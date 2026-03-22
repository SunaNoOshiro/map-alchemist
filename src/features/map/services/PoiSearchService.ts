import {
    LoadedPoiSearchItem,
    PoiMapVisibilityFilters,
    PoiPopupDetails,
    PoiSearchFilters,
    PoiTaxonomySummaryCategory
} from '@/types';
import { compareCategoryGroups, resolveCategoryGroupForPoi } from '@shared/taxonomy/poiTaxonomy';
import { PoiDetailsService } from './PoiDetailsService';

const DAY_CODES = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'] as const;
const ALL_CATEGORIES_VALUE = '__all_categories__';
const ALL_SUBCATEGORIES_VALUE = '__all_subcategories__';

const normalizeSearchText = (value: unknown): string =>
    String(value || '')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, ' ')
        .trim();

const sanitizeText = (value: unknown): string | undefined => {
    if (typeof value !== 'string' && typeof value !== 'number') return undefined;
    const trimmed = String(value).trim();
    return trimmed || undefined;
};

const normalizeTaxonomyToken = (value: unknown): string =>
    String(value || '')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, ' ')
        .trim();

const parseCoordinates = (feature: any): [number, number] | null => {
    const coordinates = feature?.geometry?.coordinates;
    if (!Array.isArray(coordinates) || coordinates.length < 2) return null;

    const lng = Number(coordinates[0]);
    const lat = Number(coordinates[1]);
    if (!Number.isFinite(lng) || !Number.isFinite(lat)) return null;

    return [lng, lat];
};

const resolveFeatureId = (feature: any): string | undefined =>
    sanitizeText(feature?.properties?.id) ||
    sanitizeText(feature?.properties?.osm_id) ||
    sanitizeText(feature?.id);

const buildPhotoFlag = (properties: Record<string, unknown>, cachedDetails?: PoiPopupDetails): boolean =>
    Boolean(
        cachedDetails?.photoCandidates?.length ||
        cachedDetails?.photoUrl ||
        sanitizeText(properties.image) ||
        sanitizeText(properties.wikimedia_commons) ||
        sanitizeText(properties.wikipedia) ||
        sanitizeText(properties.wikidata)
    );

const getTaxonomyKey = (category: string, subcategory: string): string =>
    `${normalizeTaxonomyToken(category)}::${normalizeTaxonomyToken(subcategory)}`;

const getEffectiveNow = (): Date => {
    if (typeof window !== 'undefined') {
        const override = sanitizeText((window as any).__mapAlchemistPoiSearchNow);
        if (override) {
            const parsed = new Date(override);
            if (!Number.isNaN(parsed.getTime())) {
                return parsed;
            }
        }
    }

    return new Date();
};

const parseDayExpression = (value: string): number[] => {
    const tokens = value
        .split(',')
        .map((token) => token.trim())
        .filter(Boolean);

    if (tokens.length === 0) {
        return [0, 1, 2, 3, 4, 5, 6];
    }

    const result = new Set<number>();
    tokens.forEach((token) => {
        if (/^(PH|SH)$/i.test(token)) return;

        const rangeMatch = token.match(/^(Mo|Tu|We|Th|Fr|Sa|Su)\s*-\s*(Mo|Tu|We|Th|Fr|Sa|Su)$/i);
        if (rangeMatch) {
            const start = DAY_CODES.indexOf(rangeMatch[1] as typeof DAY_CODES[number]);
            const end = DAY_CODES.indexOf(rangeMatch[2] as typeof DAY_CODES[number]);
            if (start === -1 || end === -1) return;

            let cursor = start;
            result.add(cursor);
            while (cursor !== end) {
                cursor = (cursor + 1) % DAY_CODES.length;
                result.add(cursor);
            }
            return;
        }

        const singleIndex = DAY_CODES.indexOf(token as typeof DAY_CODES[number]);
        if (singleIndex !== -1) {
            result.add(singleIndex);
        }
    });

    return Array.from(result);
};

type ParsedTimeRange = {
    startMinutes: number;
    endMinutes: number;
};

const parseTimeRanges = (value: string): ParsedTimeRange[] =>
    value
        .split(',')
        .map((segment) => segment.trim())
        .flatMap((segment) => {
            const match = segment.match(/^(\d{1,2}):(\d{2})\s*-\s*(\d{1,2}):(\d{2})$/);
            if (!match) return [];

            const startMinutes = (Number(match[1]) * 60) + Number(match[2]);
            let endMinutes = (Number(match[3]) * 60) + Number(match[4]);
            if (endMinutes <= startMinutes) {
                endMinutes += 24 * 60;
            }

            return [{ startMinutes, endMinutes }];
        });

export const evaluateOpeningHours = (openingHours: string | undefined, now = getEffectiveNow()): boolean => {
    const normalized = sanitizeText(openingHours);
    if (!normalized) return false;

    const compact = normalized.replace(/\s+/g, '');
    if (compact === '24/7') return true;

    const currentDay = now.getDay();
    const currentMinutes = (now.getHours() * 60) + now.getMinutes();
    const previousDay = (currentDay + 6) % 7;
    const segments = normalized
        .split(';')
        .map((segment) => segment.trim())
        .filter(Boolean);

    for (const segment of segments) {
        if (segment.replace(/\s+/g, '') === '24/7') {
            return true;
        }

        const hasExplicitDays = /^(Mo|Tu|We|Th|Fr|Sa|Su)/.test(segment);
        const parts = hasExplicitDays ? segment.split(/\s+/, 2) : [];
        const dayExpression = hasExplicitDays ? parts[0] : '';
        const timeExpression = hasExplicitDays ? segment.slice(dayExpression.length).trim() : segment;
        if (!timeExpression || /\b(off|closed)\b/i.test(timeExpression)) continue;

        const matchingDays = hasExplicitDays ? parseDayExpression(dayExpression) : [0, 1, 2, 3, 4, 5, 6];
        const timeRanges = parseTimeRanges(timeExpression);
        for (const range of timeRanges) {
            const isOpenToday = matchingDays.includes(currentDay)
                && currentMinutes >= range.startMinutes
                && currentMinutes < Math.min(range.endMinutes, 24 * 60);
            if (isOpenToday) return true;

            const overnightMinutes = range.endMinutes - (24 * 60);
            const isOpenFromYesterday = range.endMinutes > (24 * 60)
                && matchingDays.includes(previousDay)
                && currentMinutes < overnightMinutes;
            if (isOpenFromYesterday) return true;
        }
    }

    return false;
};

const buildSearchItem = (
    feature: any,
    shownIds: Set<string>,
    now: Date
): LoadedPoiSearchItem | null => {
    const id = resolveFeatureId(feature);
    const coordinates = parseCoordinates(feature);
    if (!id || !coordinates) return null;

    const properties = (feature?.properties || {}) as Record<string, unknown>;
    const title = sanitizeText(properties.title) || sanitizeText(properties.name);
    if (!title) return null;

    const cachedDetails = PoiDetailsService.peekCachedDetails(feature);
    const initialDetails = PoiDetailsService.buildInitialDetails(feature);
    const mergedDetails: PoiPopupDetails = {
        ...initialDetails,
        ...cachedDetails
    };
    const rawCategory = sanitizeText(properties.category) || 'Other';
    const subcategory = sanitizeText(properties.subcategory) || rawCategory || 'Other';
    const category = resolveCategoryGroupForPoi({
        category: rawCategory,
        subcategory,
        iconKey: sanitizeText(properties.iconKey),
        rawClass: sanitizeText(properties.class)
    });

    return {
        id,
        title,
        category,
        subcategory,
        taxonomyKey: getTaxonomyKey(
            category,
            subcategory
        ),
        iconKey: sanitizeText(properties.iconKey) || 'Landmark',
        coordinates,
        address: mergedDetails.address,
        website: mergedDetails.website,
        openingHours: mergedDetails.openingHours,
        hasPhoto: buildPhotoFlag(properties, mergedDetails),
        hasWebsite: Boolean(mergedDetails.website),
        isOpenNow: evaluateOpeningHours(mergedDetails.openingHours, now),
        shownOnMap: shownIds.has(id)
    };
};

const matchesQuery = (item: LoadedPoiSearchItem, query: string): boolean => {
    const normalized = normalizeSearchText(query);
    if (!normalized) return true;

    const haystack = normalizeSearchText([
        item.title,
        item.category,
        item.subcategory,
        item.address
    ].filter(Boolean).join(' '));

    return normalized
        .split(/\s+/)
        .filter(Boolean)
        .every((token) => haystack.includes(token));
};

const isShownOnMap = (
    item: Pick<LoadedPoiSearchItem, 'category' | 'subcategory' | 'taxonomyKey' | 'shownOnMap'>,
    visibilityFilters?: PoiMapVisibilityFilters
): boolean => {
    if (!visibilityFilters) {
        return item.shownOnMap;
    }

    return PoiSearchService.matchesMapVisibilityFilters(item, visibilityFilters);
};

const compareSearchItems = (
    left: LoadedPoiSearchItem,
    right: LoadedPoiSearchItem,
    query: string,
    visibilityFilters?: PoiMapVisibilityFilters
): number => {
    const leftShown = isShownOnMap(left, visibilityFilters);
    const rightShown = isShownOnMap(right, visibilityFilters);
    if (leftShown !== rightShown) {
        return leftShown ? -1 : 1;
    }

    const normalizedQuery = normalizeSearchText(query);
    if (normalizedQuery) {
        const leftTitle = normalizeSearchText(left.title);
        const rightTitle = normalizeSearchText(right.title);
        const leftExact = leftTitle === normalizedQuery;
        const rightExact = rightTitle === normalizedQuery;
        if (leftExact !== rightExact) {
            return leftExact ? -1 : 1;
        }

        const leftStarts = leftTitle.startsWith(normalizedQuery);
        const rightStarts = rightTitle.startsWith(normalizedQuery);
        if (leftStarts !== rightStarts) {
            return leftStarts ? -1 : 1;
        }
    }

    return left.title.localeCompare(right.title);
};

const partitionVisibleFirst = (
    items: LoadedPoiSearchItem[],
    visibilityFilters?: PoiMapVisibilityFilters
): LoadedPoiSearchItem[] => {
    const shown: LoadedPoiSearchItem[] = [];
    const hidden: LoadedPoiSearchItem[] = [];

    items.forEach((item) => {
        if (isShownOnMap(item, visibilityFilters)) {
            shown.push(item);
        } else {
            hidden.push(item);
        }
    });

    return [...shown, ...hidden];
};

export class PoiSearchService {
    static readonly ALL_CATEGORIES_VALUE = ALL_CATEGORIES_VALUE;
    static readonly ALL_SUBCATEGORIES_VALUE = ALL_SUBCATEGORIES_VALUE;

    static buildTaxonomyKey(category: string, subcategory: string): string {
        return getTaxonomyKey(category, subcategory);
    }

    static buildLoadedPoiItems(
        features: any[],
        shownIds: Set<string>,
        now = getEffectiveNow()
    ): LoadedPoiSearchItem[] {
        return features
            .map((feature) => buildSearchItem(feature, shownIds, now))
            .filter((item): item is LoadedPoiSearchItem => Boolean(item))
            .sort((left, right) => left.title.localeCompare(right.title));
    }

    static filterPois(items: LoadedPoiSearchItem[], filters: PoiSearchFilters): LoadedPoiSearchItem[] {
        return PoiSearchService.filterPoisWithVisibility(items, filters);
    }

    static filterPoisWithVisibility(
        items: LoadedPoiSearchItem[],
        filters: PoiSearchFilters,
        visibilityFilters?: PoiMapVisibilityFilters
    ): LoadedPoiSearchItem[] {
        const hasQuery = Boolean(normalizeSearchText(filters.query));
        const hasStructuralFilters = Boolean(
            (filters.category && filters.category !== ALL_CATEGORIES_VALUE)
            || (filters.subcategory && filters.subcategory !== ALL_SUBCATEGORIES_VALUE)
            || filters.hasPhoto
            || filters.hasWebsite
            || filters.openNow
        );

        if (!hasQuery && !hasStructuralFilters) {
            return partitionVisibleFirst(items, visibilityFilters);
        }

        const filtered = items
            .filter((item) => {
                if (filters.category && filters.category !== ALL_CATEGORIES_VALUE && item.category !== filters.category) {
                    return false;
                }
                if (
                    filters.subcategory &&
                    filters.subcategory !== ALL_SUBCATEGORIES_VALUE &&
                    item.taxonomyKey !== filters.subcategory
                ) {
                    return false;
                }
                if (filters.hasPhoto && !item.hasPhoto) return false;
                if (filters.hasWebsite && !item.hasWebsite) return false;
                if (filters.openNow && !item.isOpenNow) return false;
                return matchesQuery(item, filters.query);
            });

        if (!hasQuery) {
            return partitionVisibleFirst(filtered, visibilityFilters);
        }

        return filtered.sort((left, right) => compareSearchItems(left, right, filters.query, visibilityFilters));
    }

    static deriveAvailableCategories(items: LoadedPoiSearchItem[]): string[] {
        return Array.from(new Set(items.map((item) => item.category).filter(Boolean))).sort(compareCategoryGroups);
    }

    static deriveTaxonomySummary(
        items: LoadedPoiSearchItem[],
        visibilityFilters?: PoiMapVisibilityFilters
    ): PoiTaxonomySummaryCategory[] {
        const buckets = new Map<string, { category: string; count: number; shownCount: number; subcategories: Map<string, { subcategory: string; taxonomyKey: string; count: number; shownCount: number; }>; }>();

        items.forEach((item) => {
            const categoryKey = normalizeTaxonomyToken(item.category);
            if (!categoryKey) return;

            const categoryBucket = buckets.get(categoryKey) || {
                category: item.category,
                count: 0,
                shownCount: 0,
                subcategories: new Map()
            };

            categoryBucket.count += 1;
            if (isShownOnMap(item, visibilityFilters)) categoryBucket.shownCount += 1;

            const subcategoryBucket = categoryBucket.subcategories.get(item.taxonomyKey) || {
                subcategory: item.subcategory,
                taxonomyKey: item.taxonomyKey,
                count: 0,
                shownCount: 0
            };
            subcategoryBucket.count += 1;
            if (isShownOnMap(item, visibilityFilters)) subcategoryBucket.shownCount += 1;

            categoryBucket.subcategories.set(item.taxonomyKey, subcategoryBucket);
            buckets.set(categoryKey, categoryBucket);
        });

        return Array.from(buckets.values())
            .map((bucket) => {
                const subcategories = Array.from(bucket.subcategories.values())
                    .sort((left, right) => left.subcategory.localeCompare(right.subcategory));
                const visibleSubcategoryCount = subcategories.filter((entry) =>
                    PoiSearchService.matchesMapVisibilityFilters(
                        {
                            category: bucket.category,
                            subcategory: entry.subcategory,
                            taxonomyKey: entry.taxonomyKey
                        },
                        visibilityFilters || { hiddenCategories: [], hiddenSubcategories: [], isolation: null }
                    )
                ).length;

                return {
                    category: bucket.category,
                    count: bucket.count,
                    shownCount: bucket.shownCount,
                    subcategoryCount: subcategories.length,
                    visibleSubcategoryCount,
                    subcategories
                };
            })
            .sort((left, right) => compareCategoryGroups(left.category, right.category));
    }

    static deriveSubcategoriesForCategory(
        items: LoadedPoiSearchItem[],
        category: string,
        visibilityFilters?: PoiMapVisibilityFilters
    ): Array<{ subcategory: string; taxonomyKey: string; count: number; shownCount: number }> {
        if (!category || category === ALL_CATEGORIES_VALUE) {
            return PoiSearchService.deriveTaxonomySummary(items, visibilityFilters)
                .flatMap((bucket) => bucket.subcategories)
                .sort((left, right) => left.subcategory.localeCompare(right.subcategory));
        }

        return (PoiSearchService.deriveTaxonomySummary(items, visibilityFilters).find((bucket) => bucket.category === category)?.subcategories || []);
    }

    static isShownOnMap(
        item: Pick<LoadedPoiSearchItem, 'category' | 'subcategory' | 'taxonomyKey' | 'shownOnMap'>,
        visibilityFilters?: PoiMapVisibilityFilters
    ): boolean {
        return isShownOnMap(item, visibilityFilters);
    }

    static matchesMapVisibilityFilters(
        input: Pick<LoadedPoiSearchItem, 'category' | 'subcategory' | 'taxonomyKey'> | { properties?: Record<string, unknown> },
        filters: PoiMapVisibilityFilters
    ): boolean {
        const category = 'category' in input
            ? input.category
            : sanitizeText(input.properties?.category) || 'Other';
        const subcategory = 'subcategory' in input
            ? input.subcategory
            : sanitizeText(input.properties?.subcategory) || category;
        const taxonomyKey = 'taxonomyKey' in input
            ? input.taxonomyKey
            : getTaxonomyKey(category, subcategory);

        return !filters.hiddenCategories.includes(category) && !filters.hiddenSubcategories.includes(taxonomyKey);
    }
}
