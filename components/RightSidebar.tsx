
import React, { useState, useEffect, useRef } from 'react';
import { IconDefinition, AppStatus } from '../types';
import { RefreshCw, Image as ImageIcon } from 'lucide-react';

interface RightSidebarProps {
  isOpen: boolean;
  categories: string[];
  activeIcons: Record<string, IconDefinition>;
  selectedCategory: string | null;
  onSelectCategory: (cat: string) => void;
  onRegenerateIcon: (category: string, prompt: string) => void;
  status: AppStatus;
}

const RightSidebar: React.FC<RightSidebarProps> = ({
  isOpen,
  categories,
  activeIcons,
  selectedCategory,
  onSelectCategory,
  onRegenerateIcon,
  status
}) => {
  const [localPrompts, setLocalPrompts] = useState<Record<string, string>>({});

  // Sync prompts when icons change (or initialize them)
  useEffect(() => {
    const newPrompts = { ...localPrompts };
    let changed = false;
    categories.forEach(cat => {
      if (!newPrompts[cat] && activeIcons[cat]) {
        newPrompts[cat] = activeIcons[cat].prompt;
        changed = true;
      }
    });
    if (changed) setLocalPrompts(newPrompts);
  }, [activeIcons, categories]);

  const handleRegenerate = (cat: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const prompt = localPrompts[cat] || activeIcons[cat]?.prompt || `Icon for ${cat}`;
    onRegenerateIcon(cat, prompt);
  };

  const selectedRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (isOpen && selectedCategory && selectedRef.current) {
        selectedRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }, [selectedCategory, isOpen]);

  return (
    <div 
      className={`relative flex-shrink-0 bg-gray-900 border-l border-gray-700 flex flex-col h-full z-10 transition-all duration-300 ease-in-out ${isOpen ? 'w-64' : 'w-0 border-none'}`}
    >
      {/* Content Wrapper */}
      <div className={`flex flex-col h-full w-64 overflow-hidden ${!isOpen ? 'invisible' : 'visible'}`}>
        
        {/* Header */}
        <div className="p-3 border-b border-gray-800 flex items-center justify-between flex-shrink-0 bg-gray-900">
          <h2 className="text-xs font-bold text-gray-400 uppercase tracking-wider pl-2">Icon Assets</h2>
        </div>

        {/* List */}
        <div className="flex-1 overflow-y-auto p-2 space-y-1 scrollbar-thin">
          {categories.map((cat) => {
            const iconDef = activeIcons[cat];
            const isSelected = selectedCategory === cat;
            const isLoading = iconDef?.isLoading;

            return (
              <div 
                key={cat} 
                ref={isSelected ? selectedRef : null}
                className={`group flex items-center gap-2 p-2 rounded transition-all cursor-pointer border ${
                  isSelected 
                    ? 'bg-gray-800 border-blue-500/50' 
                    : 'bg-transparent border-transparent hover:bg-gray-800/50'
                }`}
                onClick={() => onSelectCategory(cat)}
              >
                {/* Compact Preview */}
                <div className="w-8 h-8 flex-shrink-0 bg-gray-950 rounded border border-gray-700 flex items-center justify-center overflow-hidden relative">
                   {isLoading ? (
                      <RefreshCw size={12} className="animate-spin text-blue-400" />
                   ) : iconDef?.imageUrl ? (
                      <img src={iconDef.imageUrl} alt={cat} className="w-full h-full object-contain" />
                   ) : (
                      <ImageIcon size={12} className="text-gray-600 opacity-30" />
                   )}
                </div>

                {/* Controls */}
                <div className="flex-1 min-w-0 flex flex-col justify-center">
                    <div className="flex items-center justify-between mb-0.5">
                        <span className={`text-xs font-medium truncate ${isSelected ? 'text-blue-400' : 'text-gray-300'}`}>
                          {cat}
                        </span>
                    </div>
                    <input 
                      type="text" 
                      value={localPrompts[cat] || ''}
                      onChange={(e) => setLocalPrompts(prev => ({...prev, [cat]: e.target.value}))}
                      className="w-full bg-transparent border-b border-gray-700 text-[10px] text-gray-500 focus:text-gray-200 focus:border-blue-500 focus:outline-none py-0.5"
                      placeholder={`Style for ${cat}...`}
                      onClick={(e) => e.stopPropagation()} 
                    />
                </div>

                {/* Action */}
                <button 
                  onClick={(e) => handleRegenerate(cat, e)}
                  disabled={isLoading || status !== AppStatus.IDLE}
                  className="p-1.5 text-gray-500 hover:text-blue-400 hover:bg-gray-700 rounded transition-colors disabled:opacity-30"
                  title="Regenerate this icon"
                >
                  <RefreshCw size={12} className={isLoading ? 'animate-spin' : ''} />
                </button>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};

export default RightSidebar;
