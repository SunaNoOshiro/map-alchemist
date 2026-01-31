import React from 'react';
import { BrainCircuit } from 'lucide-react';
import { AiConfig } from '@/types';
import { getSectionColor } from '@/constants';

interface AiSettingsPanelProps {
  aiConfig: AiConfig;
  availableModels: Record<string, string>;
  hasApiKey: boolean;
}

const AiSettingsPanel: React.FC<AiSettingsPanelProps> = ({
  aiConfig,
  availableModels,
  hasApiKey
}) => {
  const sectionColor = getSectionColor('ai-config'); // Blue for AI Configuration section
  const modelLabel = availableModels[aiConfig.model] || aiConfig.model;

  return (
    <div className="bg-gray-800/50 border rounded-lg p-3 space-y-3" style={{ borderColor: `${sectionColor}50` }}>
      <h3 className="text-xs font-semibold text-gray-200 uppercase tracking-wide flex items-center gap-2">
        <BrainCircuit className="w-3 h-3" style={{ color: sectionColor }} />
        <span style={{ color: sectionColor }}>AI Configuration</span>
      </h3>
      <div className="bg-gray-900/40 border rounded-md p-2 text-[10px] text-gray-300 space-y-2" style={{ borderColor: `${sectionColor}30` }}>
        <div className="flex items-center justify-between">
          <span className="text-gray-400">Status</span>
          <span className={hasApiKey ? 'text-green-400' : 'text-amber-300'}>
            {hasApiKey ? 'Connected' : 'Guest Mode'}
          </span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-gray-400">Model</span>
          <span className="text-gray-200 truncate max-w-[140px]">{modelLabel}</span>
        </div>
        <p className="text-[10px] text-gray-500 leading-relaxed">
          Provider and key settings are managed automatically. Connect your key from the Theme Generator section.
        </p>
      </div>
    </div>
  );
};

export default AiSettingsPanel;
