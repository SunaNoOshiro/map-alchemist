
import React, { useState } from 'react';
import { ChevronDown, Palette } from 'lucide-react';
import { AppStatus, MapStylePreset } from '@/types';

interface TopToolbarProps {
  styles: MapStylePreset[];
  activeStyleId: string | null;
  onSelectStyle: (id: string) => void;
  status: AppStatus;
}

const TopToolbar: React.FC<TopToolbarProps> = ({
  styles,
  activeStyleId,
  onSelectStyle,
  status
}) => {
  const [isStyleMenuOpen, setIsStyleMenuOpen] = useState(false);
  const activeStyle = styles.find((style) => style.id === activeStyleId);

  return (
    <div className="min-h-[4rem] bg-gray-900 border-b border-gray-700 flex flex-col gap-2 px-4 py-2 sm:h-16 sm:flex-row sm:items-center sm:justify-between sm:px-6 relative z-20 shadow-md flex-shrink-0">
      {/* Left Spacer */}
      <div className="hidden sm:block w-32"></div>

      {/* Center: Active Style Selector */}
      <div className="flex flex-1 flex-col gap-2 sm:flex-row sm:items-center sm:justify-center">
        <div className="flex items-center gap-2">
          <Palette size={14} className="text-blue-400" />
          <label className="text-[10px] text-blue-400 uppercase font-bold tracking-widest">Active Map Theme</label>
        </div>
        <div className="relative w-full sm:w-64">
          <button
            type="button"
            onClick={() => setIsStyleMenuOpen(!isStyleMenuOpen)}
            disabled={status !== AppStatus.IDLE}
            className="w-full bg-gray-800 hover:bg-gray-700 border border-gray-700 rounded px-2 py-1.5 text-left flex items-center justify-between transition-colors text-xs text-gray-200 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <span className="truncate">{activeStyle?.name || 'Select a style'}</span>
            <ChevronDown className="w-3 h-3 text-gray-400" />
          </button>

          {isStyleMenuOpen && (
            <div className="absolute z-30 mt-1 w-full bg-gray-800 border border-gray-700 rounded shadow-lg overflow-hidden max-h-52 overflow-y-auto">
              {styles.map((style) => {
                const isActive = style.id === activeStyleId;
                return (
                  <button
                    key={style.id}
                    type="button"
                    onClick={() => {
                      onSelectStyle(style.id);
                      setIsStyleMenuOpen(false);
                    }}
                    className={`w-full px-3 py-2 text-left text-xs transition-colors flex items-center gap-2 ${
                      isActive
                        ? 'bg-gray-700 text-white'
                        : 'text-gray-200 hover:bg-gray-700'
                    }`}
                  >
                    {isActive && <span className="text-blue-400">●</span>}
                    <span className="truncate">{style.name}</span>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Right: Status Indicator */}
      <div className="w-full sm:w-32 flex justify-start sm:justify-end">
        {status !== AppStatus.IDLE && (
          <div className="flex items-center gap-2 text-xs text-blue-400 animate-pulse bg-blue-900/20 px-3 py-1 rounded-full border border-blue-900/50 whitespace-nowrap">
            <div className="w-2 h-2 bg-blue-400 rounded-full"></div>
            {status === AppStatus.GENERATING_STYLE && 'Building...'}
            {status === AppStatus.GENERATING_ICON && 'Designing...'}
          </div>
        )}
      </div>

    </div>
  );
};

export default TopToolbar;
