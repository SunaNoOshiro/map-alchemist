
import React from 'react';
import { Download, Upload, Trash } from 'lucide-react';

interface ActionPanelProps {
  onExport: () => void;
  onImport: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onClear: () => void;
}

const ActionPanel: React.FC<ActionPanelProps> = ({ onExport, onImport, onClear }) => {
  return (
    <div className="p-3 border-t border-gray-800 grid grid-cols-3 gap-2 bg-gray-900 flex-shrink-0">
        <button
            onClick={onExport}
            className="flex flex-col items-center justify-center p-2 bg-gray-800 hover:bg-gray-700 text-gray-400 hover:text-white rounded transition-colors"
            title="Export JSON"
        >
            <Download size={14} className="mb-1"/>
            <span className="text-[10px]">Export</span>
        </button>
        <label className="flex flex-col items-center justify-center p-2 bg-gray-800 hover:bg-gray-700 text-gray-400 hover:text-white rounded transition-colors cursor-pointer" title="Import JSON">
            <Upload size={14} className="mb-1"/>
            <span className="text-[10px]">Import</span>
            <input type="file" accept=".json" onChange={onImport} className="hidden" />
        </label>
        <button
            onClick={onClear}
            className="flex flex-col items-center justify-center p-2 bg-gray-800 hover:bg-red-900/30 text-gray-400 hover:text-red-400 rounded transition-colors"
            title="Reset All"
        >
            <Trash size={14} className="mb-1"/>
            <span className="text-[10px]">Clear</span>
        </button>
    </div>
  );
};

export default ActionPanel;
