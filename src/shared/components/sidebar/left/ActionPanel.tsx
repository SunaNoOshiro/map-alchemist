
import React from 'react';
import { Download, Upload, Trash } from 'lucide-react';
import { getSectionColor } from '@/constants';
import { getSectionColorStyle, sidebarIconClasses } from './sidebarIconStyles';

interface ActionPanelProps {
  onExport: () => void;
  onImport: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onClear: () => void;
}

const ActionPanel: React.FC<ActionPanelProps> = ({ onExport, onImport, onClear }) => {
  const sectionColor = getSectionColor('theme-library'); // Green for Theme Library section
  const sectionColorStyle = getSectionColorStyle(sectionColor);

  return (
    <div
      className="grid grid-cols-3 gap-1 border-t bg-gray-900/50 p-1.5"
      style={{ borderColor: `${sectionColor}50`, ...sectionColorStyle }}
    >
        <button
            onClick={onExport}
            className={`${sidebarIconClasses.actionItemBase} text-[color:var(--section-color)] hover:bg-[color:var(--section-color)/0.12]`}
            style={{ borderColor: `${sectionColor}30` }}
            title="Export JSON"
        >
            <Download size={10} className={`${sidebarIconClasses.icon} mb-0.5`} />
            <span className={sidebarIconClasses.label}>Export</span>
        </button>
        <label
          className={`${sidebarIconClasses.actionItemBase} cursor-pointer text-[color:var(--section-color)] hover:bg-[color:var(--section-color)/0.12]`}
          style={{ borderColor: `${sectionColor}30` }}
          title="Import JSON"
        >
            <Upload size={10} className={`${sidebarIconClasses.icon} mb-0.5`} />
            <span className={sidebarIconClasses.label}>Import</span>
            <input type="file" accept=".json" onChange={onImport} className="hidden" />
        </label>
        <button
            onClick={onClear}
            className={`${sidebarIconClasses.actionItemBase} text-red-400 hover:bg-red-900/40 hover:text-red-300`}
            style={{ borderColor: `${sectionColor}30` }}
            title="Reset All"
        >
            <Trash size={10} className={`${sidebarIconClasses.icon} mb-0.5`} />
            <span className={sidebarIconClasses.label}>Clear</span>
        </button>
    </div>
  );
};

export default ActionPanel;
