
import React from 'react';
import { Download, Upload, Trash, FileDown, Map, CloudUpload } from 'lucide-react';
import { getSectionColor } from '@/constants';
import { UI_CONTROLS, UI_TYPOGRAPHY, uiClass } from '@shared/styles/uiTokens';

interface ActionPanelProps {
  onExport: () => void;
  onExportPackage: () => void;
  onExportMaputnik: () => void;
  onPublishMaputnik: () => void;
  onClearGitHubToken: () => void;
  onImport: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onClear: () => void;
}

const ActionPanel: React.FC<ActionPanelProps> = ({
  onExport,
  onExportPackage,
  onExportMaputnik,
  onPublishMaputnik,
  onClearGitHubToken,
  onImport,
  onClear
}) => {
  const sectionColor = getSectionColor('theme-library'); // Green for Theme Library section

  return (
    <div>
      <div className="p-1.5 border-t grid grid-cols-6 gap-1 bg-gray-900/50" style={{ borderColor: `${sectionColor}50` }}>
          <button
              onClick={onExport}
              className={uiClass(UI_CONTROLS.iconTile, 'text-gray-400 hover:text-white')}
              style={{ borderColor: `${sectionColor}30` }}
              title="Export Presets JSON"
          >
              <Download size={10} className="mb-0.5" style={{ color: sectionColor }} />
              <span className={UI_TYPOGRAPHY.tiny} style={{ color: sectionColor }}>Presets</span>
          </button>
          <button
              onClick={onExportPackage}
              className={uiClass(UI_CONTROLS.iconTile, 'text-gray-400 hover:text-white')}
              style={{ borderColor: `${sectionColor}30` }}
              title="Export MapLibre Package"
          >
              <FileDown size={10} className="mb-0.5" style={{ color: sectionColor }} />
              <span className={UI_TYPOGRAPHY.tiny} style={{ color: sectionColor }}>Package</span>
          </button>
          <button
              onClick={onExportMaputnik}
              className={uiClass(UI_CONTROLS.iconTile, 'text-gray-400 hover:text-white')}
              style={{ borderColor: `${sectionColor}30` }}
              title="Export Maputnik (style + sprites)"
          >
              <Map size={10} className="mb-0.5" style={{ color: sectionColor }} />
              <span className={UI_TYPOGRAPHY.tiny} style={{ color: sectionColor }}>Maputnik</span>
          </button>
          <button
              onClick={onPublishMaputnik}
              className={uiClass(UI_CONTROLS.iconTile, 'text-gray-400 hover:text-white')}
              style={{ borderColor: `${sectionColor}30` }}
              title="Publish to GitHub Pages (Maputnik)"
          >
              <CloudUpload size={10} className="mb-0.5" style={{ color: sectionColor }} />
              <span className={UI_TYPOGRAPHY.tiny} style={{ color: sectionColor }}>Publish</span>
          </button>
          <label className={uiClass(UI_CONTROLS.iconTile, 'text-gray-400 hover:text-white cursor-pointer')} style={{ borderColor: `${sectionColor}30` }} title="Import JSON">
              <Upload size={10} className="mb-0.5" style={{ color: sectionColor }} />
              <span className={UI_TYPOGRAPHY.tiny} style={{ color: sectionColor }}>Import</span>
              <input type="file" accept=".json" onChange={onImport} className="hidden" />
          </label>
          <button
              onClick={onClear}
              className={uiClass(UI_CONTROLS.iconTile, 'text-gray-400 hover:text-red-400 hover:bg-red-900/30')}
              style={{ borderColor: `${sectionColor}30` }}
              title="Reset all generated data"
          >
              <Trash size={10} className="mb-0.5" style={{ color: '#ef4444' }} />
              <span className={UI_TYPOGRAPHY.tiny} style={{ color: '#ef4444' }}>Reset</span>
          </button>
      </div>
      <div className="mt-1 flex justify-end">
        <button
          onClick={onClearGitHubToken}
          className={uiClass(UI_TYPOGRAPHY.tiny, 'uppercase tracking-[0.08em] font-semibold text-gray-500 hover:text-gray-300 transition-colors')}
          title="Remove saved GitHub token"
          type="button"
        >
          Remove GitHub Token
        </button>
      </div>
    </div>
  );
};

export default ActionPanel;
