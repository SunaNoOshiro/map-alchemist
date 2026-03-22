import { PoiMapVisibilityFilters } from '@/types';
import {
    compareCategoryGroups,
    getCanonicalCategoryGroups,
    resolveCategoryGroupForPoi
} from '@shared/taxonomy/poiTaxonomy';
import { PoiSearchService } from './PoiSearchService';

const sanitizeText = (value: unknown): string | undefined => {
    if (typeof value !== 'string' && typeof value !== 'number') return undefined;
    const trimmed = String(value).trim();
    return trimmed || undefined;
};

const cloneFeature = (feature: any): any => ({
    ...feature,
    properties: { ...(feature?.properties || {}) },
    geometry: feature?.geometry
        ? {
            ...feature.geometry,
            coordinates: Array.isArray(feature.geometry.coordinates)
                ? [...feature.geometry.coordinates]
                : feature.geometry.coordinates
        }
        : feature?.geometry
});

const toComparableFeatureSnapshot = (feature: any) => {
    const properties = { ...(feature?.properties || {}) };
    delete properties.__lastSeenAt;

    return JSON.stringify({
        properties,
        geometry: feature?.geometry
    });
};

export class PoiRegistryService {
    static clearIsolation(filters: PoiMapVisibilityFilters): PoiMapVisibilityFilters {
        if (!filters.isolation) {
            return filters;
        }

        return {
            ...filters,
            isolation: null
        };
    }

    static resetVisibility(): PoiMapVisibilityFilters {
        return {
            hiddenCategories: [],
            hiddenSubcategories: [],
            isolation: null
        };
    }

    static isCategoryIsolated(filters: PoiMapVisibilityFilters, category: string): boolean {
        return filters.isolation?.kind === 'category' && filters.isolation.key === category;
    }

    static isSubcategoryIsolated(filters: PoiMapVisibilityFilters, taxonomyKey: string): boolean {
        return filters.isolation?.kind === 'subcategory' && filters.isolation.key === taxonomyKey;
    }

    static isCategoryVisible(filters: PoiMapVisibilityFilters, category: string): boolean {
        return !filters.hiddenCategories.includes(category);
    }

    static isSubcategoryVisible(filters: PoiMapVisibilityFilters, category: string, taxonomyKey: string): boolean {
        return PoiRegistryService.isCategoryVisible(filters, category) && !filters.hiddenSubcategories.includes(taxonomyKey);
    }

    static setCategoryVisibility(filters: PoiMapVisibilityFilters, category: string, visible: boolean): PoiMapVisibilityFilters {
        const hiddenCategories = new Set(filters.hiddenCategories);
        if (visible) {
            hiddenCategories.delete(category);
        } else {
            hiddenCategories.add(category);
        }

        return {
            ...PoiRegistryService.clearIsolation(filters),
            hiddenCategories: Array.from(hiddenCategories).sort(compareCategoryGroups)
        };
    }

    static setSubcategoryVisibility(filters: PoiMapVisibilityFilters, taxonomyKey: string, visible: boolean): PoiMapVisibilityFilters {
        const hiddenSubcategories = new Set(filters.hiddenSubcategories);
        if (visible) {
            hiddenSubcategories.delete(taxonomyKey);
        } else {
            hiddenSubcategories.add(taxonomyKey);
        }

        return {
            ...PoiRegistryService.clearIsolation(filters),
            hiddenSubcategories: Array.from(hiddenSubcategories).sort((left, right) => left.localeCompare(right))
        };
    }

    static showOnlyCategory(
        filters: PoiMapVisibilityFilters,
        category: string,
        allCategories = getCanonicalCategoryGroups()
    ): PoiMapVisibilityFilters {
        if (PoiRegistryService.isCategoryIsolated(filters, category)) {
            return {
                hiddenCategories: [...filters.isolation!.previousHiddenCategories].sort(compareCategoryGroups),
                hiddenSubcategories: [...filters.isolation!.previousHiddenSubcategories].sort((left, right) => left.localeCompare(right)),
                isolation: null
            };
        }

        return {
            hiddenCategories: allCategories
                .filter((candidate) => candidate !== category)
                .sort(compareCategoryGroups),
            hiddenSubcategories: [],
            isolation: {
                kind: 'category',
                key: category,
                previousHiddenCategories: [...filters.hiddenCategories],
                previousHiddenSubcategories: [...filters.hiddenSubcategories]
            }
        };
    }

    static showOnlySubcategory(
        filters: PoiMapVisibilityFilters,
        category: string,
        taxonomyKey: string,
        siblingTaxonomyKeys: string[],
        allCategories = getCanonicalCategoryGroups()
    ): PoiMapVisibilityFilters {
        if (PoiRegistryService.isSubcategoryIsolated(filters, taxonomyKey)) {
            return {
                hiddenCategories: [...filters.isolation!.previousHiddenCategories].sort(compareCategoryGroups),
                hiddenSubcategories: [...filters.isolation!.previousHiddenSubcategories].sort((left, right) => left.localeCompare(right)),
                isolation: null
            };
        }

        return {
            hiddenCategories: allCategories
                .filter((candidate) => candidate !== category)
                .sort(compareCategoryGroups),
            hiddenSubcategories: siblingTaxonomyKeys
                .filter((candidate) => candidate !== taxonomyKey)
                .sort((left, right) => left.localeCompare(right)),
            isolation: {
                kind: 'subcategory',
                key: taxonomyKey,
                previousHiddenCategories: [...filters.hiddenCategories],
                previousHiddenSubcategories: [...filters.hiddenSubcategories]
            }
        };
    }

    static resolveFeatureId(feature: any): string | undefined {
        return sanitizeText(feature?.properties?.id)
            || sanitizeText(feature?.properties?.osm_id)
            || sanitizeText(feature?.id);
    }

    static mergeDiscoveredFeatures(
        existingRegistry: Map<string, any>,
        discoveredFeatures: any[],
        seenAt = Date.now()
    ): {
        registry: Map<string, any>;
        changed: boolean;
        addedIds: string[];
    } {
        const nextRegistry = new Map(existingRegistry);
        let changed = false;
        const addedIds: string[] = [];

        discoveredFeatures.forEach((feature) => {
            const id = PoiRegistryService.resolveFeatureId(feature);
            if (!id) return;

            const nextFeature = cloneFeature(feature);
            nextFeature.properties = {
                ...(nextFeature.properties || {}),
                __lastSeenAt: seenAt
            };

            const previous = nextRegistry.get(id);
            const nextSignature = toComparableFeatureSnapshot(nextFeature);
            const previousSignature = previous ? toComparableFeatureSnapshot(previous) : null;

            if (previousSignature !== nextSignature) {
                nextRegistry.set(id, nextFeature);
                changed = true;
            }

            if (!previous) {
                addedIds.push(id);
            }
        });

        return { registry: nextRegistry, changed, addedIds };
    }

    static toFeatureCollection(registry: Map<string, any>): { type: 'FeatureCollection'; features: any[] } {
        return {
            type: 'FeatureCollection',
            features: Array.from(registry.values()).sort((left, right) =>
                String(left?.properties?.id || '').localeCompare(String(right?.properties?.id || ''))
            )
        };
    }

    static buildLayerVisibilityFilter(filters: PoiMapVisibilityFilters): any[] | null {
        const clauses: any[] = [];

        if (filters.hiddenCategories.length > 0) {
            clauses.push(['match', ['get', 'category'], filters.hiddenCategories, false, true]);
        }

        if (filters.hiddenSubcategories.length > 0) {
            clauses.push([
                'match',
                ['get', 'taxonomyKey'],
                filters.hiddenSubcategories,
                false,
                true
            ]);
        }

        if (clauses.length === 0) {
            return null;
        }

        return ['all', ...clauses];
    }

    static buildCategoryLayerVisibilityFilter(filters: PoiMapVisibilityFilters, category: string): any[] {
        const clauses: any[] = [
            ['==', ['get', 'category'], category]
        ];

        if (filters.hiddenSubcategories.length > 0) {
            clauses.push([
                'match',
                ['get', 'taxonomyKey'],
                filters.hiddenSubcategories,
                false,
                true
            ]);
        }

        return ['all', ...clauses];
    }

    static applyMapVisibilityMetadata(feature: any): any {
        const nextFeature = cloneFeature(feature);
        const rawCategory = sanitizeText(nextFeature?.properties?.category) || 'Other';
        const subcategory = sanitizeText(nextFeature?.properties?.subcategory) || rawCategory;
        const category = resolveCategoryGroupForPoi({
            category: rawCategory,
            subcategory,
            iconKey: sanitizeText(nextFeature?.properties?.iconKey),
            rawClass: sanitizeText(nextFeature?.properties?.class)
        });
        nextFeature.properties = {
            ...(nextFeature.properties || {}),
            category,
            subcategory,
            taxonomyKey: PoiSearchService.buildTaxonomyKey(category, subcategory)
        };
        return nextFeature;
    }
}
