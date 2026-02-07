(function (global) {
  'use strict';

  var DEFAULT_FEATURES = {
    popup: true,
    poiColorLabels: true,
    demoPois: false
  };

  var DEFAULT_POPUP_STYLE = {
    backgroundColor: '#ffffff',
    textColor: '#111827',
    borderColor: '#d1d5db',
    borderRadius: '8px',
    fontFamily: 'Noto Sans'
  };
  var RUNTIME_POPUP_CLASS = 'mapalchemist-runtime-popup';
  var RUNTIME_STYLE_TAG_ID = 'mapalchemist-runtime-style';

  function mergeFeatures(features) {
    return {
      popup: features && typeof features.popup === 'boolean' ? features.popup : DEFAULT_FEATURES.popup,
      poiColorLabels: features && typeof features.poiColorLabels === 'boolean'
        ? features.poiColorLabels
        : DEFAULT_FEATURES.poiColorLabels,
      demoPois: features && typeof features.demoPois === 'boolean' ? features.demoPois : DEFAULT_FEATURES.demoPois
    };
  }

  function escapeHtml(value) {
    return String(value || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function ensureRuntimePopupStyles() {
    if (document.getElementById(RUNTIME_STYLE_TAG_ID)) {
      return;
    }
    var styleTag = document.createElement('style');
    styleTag.id = RUNTIME_STYLE_TAG_ID;
    styleTag.textContent = [
      '.' + RUNTIME_POPUP_CLASS + '.maplibregl-popup {',
      '  max-width: none !important;',
      '}',
      '.' + RUNTIME_POPUP_CLASS + '.maplibregl-popup .maplibregl-popup-content {',
      '  background: transparent !important;',
      '  border: 0 !important;',
      '  box-shadow: none !important;',
      '  padding: 0 !important;',
      '  overflow: visible !important;',
      '}',
      '.' + RUNTIME_POPUP_CLASS + '.maplibregl-popup .maplibregl-popup-tip {',
      '  display: none !important;',
      '}'
    ].join('\n');
    document.head.appendChild(styleTag);
  }

  function normalizeAddress(properties) {
    var explicitAddress = properties.address || properties.addressLine;
    if (explicitAddress) return String(explicitAddress);
    var street = properties['addr:street'];
    var house = properties['addr:housenumber'];
    if (street || house) {
      return [street, house].filter(Boolean).join(' ');
    }
    return '';
  }

  function normalizeLocality(properties) {
    var city = properties.city || properties['addr:city'];
    var postcode = properties.postcode || properties['addr:postcode'];
    var country = properties.country || properties['addr:country'];
    return [city, postcode, country].filter(Boolean).join(', ');
  }

  function getPopupIconCandidates(properties) {
    return [
      properties.iconKey,
      properties.subcategory,
      properties.category,
      properties.title
    ].filter(Boolean);
  }

  function resolvePopupIconUrl(properties, iconUrls) {
    if (!iconUrls || typeof iconUrls !== 'object') {
      return '';
    }
    var candidates = getPopupIconCandidates(properties);
    for (var i = 0; i < candidates.length; i += 1) {
      var key = candidates[i];
      if (typeof iconUrls[key] === 'string' && iconUrls[key]) {
        return iconUrls[key];
      }
    }
    return '';
  }

  async function loadSpriteAssets(spriteBaseUrl) {
    if (!spriteBaseUrl) return null;
    try {
      var index1xResponse = await fetch(spriteBaseUrl + '.json');
      if (!index1xResponse.ok) {
        return null;
      }
      var index1x = await index1xResponse.json();

      var index2x = null;
      try {
        var index2xResponse = await fetch(spriteBaseUrl + '@2x.json');
        if (index2xResponse.ok) {
          index2x = await index2xResponse.json();
        }
      } catch (_error) {
        index2x = null;
      }

      return {
        index1x: index1x,
        index2x: index2x,
        imageUrl1x: spriteBaseUrl + '.png',
        imageUrl2x: spriteBaseUrl + '@2x.png'
      };
    } catch (_error) {
      return null;
    }
  }

  function resolveSpriteEntry(properties, spriteIndex) {
    if (!spriteIndex || typeof spriteIndex !== 'object') {
      return null;
    }
    var candidates = getPopupIconCandidates(properties);
    var lowerCandidates = candidates.map(function (value) {
      return String(value).toLowerCase();
    });
    for (var i = 0; i < candidates.length; i += 1) {
      var exact = candidates[i];
      if (spriteIndex[exact]) {
        return spriteIndex[exact];
      }
    }
    var spriteKeys = Object.keys(spriteIndex);
    for (var j = 0; j < spriteKeys.length; j += 1) {
      var spriteKey = spriteKeys[j];
      if (lowerCandidates.indexOf(spriteKey.toLowerCase()) !== -1) {
        return spriteIndex[spriteKey];
      }
    }
    return null;
  }

  function resolvePopupIconRender(properties, iconUrls, spriteAssets) {
    var directIconUrl = resolvePopupIconUrl(properties, iconUrls);
    if (directIconUrl) {
      return { kind: 'image', url: directIconUrl };
    }

    if (!spriteAssets) {
      return null;
    }
    var entry2x = resolveSpriteEntry(properties, spriteAssets.index2x);
    var entry1x = resolveSpriteEntry(properties, spriteAssets.index1x);
    var entry = entry2x || entry1x;
    if (!entry || typeof entry !== 'object') {
      return null;
    }

    if (
      typeof entry.x !== 'number' ||
      typeof entry.y !== 'number' ||
      typeof entry.width !== 'number' ||
      typeof entry.height !== 'number'
    ) {
      return null;
    }

    return {
      kind: 'sprite',
      imageUrl: entry2x ? spriteAssets.imageUrl2x : spriteAssets.imageUrl1x,
      entry: entry
    };
  }

  function buildPopupIconBlock(iconRender, popupStyle, title) {
    if (!iconRender) {
      return '';
    }

    if (iconRender.kind === 'image') {
      return '<div style="width:72px;height:72px;display:flex;align-items:center;justify-content:center;border-radius:12px;background:rgba(0,0,0,0.06);border:1px solid ' + popupStyle.borderColor + '40;">' +
          '<img src="' + escapeHtml(iconRender.url) + '" alt="' + escapeHtml(title) + '" style="max-width:62px;max-height:62px;object-fit:contain;" />' +
        '</div>';
    }

    if (iconRender.kind !== 'sprite') {
      return '';
    }

    var entry = iconRender.entry;
    var pixelRatio = typeof entry.pixelRatio === 'number' && entry.pixelRatio > 0
      ? entry.pixelRatio
      : 1;
    var logicalWidth = Math.max(1, entry.width / pixelRatio);
    var logicalHeight = Math.max(1, entry.height / pixelRatio);
    var maxLogicalSide = Math.max(logicalWidth, logicalHeight);
    var logicalScale = maxLogicalSide > 62 ? (62 / maxLogicalSide) : 1;
    var outputWidth = Math.max(1, Math.round(logicalWidth * logicalScale));
    var outputHeight = Math.max(1, Math.round(logicalHeight * logicalScale));
    var renderScale = logicalScale / pixelRatio;

    return '<div style="width:72px;height:72px;display:flex;align-items:center;justify-content:center;border-radius:12px;background:rgba(0,0,0,0.06);border:1px solid ' + popupStyle.borderColor + '40;">' +
        '<span aria-hidden="true" style="display:block;width:' + outputWidth + 'px;height:' + outputHeight + 'px;overflow:hidden;">' +
          '<span style="' +
            'display:block;' +
            'width:' + entry.width + 'px;' +
            'height:' + entry.height + 'px;' +
            'background-image:url(\'' + escapeHtml(iconRender.imageUrl) + '\');' +
            'background-repeat:no-repeat;' +
            'background-position:-' + entry.x + 'px -' + entry.y + 'px;' +
            'transform-origin:top left;' +
            'transform:scale(' + renderScale + ');' +
          '"></span>' +
        '</span>' +
      '</div>';
  }

  function buildPopupHtml(properties, popupStyle, iconRender) {
    var title = escapeHtml(properties.title || 'POI');
    var category = escapeHtml(properties.subcategory || properties.category || '');
    var description = escapeHtml(properties.description || properties.kind || '');
    var addressLine = escapeHtml(normalizeAddress(properties));
    var localityLine = escapeHtml(normalizeLocality(properties));
    var iconBlock = buildPopupIconBlock(iconRender, popupStyle, title);

    return [
      '<div style="position:relative;font-family:' + popupStyle.fontFamily + ';min-width:260px;">',
      '  <button id="popup-close-btn" type="button" data-mapalchemist-popup-close="true" aria-label="Close popup" style="position:absolute;top:-14px;right:-14px;width:28px;height:28px;border-radius:999px;border:2px solid ' + popupStyle.borderColor + ';background:' + popupStyle.backgroundColor + ';color:' + popupStyle.textColor + ';cursor:pointer;font-size:16px;line-height:1;">' +
          '&times;' +
      '  </button>',
      '  <div style="background:' + popupStyle.backgroundColor + ';color:' + popupStyle.textColor + ';border:2px solid ' + popupStyle.borderColor + ';border-radius:' + popupStyle.borderRadius + ';padding:12px 14px;box-shadow:0 8px 20px rgba(0,0,0,0.22);">',
      '    <div style="display:flex;gap:10px;align-items:center;">',
      '      ' + iconBlock,
      '      <div style="flex:1;min-width:0;">',
      '        <div style="font-size:21px;font-weight:700;line-height:1.2;margin:0 0 4px;">' + title + '</div>',
      category ? '        <div style="font-size:12px;text-transform:uppercase;letter-spacing:0.08em;opacity:0.85;">' + category + '</div>' : '',
      '      </div>',
      '    </div>',
      (addressLine || localityLine || description) ? '    <div style="margin-top:10px;padding-top:8px;border-top:1px solid ' + popupStyle.borderColor + '40;font-size:13px;line-height:1.35;">' : '',
      addressLine ? '      <div>' + addressLine + '</div>' : '',
      localityLine ? '      <div style="opacity:0.85;">' + localityLine + '</div>' : '',
      description ? '      <div style="margin-top:4px;">' + description + '</div>' : '',
      (addressLine || localityLine || description) ? '    </div>' : '',
      '  </div>',
      '  <div data-mapalchemist-popup-arrow="true" aria-hidden="true" style="position:absolute;left:50%;bottom:-11px;width:18px;height:18px;transform:translateX(-50%) rotate(45deg);background:' + popupStyle.backgroundColor + ';border-right:3px solid ' + popupStyle.borderColor + ';border-bottom:3px solid ' + popupStyle.borderColor + ';box-shadow:2px 2px 6px rgba(0,0,0,0.18);"></div>',
      '</div>'
    ].join('\n');
  }

  async function loadStyle(styleUrl) {
    var response = await fetch(styleUrl);
    if (!response.ok) {
      throw new Error('Failed to load style JSON: ' + response.status + ' ' + response.statusText);
    }
    return response.json();
  }

  function normalizeStyleForMapLibre(style) {
    if (!style || !Array.isArray(style.layers)) {
      return style;
    }

    style.layers = style.layers.map(function (layer) {
      if (!layer || !layer.layout) {
        return layer;
      }

      var spacing = layer.layout['symbol-spacing'];
      var numericSpacing = typeof spacing === 'number'
        ? spacing
        : typeof spacing === 'string'
          ? Number(spacing)
          : Number.NaN;
      if (Number.isFinite(numericSpacing) && numericSpacing < 1) {
        var nextLayout = Object.assign({}, layer.layout, { 'symbol-spacing': 1 });
        return Object.assign({}, layer, { layout: nextLayout });
      }

      return layer;
    });

    return style;
  }

  function normalizeContainer(container) {
    if (typeof container === 'string') {
      return document.getElementById(container);
    }
    return container || null;
  }

  function isGeoJsonSource(source) {
    return source && typeof source.setData === 'function';
  }

  async function init(options) {
    if (!global.maplibregl) {
      throw new Error('MapLibre GL JS is required. Include maplibre-gl.js before map-alchemist-runtime.js.');
    }

    if (!options || !options.styleUrl) {
      throw new Error('MapAlchemistRuntime.init requires "styleUrl".');
    }

    var containerElement = normalizeContainer(options.container);
    if (!containerElement) {
      throw new Error('MapAlchemistRuntime.init could not resolve map container.');
    }

    var style = normalizeStyleForMapLibre(await loadStyle(options.styleUrl));
    var metadata = (style.metadata && style.metadata.mapAlchemist) || {};
    var features = mergeFeatures(options.features);
    var popupStyle = Object.assign({}, DEFAULT_POPUP_STYLE, metadata.popupStyle || {});
    var palette = metadata.palette || {};
    var iconUrls = metadata.iconUrls || {};
    var poiLayerId = metadata.poiLayerId || 'unclustered-point';
    var placesSourceId = metadata.placesSourceId || 'places';
    var spriteAssetsPromise = loadSpriteAssets(style.sprite);
    var mapOptions = Object.assign(
      {
        center: Array.isArray(style.center) ? style.center : [30.5238, 50.4547],
        zoom: typeof style.zoom === 'number' ? style.zoom : 13
      },
      options.mapOptions || {}
    );

    var map = new global.maplibregl.Map({
      container: containerElement,
      style: style,
      center: mapOptions.center,
      zoom: mapOptions.zoom
    });

    var onLayerClick = null;
    var onMouseEnter = null;
    var onMouseLeave = null;
    var onZoomStart = null;
    var activePopup = null;

    function closeActivePopup() {
      if (!activePopup) return;
      activePopup.remove();
      activePopup = null;
    }

    map.on('load', function () {
      if (features.poiColorLabels && map.getLayer(poiLayerId)) {
        try {
          map.setPaintProperty(
            poiLayerId,
            'text-color',
            ['coalesce', ['get', 'textColor'], palette.text || '#111827']
          );
          map.setPaintProperty(
            poiLayerId,
            'text-halo-color',
            ['coalesce', ['get', 'haloColor'], palette.land || '#ffffff']
          );
        } catch (_error) {
          // Non-fatal: style might not support these paint properties.
        }
      }

      if (!features.demoPois) {
        var placesSource = map.getSource(placesSourceId);
        if (isGeoJsonSource(placesSource)) {
          placesSource.setData({ type: 'FeatureCollection', features: [] });
        }
      }

      if (features.popup && map.getLayer(poiLayerId)) {
        ensureRuntimePopupStyles();
        onLayerClick = async function (event) {
          var feature = event && event.features && event.features[0];
          if (!feature) return;

          closeActivePopup();

          var props = feature.properties || {};
          var spriteAssets = await spriteAssetsPromise;
          var iconRender = resolvePopupIconRender(props, iconUrls, spriteAssets);
          var popup = new global.maplibregl.Popup({
            closeButton: false,
            closeOnClick: true,
            anchor: 'bottom',
            className: RUNTIME_POPUP_CLASS
          })
            .setLngLat(event.lngLat)
            .setHTML(buildPopupHtml(props, popupStyle, iconRender));
          popup.addTo(map);
          activePopup = popup;
          popup.on('close', function () {
            if (activePopup === popup) {
              activePopup = null;
            }
          });
          setTimeout(function () {
            var popupRoot = popup && popup.getElement && popup.getElement();
            if (!popupRoot) return;
            var closeButton = popupRoot.querySelector('[data-mapalchemist-popup-close="true"]');
            if (closeButton) {
              closeButton.addEventListener('click', function () {
                popup.remove();
              }, { once: true });
            }
          }, 0);
        };

        onMouseEnter = function () {
          map.getCanvas().style.cursor = 'pointer';
        };

        onMouseLeave = function () {
          map.getCanvas().style.cursor = '';
        };

        map.on('click', poiLayerId, onLayerClick);
        map.on('mouseenter', poiLayerId, onMouseEnter);
        map.on('mouseleave', poiLayerId, onMouseLeave);
      }

      onZoomStart = function () {
        closeActivePopup();
      };
      map.on('zoomstart', onZoomStart);
    });

    return {
      map: map,
      setPlacesData: function (geojson) {
        var placesSource = map.getSource(placesSourceId);
        if (isGeoJsonSource(placesSource)) {
          placesSource.setData(geojson);
        }
      },
      destroy: function () {
        closeActivePopup();
        if (onLayerClick) map.off('click', poiLayerId, onLayerClick);
        if (onMouseEnter) map.off('mouseenter', poiLayerId, onMouseEnter);
        if (onMouseLeave) map.off('mouseleave', poiLayerId, onMouseLeave);
        if (onZoomStart) map.off('zoomstart', onZoomStart);
        map.remove();
      }
    };
  }

  global.MapAlchemistRuntime = {
    version: '1.0.0',
    init: init
  };
})(window);
