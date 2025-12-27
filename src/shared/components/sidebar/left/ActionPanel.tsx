
import React from 'react';
import { Download, Upload, Trash } from 'lucide-react';
import { getSectionColor } from '@/constants';

interface ActionPanelProps {
  onExport: () => void;
  onImport: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onClear: () => void;
}

const ActionPanel: React.FC<ActionPanelProps> = ({ onExport, onImport, onClear }) => {
  const sectionColor = getSectionColor('theme-library'); // Green for Theme Library section

  return (
    <div className="p-1.5 border-t grid grid-cols-3 gap-1 bg-gray-900/50" style={{ borderColor: `${sectionColor}50` }}>
        <button
            onClick={onExport}
            className="flex flex-col items-center justify-center p-1.5 bg-gray-800 hover:bg-gray-700 text-gray-400 hover:text-white rounded transition-colors"
            style={{ borderColor: `${sectionColor}30` }}
            title="Export JSON"
        >
            <Download size={10} className="mb-0.5" style={{ color: sectionColor }} />
            <span className="text-[9px]" style={{ color: sectionColor }}>Export</span>
        </button>
        <label className="flex flex-col items-center justify-center p-1.5 bg-gray-800 hover:bg-gray-700 text-gray-400 hover:text-white rounded transition-colors cursor-pointer" style={{ borderColor: `${sectionColor}30` }} title="Import JSON">
            <Upload size={10} className="mb-0.5" style={{ color: sectionColor }} />
            <span className="text-[9px]" style={{ color: sectionColor }}>Import</span>
            <input type="file" accept=".json" onChange={onImport} className="hidden" />
        </label>
        <button
            onClick={onClear}
            className="flex flex-col items-center justify-center p-1.5 bg-gray-800 hover:bg-red-900/30 text-gray-400 hover:text-red-400 rounded transition-colors"
            style={{ borderColor: `${sectionColor}30` }}
            title="Reset All"
        >
            <Trash size={10} className="mb-0.5" style={{ color: '#ef4444' }} />
            <span className="text-[9px]" style={{ color: '#ef4444' }}>Clear</span>
        </button>
    </div>
  );
};

export default ActionPanel;
