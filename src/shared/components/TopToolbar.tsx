
import React from 'react';
import { Palette, PanelLeft, PanelRight } from 'lucide-react';
import { AppStatus, MapStylePreset } from '@/types';

interface TopToolbarProps {
  styles: MapStylePreset[];
  activeStyleId: string | null;
  onSelectStyle: (id: string) => void;
  status: AppStatus;
  onToggleLeft?: () => void;
  onToggleRight?: () => void;
  isLeftSidebarOpen?: boolean;
  isRightSidebarOpen?: boolean;
}

const TopToolbar: React.FC<TopToolbarProps> = ({
  styles,
  activeStyleId,
  onSelectStyle,
  status,
  onToggleLeft,
  onToggleRight,
  isLeftSidebarOpen,
  isRightSidebarOpen
}) => {

  return (
    <div className="h-14 sm:h-16 bg-gray-900/95 border-b border-gray-700 flex items-center justify-between px-3 sm:px-6 relative z-20 shadow-md flex-shrink-0 backdrop-blur">

      {/* Left Spacer */}
      <div className="w-32 hidden sm:flex items-center gap-2" />

      <div className="flex items-center gap-2 sm:hidden">
        {onToggleLeft && (
          <button
            onClick={onToggleLeft}
            className="inline-flex items-center justify-center w-9 h-9 rounded-full bg-gray-800/80 border border-gray-700 text-gray-200"
            aria-label="Toggle left sidebar"
          >
            <PanelLeft size={16} className={isLeftSidebarOpen ? 'text-blue-300' : ''} />
          </button>
        )}
      </div>

      {/* Center: Active Style Selector */}
      <div className="flex flex-col items-center flex-1 max-w-md mx-auto px-2">
        <label className="text-[9px] sm:text-[10px] text-blue-400 uppercase font-bold tracking-wider mb-1 flex items-center gap-1.5">
          <Palette size={12} /> Active Map Theme
        </label>
        <div className="relative w-full">
          <select
            value={activeStyleId || ''}
            onChange={(e) => onSelectStyle(e.target.value)}
            disabled={status !== AppStatus.IDLE}
            className="w-full bg-gray-800 border border-gray-600 text-white text-sm rounded-md px-4 py-2 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 hover:bg-gray-700 cursor-pointer transition-colors disabled:opacity-50 disabled:cursor-not-allowed appearance-none text-left"
          >
            {styles.map(s => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </select>
          {/* Custom Arrow */}
          <div className="absolute inset-y-0 right-0 flex items-center px-2 pointer-events-none text-gray-400">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7"></path></svg>
          </div>
        </div>
      </div>

      {/* Right: Status Indicator */}
      <div className="w-32 flex justify-end items-center gap-2">
        {status !== AppStatus.IDLE && (
          <div className="flex items-center gap-2 text-[10px] sm:text-xs text-blue-400 animate-pulse bg-blue-900/20 px-2.5 sm:px-3 py-1 rounded-full border border-blue-900/50 whitespace-nowrap">
            <div className="w-2 h-2 bg-blue-400 rounded-full"></div>
            {status === AppStatus.GENERATING_STYLE && 'Building...'}
            {status === AppStatus.GENERATING_ICON && 'Designing...'}
          </div>
        )}
        {onToggleRight && (
          <button
            onClick={onToggleRight}
            className="sm:hidden inline-flex items-center justify-center w-9 h-9 rounded-full bg-gray-800/80 border border-gray-700 text-gray-200"
            aria-label="Toggle right sidebar"
          >
            <PanelRight size={16} className={isRightSidebarOpen ? 'text-blue-300' : ''} />
          </button>
        )}
      </div>

    </div>
  );
};

export default TopToolbar;
