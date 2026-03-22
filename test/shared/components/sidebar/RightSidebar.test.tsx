import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import RightSidebar from '@/shared/components/sidebar/RightSidebar';
import { AppStatus, IconDefinition, LoadedPoiSearchItem, PoiMapVisibilityFilters } from '@/types';
import { PoiSearchService } from '@/features/map/services/PoiSearchService';

const activeIcons: Record<string, IconDefinition> = {
  Cafe: {
    category: 'Cafe',
    prompt: 'cafe icon',
    imageUrl: 'data:image/png;base64,cafe'
  },
  Bar: {
    category: 'Bar',
    prompt: 'bar icon',
    imageUrl: 'data:image/png;base64,bar'
  },
  Supermarket: {
    category: 'Supermarket',
    prompt: 'test icon',
    imageUrl: 'data:image/png;base64,abc'
  }
};

const loadedPois: LoadedPoiSearchItem[] = [
  {
    id: 'poi-1',
    title: 'Corner Market',
    category: 'Shopping',
    subcategory: 'Supermarket',
    taxonomyKey: PoiSearchService.buildTaxonomyKey('Shopping', 'Supermarket'),
    iconKey: 'Supermarket',
    coordinates: [-122.4194, 37.7749],
    address: '123 Market St',
    hasPhoto: false,
    hasWebsite: false,
    isOpenNow: false,
    shownOnMap: true
  }
];

const defaultVisibility: PoiMapVisibilityFilters = {
  hiddenCategories: [],
  hiddenSubcategories: [],
  isolation: null
};

describe('RightSidebar', () => {
  it('keeps icon browsing free from POI count strings in icons mode', () => {
    render(
      <RightSidebar
        isOpen
        activeIcons={activeIcons}
        selectedCategory={null}
        onSelectCategory={vi.fn()}
        onRegenerateIcon={vi.fn()}
        status={AppStatus.IDLE}
        hasApiKey
        mode="icons"
        onModeChange={vi.fn()}
        loadedPois={loadedPois}
        selectedPoiId={null}
        onSelectPoi={vi.fn()}
        poiMapVisibilityFilters={defaultVisibility}
        onPoiMapVisibilityFiltersChange={vi.fn()}
      />
    );

    const iconAssetsList = screen.getByTestId('icon-assets-list');
    expect(iconAssetsList).toHaveTextContent('Shopping');
    expect(iconAssetsList).toHaveTextContent('Supermarket');
    expect(iconAssetsList).not.toHaveTextContent(/\bPOIs\b/);
    expect(iconAssetsList).not.toHaveTextContent(/\btypes\b/);
  });

  it('releases remix focus before selecting a different icon manually', () => {
    const onClearRemixFocus = vi.fn();
    const onSelectCategory = vi.fn();

    render(
      <RightSidebar
        isOpen
        activeIcons={activeIcons}
        selectedCategory="Cafe"
        remixFocusCategory="Cafe"
        onClearRemixFocus={onClearRemixFocus}
        onSelectCategory={onSelectCategory}
        onRegenerateIcon={vi.fn()}
        status={AppStatus.IDLE}
        hasApiKey
        mode="icons"
        onModeChange={vi.fn()}
        loadedPois={loadedPois}
        selectedPoiId={null}
        onSelectPoi={vi.fn()}
        poiMapVisibilityFilters={defaultVisibility}
        onPoiMapVisibilityFiltersChange={vi.fn()}
      />
    );

    screen.getByTestId('icon-item-bar').click();

    expect(onClearRemixFocus).toHaveBeenCalledTimes(1);
    expect(onSelectCategory).toHaveBeenCalledWith('Bar');
  });
});
