
import React, { startTransition, useDeferredValue, useEffect, useRef, useMemo, useState } from 'react';
import { IconDefinition, AppStatus, LoadedPoiSearchItem, PoiMapVisibilityFilters, RightSidebarMode } from '@/types';
import SidebarContainer from './SidebarContainer';
import IconItem from './right/IconItem';
import PoiSearchPanel from './right/PoiSearchPanel';
import { CATEGORY_COLORS } from '@/constants';
import { ChevronDown, ChevronRight, MapPinned, Shapes, X } from 'lucide-react';
import { UI_CONTROLS, UI_TYPOGRAPHY, uiClass } from '@shared/styles/uiTokens';
import { buildIconSidebarGroups } from '@shared/taxonomy/poiTaxonomy';
import { PoiRegistryService } from '@/features/map/services/PoiRegistryService';
import { PoiSearchService } from '@/features/map/services/PoiSearchService';
import SidebarVisibilityActions from './common/SidebarVisibilityActions';

interface RightSidebarProps {
  isOpen: boolean;
  onClose?: () => void;
  activeIcons: Record<string, IconDefinition>;
  selectedCategory: string | null;
  remixFocusCategory?: string | null;
  onClearRemixFocus?: () => void;
  onSelectCategory: (cat: string | null) => void;
  onRegenerateIcon: (category: string, prompt: string) => void;
  status: AppStatus;
  hasApiKey: boolean;
  mode: RightSidebarMode;
  onModeChange: (mode: RightSidebarMode) => void;
  loadedPois: LoadedPoiSearchItem[];
  selectedPoiId?: string | null;
  onSelectPoi: (poiId: string) => void;
  poiMapVisibilityFilters: PoiMapVisibilityFilters;
  onPoiMapVisibilityFiltersChange: (filters: PoiMapVisibilityFilters) => void;
}

const RightSidebar: React.FC<RightSidebarProps> = ({
  isOpen,
  onClose,
  activeIcons,
  selectedCategory,
  remixFocusCategory,
  onClearRemixFocus,
  onSelectCategory,
  onRegenerateIcon,
  status,
  hasApiKey,
  mode,
  onModeChange,
  loadedPois,
  selectedPoiId,
  onSelectPoi,
  poiMapVisibilityFilters,
  onPoiMapVisibilityFiltersChange
}) => {
  const selectedRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const isProgrammaticScroll = useRef(false);
  const scrollTimeoutRef = useRef<number | null>(null);
  const scrollAnimationFrameRef = useRef<number | null>(null);
  const appliedRemixFocusRef = useRef<string | null>(null);
  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>({});
  const [hasVisitedPlaces, setHasVisitedPlaces] = useState(mode === 'places');
  const deferredLoadedPois = useDeferredValue(loadedPois);
  const observedPoisForIcons = mode === 'icons' ? deferredLoadedPois : [];

  const iconGroups = useMemo(() => {
    if (mode !== 'icons') return [];
    return buildIconSidebarGroups(activeIcons, observedPoisForIcons);
  }, [activeIcons, observedPoisForIcons, mode]);
  const hasActiveMapVisibilityFilters = Boolean(
    poiMapVisibilityFilters.hiddenCategories.length ||
    poiMapVisibilityFilters.hiddenSubcategories.length ||
    poiMapVisibilityFilters.isolation
  );

  // Preserve the user's collapse state even as taxonomy grows with newly loaded POIs.
  useEffect(() => {
    if (mode !== 'icons') return;
    setExpandedGroups((prev) => {
      const next = iconGroups.reduce((acc, group) => {
        acc[group.groupName] = prev[group.groupName] ?? true;
        return acc;
      }, {} as Record<string, boolean>);

      const hasChanged =
        Object.keys(next).length !== Object.keys(prev).length
        || Object.entries(next).some(([key, value]) => prev[key] !== value);

      return hasChanged ? next : prev;
    });
  }, [iconGroups, mode]);

  useEffect(() => {
    if (mode === 'places') {
      setHasVisitedPlaces(true);
    }
  }, [mode]);

  const collapseToGroup = (groupName: string) => {
    const nextState = iconGroups.reduce((acc, group) => {
      acc[group.groupName] = group.groupName === groupName;
      return acc;
    }, {} as Record<string, boolean>);
    setExpandedGroups(nextState);
  };

  const clearPendingListScroll = () => {
    if (scrollTimeoutRef.current !== null) {
      window.clearTimeout(scrollTimeoutRef.current);
      scrollTimeoutRef.current = null;
    }
    if (scrollAnimationFrameRef.current !== null) {
      window.cancelAnimationFrame(scrollAnimationFrameRef.current);
      scrollAnimationFrameRef.current = null;
    }
    isProgrammaticScroll.current = false;
  };

  useEffect(() => {
    if (!remixFocusCategory) {
      appliedRemixFocusRef.current = null;
    }
  }, [remixFocusCategory]);

  // Scroll to selected item and ensure its group is expanded
  useEffect(() => {
    if (mode !== 'icons') return;
    clearPendingListScroll();
    if (isOpen && selectedCategory) {
      // Find which group holds this category
      const groupName = iconGroups.find((group) => group.items.includes(selectedCategory))?.groupName;
      const shouldApplyRemixFocus = Boolean(
        remixFocusCategory &&
        remixFocusCategory === selectedCategory &&
        appliedRemixFocusRef.current !== remixFocusCategory
      );

      if (groupName) {
        if (shouldApplyRemixFocus) {
          collapseToGroup(groupName);
        } else {
          setExpandedGroups(prev => ({ ...prev, [groupName]: true }));
        }
      }

      if (selectedRef.current && shouldApplyRemixFocus) {
        const alignSelectedToTop = () => {
          if (!selectedRef.current) return;
          if (remixFocusCategory && listRef.current) {
            const list = listRef.current;
            const computed = window.getComputedStyle(list);
            const paddingTop = Number.parseFloat(computed.paddingTop || '0');
            const paddingBottom = Number.parseFloat(computed.paddingBottom || '0');
            const headerEl = groupName
              ? (list.querySelector(
                  `[data-testid="icon-group-header"][data-group="${groupName}"]`
                ) as HTMLElement | null)
              : null;
            const headerHeight = headerEl?.getBoundingClientRect().height ?? 0;
            const padding = 8;
            const targetTop = selectedRef.current.offsetTop;
            const targetHeight = selectedRef.current.offsetHeight;
            const desiredTop = Math.max(0, targetTop - headerHeight - paddingTop - padding);
            isProgrammaticScroll.current = true;
            list.scrollTop = desiredTop;
            const ensureVisible = () => {
              if (!selectedRef.current || !listRef.current) return;
              const listAfter = listRef.current;
              const listRect = listAfter.getBoundingClientRect();
              const itemRect = selectedRef.current.getBoundingClientRect();
              const minTop = listRect.top + headerHeight + paddingTop + padding;
              const maxBottom = listRect.bottom - padding;
              if (itemRect.top < minTop) {
                listAfter.scrollTop -= (minTop - itemRect.top);
              } else if (itemRect.bottom > maxBottom) {
                listAfter.scrollTop += (itemRect.bottom - maxBottom);
              }
            };
            requestAnimationFrame(() => {
              if (!selectedRef.current || !listRef.current) {
                isProgrammaticScroll.current = false;
                return;
              }
              ensureVisible();
              requestAnimationFrame(() => {
                ensureVisible();
                isProgrammaticScroll.current = false;
              });
            });
            return;
          }
          selectedRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' });
        };

        const scheduleScroll = () => {
          scrollAnimationFrameRef.current = window.requestAnimationFrame(() => {
            scrollAnimationFrameRef.current = window.requestAnimationFrame(() => {
              alignSelectedToTop();
            });
          });
        };

        if (shouldApplyRemixFocus) {
          appliedRemixFocusRef.current = remixFocusCategory || null;
          scheduleScroll();
        }
      }
    }
    return () => {
      clearPendingListScroll();
    };
  }, [selectedCategory, isOpen, remixFocusCategory, mode, iconGroups]);

  const toggleGroup = (group: string) => {
    setExpandedGroups(prev => ({ ...prev, [group]: !prev[group] }));
  };

  const totalIcons = useMemo(() => iconGroups.reduce((sum, group) => sum + group.items.length, 0), [iconGroups]);
  const headerTitle = mode === 'places' ? 'Loaded Places' : 'Icon Assets';
  const headerCount = mode === 'places' ? `${loadedPois.length} POIs` : `${totalIcons} Items`;

  const handleCategoryVisibilityToggle = (category: string, visible: boolean) => {
    startTransition(() => {
      onPoiMapVisibilityFiltersChange(
        PoiRegistryService.setCategoryVisibility(poiMapVisibilityFilters, category, visible)
      );
    });
  };

  const handleSubcategoryVisibilityToggle = (taxonomyKey: string, visible: boolean) => {
    startTransition(() => {
      onPoiMapVisibilityFiltersChange(
        PoiRegistryService.setSubcategoryVisibility(poiMapVisibilityFilters, taxonomyKey, visible)
      );
    });
  };

  const applyPoiMapVisibilityFilters = (filters: PoiMapVisibilityFilters) => {
    startTransition(() => {
      onPoiMapVisibilityFiltersChange(filters);
    });
  };

  const handleIconSelection = (category: string | null) => {
    clearPendingListScroll();
    appliedRemixFocusRef.current = null;
    if (remixFocusCategory && onClearRemixFocus) {
      onClearRemixFocus();
    }
    onSelectCategory(category);
  };

  return (
    <SidebarContainer isOpen={isOpen} width="w-full sm:w-80" side="right" onClose={onClose}>
      {/* Header */}
      <div className="p-4 border-b border-gray-800 flex items-center justify-between gap-2 flex-shrink-0 bg-gray-900">
        <div className="flex items-center gap-2">
          <h2 className={uiClass(UI_TYPOGRAPHY.sectionLabel, 'text-gray-400')}>{headerTitle}</h2>
          <span className={uiClass(UI_TYPOGRAPHY.tiny, 'text-gray-600 bg-gray-800 px-2 py-0.5 rounded-full')}>{headerCount}</span>
        </div>
        {onClose && (
          <button
            type="button"
            onClick={onClose}
            className={uiClass(UI_CONTROLS.subtleButton, 'px-2')}
            aria-label="Close panel"
          >
            <X size={14} />
            <span className="hidden sm:inline">Close</span>
          </button>
        )}
      </div>

      <div className="border-b border-gray-800 bg-gray-900 px-4 pb-4">
        <div className="grid grid-cols-2 gap-2 rounded-xl bg-gray-950/70 p-1">
          <button
            type="button"
            onClick={() => onModeChange('places')}
            className={uiClass(
              UI_CONTROLS.subtleButton,
              'min-h-10 justify-center rounded-lg px-3 py-2 text-xs normal-case tracking-normal',
              mode === 'places'
                ? 'border-gray-600 bg-gray-800/80 text-white shadow-[inset_0_0_0_1px_rgba(255,255,255,0.03)]'
                : 'border-transparent bg-transparent text-gray-400 hover:bg-gray-800/50'
            )}
            data-testid="right-sidebar-tab-places"
          >
            <MapPinned size={14} />
            Places
          </button>
          <button
            type="button"
            onClick={() => onModeChange('icons')}
            className={uiClass(
              UI_CONTROLS.subtleButton,
              'min-h-10 justify-center rounded-lg px-3 py-2 text-xs normal-case tracking-normal',
              mode === 'icons'
                ? 'border-gray-600 bg-gray-800/80 text-white shadow-[inset_0_0_0_1px_rgba(255,255,255,0.03)]'
                : 'border-transparent bg-transparent text-gray-400 hover:bg-gray-800/50'
            )}
            data-testid="right-sidebar-tab-icons"
          >
            <Shapes size={14} />
            Icons
          </button>
        </div>
      </div>

      {hasVisitedPlaces && (
        <div
          className={uiClass(
            'flex-1 overflow-y-auto px-3 pb-32 scrollbar-thin',
            mode === 'places' ? 'block' : 'hidden'
          )}
        >
          <PoiSearchPanel
            pois={loadedPois}
            isActive={mode === 'places'}
            selectedPoiId={selectedPoiId}
            onSelectPoi={onSelectPoi}
            mapVisibilityFilters={poiMapVisibilityFilters}
            onMapVisibilityFiltersChange={onPoiMapVisibilityFiltersChange}
          />
        </div>
      )}

      {mode === 'icons' && (
        <div
          ref={listRef}
          data-testid="icon-assets-list"
          className="flex-1 overflow-y-auto px-3 pb-32 space-y-3 scrollbar-thin"
          onScroll={() => {
            if (!isProgrammaticScroll.current) {
              clearPendingListScroll();
            }
            if (remixFocusCategory && onClearRemixFocus && !isProgrammaticScroll.current) {
              onClearRemixFocus();
            }
          }}
        >
          <div className={uiClass(UI_CONTROLS.panel, 'rounded-2xl p-3 shadow-inner')}>
            <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                <div className={uiClass(UI_TYPOGRAPHY.sectionLabel, 'text-gray-400')}>Map visibility</div>
                <div className={uiClass(UI_TYPOGRAPHY.compact, 'text-gray-500')}>
                  Eye toggles hide or reveal branches while keeping icon browsing focused on category structure.
                </div>
              </div>
              <button
                type="button"
                onClick={() => applyPoiMapVisibilityFilters(PoiRegistryService.resetVisibility())}
                className={uiClass(UI_CONTROLS.subtleButton, 'px-3 normal-case tracking-normal text-sm font-medium')}
                data-testid="icon-map-reset-visibility"
                disabled={!hasActiveMapVisibilityFilters}
              >
                Reset visibility
              </button>
            </div>
          </div>

          {iconGroups.map(({ groupName, items }) => {
            const isExpanded = expandedGroups[groupName];
            const groupColor = CATEGORY_COLORS[groupName] || '#6b7280';
            const categoryVisible = PoiRegistryService.isCategoryVisible(poiMapVisibilityFilters, groupName);
            const siblingTaxonomyKeys = items.map((item) => PoiSearchService.buildTaxonomyKey(groupName, item));

            return (
              <div
                key={groupName}
                className="space-y-1"
                data-testid="icon-group"
                data-group={groupName}
                data-expanded={isExpanded ? 'true' : 'false'}
              >
                {/* Group Header */}
                <div
                  onClick={() => toggleGroup(groupName)}
                  data-testid="icon-group-header"
                  data-group={groupName}
                  className="flex items-center gap-2 px-3 py-2 cursor-pointer select-none border-b bg-gray-900/50 hover:bg-gray-800/50 transition-colors sticky top-0 z-10 backdrop-blur-sm"
                  style={{ borderColor: groupColor }}
                >
                  {isExpanded ? (
                    <ChevronDown size={12} style={{ color: groupColor }} />
                  ) : (
                    <ChevronRight size={12} style={{ color: groupColor }} />
                  )}
                  <span className={uiClass(UI_TYPOGRAPHY.sectionLabel, 'flex-1')} style={{ color: groupColor }}>
                    {groupName}
                  </span>
                  <SidebarVisibilityActions
                    isVisible={categoryVisible}
                    isIsolated={PoiRegistryService.isCategoryIsolated(poiMapVisibilityFilters, groupName)}
                    entityLabel={groupName}
                    accentColor={groupColor}
                    toggleTestId={`icon-map-category-eye-${groupName.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`}
                    isolateTestId={`icon-map-category-only-${groupName.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`}
                    onToggle={() => handleCategoryVisibilityToggle(groupName, !categoryVisible)}
                    onShowOnly={() => applyPoiMapVisibilityFilters(PoiRegistryService.showOnlyCategory(poiMapVisibilityFilters, groupName))}
                  />
                </div>

                {/* Items */}
                {isExpanded && (
                  <div className="space-y-1">
                    {items.map((cat) => {
                      const taxonomyKey = PoiSearchService.buildTaxonomyKey(groupName, cat);
                      const subcategoryVisible = PoiRegistryService.isSubcategoryVisible(
                        poiMapVisibilityFilters,
                        groupName,
                        taxonomyKey
                      );

                      return (
                      <div key={cat} ref={selectedCategory === cat ? selectedRef : null}>
                        <IconItem
                          category={cat}
                          iconDef={activeIcons[cat]}
                          isSelected={selectedCategory === cat}
                          onSelect={handleIconSelection}
                          onRegenerate={onRegenerateIcon}
                          isReadOnly={!hasApiKey}
                          mapVisibilityState={{
                            isVisible: subcategoryVisible,
                            isIsolated: PoiRegistryService.isSubcategoryIsolated(poiMapVisibilityFilters, taxonomyKey),
                            onToggle: () => handleSubcategoryVisibilityToggle(taxonomyKey, !subcategoryVisible),
                            onShowOnly: () => applyPoiMapVisibilityFilters(
                              PoiRegistryService.showOnlySubcategory(
                                poiMapVisibilityFilters,
                                groupName,
                                taxonomyKey,
                                siblingTaxonomyKeys
                              )
                            )
                          }}
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
      )}
    </SidebarContainer>
  );
};

export default RightSidebar;
