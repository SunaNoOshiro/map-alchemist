import { describe, expect, it } from 'vitest';
import { PoiRegistryService } from '@/features/map/services/PoiRegistryService';

type TestPoiFeature = {
    type: 'Feature';
    geometry: {
        type: 'Point';
        coordinates: [number, number];
    };
    properties: {
        id: string;
        title: string;
        category: string;
        subcategory: string;
        __lastSeenAt?: number;
        [key: string]: unknown;
    };
};

const createFeature = (id: string, overrides: Record<string, unknown> = {}): TestPoiFeature => ({
    type: 'Feature',
    geometry: {
        type: 'Point',
        coordinates: [-122.4194, 37.7749]
    },
    properties: {
        id,
        title: `POI ${id}`,
        category: 'Food & Drink',
        subcategory: 'Cafe',
        ...overrides
    }
});

describe('PoiRegistryService.mergeDiscoveredFeatures', () => {
    it('merges new features into the existing registry without dropping older ones', () => {
        const existing = new Map<string, any>([
            ['poi-1', createFeature('poi-1')]
        ]);

        const { registry, changed, addedIds } = PoiRegistryService.mergeDiscoveredFeatures(
            existing,
            [createFeature('poi-2')],
            123
        );

        expect(changed).toBe(true);
        expect(addedIds).toEqual(['poi-2']);
        expect(Array.from(registry.keys())).toEqual(['poi-1', 'poi-2']);
        expect(registry.get('poi-2')?.properties?.__lastSeenAt).toBe(123);
    });

    it('adds taxonomyKey metadata for map visibility filtering', () => {
        const feature = PoiRegistryService.applyMapVisibilityMetadata(
            createFeature('poi-1', { category: 'Nature', subcategory: 'Park' })
        );

        expect(feature.properties.taxonomyKey).toBe('nature::park');
    });

    it('normalizes raw POI categories into curated category groups', () => {
        const feature = PoiRegistryService.applyMapVisibilityMetadata(
            createFeature('poi-2', { category: 'Bag', subcategory: 'Bag', class: 'shop' })
        );

        expect(feature.properties.category).toBe('Shopping');
        expect(feature.properties.subcategory).toBe('Bag');
        expect(feature.properties.taxonomyKey).toBe('shopping::bag');
    });

    it('does not mark unchanged features as changed when only seenAt moves forward', () => {
        const existingFeature = createFeature('poi-1');
        existingFeature.properties.__lastSeenAt = 100;
        const existing = new Map<string, any>([['poi-1', existingFeature]]);

        const { registry, changed, addedIds } = PoiRegistryService.mergeDiscoveredFeatures(
            existing,
            [createFeature('poi-1')],
            200
        );

        expect(changed).toBe(false);
        expect(addedIds).toEqual([]);
        expect(registry.get('poi-1')?.properties?.__lastSeenAt).toBe(100);
    });
});

describe('PoiRegistryService.buildLayerVisibilityFilter', () => {
    it('returns null when all map categories are visible', () => {
        expect(PoiRegistryService.buildLayerVisibilityFilter({
            hiddenCategories: [],
            hiddenSubcategories: [],
            isolation: null
        })).toBeNull();
    });

    it('builds a combined filter for hidden categories and hidden subcategories', () => {
        expect(PoiRegistryService.buildLayerVisibilityFilter({
            hiddenCategories: ['Food & Drink'],
            hiddenSubcategories: ['nature::park'],
            isolation: null
        })).toEqual([
            'all',
            ['match', ['get', 'category'], ['Food & Drink'], false, true],
            ['match', ['get', 'taxonomyKey'], ['nature::park'], false, true]
        ]);
    });

    it('builds a per-category symbol-layer filter for visible branches', () => {
        expect(PoiRegistryService.buildCategoryLayerVisibilityFilter({
            hiddenCategories: ['Shopping'],
            hiddenSubcategories: ['food-drink::bar'],
            isolation: null
        }, 'Food & Drink')).toEqual([
            'all',
            ['==', ['get', 'category'], 'Food & Drink'],
            ['match', ['get', 'taxonomyKey'], ['food-drink::bar'], false, true]
        ]);
    });

    it('builds show-only filters for a category branch', () => {
        expect(PoiRegistryService.showOnlyCategory({
            hiddenCategories: ['Services'],
            hiddenSubcategories: ['food-drink::bar'],
            isolation: null
        }, 'Food & Drink')).toEqual({
            hiddenCategories: expect.arrayContaining(['Shopping', 'Health', 'Transport']),
            hiddenSubcategories: [],
            isolation: {
                kind: 'category',
                key: 'Food & Drink',
                previousHiddenCategories: ['Services'],
                previousHiddenSubcategories: ['food-drink::bar']
            }
        });
    });

    it('builds show-only filters for a specific subcategory branch', () => {
        expect(
            PoiRegistryService.showOnlySubcategory(
                {
                    hiddenCategories: ['Nature'],
                    hiddenSubcategories: ['food-drink::deli'],
                    isolation: null
                },
                'Food & Drink',
                'food-drink::cafe',
                ['food-drink::restaurant', 'food-drink::cafe', 'food-drink::bar']
            )
        ).toEqual({
            hiddenCategories: expect.arrayContaining(['Shopping', 'Health', 'Transport']),
            hiddenSubcategories: ['food-drink::bar', 'food-drink::restaurant'],
            isolation: {
                kind: 'subcategory',
                key: 'food-drink::cafe',
                previousHiddenCategories: ['Nature'],
                previousHiddenSubcategories: ['food-drink::deli']
            }
        });
    });

    it('restores the previous visibility snapshot when the same category isolation is toggled off', () => {
        const isolated = PoiRegistryService.showOnlyCategory({
            hiddenCategories: ['Nature'],
            hiddenSubcategories: ['food-drink::bar'],
            isolation: null
        }, 'Food & Drink');

        expect(PoiRegistryService.showOnlyCategory(isolated, 'Food & Drink')).toEqual({
            hiddenCategories: ['Nature'],
            hiddenSubcategories: ['food-drink::bar'],
            isolation: null
        });
    });
});
