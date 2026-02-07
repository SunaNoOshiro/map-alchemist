import { describe, expect, it } from 'vitest';
import { buildSpriteLayout } from '@/features/styles/services/spriteUtils';
import { applySpriteUrl, injectDemoPois, applyDemoPois } from '@/features/styles/services/MaputnikExportService';

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
      layers: []
    };

    const updated = injectDemoPois(styleJson, ['Cafe', 'Museum', 'Library'], { text: '#111111', land: '#ffffff' });
    const features = (updated.sources as any).places.data.features;

    expect(Array.isArray(features)).toBe(true);
    expect(features.length).toBe(3);
    expect(features[0].properties.iconKey).toBe('Cafe');
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
