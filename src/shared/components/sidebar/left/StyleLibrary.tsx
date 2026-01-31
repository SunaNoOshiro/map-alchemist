
import React from 'react';
import { Check, Trash2 } from 'lucide-react';
import { MapStylePreset } from '@/types';
import { getSectionColor } from '@/constants';
import { getSectionColorStyle, sidebarIconClasses } from './sidebarIconStyles';

interface StyleLibraryProps {
  styles: MapStylePreset[];
  activeStyleId: string | null;
  onApplyStyle: (id: string) => void;
  onDeleteStyle: (id: string) => void;
}

const StyleLibrary: React.FC<StyleLibraryProps> = ({ styles, activeStyleId, onApplyStyle, onDeleteStyle }) => {
  const sectionColor = getSectionColor('theme-library'); // Green for Theme Library section
  const sectionColorStyle = getSectionColorStyle(sectionColor);

  return (
    <div className="space-y-2" style={sectionColorStyle}>
      <div className="flex items-center justify-between mb-2">
        <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Style Library</h2>
        <span className="text-[10px] text-gray-600">{styles.length} Saved</span>
      </div>

      <div className="space-y-1 max-h-64 overflow-y-auto scrollbar-thin">
        {styles.map((style) => (
          <div
            key={style.id}
            onClick={() => onApplyStyle(style.id)}
            className={`group p-1.5 rounded border transition-all cursor-pointer`}
            style={{
              backgroundColor: activeStyleId === style.id ? '#27272a' : 'rgba(31, 41, 55, 0.3)',
              borderColor: activeStyleId === style.id ? `${sectionColor}50` : `${sectionColor}30`,
              boxShadow: activeStyleId === style.id ? '0 1px 3px 0 rgb(0 0 0 / 0.1), 0 1px 2px -1px rgb(0 0 0 / 0.1)' : 'none'
            }}
          >
            <div className="flex justify-between items-start">
              <div className="flex-1 min-w-0">
                <h3 className={`font-medium text-xs leading-tight`} style={{ color: activeStyleId === style.id ? sectionColor : '#d1d5db' }}>
                  {style.name}
                </h3>
                <span className="text-[9px] text-gray-500 truncate max-w-[120px] block mt-0.5">
                  {new Date(style.createdAt).toLocaleDateString()}
                </span>
              </div>
              <div className="flex items-center gap-1 ml-1">
                {activeStyleId === style.id && (
                  <Check size={10} className={`${sidebarIconClasses.icon} flex-shrink-0 text-[color:var(--section-color)]`} />
                )}
                <button
                  onClick={(e) => { e.stopPropagation(); onDeleteStyle(style.id); }}
                  className={`${sidebarIconClasses.iconButtonBase} text-gray-500 hover:bg-red-900/50 hover:text-red-400 opacity-0 group-hover:opacity-100`}
                  title="Delete Style"
                >
                  <Trash2 size={10} className={sidebarIconClasses.icon} />
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default StyleLibrary;
