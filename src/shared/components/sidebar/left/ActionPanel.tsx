
import React from 'react';
import { Download, Upload, Trash, FileDown, Map, CloudUpload } from 'lucide-react';
import { getSectionColor } from '@/constants';

interface ActionPanelProps {
  onExport: () => void;
  onExportPackage: () => void;
  onExportMaputnik: () => void;
  onPublishMaputnik: () => void;
  onClearGitHubToken: () => void;
  maputnikDemoPoisEnabled: boolean;
  onToggleMaputnikDemoPois: (enabled: boolean) => void;
  onImport: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onClear: () => void;
}

const ActionPanel: React.FC<ActionPanelProps> = ({
  onExport,
  onExportPackage,
  onExportMaputnik,
  onPublishMaputnik,
  onClearGitHubToken,
  maputnikDemoPoisEnabled,
  onToggleMaputnikDemoPois,
  onImport,
  onClear
}) => {
  const sectionColor = getSectionColor('theme-library'); // Green for Theme Library section

  return (
    <div>
      <div className="p-1.5 border-t grid grid-cols-6 gap-1 bg-gray-900/50" style={{ borderColor: `${sectionColor}50` }}>
          <button
              onClick={onExport}
              className="flex flex-col items-center justify-center p-1.5 bg-gray-800 hover:bg-gray-700 text-gray-400 hover:text-white rounded transition-colors"
              style={{ borderColor: `${sectionColor}30` }}
              title="Export Presets JSON"
          >
              <Download size={10} className="mb-0.5" style={{ color: sectionColor }} />
              <span className="text-[9px]" style={{ color: sectionColor }}>Presets</span>
          </button>
          <button
              onClick={onExportPackage}
              className="flex flex-col items-center justify-center p-1.5 bg-gray-800 hover:bg-gray-700 text-gray-400 hover:text-white rounded transition-colors"
              style={{ borderColor: `${sectionColor}30` }}
              title="Export MapLibre Package"
          >
              <FileDown size={10} className="mb-0.5" style={{ color: sectionColor }} />
              <span className="text-[9px]" style={{ color: sectionColor }}>Package</span>
          </button>
          <button
              onClick={onExportMaputnik}
              className="flex flex-col items-center justify-center p-1.5 bg-gray-800 hover:bg-gray-700 text-gray-400 hover:text-white rounded transition-colors"
              style={{ borderColor: `${sectionColor}30` }}
              title="Export Maputnik (style + sprites)"
          >
              <Map size={10} className="mb-0.5" style={{ color: sectionColor }} />
              <span className="text-[9px]" style={{ color: sectionColor }}>Maputnik</span>
          </button>
          <button
              onClick={onPublishMaputnik}
              className="flex flex-col items-center justify-center p-1.5 bg-gray-800 hover:bg-gray-700 text-gray-400 hover:text-white rounded transition-colors"
              style={{ borderColor: `${sectionColor}30` }}
              title="Publish to GitHub Pages (Maputnik)"
          >
              <CloudUpload size={10} className="mb-0.5" style={{ color: sectionColor }} />
              <span className="text-[9px]" style={{ color: sectionColor }}>Publish</span>
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
      <div className="mt-2 flex items-center justify-between rounded-md border border-white/10 bg-gray-900/40 px-2 py-1 text-[10px] uppercase tracking-widest text-gray-400">
        <span>Demo POIs</span>
        <label className="flex items-center gap-2 text-[10px] text-gray-500">
          <input
            type="checkbox"
            checked={maputnikDemoPoisEnabled}
            onChange={(event) => onToggleMaputnikDemoPois(event.target.checked)}
            className="h-3 w-3 accent-emerald-500"
          />
          <span>{maputnikDemoPoisEnabled ? 'On' : 'Off'}</span>
        </label>
      </div>
      <div className="mt-1 flex justify-end">
        <button
          onClick={onClearGitHubToken}
          className="text-[9px] uppercase tracking-widest text-gray-500 hover:text-gray-300 transition-colors"
          title="Clear stored GitHub token"
          type="button"
        >
          Clear GitHub Token
        </button>
      </div>
    </div>
  );
};

export default ActionPanel;
