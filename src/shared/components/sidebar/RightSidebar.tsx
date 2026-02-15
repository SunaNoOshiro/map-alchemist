
import React, { useEffect, useRef, useMemo, useState } from 'react';
import { IconDefinition, AppStatus } from '@/types';
import SidebarContainer from './SidebarContainer';
import IconItem from './right/IconItem';
import { CATEGORY_COLORS, CATEGORY_GROUPS } from '@/constants';
import { ChevronDown, ChevronRight, X } from 'lucide-react';
import { UI_CONTROLS, UI_TYPOGRAPHY, uiClass } from '@shared/styles/uiTokens';

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
  hasApiKey
}) => {
  const selectedRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const isProgrammaticScroll = useRef(false);
  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>({});

  // Initialize all groups as expanded
  useEffect(() => {
    const allExpanded = Object.keys(CATEGORY_GROUPS).reduce((acc, key) => ({ ...acc, [key]: true }), {});
    setExpandedGroups(allExpanded);
  }, []);

  const collapseToGroup = (groupName: string) => {
    const nextState = Object.keys(CATEGORY_GROUPS).reduce((acc, key) => {
      acc[key] = key === groupName;
      return acc;
    }, {} as Record<string, boolean>);
    setExpandedGroups(nextState);
  };

  // Scroll to selected item and ensure its group is expanded
  useEffect(() => {
    if (isOpen && selectedCategory) {
      // Find which group holds this category
      const groupName = Object.entries(CATEGORY_GROUPS).find(([_, items]) =>
        items.includes(selectedCategory)
      )?.[0];

      if (groupName) {
        if (remixFocusCategory) {
          collapseToGroup(groupName);
        } else {
          setExpandedGroups(prev => ({ ...prev, [groupName]: true }));
        }
      }

      if (selectedRef.current) {
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
            setTimeout(() => {
              if (!selectedRef.current || !listRef.current) return;
              isProgrammaticScroll.current = true;
              ensureVisible();
              isProgrammaticScroll.current = false;
            }, 250);
            return;
          }
          selectedRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' });
        };

        const scheduleScroll = () => {
          requestAnimationFrame(() => {
            requestAnimationFrame(() => {
              alignSelectedToTop();
            });
          });
        };

        if (remixFocusCategory) {
          scheduleScroll();
        } else {
          setTimeout(() => {
            scheduleScroll();
          }, 150);
        }
      }
    }
  }, [selectedCategory, isOpen, remixFocusCategory]);

  const toggleGroup = (group: string) => {
    setExpandedGroups(prev => ({ ...prev, [group]: !prev[group] }));
  };

  const totalIcons = useMemo(() => Object.values(CATEGORY_GROUPS).flat().length, []);

  return (
    <SidebarContainer isOpen={isOpen} width="w-full sm:w-80" side="right" onClose={onClose}>
      {/* Header */}
      <div className="p-4 border-b border-gray-800 flex items-center justify-between gap-2 flex-shrink-0 bg-gray-900">
        <div className="flex items-center gap-2">
          <h2 className={uiClass(UI_TYPOGRAPHY.sectionLabel, 'text-gray-400')}>Icon Assets</h2>
          <span className={uiClass(UI_TYPOGRAPHY.tiny, 'text-gray-600 bg-gray-800 px-2 py-0.5 rounded-full')}>{totalIcons} Items</span>
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

      {/* List */}
      <div
        ref={listRef}
        data-testid="icon-assets-list"
        className="flex-1 overflow-y-auto px-3 pb-32 space-y-3 scrollbar-thin"
        onScroll={() => {
          if (remixFocusCategory && onClearRemixFocus && !isProgrammaticScroll.current) {
            onClearRemixFocus();
          }
        }}
      >
        {Object.entries(CATEGORY_GROUPS).map(([groupName, items]) => {
          const isExpanded = expandedGroups[groupName];
          const groupColor = CATEGORY_COLORS[groupName] || '#6b7280';

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
                <span className={UI_TYPOGRAPHY.sectionLabel} style={{ color: groupColor }}>
                  {groupName}
                </span>
                <span className={uiClass(UI_TYPOGRAPHY.tiny, 'ml-auto text-gray-600')}>{items.length}</span>
              </div>

              {/* Items */}
              {isExpanded && (
                <div className="space-y-1">
                  {items.map((cat) => (
                    <div key={cat} ref={selectedCategory === cat ? selectedRef : null}>
                      <IconItem
                        category={cat}
                        iconDef={activeIcons[cat]}
                        isSelected={selectedCategory === cat}
                        onSelect={onSelectCategory}
                        onRegenerate={onRegenerateIcon}
                        isReadOnly={!hasApiKey}
                      />
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </SidebarContainer>
  );
};

export default RightSidebar;
