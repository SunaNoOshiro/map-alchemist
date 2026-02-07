import { describe, expect, it } from 'vitest';
import { buildSpriteLayout } from '@/features/styles/services/spriteUtils';
import {
  applySpriteUrl,
  injectDemoPois,
  applyDemoPois,
  applyMapAlchemistMetadata,
  sanitizeSymbolSpacing
} from '@/features/styles/services/MaputnikExportService';

describe('spriteUtils.buildSpriteLayout', () => {
  it('creates a deterministic grid layout with padding', () => {
    const layout = buildSpriteLayout(['B', 'A', 'C', 'D'], {
      iconSize: 64,
      padding: 2,
      pixelRatio: 1
    });

    expect(layout.columns).toBe(2);
    expect(layout.rows).toBe(2);
    expect(layout.width).toBe(136);
    expect(layout.height).toBe(136);

    const entryA = layout.entries['A'];
    const entryB = layout.entries['B'];

    expect(entryA).toEqual({ x: 2, y: 2, width: 64, height: 64, pixelRatio: 1 });
    expect(entryB).toEqual({ x: 70, y: 2, width: 64, height: 64, pixelRatio: 1 });
  });

  it('returns an empty layout when no icons provided', () => {
    const layout = buildSpriteLayout([], {
      iconSize: 64,
      padding: 2,
      pixelRatio: 1
    });

    expect(layout.width).toBe(1);
    expect(layout.height).toBe(1);
    expect(layout.entries).toEqual({});
  });
});

describe('MaputnikExportService.applySpriteUrl', () => {
  it('sets the sprite base URL on the style JSON', () => {
    const styleJson = { version: 8, sources: {}, layers: [] };
    const updated = applySpriteUrl(styleJson, 'https://cdn.example.com/sprites/demo');

    expect(updated.sprite).toBe('https://cdn.example.com/sprites/demo');
    expect(styleJson).not.toBe(updated);
  });
});

describe('MaputnikExportService.injectDemoPois', () => {
  it('adds demo POIs for every icon when the places source is empty', () => {
    const styleJson = {
      version: 8,
      sources: {
        places: { type: 'geojson', data: { type: 'FeatureCollection', features: [] } }
      },
      layers: [
        {
          id: 'unclustered-point',
          type: 'symbol',
          layout: {
            'icon-allow-overlap': false,
            'text-allow-overlap': false
          }
        }
      ]
    };

    const updated = injectDemoPois(styleJson, ['Cafe', 'Museum', 'Library', 'Unknown Demo Type'], { text: '#111111', land: '#ffffff' });
    const features = (updated.sources as any).places.data.features;
    const poiLayer = (updated.layers as any[]).find((layer) => layer.id === 'unclustered-point');

    expect(Array.isArray(features)).toBe(true);
    expect(features.length).toBe(4);
    expect(features[0].properties.iconKey).toBe('Cafe');
    expect(features[0].properties.title).toBe('Cafe');
    expect(features[0].properties.category).toBe('Cafe');
    expect(features[0].properties.subcategory).toBe('Cafe');
    expect(features[0].properties.description).toContain('Demo POI for');
    expect(features[0].properties.address).toContain('Demo Street');
    expect(features[0].properties.city).toBe('Map Alchemist City');
    expect(features[0].properties.textColor).toBe('#f97316');
    expect(features[3].properties.textColor).toBe('#111111');
    expect(poiLayer.layout['icon-allow-overlap']).toBe(true);
    expect(poiLayer.layout['text-allow-overlap']).toBe(true);
    expect(poiLayer.layout['symbol-spacing']).toBe(1);
  });

  it('skips injection when places already has features', () => {
    const styleJson = {
      version: 8,
      sources: {
        places: {
          type: 'geojson',
          data: { type: 'FeatureCollection', features: [{ type: 'Feature', properties: {} }] }
        }
      },
      layers: []
    };

    const updated = injectDemoPois(styleJson, ['Cafe'], { text: '#111111', land: '#ffffff' });
    const features = (updated.sources as any).places.data.features;

    expect(features.length).toBe(1);
  });
});

describe('MaputnikExportService.applyDemoPois', () => {
  it('returns the original style when demo POIs are disabled', () => {
    const styleJson = {
      version: 8,
      sources: {
        places: { type: 'geojson', data: { type: 'FeatureCollection', features: [] } }
      },
      layers: []
    };

    const updated = applyDemoPois(styleJson, ['Cafe'], { text: '#111111', land: '#ffffff' }, false);
    const features = (updated.sources as any).places.data.features;

    expect(features.length).toBe(0);
  });
});

describe('MaputnikExportService.applyMapAlchemistMetadata', () => {
  it('writes metadata.mapAlchemist payload for runtime integrations', () => {
    const styleJson = { version: 8, sources: {}, layers: [] };
    const updated = applyMapAlchemistMetadata(styleJson, {
      palette: { text: '#111111' },
      popupStyle: { backgroundColor: '#ffffff' },
      placesSourceId: 'places',
      poiLayerId: 'unclustered-point'
    });

    const metadata = (updated.metadata as any).mapAlchemist;
    expect(metadata.version).toBe('1.0');
    expect(metadata.placesSourceId).toBe('places');
    expect(metadata.poiLayerId).toBe('unclustered-point');
    expect(metadata.palette.text).toBe('#111111');
    expect(metadata.popupStyle.backgroundColor).toBe('#ffffff');
    expect(metadata.iconUrls || {}).toEqual({});
  });
});

describe('MaputnikExportService.sanitizeSymbolSpacing', () => {
  it('normalizes non-positive symbol-spacing values to 1', () => {
    const styleJson = {
      version: 8,
      sources: {},
      layers: [
        { id: 'a', type: 'symbol', layout: { 'symbol-spacing': 0 } },
        { id: 'b', type: 'symbol', layout: { 'symbol-spacing': '0' } },
        { id: 'c', type: 'symbol', layout: { 'symbol-spacing': -5 } },
        { id: 'd', type: 'symbol', layout: { 'symbol-spacing': 3 } },
        { id: 'e', type: 'symbol', layout: { 'symbol-spacing': ['interpolate', ['linear'], ['zoom'], 12, 0, 16, 20] } }
      ]
    };

    const updated = sanitizeSymbolSpacing(styleJson);
    const byId = Object.fromEntries((updated.layers as any[]).map((layer) => [layer.id, layer]));

    expect(byId.a.layout['symbol-spacing']).toBe(1);
    expect(byId.b.layout['symbol-spacing']).toBe(1);
    expect(byId.c.layout['symbol-spacing']).toBe(1);
    expect(byId.d.layout['symbol-spacing']).toBe(3);
    expect(Array.isArray(byId.e.layout['symbol-spacing'])).toBe(true);
  });
});
