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

  function buildPopupHtml(properties, popupStyle) {
    var title = escapeHtml(properties.title || 'POI');
    var category = escapeHtml(properties.category || properties.subcategory || '');
    var description = escapeHtml(properties.description || '');

    return [
      '<div style="font-family:' + popupStyle.fontFamily + ';min-width:220px;">',
      '  <div style="background:' + popupStyle.backgroundColor + ';color:' + popupStyle.textColor + ';border:2px solid ' + popupStyle.borderColor + ';border-radius:' + popupStyle.borderRadius + ';padding:12px 14px;">',
      '    <div style="font-size:16px;font-weight:700;line-height:1.2;margin:0 0 4px;">' + title + '</div>',
      category ? '    <div style="font-size:12px;opacity:0.8;margin-bottom:4px;">' + category + '</div>' : '',
      description ? '    <div style="font-size:12px;line-height:1.4;">' + description + '</div>' : '',
      '  </div>',
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
      if (typeof spacing === 'number' && spacing < 1) {
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
    var poiLayerId = metadata.poiLayerId || 'unclustered-point';
    var placesSourceId = metadata.placesSourceId || 'places';
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
        onLayerClick = function (event) {
          var feature = event && event.features && event.features[0];
          if (!feature) return;

          var props = feature.properties || {};
          var popup = new global.maplibregl.Popup({ closeButton: false, closeOnClick: true })
            .setLngLat(event.lngLat)
            .setHTML(buildPopupHtml(props, popupStyle));
          popup.addTo(map);
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
        if (onLayerClick) map.off('click', poiLayerId, onLayerClick);
        if (onMouseEnter) map.off('mouseenter', poiLayerId, onMouseEnter);
        if (onMouseLeave) map.off('mouseleave', poiLayerId, onMouseLeave);
        map.remove();
      }
    };
  }

  global.MapAlchemistRuntime = {
    version: '1.0.0',
    init: init
  };
})(window);
