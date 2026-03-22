import React, {
    startTransition,
    useCallback,
    useDeferredValue,
    useEffect,
    useMemo,
    useRef,
    useState
} from 'react';
import {
    Camera,
    ChevronDown,
    ChevronRight,
    Clock3,
    Globe,
    MapPin,
    Search,
    X
} from 'lucide-react';
import { LoadedPoiSearchItem, PoiMapVisibilityFilters, PoiSearchFilters } from '@/types';
import { PoiRegistryService } from '@/features/map/services/PoiRegistryService';
import { PoiSearchService } from '@/features/map/services/PoiSearchService';
import { CATEGORY_COLORS } from '@/constants';
import SidebarSelectMenu from '@shared/components/sidebar/common/SidebarSelectMenu';
import SidebarCheckbox from '@shared/components/sidebar/common/SidebarCheckbox';
import SidebarVisibilityActions from '@shared/components/sidebar/common/SidebarVisibilityActions';
import { UI_CONTROLS, UI_TYPOGRAPHY, uiClass } from '@shared/styles/uiTokens';

interface PoiSearchPanelProps {
    pois: LoadedPoiSearchItem[];
    isActive?: boolean;
    selectedPoiId?: string | null;
    onSelectPoi: (poiId: string) => void;
    mapVisibilityFilters: PoiMapVisibilityFilters;
    onMapVisibilityFiltersChange: (filters: PoiMapVisibilityFilters) => void;
}

const RESULTS_BATCH_SIZE = 80;
const EMPTY_POIS: LoadedPoiSearchItem[] = [];

const baseFilters: PoiSearchFilters = {
    query: '',
    category: PoiSearchService.ALL_CATEGORIES_VALUE,
    subcategory: PoiSearchService.ALL_SUBCATEGORIES_VALUE,
    hasPhoto: false,
    hasWebsite: false,
    openNow: false
};

const resultMetaChipClass = 'inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium';

const filterButtonClass = (active: boolean) => uiClass(
    UI_CONTROLS.subtleButton,
    'min-h-10 flex-1 gap-2 rounded-md px-3 py-2 normal-case tracking-normal text-sm font-medium leading-4 bg-gray-900/40',
    active
        ? 'border-gray-500 bg-gray-800/80 text-white shadow-[inset_0_0_0_1px_rgba(255,255,255,0.03)]'
        : 'border-gray-700 text-gray-300 hover:border-gray-600 hover:bg-gray-800/60 hover:text-white'
);

const toTestToken = (value: string): string =>
    value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');

const PoiSearchPanel: React.FC<PoiSearchPanelProps> = ({
    pois,
    isActive = true,
    selectedPoiId,
    onSelectPoi,
    mapVisibilityFilters,
    onMapVisibilityFiltersChange
}) => {
    const [filters, setFilters] = useState<PoiSearchFilters>(baseFilters);
    const [openMenu, setOpenMenu] = useState<'category' | 'subcategory' | null>(null);
    const [expandedTaxonomy, setExpandedTaxonomy] = useState<Record<string, boolean>>({});
    const [isMapVisibilityExpanded, setIsMapVisibilityExpanded] = useState(false);
    const [resultsLimit, setResultsLimit] = useState(RESULTS_BATCH_SIZE);
    const rootRef = useRef<HTMLDivElement>(null);
    const deferredPois = useDeferredValue(isActive ? pois : EMPTY_POIS);
    const deferredQuery = useDeferredValue(filters.query);
    const deferredVisibilityFilters = useDeferredValue(mapVisibilityFilters);

    const closeMenus = useCallback(() => {
        setOpenMenu(null);
    }, []);

    const effectiveFilters = useMemo(
        () => ({
            ...filters,
            query: deferredQuery
        }),
        [deferredQuery, filters]
    );

    const taxonomy = useMemo(
        () => PoiSearchService.deriveTaxonomySummary(deferredPois, deferredVisibilityFilters),
        [deferredPois, deferredVisibilityFilters]
    );

    const visiblePois = useMemo(
        () => deferredPois.filter((item) => PoiSearchService.isShownOnMap(item, deferredVisibilityFilters)),
        [deferredPois, deferredVisibilityFilters]
    );

    const availableTaxonomy = useMemo(
        () => PoiSearchService.deriveTaxonomySummary(visiblePois),
        [visiblePois]
    );

    const availableSubcategories = useMemo(() => {
        if (!filters.category || filters.category === PoiSearchService.ALL_CATEGORIES_VALUE) {
            return availableTaxonomy.flatMap((bucket) => bucket.subcategories);
        }

        return availableTaxonomy.find((bucket) => bucket.category === filters.category)?.subcategories || [];
    }, [availableTaxonomy, filters.category]);

    const results = useMemo(
        () => PoiSearchService.filterPoisWithVisibility(deferredPois, effectiveFilters, deferredVisibilityFilters),
        [deferredPois, effectiveFilters, deferredVisibilityFilters]
    );

    const displayedResults = useMemo(() => {
        const initialSlice = results.slice(0, resultsLimit);
        if (!selectedPoiId || initialSlice.some((item) => item.id === selectedPoiId)) {
            return initialSlice;
        }

        const selectedResult = results.find((item) => item.id === selectedPoiId);
        return selectedResult ? [...initialSlice, selectedResult] : initialSlice;
    }, [results, resultsLimit, selectedPoiId]);

    useEffect(() => {
        if (!isActive) return;
        const allowedCategories = new Set(availableTaxonomy.map((entry) => entry.category));
        if (
            filters.category !== PoiSearchService.ALL_CATEGORIES_VALUE &&
            !allowedCategories.has(filters.category)
        ) {
            setFilters((prev) => ({
                ...prev,
                category: PoiSearchService.ALL_CATEGORIES_VALUE,
                subcategory: PoiSearchService.ALL_SUBCATEGORIES_VALUE
            }));
            return;
        }

        const allowedKeys = new Set(availableSubcategories.map((entry) => entry.taxonomyKey));
        if (
            filters.subcategory !== PoiSearchService.ALL_SUBCATEGORIES_VALUE &&
            !allowedKeys.has(filters.subcategory)
        ) {
            setFilters((prev) => ({ ...prev, subcategory: PoiSearchService.ALL_SUBCATEGORIES_VALUE }));
        }
    }, [availableSubcategories, availableTaxonomy, filters.category, filters.subcategory, isActive]);

    useEffect(() => {
        if (!openMenu) return;

        const handlePointerDown = (event: PointerEvent) => {
            if (!rootRef.current?.contains(event.target as Node)) {
                closeMenus();
            }
        };

        const handleFocusIn = (event: FocusEvent) => {
            if (!rootRef.current?.contains(event.target as Node)) {
                closeMenus();
            }
        };

        const handleKeyDown = (event: KeyboardEvent) => {
            if (event.key === 'Escape') {
                closeMenus();
            }
        };

        document.addEventListener('pointerdown', handlePointerDown);
        document.addEventListener('focusin', handleFocusIn);
        document.addEventListener('keydown', handleKeyDown);

        return () => {
            document.removeEventListener('pointerdown', handlePointerDown);
            document.removeEventListener('focusin', handleFocusIn);
            document.removeEventListener('keydown', handleKeyDown);
        };
    }, [closeMenus, openMenu]);

    useEffect(() => {
        setExpandedTaxonomy((prev) => {
            const next = { ...prev };
            taxonomy.forEach((bucket) => {
                if (typeof next[bucket.category] !== 'boolean') {
                    next[bucket.category] = false;
                }
            });
            return next;
        });
    }, [taxonomy]);

    useEffect(() => {
        if (!isActive) return;
        setResultsLimit(RESULTS_BATCH_SIZE);
    }, [
        isActive,
        filters.query,
        filters.category,
        filters.subcategory,
        filters.hasPhoto,
        filters.hasWebsite,
        filters.openNow,
        deferredPois.length
    ]);

    useEffect(() => {
        if (isActive) return;
        setOpenMenu(null);
    }, [isActive]);

    const hasActiveFilters = Boolean(
        filters.query ||
        filters.category !== PoiSearchService.ALL_CATEGORIES_VALUE ||
        filters.subcategory !== PoiSearchService.ALL_SUBCATEGORIES_VALUE ||
        filters.hasPhoto ||
        filters.hasWebsite ||
        filters.openNow
    );

    const hasActiveMapVisibilityFilters = Boolean(
        mapVisibilityFilters.hiddenCategories.length ||
        mapVisibilityFilters.hiddenSubcategories.length ||
        Boolean(mapVisibilityFilters.isolation)
    );

    const categoryLabel = filters.category === PoiSearchService.ALL_CATEGORIES_VALUE
        ? 'All categories'
        : filters.category;

    const subcategoryLabel = filters.subcategory === PoiSearchService.ALL_SUBCATEGORIES_VALUE
        ? (filters.category === PoiSearchService.ALL_CATEGORIES_VALUE
            ? 'All subcategories'
            : `All ${filters.category} subcategories`)
        : availableSubcategories.find((entry) => entry.taxonomyKey === filters.subcategory)?.subcategory || 'All subcategories';

    const categoryOptions = useMemo(
        () => [
            {
                value: PoiSearchService.ALL_CATEGORIES_VALUE,
                label: 'All categories'
            },
            ...availableTaxonomy.map((bucket) => ({
                value: bucket.category,
                label: bucket.category
            }))
        ],
        [availableTaxonomy]
    );

    const subcategoryOptions = useMemo(
        () => [
            {
                value: PoiSearchService.ALL_SUBCATEGORIES_VALUE,
                label: filters.category === PoiSearchService.ALL_CATEGORIES_VALUE
                    ? 'All subcategories'
                    : `All ${filters.category} subcategories`
            },
            ...availableSubcategories.map((entry) => ({
                value: entry.taxonomyKey,
                label: entry.subcategory
            }))
        ],
        [availableSubcategories, filters.category]
    );

    const setFilterValue = (patch: Partial<PoiSearchFilters>) => {
        closeMenus();
        startTransition(() => {
            setFilters((prev) => ({ ...prev, ...patch }));
        });
    };

    const applyMapVisibilityFilters = (nextFilters: PoiMapVisibilityFilters) => {
        closeMenus();
        startTransition(() => {
            onMapVisibilityFiltersChange(nextFilters);
        });
    };

    const toggleCategoryVisibility = (category: string, checked: boolean) => {
        applyMapVisibilityFilters(
            PoiRegistryService.setCategoryVisibility(mapVisibilityFilters, category, checked)
        );
    };

    const toggleSubcategoryVisibility = (taxonomyKey: string, checked: boolean) => {
        applyMapVisibilityFilters(
            PoiRegistryService.setSubcategoryVisibility(mapVisibilityFilters, taxonomyKey, checked)
        );
    };

    return (
        <div ref={rootRef} className="flex flex-col gap-3">
            <div className={uiClass(UI_CONTROLS.panel, 'rounded-2xl p-3 shadow-inner')} data-testid="poi-map-visibility-panel">
                <button
                    type="button"
                    onClick={() => {
                        closeMenus();
                        setIsMapVisibilityExpanded((prev) => !prev);
                    }}
                    className="flex w-full items-start gap-2 rounded-xl text-left focus:outline-none focus-visible:ring-1 focus-visible:ring-gray-500 focus-visible:ring-inset"
                    data-testid="poi-map-visibility-toggle"
                >
                    <span className="mt-0.5 text-gray-500">
                        {isMapVisibilityExpanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                    </span>
                    <span className="min-w-0 flex-1">
                        <span className={uiClass(UI_TYPOGRAPHY.sectionLabel, 'block text-gray-400')}>Show on map</span>
                        <span className={uiClass(UI_TYPOGRAPHY.compact, 'block text-gray-500')}>
                            Hide or reveal loaded categories without dropping them from cache.
                        </span>
                        <span
                            className={uiClass(UI_TYPOGRAPHY.tiny, 'mt-1 block text-gray-600')}
                            data-testid="poi-map-visibility-count-legend"
                        >
                            Category counts show visible / total types. Leaf rows show shown / loaded POIs.
                        </span>
                    </span>
                </button>

                {isMapVisibilityExpanded && (
                    <>
                        <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
                            <span className={uiClass(UI_TYPOGRAPHY.compact, 'text-gray-500')}>
                                Hidden branches stay loaded and searchable.
                            </span>
                            <button
                                type="button"
                                onClick={() => applyMapVisibilityFilters(PoiRegistryService.resetVisibility())}
                                className={uiClass(UI_CONTROLS.subtleButton, 'rounded-md px-3 normal-case tracking-normal text-sm font-medium')}
                                disabled={!hasActiveMapVisibilityFilters}
                            >
                                Reset map
                            </button>
                        </div>

                        <div className="mt-3 max-h-72 space-y-2 overflow-y-auto pr-1">
                            {taxonomy.map((bucket) => {
                                const categoryVisible = PoiRegistryService.isCategoryVisible(mapVisibilityFilters, bucket.category);
                                const expanded = expandedTaxonomy[bucket.category] ?? false;
                                const siblingTaxonomyKeys = bucket.subcategories.map((entry) => entry.taxonomyKey);
                                const categoryColor = CATEGORY_COLORS[bucket.category] || '#9ca3af';

                                return (
                                    <div
                                        key={bucket.category}
                                        className="overflow-hidden rounded-xl border border-gray-800 bg-gray-900/20"
                                    >
                                        <div
                                            className="flex items-start gap-2 border-b bg-gray-900/40 px-3 py-2 transition-colors hover:bg-gray-800/50"
                                            style={{ borderColor: `${categoryColor}66` }}
                                        >
                                            <button
                                                type="button"
                                                onClick={() => {
                                                    closeMenus();
                                                    setExpandedTaxonomy((prev) => ({ ...prev, [bucket.category]: !expanded }));
                                                }}
                                                className="mt-0.5 flex h-5 w-5 items-center justify-center rounded-md text-gray-500 transition-colors hover:bg-gray-800 hover:text-white"
                                                aria-label={`${expanded ? 'Collapse' : 'Expand'} ${bucket.category} subcategories`}
                                                data-testid={`poi-map-category-toggle-${toTestToken(bucket.category)}`}
                                            >
                                                {expanded
                                                    ? <ChevronDown size={14} style={{ color: categoryColor }} />
                                                    : <ChevronRight size={14} style={{ color: categoryColor }} />}
                                            </button>
                                            <SidebarCheckbox
                                                checked={categoryVisible}
                                                onChange={(checked) => toggleCategoryVisibility(bucket.category, checked)}
                                                ariaLabel={`${categoryVisible ? 'Hide' : 'Show'} ${bucket.category} on the map`}
                                                testId={`poi-map-category-checkbox-${toTestToken(bucket.category)}`}
                                            />
                                            <div className="min-w-0 flex-1 pr-2">
                                                <div
                                                    className="whitespace-normal break-normal text-sm font-medium leading-5"
                                                    style={{ color: categoryColor }}
                                                >
                                                    {bucket.category}
                                                </div>
                                                <div
                                                    className="mt-0.5 text-[11px] leading-4 text-gray-500"
                                                    title={`${bucket.visibleSubcategoryCount} visible of ${bucket.subcategoryCount} total subcategories`}
                                                >
                                                    {bucket.visibleSubcategoryCount} / {bucket.subcategoryCount} types
                                                </div>
                                            </div>
                                            <SidebarVisibilityActions
                                                isVisible={categoryVisible}
                                                isIsolated={PoiRegistryService.isCategoryIsolated(mapVisibilityFilters, bucket.category)}
                                                entityLabel={bucket.category}
                                                toggleTestId={`poi-map-category-eye-${toTestToken(bucket.category)}`}
                                                isolateTestId={`poi-map-category-only-${toTestToken(bucket.category)}`}
                                                onToggle={() => toggleCategoryVisibility(bucket.category, !categoryVisible)}
                                                onShowOnly={() => applyMapVisibilityFilters(
                                                    PoiRegistryService.showOnlyCategory(mapVisibilityFilters, bucket.category)
                                                )}
                                            />
                                        </div>

                                        {expanded && (
                                            <div className="space-y-1 bg-gray-900/10 px-3 py-2">
                                                {bucket.subcategories.map((entry) => {
                                                    const subcategoryVisible = PoiRegistryService.isSubcategoryVisible(
                                                        mapVisibilityFilters,
                                                        bucket.category,
                                                        entry.taxonomyKey
                                                    );
                                                    return (
                                                        <div
                                                            key={entry.taxonomyKey}
                                                            className={uiClass(
                                                                'flex items-start gap-2 rounded-md border px-2 py-1.5 text-sm transition-colors',
                                                                categoryVisible
                                                                    ? 'border-gray-800 bg-gray-900/30 text-gray-300 hover:bg-gray-800/50'
                                                                    : 'cursor-not-allowed border-gray-800 bg-gray-900/20 text-gray-600'
                                                            )}
                                                        >
                                                            <SidebarCheckbox
                                                                checked={subcategoryVisible}
                                                                disabled={!categoryVisible}
                                                                onChange={(checked) => toggleSubcategoryVisibility(entry.taxonomyKey, checked)}
                                                                ariaLabel={`${subcategoryVisible ? 'Hide' : 'Show'} ${entry.subcategory} on the map`}
                                                                testId={`poi-map-subcategory-checkbox-${toTestToken(entry.taxonomyKey)}`}
                                                            />
                                                            <div className="min-w-0 flex-1 pr-2">
                                                                <div className="whitespace-normal break-normal leading-5">{entry.subcategory}</div>
                                                                <div
                                                                    className="mt-0.5 text-[11px] leading-4 text-gray-500"
                                                                    title={`${entry.shownCount} shown of ${entry.count} loaded POIs`}
                                                                >
                                                                    {entry.shownCount} / {entry.count} POIs
                                                                </div>
                                                            </div>
                                                            <SidebarVisibilityActions
                                                                isVisible={subcategoryVisible}
                                                                isIsolated={PoiRegistryService.isSubcategoryIsolated(mapVisibilityFilters, entry.taxonomyKey)}
                                                                entityLabel={entry.subcategory}
                                                                toggleTestId={`poi-map-subcategory-eye-${toTestToken(entry.taxonomyKey)}`}
                                                                isolateTestId={`poi-map-subcategory-only-${toTestToken(entry.taxonomyKey)}`}
                                                                onToggle={() => toggleSubcategoryVisibility(entry.taxonomyKey, !subcategoryVisible)}
                                                                onShowOnly={() => applyMapVisibilityFilters(
                                                                    PoiRegistryService.showOnlySubcategory(
                                                                        mapVisibilityFilters,
                                                                        bucket.category,
                                                                        entry.taxonomyKey,
                                                                        siblingTaxonomyKeys
                                                                    )
                                                                )}
                                                            />
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                    </>
                )}
            </div>

            <div className={uiClass(UI_CONTROLS.panel, 'rounded-2xl p-3 shadow-inner')}>
                <div className="relative">
                    <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
                    <input
                        type="text"
                        value={filters.query}
                        onChange={(event) => setFilterValue({ query: event.target.value })}
                        onFocus={closeMenus}
                        placeholder="Search loaded POIs by name or taxonomy..."
                        className={uiClass(UI_CONTROLS.input, 'pl-9 pr-8')}
                        data-testid="poi-search-input"
                    />
                    {filters.query && (
                        <button
                            type="button"
                            onClick={() => setFilterValue({ query: '' })}
                            className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded-md p-1 text-gray-500 transition-colors hover:bg-gray-600 hover:text-white"
                            aria-label="Clear search query"
                            data-testid="poi-search-clear"
                        >
                            <X size={13} />
                        </button>
                    )}
                </div>

                <div className="mt-3 grid gap-3">
                    <div className="grid gap-3">
                        <SidebarSelectMenu
                            testId="poi-category-filter"
                            label="Category"
                            currentLabel={categoryLabel}
                            isOpen={openMenu === 'category'}
                            onToggle={() => setOpenMenu((prev) => prev === 'category' ? null : 'category')}
                            options={categoryOptions}
                            selectedValue={filters.category}
                            onSelect={(value) => {
                                setOpenMenu(null);
                                setFilterValue({
                                    category: value,
                                    subcategory: PoiSearchService.ALL_SUBCATEGORIES_VALUE
                                });
                            }}
                        />
                        <SidebarSelectMenu
                            testId="poi-subcategory-filter"
                            label="Subcategory"
                            currentLabel={subcategoryLabel}
                            isOpen={openMenu === 'subcategory'}
                            onToggle={() => setOpenMenu((prev) => prev === 'subcategory' ? null : 'subcategory')}
                            options={subcategoryOptions}
                            selectedValue={filters.subcategory}
                            onSelect={(value) => {
                                setOpenMenu(null);
                                setFilterValue({ subcategory: value });
                            }}
                        />
                    </div>

                    <div className="grid grid-cols-2 gap-2">
                        <button
                            type="button"
                            onClick={() => setFilterValue({ hasPhoto: !filters.hasPhoto })}
                            className={uiClass(filterButtonClass(filters.hasPhoto), 'rounded-lg')}
                            data-testid="poi-filter-has-photo"
                        >
                            <Camera size={13} />
                            <span className="whitespace-nowrap">Has photo</span>
                        </button>
                        <button
                            type="button"
                            onClick={() => setFilterValue({ hasWebsite: !filters.hasWebsite })}
                            className={uiClass(filterButtonClass(filters.hasWebsite), 'rounded-lg')}
                            data-testid="poi-filter-has-website"
                        >
                            <Globe size={13} />
                            <span className="whitespace-nowrap">Has website</span>
                        </button>
                        <button
                            type="button"
                            onClick={() => setFilterValue({ openNow: !filters.openNow })}
                            className={uiClass(filterButtonClass(filters.openNow), 'col-span-2 rounded-lg')}
                            data-testid="poi-filter-open-now"
                        >
                            <Clock3 size={13} />
                            <span className="whitespace-nowrap">Open now</span>
                        </button>
                    </div>
                </div>

                <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
                    <span className={uiClass(UI_TYPOGRAPHY.compact, 'text-gray-400')} data-testid="poi-search-results-count">
                        {results.length} / {deferredPois.length} loaded places
                    </span>
                    {hasActiveFilters && (
                        <button
                            type="button"
                            onClick={() => {
                                closeMenus();
                                setFilters(baseFilters);
                            }}
                            className={uiClass(UI_CONTROLS.subtleButton, 'px-3 normal-case tracking-normal text-sm font-medium')}
                        >
                            Reset filters
                        </button>
                    )}
                </div>
            </div>

            <div className={uiClass(UI_CONTROLS.panel, 'rounded-2xl p-3 shadow-inner')}>
                <div className="mb-3">
                    <div className={uiClass(UI_TYPOGRAPHY.sectionLabel, 'text-gray-400')}>Results</div>
                    <div className={uiClass(UI_TYPOGRAPHY.compact, 'text-gray-500')}>
                        Loaded places matching the current filters.
                    </div>
                </div>

                <div className="space-y-2" data-testid="poi-search-results">
                    {deferredPois.length === 0 && (
                        <div className="rounded-xl border border-dashed border-gray-700 bg-gray-900/50 p-4 text-sm text-gray-400">
                            Loaded places will appear here once the map finishes pulling POIs for the current area.
                        </div>
                    )}

                    {deferredPois.length > 0 && results.length === 0 && (
                        <div className="rounded-xl border border-dashed border-gray-700 bg-gray-900/50 p-4 text-sm text-gray-400">
                            No loaded POIs match the current search and filters.
                        </div>
                    )}

                    {results.length > displayedResults.length && (
                        <div
                            className="rounded-xl border border-gray-700 bg-gray-900/40 px-3 py-2 text-xs text-gray-400"
                            data-testid="poi-results-windowing-note"
                        >
                            Showing {displayedResults.length} of {results.length} matching places. Refine filters or load more results to browse deeper.
                        </div>
                    )}

                    {displayedResults.map((poi) => {
                        const shownOnMap = PoiSearchService.isShownOnMap(poi, deferredVisibilityFilters);
                        const categoryColor = CATEGORY_COLORS[poi.category] || '#6b7280';
                        return (
                            <button
                                key={poi.id}
                                type="button"
                                onClick={() => {
                                    closeMenus();
                                    onSelectPoi(poi.id);
                                }}
                                className={uiClass(
                                    'relative w-full overflow-hidden rounded-xl border p-3 text-left transition-colors focus:outline-none focus-visible:ring-1 focus-visible:ring-gray-500 focus-visible:ring-inset',
                                    selectedPoiId === poi.id
                                        ? 'border-gray-600 bg-gray-800/80 shadow-[inset_0_0_0_1px_rgba(255,255,255,0.03)]'
                                        : 'border-gray-800 bg-gray-900/60 hover:bg-gray-800/70'
                                )}
                                data-testid="poi-search-result"
                                data-poi-id={poi.id}
                            >
                                {selectedPoiId === poi.id && (
                                    <span
                                        aria-hidden="true"
                                        className="absolute inset-y-3 left-0 w-px rounded-full opacity-70"
                                        style={{ backgroundColor: categoryColor }}
                                    />
                                )}

                                <div className="flex items-start justify-between gap-3">
                                    <div className="min-w-0 flex-1">
                                        <div className={uiClass(UI_TYPOGRAPHY.subheading, 'text-white')}>
                                            {poi.title}
                                        </div>
                                        <div className="mt-2 flex flex-wrap items-center gap-2">
                                            <span
                                                data-testid="poi-result-category-chip"
                                                className="inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-semibold"
                                                style={{
                                                    borderColor: `${categoryColor}55`,
                                                    backgroundColor: `${categoryColor}14`,
                                                    color: categoryColor
                                                }}
                                            >
                                                {poi.category}
                                            </span>
                                            <span className={uiClass(UI_TYPOGRAPHY.compact, 'text-gray-400')}>
                                                {poi.subcategory}
                                            </span>
                                        </div>
                                    </div>
                                    <span className={uiClass(
                                        'rounded-full border px-2 py-0.5 text-[11px] font-semibold',
                                        shownOnMap
                                            ? 'border-emerald-400/40 bg-emerald-500/10 text-emerald-200'
                                            : 'border-gray-700 text-gray-500'
                                    )}>
                                        {shownOnMap ? 'Shown' : 'Hidden'}
                                    </span>
                                </div>

                                {poi.address && (
                                    <div className="mt-2 flex items-start gap-2 text-sm text-gray-300">
                                        <MapPin size={14} className="mt-0.5 flex-shrink-0 text-gray-500" />
                                        <span className="line-clamp-2">{poi.address}</span>
                                    </div>
                                )}

                                <div className="mt-3 flex flex-wrap gap-2">
                                    <span className={uiClass(resultMetaChipClass, poi.hasPhoto ? 'border-amber-400/40 bg-amber-500/10 text-amber-100' : 'border-gray-700 text-gray-500')}>
                                        <Camera size={11} />
                                        {poi.hasPhoto ? 'Photo' : 'No photo'}
                                    </span>
                                    <span className={uiClass(resultMetaChipClass, poi.hasWebsite ? 'border-cyan-400/40 bg-cyan-500/10 text-cyan-100' : 'border-gray-700 text-gray-500')}>
                                        <Globe size={11} />
                                        {poi.hasWebsite ? 'Website' : 'No website'}
                                    </span>
                                    <span className={uiClass(resultMetaChipClass, poi.isOpenNow ? 'border-emerald-400/40 bg-emerald-500/10 text-emerald-100' : 'border-gray-700 text-gray-500')}>
                                        <Clock3 size={11} />
                                        {poi.isOpenNow ? 'Open now' : 'Closed / unknown'}
                                    </span>
                                </div>
                            </button>
                        );
                    })}

                    {results.length > displayedResults.length && (
                        <button
                            type="button"
                            onClick={() => setResultsLimit((prev) => prev + RESULTS_BATCH_SIZE)}
                            className={uiClass(UI_CONTROLS.subtleButton, 'w-full px-3')}
                            data-testid="poi-search-load-more"
                        >
                            Load more places
                        </button>
                    )}
                </div>
            </div>
        </div>
    );
};

export default PoiSearchPanel;
