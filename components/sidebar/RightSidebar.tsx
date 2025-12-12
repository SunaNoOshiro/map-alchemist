
import React, { useEffect, useRef, useMemo, useState } from 'react';
import { IconDefinition, AppStatus } from '../../types';
import SidebarContainer from './SidebarContainer';
import IconItem from './right/IconItem';
import { CATEGORY_GROUPS } from '../../constants';
import { ChevronDown, ChevronRight } from 'lucide-react';

interface RightSidebarProps {
  isOpen: boolean;
  activeIcons: Record<string, IconDefinition>;
  selectedCategory: string | null;
  onSelectCategory: (cat: string | null) => void;
  onRegenerateIcon: (category: string, prompt: string) => void;
  status: AppStatus;
}

// Map group names to colors for visual distinction
const GROUP_COLORS: Record<string, string> = {
  'Food & Drink': 'text-orange-400 border-orange-500/30',
  'Shopping': 'text-blue-400 border-blue-500/30',
  'Health': 'text-red-400 border-red-500/30',
  'Recreation': 'text-green-400 border-green-500/30',
  'Attractions': 'text-purple-400 border-purple-500/30',
  'Education': 'text-teal-400 border-teal-500/30',
  'Transport': 'text-cyan-400 border-cyan-500/30',
  'Services': 'text-gray-400 border-gray-500/30',
};

const RightSidebar: React.FC<RightSidebarProps> = ({
  isOpen,
  activeIcons,
  selectedCategory,
  onSelectCategory,
  onRegenerateIcon,
  status
}) => {
  const selectedRef = useRef<HTMLDivElement>(null);
  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>({});

  // Initialize all groups as expanded
  useEffect(() => {
    const allExpanded = Object.keys(CATEGORY_GROUPS).reduce((acc, key) => ({ ...acc, [key]: true }), {});
    setExpandedGroups(allExpanded);
  }, []);

  // Scroll to selected item and ensure its group is expanded
  useEffect(() => {
    if (isOpen && selectedCategory) {
      // Find which group holds this category
      const groupName = Object.entries(CATEGORY_GROUPS).find(([_, items]) => 
        items.includes(selectedCategory)
      )?.[0];

      if (groupName) {
        setExpandedGroups(prev => ({ ...prev, [groupName]: true }));
      }

      if (selectedRef.current) {
        setTimeout(() => {
            selectedRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }, 150);
      }
    }
  }, [selectedCategory, isOpen]);

  const toggleGroup = (group: string) => {
    setExpandedGroups(prev => ({ ...prev, [group]: !prev[group] }));
  };

  const totalIcons = useMemo(() => Object.values(CATEGORY_GROUPS).flat().length, []);

  return (
    <SidebarContainer isOpen={isOpen} width="w-80" side="right">
        {/* Header */}
        <div className="p-4 border-b border-gray-800 flex items-center justify-between flex-shrink-0 bg-gray-900">
          <h2 className="text-xs font-bold text-gray-400 uppercase tracking-wider">Icon Assets</h2>
          <span className="text-[10px] text-gray-600 bg-gray-800 px-2 py-0.5 rounded-full">{totalIcons} Items</span>
        </div>

        {/* List */}
        <div className="flex-1 overflow-y-auto p-2 space-y-4 scrollbar-thin">
          {Object.entries(CATEGORY_GROUPS).map(([groupName, items]) => {
            const isExpanded = expandedGroups[groupName];
            const colorClass = GROUP_COLORS[groupName] || 'text-gray-400 border-gray-700';

            return (
              <div key={groupName} className="space-y-1">
                {/* Group Header */}
                <div 
                  onClick={() => toggleGroup(groupName)}
                  className={`flex items-center gap-2 px-2 py-1.5 cursor-pointer select-none border-b ${colorClass.split(' ')[1]} bg-gray-900/50 hover:bg-gray-800/50 transition-colors sticky top-0 z-10 backdrop-blur-sm`}
                >
                  {isExpanded ? <ChevronDown size={12} className={colorClass.split(' ')[0]} /> : <ChevronRight size={12} className={colorClass.split(' ')[0]} />}
                  <span className={`text-[10px] font-bold uppercase tracking-widest ${colorClass.split(' ')[0]}`}>
                    {groupName}
                  </span>
                  <span className="ml-auto text-[9px] text-gray-600">{items.length}</span>
                </div>

                {/* Items */}
                {isExpanded && (
                  <div className="pl-1 space-y-1">
                    {items.map((cat) => (
                      <div key={cat} ref={selectedCategory === cat ? selectedRef : null}>
                          <IconItem 
                              category={cat}
                              iconDef={activeIcons[cat]}
                              isSelected={selectedCategory === cat}
                              onSelect={onSelectCategory}
                              onRegenerate={onRegenerateIcon}
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
