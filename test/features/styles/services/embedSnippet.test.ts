import { describe, expect, it } from 'vitest';
import { buildEmbedSnippet, buildRuntimeUrlFromStyleUrl } from '@/features/styles/services/embedSnippet';

describe('embedSnippet.buildRuntimeUrlFromStyleUrl', () => {
  it('converts style URL to runtime script URL on the same Pages host', () => {
    const runtimeUrl = buildRuntimeUrlFromStyleUrl(
      'https://sunanooshiro.github.io/map-alchemist/styles/pirates-map-of-treasures.json'
    );

    expect(runtimeUrl).toBe('https://sunanooshiro.github.io/map-alchemist/runtime/map-alchemist-runtime.js');
  });
});

describe('embedSnippet.buildEmbedSnippet', () => {
  it('produces an HTML snippet with runtime init config', () => {
    const snippet = buildEmbedSnippet({
      styleUrl: 'https://sunanooshiro.github.io/map-alchemist/styles/pirates-map-of-treasures.json',
      runtimeUrl: 'https://sunanooshiro.github.io/map-alchemist/runtime/map-alchemist-runtime.js',
      features: {
        popup: true,
        poiColorLabels: true,
        demoPois: false
      }
    });

    expect(snippet).toContain('MapAlchemistRuntime.init');
    expect(snippet).toContain('"styleUrl": "https://sunanooshiro.github.io/map-alchemist/styles/pirates-map-of-treasures.json"');
    expect(snippet).toContain('map-alchemist-runtime.js');
  });
});

