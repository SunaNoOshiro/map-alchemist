import { describe, expect, it } from 'vitest';
import { buildStyleCatalog, extractIconImageKeys, extractPoiSymbolSources } from '@/features/map/services/styleCatalog';

const sampleStyle = {
  version: 8,
  sources: {
    openfreemap: { type: 'vector', url: 'https://tiles.openfreemap.org/v1/openfreemap' }
  },
  layers: [
    {
      id: 'background',
      type: 'background',
      paint: { 'background-color': '#101010' }
    },
    {
      id: 'water-fill',
      type: 'fill',
      source: 'openfreemap',
      'source-layer': 'water',
      paint: { 'fill-color': '#0a84ff' }
    },
    {
      id: 'road-primary',
      type: 'line',
      source: 'openfreemap',
      'source-layer': 'transportation',
      filter: ['==', ['get', 'class'], 'primary'],
      paint: { 'line-color': '#ff6b3d' }
    },
    {
      id: 'place-label',
      type: 'symbol',
      source: 'openfreemap',
      'source-layer': 'place',
      layout: { 'text-field': ['get', 'name'] },
      paint: { 'text-color': '#f8fbff' }
    },
    {
      id: 'poi-label',
      type: 'symbol',
      source: 'openfreemap',
      'source-layer': 'poi',
      layout: {
        'icon-image': ['match', ['get', 'subclass'], 'cafe', 'cafe', 'museum', 'museum', 'landmark']
      },
      paint: { 'text-color': '#f8fbff', 'text-halo-color': '#111111' }
    },
    {
      id: 'poi-station',
      type: 'symbol',
      source: 'openfreemap',
      'source-layer': 'poi_detail',
      layout: { 'icon-image': 'airport' }
    },
    {
      id: 'custom-poi',
      type: 'symbol',
      source: 'places',
      layout: { 'icon-image': ['get', 'iconKey'] }
    },
    {
      id: 'poi-label-duplicate-source',
      type: 'symbol',
      source: 'openfreemap',
      'source-layer': 'poi',
      layout: { 'text-field': ['get', 'name'] }
    }
  ]
};

describe('styleCatalog', () => {
  it('builds deterministic color targets and layer role coverage from style JSON', () => {
    const catalog = buildStyleCatalog(sampleStyle);
    const key = (layerId: string, section: string, propertyName: string) =>
      catalog.colorTargets.find((target) =>
        target.layerId === layerId &&
        target.section === section &&
        target.propertyName === propertyName
      );

    expect(key('background', 'paint', 'background-color')?.role).toBe('background');
    expect(key('water-fill', 'paint', 'fill-color')?.role).toBe('water');
    expect(key('road-primary', 'paint', 'line-color')?.role).toBe('primaryRoad');
    expect(key('place-label', 'paint', 'text-color')?.role).toBe('labelPrimary');
    expect(key('poi-label', 'paint', 'text-halo-color')?.role).toBe('poi');
    expect(catalog.colorTargets.length).toBeGreaterThan(0);
  });

  it('extracts literal icon-image keys from symbol layers without pulling dynamic get() keys', () => {
    const keys = extractIconImageKeys(sampleStyle);
    expect(keys).toEqual(['cafe', 'museum', 'landmark', 'airport']);
    expect(keys).not.toContain('iconKey');
  });

  it('extracts deduped POI symbol source definitions from style layers', () => {
    const poiSources = extractPoiSymbolSources(sampleStyle);
    expect(poiSources).toEqual([
      { layerId: 'poi-label', source: 'openfreemap', sourceLayer: 'poi' },
      { layerId: 'poi-station', source: 'openfreemap', sourceLayer: 'poi_detail' }
    ]);
  });
});
