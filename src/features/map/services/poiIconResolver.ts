import { MAP_CATEGORIES, OSM_MAPPING } from '@/constants';
import { IconDefinition } from '@/types';
import { getCanonicalCategoryGroups, resolveCategoryGroupForPoi } from '@shared/taxonomy/poiTaxonomy';

export const FALLBACK_POI_ICON_KEY = 'Landmark';

const normalizeToken = (value?: string): string =>
  String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

const toDisplayLabel = (value?: string): string => {
  const normalized = String(value || '')
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!normalized) return '';
  return normalized
    .split(' ')
    .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1).toLowerCase())
    .join(' ');
};

const orderedUnique = (values: string[]): string[] => {
  const out: string[] = [];
  const seen = new Set<string>();
  values.forEach((value) => {
    const trimmed = value.trim();
    if (!trimmed) return;
    const key = normalizeToken(trimmed);
    if (!key || seen.has(key)) return;
    seen.add(key);
    out.push(trimmed);
  });
  return out;
};

const SUBCLASS_LOOKUP = new Map<string, { category: string; subcategory: string }>();
const CLASS_AND_SUBCLASS_LOOKUP = new Map<string, { category: string; subcategory: string }>();
Object.entries(OSM_MAPPING).forEach(([combo, value]) => {
  const [rawClass, rawSubclass] = combo.split('=');
  const classKey = normalizeToken(rawClass);
  if (!rawSubclass) return;
  const subclassKey = normalizeToken(rawSubclass);
  if (!subclassKey) return;
  SUBCLASS_LOOKUP.set(subclassKey, { category: value.category, subcategory: value.subcategory });
  if (classKey) {
    CLASS_AND_SUBCLASS_LOOKUP.set(`${classKey}=${subclassKey}`, { category: value.category, subcategory: value.subcategory });
  }
});

const FULL_POI_CATEGORY_CATALOG = orderedUnique([
  ...MAP_CATEGORIES,
  ...Object.values(OSM_MAPPING).map((entry) => entry.subcategory)
]);

const STYLE_SEED_POI_CATEGORY_CATALOG = orderedUnique([
  ...MAP_CATEGORIES
]);

export const getCanonicalPoiCategories = (categoriesInput?: string[]): string[] => {
  const sourceCategories = categoriesInput === undefined ? FULL_POI_CATEGORY_CATALOG : categoriesInput;
  const categories = orderedUnique([...sourceCategories]);
  if (
    categories.length > 0 &&
    !categories.some((value) => normalizeToken(value) === normalizeToken(FALLBACK_POI_ICON_KEY))
  ) {
    categories.push(FALLBACK_POI_ICON_KEY);
  }
  return categories;
};

export const getStyleSeedPoiCategories = (categoriesInput?: string[]): string[] => {
  const sourceCategories = categoriesInput === undefined ? STYLE_SEED_POI_CATEGORY_CATALOG : categoriesInput;
  return getCanonicalPoiCategories(sourceCategories);
};

export const resolvePoiTaxonomy = (subclass?: string, className?: string): { category: string; subcategory: string } => {
  const subclassKey = normalizeToken(subclass);
  const classKey = normalizeToken(className);
  const mappedByCombo = classKey && subclassKey
    ? CLASS_AND_SUBCLASS_LOOKUP.get(`${classKey}=${subclassKey}`)
    : null;
  const mapped = mappedByCombo || SUBCLASS_LOOKUP.get(subclassKey) || SUBCLASS_LOOKUP.get(classKey);
  if (mapped) return mapped;

  const fallbackLabel = toDisplayLabel(subclass || className) || FALLBACK_POI_ICON_KEY;
  return {
    category: resolveCategoryGroupForPoi({
      category: className,
      subcategory: fallbackLabel,
      rawClass: className
    }),
    subcategory: fallbackLabel,
  };
};

const buildAvailableIconIndex = (
  activeIcons: Record<string, IconDefinition>,
  options?: { includeKeysWithoutImage?: boolean }
): Map<string, string> => {
  const index = new Map<string, string>();
  Object.entries(activeIcons).forEach(([key, iconDef]) => {
    if (!iconDef) return;
    if (!options?.includeKeysWithoutImage && !iconDef.imageUrl) return;
    const normalized = normalizeToken(key);
    if (!normalized) return;
    if (!index.has(normalized)) {
      index.set(normalized, key);
    }
  });
  return index;
};

export const resolvePoiIconKey = (
  activeIcons: Record<string, IconDefinition>,
  options: {
    category?: string;
    subcategory?: string;
    subclass?: string;
  }
): string => {
  const available = buildAvailableIconIndex(activeIcons);
  const pick = (value?: string): string | null => {
    const normalized = normalizeToken(value);
    if (!normalized) return null;
    return available.get(normalized) || null;
  };

  const candidates = [
    options.subcategory,
    options.category,
    toDisplayLabel(options.subclass),
    FALLBACK_POI_ICON_KEY,
  ];

  for (const candidate of candidates) {
    const resolved = pick(candidate);
    if (resolved) return resolved;
  }

  const fallbackResolved = pick(FALLBACK_POI_ICON_KEY);
  return fallbackResolved || FALLBACK_POI_ICON_KEY;
};

export const resolvePoiRemixTarget = (
  activeIcons: Record<string, IconDefinition>,
  options: {
    category?: string;
    subcategory?: string;
    subclass?: string;
    className?: string;
    iconKey?: string;
  }
): string => {
  const available = buildAvailableIconIndex(activeIcons, { includeKeysWithoutImage: true });
  const categoryGroups = new Set(getCanonicalCategoryGroups().map((entry) => normalizeToken(entry)));
  const taxonomy = resolvePoiTaxonomy(options.subclass, options.className);
  const resolveExisting = (value?: string): string | null => {
    const normalized = normalizeToken(value);
    if (!normalized) return null;
    return available.get(normalized) || null;
  };
  const normalizeLabel = (value?: string): string => toDisplayLabel(value) || String(value || '').trim();

  const leafCandidates = [
    options.subcategory,
    taxonomy.subcategory,
    toDisplayLabel(options.subclass)
  ];

  for (const candidate of leafCandidates) {
    const existing = resolveExisting(candidate);
    if (existing) return existing;
  }

  for (const candidate of leafCandidates) {
    const normalized = normalizeToken(candidate);
    const label = normalizeLabel(candidate);
    if (!normalized || !label) continue;
    if (!categoryGroups.has(normalized)) {
      return label;
    }
  }

  const fallbackCandidates = [
    options.iconKey,
    taxonomy.category,
    options.category
  ];

  for (const candidate of fallbackCandidates) {
    const existing = resolveExisting(candidate);
    if (existing) return existing;
  }

  for (const candidate of fallbackCandidates) {
    const label = normalizeLabel(candidate);
    if (label) return label;
  }

  return '';
};
