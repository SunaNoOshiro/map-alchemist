import { describe, expect, it } from 'vitest';
import { MapStyleExportService } from '@/features/styles/services/MapStyleExportService';
import { MapStylePreset, PopupStyle } from '@/types';

type ExportStyleJson = {
  name?: string;
  sources?: Record<string, unknown>;
  layers?: Array<{ id: string; type: string; paint?: Record<string, unknown> }>;
};

const popupStyle: PopupStyle = {
  backgroundColor: '#ffffff',
  textColor: '#111827',
  borderColor: '#d1d5db',
  borderRadius: '8px',
  fontFamily: 'Noto Sans'
};

const baseStyle = {
  version: 8,
  sources: {
    openmaptiles: { type: 'vector', url: 'https://example.com' }
  },
  layers: [
    { id: 'water-layer', type: 'fill', paint: { 'fill-color': '#000000' } },
    { id: 'land-layer', type: 'background', paint: { 'background-color': '#ffffff' } },
    { id: 'road-primary', type: 'line', paint: { 'line-color': '#000000' } },
    { id: 'building-layer', type: 'fill', paint: { 'fill-color': '#000000' } },
    { id: 'poi-label', type: 'symbol', paint: { 'text-color': '#000000' } }
  ]
};

const createPreset = (): MapStylePreset => ({
  id: 'style-1',
  name: 'Sunset Map',
  prompt: 'Sunset vibes',
  iconTheme: 'Warm neon',
  createdAt: '2025-01-01T00:00:00.000Z',
  mapStyleJson: {
    water: '#111111',
    land: '#222222',
    road: '#333333',
    building: '#444444',
    park: '#555555',
    text: '#666666'
  },
  palette: {
    water: '#111111',
    land: '#222222',
    road: '#333333',
    building: '#444444',
    park: '#555555',
    text: '#666666'
  },
  iconsByCategory: {
    Cafe: {
      category: 'Cafe',
      prompt: 'Warm neon',
      imageUrl: 'data:image/png;base64,abc123'
    },
    Park: {
      category: 'Park',
      prompt: 'Warm neon',
      imageUrl: null
    }
  },
  popupStyle
});

const getLayer = (styleJson: ExportStyleJson, id: string) =>
  styleJson.layers?.find((layer) => layer.id === id);

describe('MapStyleExportService.buildExportPackage', () => {
  it('applies palette colors to base style layers', async () => {
    const preset = createPreset();
    const result = await MapStyleExportService.buildExportPackage(preset, { baseStyleJson: baseStyle });
    const styleJson = result.styleJson as ExportStyleJson;

    expect(getLayer(styleJson, 'water-layer')?.paint?.['fill-color']).toBe('#111111');
    expect(getLayer(styleJson, 'land-layer')?.paint?.['background-color']).toBe('#555555');
    expect(getLayer(styleJson, 'road-primary')?.paint?.['line-color']).toBe('#333333');
    expect(getLayer(styleJson, 'building-layer')?.paint?.['fill-color']).toBe('#444444');
    expect(getLayer(styleJson, 'poi-label')?.paint?.['text-color']).toBe('#666666');
  });

  it('adds places source and unclustered-point layer', async () => {
    const preset = createPreset();
    const result = await MapStyleExportService.buildExportPackage(preset, { baseStyleJson: baseStyle });
    const styleJson = result.styleJson as ExportStyleJson;

    expect(styleJson.sources).toHaveProperty('places');
    expect(styleJson.layers?.some((layer) => layer.id === 'unclustered-point')).toBe(true);
  });

  it('exports only icons with image data', async () => {
    const preset = createPreset();
    const result = await MapStyleExportService.buildExportPackage(preset, { baseStyleJson: baseStyle });

    expect(Object.keys(result.iconsByCategory)).toEqual(['Cafe']);
  });
});
