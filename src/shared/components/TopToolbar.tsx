
import React from 'react';
import { Palette } from 'lucide-react';
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

  return (
    <div className="h-16 bg-gray-900 border-b border-gray-700 flex items-center justify-between px-6 relative z-20 shadow-md flex-shrink-0">

      {/* Left Spacer */}
      <div className="w-32 hidden sm:block"></div>

      {/* Center: Active Style Selector */}
      <div className="flex items-center justify-center flex-1">
        <div className="flex items-center gap-2">
          <Palette size={14} className="text-blue-400" />
          <label className="text-xs text-blue-400 uppercase font-bold tracking-wider">Active Map Theme</label>
        </div>
        <div className="relative ml-2">
          <select
            value={activeStyleId || ''}
            onChange={(e) => onSelectStyle(e.target.value)}
            disabled={status !== AppStatus.IDLE}
            className="bg-gray-900 border border-gray-700 text-white text-xs rounded px-2 py-1 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 hover:bg-gray-800 cursor-pointer transition-colors disabled:opacity-50 disabled:cursor-not-allowed appearance-none"
          >
            {styles.map(s => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </select>
          {/* Custom Arrow */}
          <div className="absolute inset-y-0 right-0 flex items-center px-1 pointer-events-none text-gray-400">
            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7"></path></svg>
          </div>
        </div>
      </div>

      {/* Right: Status Indicator */}
      <div className="w-32 flex justify-end">
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
