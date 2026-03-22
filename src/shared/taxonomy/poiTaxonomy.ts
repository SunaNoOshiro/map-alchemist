import { CATEGORY_GROUPS, OSM_MAPPING } from '@/constants';
import { IconDefinition, LoadedPoiSearchItem } from '@/types';

export const OTHER_CATEGORY_GROUP = 'Other';
export const THEME_EXTRAS_GROUP = 'Theme Extras';

const normalizeToken = (value?: string): string =>
  String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

const ITEM_TO_GROUP = new Map<string, string>();
const GROUP_ORDER = [...Object.keys(CATEGORY_GROUPS), OTHER_CATEGORY_GROUP];
const BASE_GROUP_ITEMS = new Map<string, string[]>();

Object.entries(CATEGORY_GROUPS).forEach(([groupName, items]) => {
  ITEM_TO_GROUP.set(normalizeToken(groupName), groupName);
  BASE_GROUP_ITEMS.set(groupName, [...items]);
  items.forEach((item) => {
    const normalized = normalizeToken(item);
    if (normalized) {
      ITEM_TO_GROUP.set(normalized, groupName);
    }
  });
});

const CLASS_FALLBACK_GROUPS: Record<string, string> = {
  aeroway: 'Transport',
  amenity: 'Services',
  building: 'Civic',
  craft: 'Services',
  emergency: 'Public Services',
  healthcare: 'Health',
  highway: 'Transport',
  historic: 'Attractions',
  leisure: 'Sports & Leisure',
  man_made: 'Attractions',
  natural: 'Nature',
  office: 'Services',
  place_of_worship: 'Religious',
  public_transport: 'Transport',
  railway: 'Transport',
  shop: 'Shopping',
  tourism: 'Attractions'
};

const addBaseGroupItem = (groupName: string, item: string) => {
  if (!groupName || !item) return;
  const normalized = normalizeToken(item);
  if (!normalized) return;
  const bucket = BASE_GROUP_ITEMS.get(groupName) || [];
  if (bucket.some((existing) => normalizeToken(existing) === normalized)) return;
  bucket.push(item);
  BASE_GROUP_ITEMS.set(groupName, bucket);
  if (!ITEM_TO_GROUP.has(normalized)) {
    ITEM_TO_GROUP.set(normalized, groupName);
  }
};

Object.values(OSM_MAPPING).forEach(({ category, subcategory }) => {
  addBaseGroupItem(category, subcategory);
});

const BASE_GROUP_ITEM_ORDER = new Map<string, Map<string, number>>();
BASE_GROUP_ITEMS.forEach((items, groupName) => {
  BASE_GROUP_ITEM_ORDER.set(
    groupName,
    new Map(items.map((item, index) => [normalizeToken(item), index]))
  );
});

export const getCanonicalCategoryGroups = (): string[] => [...GROUP_ORDER];

export const resolveCategoryGroupForValue = (value?: string): string | null => {
  const normalized = normalizeToken(value);
  if (!normalized) return null;
  return ITEM_TO_GROUP.get(normalized) || null;
};

export const resolveCategoryGroupForPoi = (options: {
  category?: string;
  subcategory?: string;
  iconKey?: string;
  rawClass?: string;
}): string => {
  const directMatch = [
    options.category,
    options.subcategory
  ].map(resolveCategoryGroupForValue).find(Boolean);

  if (directMatch) {
    return directMatch;
  }

  const rawClassKey = normalizeToken(options.rawClass);
  if (rawClassKey && CLASS_FALLBACK_GROUPS[rawClassKey]) {
    return CLASS_FALLBACK_GROUPS[rawClassKey];
  }

  const iconGroup = resolveCategoryGroupForValue(options.iconKey);
  if (iconGroup) {
    return iconGroup;
  }

  return OTHER_CATEGORY_GROUP;
};

export const compareCategoryGroups = (left: string, right: string): number => {
  const leftIndex = GROUP_ORDER.indexOf(left);
  const rightIndex = GROUP_ORDER.indexOf(right);

  if (leftIndex !== -1 || rightIndex !== -1) {
    if (leftIndex === -1) return 1;
    if (rightIndex === -1) return -1;
    if (leftIndex !== rightIndex) {
      return leftIndex - rightIndex;
    }
  }

  return left.localeCompare(right);
};

const sortItemsWithinGroup = (groupName: string, items: string[]): string[] => {
  const order = BASE_GROUP_ITEM_ORDER.get(groupName);
  return [...items].sort((left, right) => {
    const leftIndex = order?.get(normalizeToken(left));
    const rightIndex = order?.get(normalizeToken(right));

    if (leftIndex !== undefined || rightIndex !== undefined) {
      if (leftIndex === undefined) return 1;
      if (rightIndex === undefined) return -1;
      if (leftIndex !== rightIndex) return leftIndex - rightIndex;
    }

    return left.localeCompare(right);
  });
};

export const buildIconSidebarGroups = (
  activeIcons: Record<string, IconDefinition>,
  observedPois: LoadedPoiSearchItem[] = []
): Array<{ groupName: string; items: string[] }> => {
  const groupBuckets = new Map<string, Set<string>>();
  BASE_GROUP_ITEMS.forEach((items, groupName) => {
    groupBuckets.set(groupName, new Set(items));
  });

  observedPois.forEach((poi) => {
    const groupName = poi.category || OTHER_CATEGORY_GROUP;
    if (!groupBuckets.has(groupName)) {
      groupBuckets.set(groupName, new Set());
    }
    groupBuckets.get(groupName)!.add(poi.subcategory);
  });

  const knownItems = new Set(
    Array.from(groupBuckets.values()).flatMap((group) =>
      Array.from(group).map((item) => normalizeToken(item))
    )
  );
  const extras = new Set<string>();
  Object.keys(activeIcons).forEach((key) => {
    const normalized = normalizeToken(key);
    if (!normalized) return;
    if (knownItems.has(normalized)) return;

    const resolvedGroup = resolveCategoryGroupForValue(key);
    if (resolvedGroup) {
      if (!groupBuckets.has(resolvedGroup)) {
        groupBuckets.set(resolvedGroup, new Set());
      }
      groupBuckets.get(resolvedGroup)!.add(key);
      return;
    }

    extras.add(key);
  });

  const orderedGroups = Array.from(groupBuckets.entries())
    .filter(([, items]) => items.size > 0)
    .sort(([left], [right]) => compareCategoryGroups(left, right))
    .map(([groupName, items]) => ({
      groupName,
      items: sortItemsWithinGroup(groupName, Array.from(items))
    }));

  if (extras.size > 0) {
    orderedGroups.push({
      groupName: THEME_EXTRAS_GROUP,
      items: Array.from(extras).sort((left, right) => left.localeCompare(right))
    });
  }

  return orderedGroups;
};
