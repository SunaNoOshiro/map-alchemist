import React from 'react';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import PoiSearchPanel from '@/shared/components/sidebar/right/PoiSearchPanel';
import { LoadedPoiSearchItem } from '@/types';
import { PoiRegistryService } from '@/features/map/services/PoiRegistryService';
import { PoiSearchService } from '@/features/map/services/PoiSearchService';

const buildPoi = (overrides: Partial<LoadedPoiSearchItem>): LoadedPoiSearchItem => ({
    id: 'poi-1',
    title: 'Cafe Aurora',
    category: 'Food & Drink',
    subcategory: 'Cafe',
    taxonomyKey: PoiSearchService.buildTaxonomyKey('Food & Drink', 'Cafe'),
    iconKey: 'Cafe',
    coordinates: [-122.4194, 37.7749],
    address: '123 Market St',
    hasPhoto: true,
    hasWebsite: true,
    isOpenNow: true,
    shownOnMap: true,
    ...overrides
});

describe('PoiSearchPanel', () => {
    it('uses app-style taxonomy menus and a single clear action', () => {
        render(
            <PoiSearchPanel
                pois={[
                    buildPoi({}),
                    buildPoi({
                        id: 'poi-2',
                        title: 'Night Owl Bar',
                        subcategory: 'Bar',
                        taxonomyKey: PoiSearchService.buildTaxonomyKey('Food & Drink', 'Bar'),
                        iconKey: 'Bar'
                    })
                ]}
                selectedPoiId={null}
                onSelectPoi={() => undefined}
                mapVisibilityFilters={{ hiddenCategories: [], hiddenSubcategories: [], isolation: null }}
                onMapVisibilityFiltersChange={() => undefined}
            />
        );

        fireEvent.change(screen.getByTestId('poi-search-input'), { target: { value: 'aurora' } });
        expect(screen.getAllByLabelText('Clear search query')).toHaveLength(1);
        expect(screen.getByTestId('poi-category-filter').className).toContain('bg-gray-700');

        fireEvent.click(screen.getByTestId('poi-category-filter'));
        expect(screen.getByTestId('poi-category-filter-option-all-categories')).toHaveTextContent(/^All categories$/);
        expect(screen.getByTestId('poi-category-filter-option-food-drink').className).toContain('hover:bg-gray-600');
        expect(screen.getByTestId('poi-category-filter-option-food-drink')).toHaveTextContent(/^Food & Drink$/);
        fireEvent.click(screen.getByTestId('poi-category-filter-option-food-drink'));

        fireEvent.click(screen.getByTestId('poi-subcategory-filter'));
        fireEvent.click(screen.getByTestId('poi-subcategory-filter-option-food-drink-cafe'));

        expect(screen.getByTestId('poi-search-results')).toContainHTML('Cafe Aurora');
        expect(screen.getByTestId('poi-search-results')).not.toContainHTML('Night Owl Bar');
        expect(screen.getByTestId('poi-map-visibility-count-legend')).toHaveTextContent('visible / total types');
    });

    it('closes taxonomy dropdowns when other filter controls are used', () => {
        render(
            <PoiSearchPanel
                pois={[
                    buildPoi({}),
                    buildPoi({
                        id: 'poi-2',
                        title: 'Night Owl Bar',
                        subcategory: 'Bar',
                        taxonomyKey: PoiSearchService.buildTaxonomyKey('Food & Drink', 'Bar'),
                        iconKey: 'Bar'
                    })
                ]}
                selectedPoiId={null}
                onSelectPoi={() => undefined}
                mapVisibilityFilters={{ hiddenCategories: [], hiddenSubcategories: [], isolation: null }}
                onMapVisibilityFiltersChange={() => undefined}
            />
        );

        fireEvent.click(screen.getByTestId('poi-category-filter'));
        expect(screen.getByTestId('poi-category-filter-option-food-drink')).toBeInTheDocument();

        fireEvent.click(screen.getByTestId('poi-filter-has-photo'));
        expect(screen.queryByTestId('poi-category-filter-option-food-drink')).not.toBeInTheDocument();

        fireEvent.click(screen.getByTestId('poi-subcategory-filter'));
        expect(screen.getByTestId('poi-subcategory-filter-option-food-drink-cafe')).toBeInTheDocument();

        fireEvent.focus(screen.getByTestId('poi-search-input'));
        expect(screen.queryByTestId('poi-subcategory-filter-option-food-drink-cafe')).not.toBeInTheDocument();
    });

    it('shows only currently visible loaded taxonomy options in Places filters', async () => {
        render(
            <PoiSearchPanel
                pois={[
                    buildPoi({}),
                    buildPoi({
                        id: 'poi-2',
                        title: 'Corner Market',
                        category: 'Shopping',
                        subcategory: 'Supermarket',
                        taxonomyKey: PoiSearchService.buildTaxonomyKey('Shopping', 'Supermarket'),
                        iconKey: 'Supermarket'
                    })
                ]}
                selectedPoiId={null}
                onSelectPoi={() => undefined}
                mapVisibilityFilters={{
                    hiddenCategories: ['Shopping'],
                    hiddenSubcategories: [],
                    isolation: null
                }}
                onMapVisibilityFiltersChange={() => undefined}
            />
        );

        fireEvent.click(screen.getByTestId('poi-category-filter'));

        await waitFor(() => {
            expect(screen.getByTestId('poi-category-filter-option-food-drink')).toBeInTheDocument();
        });

        expect(screen.queryByTestId('poi-category-filter-option-shopping')).not.toBeInTheDocument();
    });

    it('keeps map visibility controls collapsed by default', () => {
        render(
            <PoiSearchPanel
                pois={[buildPoi({})]}
                selectedPoiId={null}
                onSelectPoi={() => undefined}
                mapVisibilityFilters={{ hiddenCategories: [], hiddenSubcategories: [], isolation: null }}
                onMapVisibilityFiltersChange={() => undefined}
            />
        );

        expect(screen.queryByTestId('poi-map-category-checkbox-food-drink')).not.toBeInTheDocument();
        fireEvent.click(screen.getByTestId('poi-map-visibility-toggle'));
        expect(screen.getByTestId('poi-map-category-checkbox-food-drink')).toBeInTheDocument();
    });

    it('emits map visibility filter changes through category checkboxes', () => {
        const onMapVisibilityFiltersChange = vi.fn();

        render(
            <PoiSearchPanel
                pois={[buildPoi({})]}
                selectedPoiId={null}
                onSelectPoi={() => undefined}
                mapVisibilityFilters={{ hiddenCategories: [], hiddenSubcategories: [], isolation: null }}
                onMapVisibilityFiltersChange={onMapVisibilityFiltersChange}
            />
        );

        fireEvent.click(screen.getByTestId('poi-map-visibility-toggle'));
        fireEvent.click(screen.getByTestId('poi-map-category-checkbox-food-drink'));

        expect(onMapVisibilityFiltersChange).toHaveBeenCalledWith({
            hiddenCategories: ['Food & Drink'],
            hiddenSubcategories: [],
            isolation: null
        });
    });

    it('emits show-only map visibility changes from category actions', () => {
        const onMapVisibilityFiltersChange = vi.fn();

        render(
            <PoiSearchPanel
                pois={[buildPoi({})]}
                selectedPoiId={null}
                onSelectPoi={() => undefined}
                mapVisibilityFilters={{ hiddenCategories: [], hiddenSubcategories: [], isolation: null }}
                onMapVisibilityFiltersChange={onMapVisibilityFiltersChange}
            />
        );

        fireEvent.click(screen.getByTestId('poi-map-visibility-toggle'));
        fireEvent.click(screen.getByTestId('poi-map-category-only-food-drink'));

        expect(onMapVisibilityFiltersChange).toHaveBeenCalledWith(
            expect.objectContaining({
                hiddenSubcategories: []
            })
        );
        expect(onMapVisibilityFiltersChange.mock.calls[0][0].hiddenCategories).not.toContain('Food & Drink');
        expect(onMapVisibilityFiltersChange.mock.calls[0][0].isolation).toEqual(
            expect.objectContaining({
                kind: 'category',
                key: 'Food & Drink'
            })
        );
    });

    it('tints loaded-place map visibility actions with the category accent color', () => {
        render(
            <PoiSearchPanel
                pois={[buildPoi({})]}
                selectedPoiId={null}
                onSelectPoi={() => undefined}
                mapVisibilityFilters={{ hiddenCategories: [], hiddenSubcategories: [], isolation: null }}
                onMapVisibilityFiltersChange={() => undefined}
            />
        );

        fireEvent.click(screen.getByTestId('poi-map-visibility-toggle'));
        expect(screen.getByTestId('poi-map-category-eye-food-drink').style.getPropertyValue('--sidebar-action-accent')).toBe('#f97316');

        fireEvent.click(screen.getByTestId('poi-map-category-toggle-food-drink'));
        expect(screen.getByTestId('poi-map-subcategory-eye-food-drink-cafe').style.getPropertyValue('--sidebar-action-accent')).toBe('#f97316');
    });

    it('windows large result lists until the user explicitly loads more', () => {
        const pois = Array.from({ length: 95 }, (_, index) => buildPoi({
            id: `poi-${index + 1}`,
            title: `Cafe ${index + 1}`
        }));

        render(
            <PoiSearchPanel
                pois={pois}
                selectedPoiId={null}
                onSelectPoi={() => undefined}
                mapVisibilityFilters={{ hiddenCategories: [], hiddenSubcategories: [], isolation: null }}
                onMapVisibilityFiltersChange={() => undefined}
            />
        );

        expect(screen.getAllByTestId('poi-search-result')).toHaveLength(80);
        expect(screen.getByTestId('poi-results-windowing-note')).toHaveTextContent('Showing 80 of 95');

        fireEvent.click(screen.getByTestId('poi-search-load-more'));

        expect(screen.getAllByTestId('poi-search-result')).toHaveLength(95);
    });

    it('restores the previous visibility snapshot when show-only is toggled twice', () => {
        const onMapVisibilityFiltersChange = vi.fn();
        const isolatedFilters = PoiRegistryService.showOnlyCategory(
            {
                hiddenCategories: ['Services'],
                hiddenSubcategories: ['food-drink::bar'],
                isolation: null
            },
            'Food & Drink'
        );

        render(
            <PoiSearchPanel
                pois={[buildPoi({})]}
                selectedPoiId={null}
                onSelectPoi={() => undefined}
                mapVisibilityFilters={isolatedFilters}
                onMapVisibilityFiltersChange={onMapVisibilityFiltersChange}
            />
        );

        fireEvent.click(screen.getByTestId('poi-map-visibility-toggle'));
        fireEvent.click(screen.getByTestId('poi-map-category-only-food-drink'));

        expect(onMapVisibilityFiltersChange).toHaveBeenCalledWith({
            hiddenCategories: ['Services'],
            hiddenSubcategories: ['food-drink::bar'],
            isolation: null
        });
    });

    it('marks hidden results with the hidden badge text from current map visibility filters', () => {
        render(
            <PoiSearchPanel
                pois={[buildPoi({ shownOnMap: true })]}
                selectedPoiId={null}
                onSelectPoi={() => undefined}
                mapVisibilityFilters={{ hiddenCategories: ['Food & Drink'], hiddenSubcategories: [], isolation: null }}
                onMapVisibilityFiltersChange={() => undefined}
            />
        );

        expect(screen.getByTestId('poi-search-results')).toContainHTML('Hidden');
        expect(screen.getByTestId('poi-search-results')).not.toContainHTML('Shown');
    });

    it('shows category chips in result cards and category rows count visible types', () => {
        render(
            <PoiSearchPanel
                pois={[
                    buildPoi({}),
                    buildPoi({
                        id: 'poi-2',
                        title: 'Night Owl Bar',
                        subcategory: 'Bar',
                        taxonomyKey: PoiSearchService.buildTaxonomyKey('Food & Drink', 'Bar'),
                        iconKey: 'Bar'
                    })
                ]}
                selectedPoiId={null}
                onSelectPoi={() => undefined}
                mapVisibilityFilters={{ hiddenCategories: [], hiddenSubcategories: [], isolation: null }}
                onMapVisibilityFiltersChange={() => undefined}
            />
        );

        const firstResult = screen.getAllByTestId('poi-search-result')[0];
        const title = within(firstResult).getByText('Cafe Aurora');
        const chip = within(firstResult).getByTestId('poi-result-category-chip');
        expect(chip).toHaveTextContent('Food & Drink');
        expect(title.compareDocumentPosition(chip) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();

        fireEvent.click(screen.getByTestId('poi-map-visibility-toggle'));
        expect(screen.getByTitle('2 visible of 2 total subcategories')).toHaveTextContent('2 / 2 types');
        fireEvent.click(screen.getByTestId('poi-map-category-toggle-food-drink'));
        expect(screen.getAllByTitle('1 shown of 1 loaded POIs').length).toBeGreaterThan(0);
    });

    it('limits category and subcategory dropdown options to POIs currently shown on the map', () => {
        render(
            <PoiSearchPanel
                pois={[
                    buildPoi({}),
                    buildPoi({
                        id: 'poi-2',
                        title: 'Hidden Hardware',
                        category: 'Shopping',
                        subcategory: 'Hardware Store',
                        taxonomyKey: PoiSearchService.buildTaxonomyKey('Shopping', 'Hardware Store'),
                        iconKey: 'Hardware Store',
                        shownOnMap: true
                    })
                ]}
                selectedPoiId={null}
                onSelectPoi={() => undefined}
                mapVisibilityFilters={{ hiddenCategories: ['Shopping'], hiddenSubcategories: [], isolation: null }}
                onMapVisibilityFiltersChange={() => undefined}
            />
        );

        fireEvent.click(screen.getByTestId('poi-category-filter'));
        expect(screen.getByTestId('poi-category-filter-option-food-drink')).toBeInTheDocument();
        expect(screen.queryByTestId('poi-category-filter-option-shopping')).not.toBeInTheDocument();

        fireEvent.click(screen.getByTestId('poi-category-filter-option-food-drink'));
        fireEvent.click(screen.getByTestId('poi-subcategory-filter'));
        expect(screen.getByTestId('poi-subcategory-filter-option-food-drink-cafe')).toBeInTheDocument();
        expect(screen.queryByTestId('poi-subcategory-filter-option-shopping-hardware-store')).not.toBeInTheDocument();
    });
});
