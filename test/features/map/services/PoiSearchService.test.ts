import { afterEach, describe, expect, it, vi } from 'vitest';
import { PoiSearchService, evaluateOpeningHours } from '@/features/map/services/PoiSearchService';
import { PoiDetailsService } from '@/features/map/services/PoiDetailsService';
import { LoadedPoiSearchItem, PoiPopupDetails } from '@/types';

const createFeature = (overrides: Record<string, unknown> = {}) => ({
    type: 'Feature',
    geometry: {
        type: 'Point',
        coordinates: [-122.4194, 37.7749]
    },
    properties: {
        id: 'poi-1',
        title: 'Cafe Aurora',
        category: 'Food & Drink',
        subcategory: 'Cafe',
        iconKey: 'Cafe',
        ...overrides
    }
});

describe('evaluateOpeningHours', () => {
    it('treats 24/7 as always open', () => {
        expect(evaluateOpeningHours('24/7', new Date('2026-03-15T22:45:00'))).toBe(true);
    });

    it('matches regular daily opening ranges', () => {
        expect(evaluateOpeningHours('Mo-Su 07:00-20:00', new Date('2026-03-15T10:45:00'))).toBe(true);
        expect(evaluateOpeningHours('Mo-Su 07:00-20:00', new Date('2026-03-15T22:45:00'))).toBe(false);
    });

    it('supports overnight ranges that pass midnight', () => {
        expect(evaluateOpeningHours('Fr-Sa 17:30-02:00', new Date('2026-03-14T01:15:00'))).toBe(true);
        expect(evaluateOpeningHours('Fr-Sa 17:30-02:00', new Date('2026-03-14T10:15:00'))).toBe(false);
    });
});

describe('PoiSearchService.buildLoadedPoiItems', () => {
    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('extracts searchable loaded POIs and marks visible items first-class', () => {
        const items = PoiSearchService.buildLoadedPoiItems(
            [
                createFeature({
                    id: 'poi-visible',
                    title: 'Cafe Aurora',
                    website: 'https://aurora.example',
                    opening_hours: '24/7',
                    wikipedia: 'en:Cafe_Aurora'
                }),
                createFeature({
                    id: 'poi-hidden',
                    title: 'Night Owl Bar',
                    category: 'Food & Drink',
                    subcategory: 'Bar',
                    iconKey: 'Bar'
                })
            ],
            new Set(['poi-visible']),
            new Date('2026-03-15T10:45:00')
        );

        expect(items).toHaveLength(2);
        expect(items[0]).toMatchObject({
            id: 'poi-visible',
            title: 'Cafe Aurora',
            hasWebsite: true,
            hasPhoto: true,
            isOpenNow: true,
            shownOnMap: true
        });
        expect(items[1]).toMatchObject({
            id: 'poi-hidden',
            hasWebsite: false,
            hasPhoto: false,
            isOpenNow: false,
            shownOnMap: false
        });
    });

    it('merges cached POI details into search flags when popup enrichment already happened', () => {
        const cachedDetails: PoiPopupDetails = {
            status: 'loaded',
            googleMapsUrl: 'https://example.com/google',
            website: 'https://cached.example',
            openingHours: '24/7',
            photoUrl: 'https://example.com/photo.jpg',
            photoCandidates: [{ url: 'https://example.com/photo.jpg', source: 'wikimedia-commons' }]
        };
        vi.spyOn(PoiDetailsService, 'peekCachedDetails').mockReturnValue(cachedDetails);

        const items = PoiSearchService.buildLoadedPoiItems(
            [createFeature({ id: 'poi-cached', title: 'Cached Place' })],
            new Set<string>(),
            new Date('2026-03-15T10:45:00')
        );

        expect(items[0]).toMatchObject({
            id: 'poi-cached',
            hasWebsite: true,
            hasPhoto: true,
            isOpenNow: true,
            website: 'https://cached.example'
        });
    });

    it('normalizes raw category values into curated groups for places filters', () => {
        const items = PoiSearchService.buildLoadedPoiItems(
            [createFeature({
                id: 'poi-bag',
                title: 'Bag Boutique',
                category: 'Bag',
                subcategory: 'Bag',
                class: 'shop',
                iconKey: 'Landmark'
            })],
            new Set<string>()
        );

        expect(items[0]).toMatchObject({
            category: 'Shopping',
            subcategory: 'Bag',
            taxonomyKey: PoiSearchService.buildTaxonomyKey('Shopping', 'Bag')
        });
    });
});

describe('PoiSearchService.filterPois', () => {
    const items: LoadedPoiSearchItem[] = [
        {
            id: '1',
            title: 'Cafe Aurora',
            category: 'Food & Drink',
            subcategory: 'Cafe',
            taxonomyKey: PoiSearchService.buildTaxonomyKey('Food & Drink', 'Cafe'),
            iconKey: 'Cafe',
            coordinates: [-122.4194, 37.7749],
            address: '123 Market St',
            website: 'https://aurora.example',
            openingHours: '24/7',
            hasPhoto: true,
            hasWebsite: true,
            isOpenNow: true,
            shownOnMap: true
        },
        {
            id: '2',
            title: 'Maritime Plaza',
            category: 'Nature',
            subcategory: 'Park',
            taxonomyKey: PoiSearchService.buildTaxonomyKey('Nature', 'Park'),
            iconKey: 'Park',
            coordinates: [-122.4, 37.78],
            address: '300 Clay St',
            hasPhoto: true,
            hasWebsite: false,
            isOpenNow: false,
            shownOnMap: false
        },
        {
            id: '3',
            title: 'Office Hub',
            category: 'Services',
            subcategory: 'Office',
            taxonomyKey: PoiSearchService.buildTaxonomyKey('Services', 'Office'),
            iconKey: 'Office',
            coordinates: [-122.41, 37.77],
            address: '1 Spear St',
            website: 'https://office.example',
            hasPhoto: false,
            hasWebsite: true,
            isOpenNow: false,
            shownOnMap: true
        }
    ];

    it('matches query terms across title and category text', () => {
        const results = PoiSearchService.filterPois(items, {
            query: 'cafe food',
            category: PoiSearchService.ALL_CATEGORIES_VALUE,
            subcategory: PoiSearchService.ALL_SUBCATEGORIES_VALUE,
            hasPhoto: false,
            hasWebsite: false,
            openNow: false
        });

        expect(results.map((item) => item.id)).toEqual(['1']);
    });

    it('applies category and boolean filters in combination', () => {
        const results = PoiSearchService.filterPois(items, {
            query: '',
            category: 'Food & Drink',
            subcategory: PoiSearchService.buildTaxonomyKey('Food & Drink', 'Cafe'),
            hasPhoto: true,
            hasWebsite: true,
            openNow: true
        });

        expect(results.map((item) => item.id)).toEqual(['1']);
    });

    it('keeps visible matches sorted ahead of hidden ones', () => {
        const results = PoiSearchService.filterPoisWithVisibility(items, {
            query: '',
            category: PoiSearchService.ALL_CATEGORIES_VALUE,
            subcategory: PoiSearchService.ALL_SUBCATEGORIES_VALUE,
            hasPhoto: false,
            hasWebsite: false,
            openNow: false
        }, {
            hiddenCategories: ['Services'],
            hiddenSubcategories: [],
            isolation: null
        });

        expect(results.map((item) => item.id)).toEqual(['1', '2', '3']);
    });

    it('derives grouped category and subcategory summaries', () => {
        const taxonomy = PoiSearchService.deriveTaxonomySummary(items, {
            hiddenCategories: ['Services'],
            hiddenSubcategories: [],
            isolation: null
        });

        expect(taxonomy).toEqual([
            {
                category: 'Food & Drink',
                count: 1,
                shownCount: 1,
                subcategoryCount: 1,
                visibleSubcategoryCount: 1,
                subcategories: [
                    {
                        subcategory: 'Cafe',
                        taxonomyKey: PoiSearchService.buildTaxonomyKey('Food & Drink', 'Cafe'),
                        count: 1,
                        shownCount: 1
                    }
                ]
            },
            {
                category: 'Services',
                count: 1,
                shownCount: 0,
                subcategoryCount: 1,
                visibleSubcategoryCount: 0,
                subcategories: [
                    {
                        subcategory: 'Office',
                        taxonomyKey: PoiSearchService.buildTaxonomyKey('Services', 'Office'),
                        count: 1,
                        shownCount: 0
                    }
                ]
            },
            {
                category: 'Nature',
                count: 1,
                shownCount: 1,
                subcategoryCount: 1,
                visibleSubcategoryCount: 1,
                subcategories: [
                    {
                        subcategory: 'Park',
                        taxonomyKey: PoiSearchService.buildTaxonomyKey('Nature', 'Park'),
                        count: 1,
                        shownCount: 1
                    }
                ]
            }
        ]);
    });

    it('matches map visibility filters against categories and subcategories', () => {
        expect(PoiSearchService.matchesMapVisibilityFilters(items[0], {
            hiddenCategories: [],
            hiddenSubcategories: []
        })).toBe(true);

        expect(PoiSearchService.matchesMapVisibilityFilters(items[0], {
            hiddenCategories: ['Food & Drink'],
            hiddenSubcategories: []
        })).toBe(false);

        expect(PoiSearchService.matchesMapVisibilityFilters(items[0], {
            hiddenCategories: [],
            hiddenSubcategories: [PoiSearchService.buildTaxonomyKey('Food & Drink', 'Cafe')]
        })).toBe(false);
    });
});
