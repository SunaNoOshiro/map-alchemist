import { MAP_CATEGORIES, OSM_MAPPING } from '@/constants';
import { IconDefinition } from '@/types';

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

export const getCanonicalPoiCategories = (categoriesInput?: string[]): string[] => {
  const sourceCategories = categoriesInput === undefined ? MAP_CATEGORIES : categoriesInput;
  const categories = orderedUnique([...sourceCategories]);
  if (
    categories.length > 0 &&
    !categories.some((value) => normalizeToken(value) === normalizeToken(FALLBACK_POI_ICON_KEY))
  ) {
    categories.push(FALLBACK_POI_ICON_KEY);
  }
  return categories;
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
    category: fallbackLabel,
    subcategory: fallbackLabel,
  };
};

const buildAvailableIconIndex = (activeIcons: Record<string, IconDefinition>): Map<string, string> => {
  const index = new Map<string, string>();
  Object.entries(activeIcons).forEach(([key, iconDef]) => {
    if (!iconDef?.imageUrl) return;
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

  const firstAvailable = Object.keys(activeIcons).find((key) => Boolean(activeIcons[key]?.imageUrl));
  return firstAvailable || FALLBACK_POI_ICON_KEY;
};
