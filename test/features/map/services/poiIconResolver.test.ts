import { describe, expect, it } from 'vitest';
import { OSM_MAPPING } from '@/constants';
import { FALLBACK_POI_ICON_KEY, getCanonicalPoiCategories, resolvePoiIconKey, resolvePoiRemixTarget, resolvePoiTaxonomy } from '@/features/map/services/poiIconResolver';
import { IconDefinition } from '@/types';

const toIconMap = (categories: string[]): Record<string, IconDefinition> =>
  Object.fromEntries(
    categories.map((category) => [
      category,
      {
        category,
        prompt: 'test icon',
        imageUrl: 'data:image/png;base64,abc'
      } as IconDefinition
    ])
  );

describe('poiIconResolver', () => {
  it('returns unique canonical categories and keeps fallback icon key available', () => {
    const categories = getCanonicalPoiCategories();
    const normalized = categories.map((value) => value.toLowerCase());
    expect(new Set(normalized).size).toBe(categories.length);
    expect(categories).toContain('Cafe');
    expect(categories).toContain('Landmark');
  });

  it('resolves every mapped OSM subclass to a deterministic icon key when icon set is complete', () => {
    const categories = getCanonicalPoiCategories();
    const activeIcons = toIconMap(categories);

    Object.entries(OSM_MAPPING).forEach(([combo, mapping]) => {
      const [className, subclass] = combo.split('=');
      const taxonomy = resolvePoiTaxonomy(subclass, className);
      const iconKey = resolvePoiIconKey(activeIcons, {
        category: taxonomy.category,
        subcategory: taxonomy.subcategory,
        subclass
      });

      expect(taxonomy.subcategory).toBe(mapping.subcategory);
      expect(iconKey).toBe(mapping.subcategory);
    });
  });

  it('falls back to landmark icon for unknown subclasses', () => {
    const activeIcons = toIconMap([FALLBACK_POI_ICON_KEY, 'Cafe']);
    const taxonomy = resolvePoiTaxonomy('unknown_custom_poi', 'amenity');
    const iconKey = resolvePoiIconKey(activeIcons, {
      category: taxonomy.category,
      subcategory: taxonomy.subcategory,
      subclass: 'unknown_custom_poi'
    });
    expect(taxonomy.category).toBe('Services');
    expect(taxonomy.subcategory).toBe('Unknown Custom Poi');
    expect(iconKey).toBe(FALLBACK_POI_ICON_KEY);
  });

  it('does not fallback to unrelated available icons when no match exists', () => {
    const activeIcons = toIconMap(['Cafe', 'Bar']);
    const taxonomy = resolvePoiTaxonomy('unknown_custom_poi', 'amenity');
    const iconKey = resolvePoiIconKey(activeIcons, {
      category: taxonomy.category,
      subcategory: taxonomy.subcategory,
      subclass: 'unknown_custom_poi'
    });
    expect(iconKey).toBe(FALLBACK_POI_ICON_KEY);
  });

  it('projects unknown shop subclasses into the shopping group taxonomy', () => {
    const taxonomy = resolvePoiTaxonomy('bag', 'shop');

    expect(taxonomy).toEqual({
      category: 'Shopping',
      subcategory: 'Bag'
    });
  });

  it('prefers the concrete POI leaf for remix targets instead of sticking to broader fallback icon keys', () => {
    const remixTarget = resolvePoiRemixTarget(toIconMap(['Landmark', 'Supermarket']), {
      category: 'Shopping',
      subcategory: 'Supermarket',
      subclass: 'supermarket',
      className: 'shop',
      iconKey: 'Landmark'
    });

    expect(remixTarget).toBe('Supermarket');
  });

  it('keeps remix available for discovered leaves even when no current image exists yet', () => {
    const remixTarget = resolvePoiRemixTarget({
      Supermarket: {
        category: 'Supermarket',
        prompt: 'test icon',
        imageUrl: null
      }
    }, {
      category: 'Shopping',
      subcategory: 'Supermarket',
      subclass: 'supermarket',
      className: 'shop',
      iconKey: 'Landmark'
    });

    expect(remixTarget).toBe('Supermarket');
  });
});
