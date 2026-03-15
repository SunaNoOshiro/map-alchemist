import { describe, expect, it } from 'vitest';
import { compileThemeStyle, extractPaletteFromCompiledStyle, isMapLibreStyleJson } from '@/features/map/services/styleCompiler';

const baseStyle = {
  version: 8,
  sources: {
    openfreemap: { type: 'vector', url: 'https://tiles.openfreemap.org/v1/openfreemap' }
  },
  layers: [
    { id: 'background', type: 'background', paint: { 'background-color': '#000000' } },
    { id: 'water', type: 'fill', source: 'openfreemap', 'source-layer': 'water', paint: { 'fill-color': '#111111' } },
    { id: 'waterway', type: 'line', source: 'openfreemap', 'source-layer': 'waterway', paint: { 'line-color': '#222222' } },
    { id: 'road-motorway', type: 'line', source: 'openfreemap', 'source-layer': 'transportation', filter: ['==', ['get', 'class'], 'motorway'], paint: { 'line-color': '#333333' } },
    { id: 'road-primary', type: 'line', source: 'openfreemap', 'source-layer': 'transportation', filter: ['==', ['get', 'class'], 'primary'], paint: { 'line-color': '#444444' } },
    { id: 'road-secondary', type: 'line', source: 'openfreemap', 'source-layer': 'transportation', filter: ['==', ['get', 'class'], 'secondary'], paint: { 'line-color': '#555555' } },
    { id: 'road-local', type: 'line', source: 'openfreemap', 'source-layer': 'transportation', filter: ['==', ['get', 'class'], 'residential'], paint: { 'line-color': '#666666' } },
    { id: 'road-primary-casing', type: 'line', source: 'openfreemap', 'source-layer': 'transportation', paint: { 'line-color': '#777777' } },
    { id: 'admin-boundary', type: 'line', source: 'openfreemap', 'source-layer': 'boundary', paint: { 'line-color': '#888888' } },
    { id: 'park-fill', type: 'fill', source: 'openfreemap', 'source-layer': 'landuse', filter: ['==', ['get', 'class'], 'park'], paint: { 'fill-color': '#999999' } },
    { id: 'building-fill', type: 'fill', source: 'openfreemap', 'source-layer': 'building', paint: { 'fill-color': '#aaaaaa' } },
    { id: 'poi-label', type: 'symbol', source: 'openfreemap', 'source-layer': 'poi', layout: { 'text-field': ['get', 'name'] }, paint: { 'text-color': '#bbbbbb', 'text-halo-color': '#000000' } },
    { id: 'place-label', type: 'symbol', source: 'openfreemap', 'source-layer': 'place', layout: { 'text-field': ['get', 'name'] }, paint: { 'text-color': '#cccccc', 'text-halo-color': '#000000' } }
  ]
};

const getLayerPaint = (style: any, layerId: string, paintProp: string) =>
  style.layers.find((layer: any) => layer.id === layerId)?.paint?.[paintProp];

const getLuminance = (hexColor: string): number => {
  const normalized = hexColor.replace('#', '');
  const numeric = parseInt(normalized, 16);
  const r = (numeric >> 16) & 255;
  const g = (numeric >> 8) & 255;
  const b = numeric & 255;
  const toLinear = (channel: number) => {
    const normalizedChannel = channel / 255;
    return normalizedChannel <= 0.04045
      ? normalizedChannel / 12.92
      : ((normalizedChannel + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * toLinear(r) + 0.7152 * toLinear(g) + 0.0722 * toLinear(b);
};

describe('styleCompiler', () => {
  it('compiles token colors across key layer groups and applies per-layer overrides', () => {
    const compiled = compileThemeStyle(baseStyle, {
      tokens: {
        background: '#010203',
        water: '#021244',
        waterLine: '#083388',
        motorway: '#aa1133',
        primaryRoad: '#bb2244',
        secondaryRoad: '#cc3355',
        localRoad: '#dd4466',
        roadCasing: '#112233',
        admin: '#88aaff',
        park: '#226644',
        building: '#334455',
        poiText: '#f5f5f5',
        poiHalo: '#111111',
        textPrimary: '#fafafa',
        haloPrimary: '#05070a'
      },
      layerOverrides: {
        'road-primary': {
          paint: { 'line-color': '#abcdef' }
        },
        'place-label': {
          paint: { 'text-color': '#123123' }
        }
      }
    });

    expect(getLayerPaint(compiled, 'background', 'background-color')).toBe('#010203');
    expect(getLayerPaint(compiled, 'water', 'fill-color')).toBe('#021244');
    expect(getLayerPaint(compiled, 'waterway', 'line-color')).toBe('#083388');
    expect(getLayerPaint(compiled, 'road-motorway', 'line-color')).toBe('#aa1133');
    expect(getLayerPaint(compiled, 'road-primary', 'line-color')).toBe('#abcdef');
    expect(getLayerPaint(compiled, 'road-secondary', 'line-color')).toBe('#cc3355');
    expect(getLayerPaint(compiled, 'road-local', 'line-color')).toBe('#dd4466');
    expect(getLayerPaint(compiled, 'road-primary-casing', 'line-color')).toBe('#112233');
    expect(getLayerPaint(compiled, 'admin-boundary', 'line-color')).toBe('#88aaff');
    expect(getLayerPaint(compiled, 'park-fill', 'fill-color')).toBe('#226644');
    expect(getLayerPaint(compiled, 'building-fill', 'fill-color')).toBe('#334455');
    expect(getLayerPaint(compiled, 'poi-label', 'text-color')).toBe('#f5f5f5');
    const poiHalo = getLayerPaint(compiled, 'poi-label', 'text-halo-color');
    const placeHalo = getLayerPaint(compiled, 'place-label', 'text-halo-color');
    expect(typeof poiHalo).toBe('string');
    expect(poiHalo).toBe(placeHalo);
    expect(getLayerPaint(compiled, 'place-label', 'text-color')).toBe('#123123');
  });

  it('stores palette metadata and exposes compiled style detection helpers', () => {
    const compiled = compileThemeStyle(baseStyle, {
      tokens: {
        water: '#0055ff',
        land: '#202840',
        building: '#36435c',
        primaryRoad: '#ff6b3d',
        park: '#1f5a3a',
        textPrimary: '#f8fbff'
      }
    });

    expect(isMapLibreStyleJson(compiled)).toBe(true);
    expect(extractPaletteFromCompiledStyle(compiled)).toEqual({
      water: '#0055ff',
      land: '#202840',
      building: '#36435c',
      road: '#ff6b3d',
      park: '#1f5a3a',
      text: '#f8fbff'
    });

    const catalogMetadata = (compiled.metadata as any)?.mapAlchemist?.catalog;
    expect(catalogMetadata?.version).toBe('style-catalog-v1');
    expect(catalogMetadata?.colorTargetCount).toBeGreaterThan(0);
    expect(catalogMetadata?.iconKeyCount).toBeGreaterThanOrEqual(0);
  });

  it('normalizes token-based color overrides and always emits object paint/layout sections', () => {
    const styleWithSparseSections = {
      version: 8,
      sources: {
        openfreemap: { type: 'vector', url: 'https://tiles.openfreemap.org/v1/openfreemap' }
      },
      layers: [
        { id: 'background', type: 'background', paint: { 'background-color': '#000000' } },
        { id: 'water', type: 'fill', source: 'openfreemap', 'source-layer': 'water', paint: { 'fill-color': '#111111' } },
        // Intentionally omits both layout and paint to mirror real-world sparse layer objects.
        { id: 'road-label', type: 'symbol', source: 'openfreemap', 'source-layer': 'transportation_name' },
      ]
    };

    const compiled = compileThemeStyle(styleWithSparseSections, {
      tokens: {
        water: '#0a84ff',
        textPrimary: '#f8fbff',
        haloPrimary: '#11182b',
      },
      layerOverrides: {
        water: {
          paint: {
            'fill-color': "token('water')",
          }
        },
      }
    });

    const waterLayer = compiled.layers.find((layer: any) => layer.id === 'water');
    const roadLabelLayer = compiled.layers.find((layer: any) => layer.id === 'road-label');

    expect(waterLayer?.paint?.['fill-color']).toBe('#0a84ff');
    expect(typeof waterLayer?.paint).toBe('object');
    expect(typeof waterLayer?.layout).toBe('object');
    expect(typeof roadLabelLayer?.paint).toBe('object');
    expect(typeof roadLabelLayer?.layout).toBe('object');
    expect(JSON.stringify(compiled.layers)).not.toContain("token('");
  });

  it('adapts harmonized halo brightness for dark vs bright themes', () => {
    const darkThemeStyle = compileThemeStyle(baseStyle, {
      tokens: {
        background: '#0b1220',
        land: '#1c2435',
        textPrimary: '#f8fbff',
      }
    });
    const brightThemeStyle = compileThemeStyle(baseStyle, {
      tokens: {
        background: '#f8fafc',
        land: '#e2e8f0',
        textPrimary: '#0f172a',
      }
    });

    const darkHalo = getLayerPaint(darkThemeStyle, 'place-label', 'text-halo-color');
    const brightHalo = getLayerPaint(brightThemeStyle, 'place-label', 'text-halo-color');

    expect(typeof darkHalo).toBe('string');
    expect(typeof brightHalo).toBe('string');
    expect(getLuminance(darkHalo)).toBeLessThan(getLuminance(brightHalo));
  });
});
