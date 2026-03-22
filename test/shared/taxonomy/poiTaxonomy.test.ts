import { describe, expect, it } from 'vitest';
import { buildIconSidebarGroups } from '@/shared/taxonomy/poiTaxonomy';
import { LoadedPoiSearchItem } from '@/types';

const buildPoi = (overrides: Partial<LoadedPoiSearchItem>): LoadedPoiSearchItem => ({
  id: 'poi-1',
  title: 'Bag Boutique',
  category: 'Shopping',
  subcategory: 'Bag',
  taxonomyKey: 'shopping::bag',
  iconKey: 'Landmark',
  coordinates: [-122.4194, 37.7749],
  hasPhoto: false,
  hasWebsite: false,
  isOpenNow: false,
  shownOnMap: true,
  ...overrides
});

describe('buildIconSidebarGroups', () => {
  it('merges observed loaded POI subcategories into the icon sidebar even before an icon exists', () => {
    const groups = buildIconSidebarGroups({}, [
      buildPoi({
        id: 'poi-1',
        subcategory: 'Bag',
        taxonomyKey: 'shopping::bag',
        category: 'Shopping'
      }),
      buildPoi({
        id: 'poi-2',
        subcategory: 'Arcade Gallery',
        taxonomyKey: 'entertainment::arcade-gallery',
        category: 'Entertainment'
      })
    ]);
    const shopping = groups.find((group) => group.groupName === 'Shopping');
    const entertainment = groups.find((group) => group.groupName === 'Entertainment');

    expect(shopping?.items).toContain('Bag');
    expect(entertainment?.items).toContain('Arcade Gallery');
  });
});
