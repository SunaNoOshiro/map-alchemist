
import React, { useState } from 'react';
import { Play, ShieldCheck } from 'lucide-react';
import { AppStatus } from '@/types';
import { getSectionColor } from '@/constants';
import { UI_CONTROLS, UI_SPACING, UI_TYPOGRAPHY, brightenHex, uiClass } from '@shared/styles/uiTokens';

interface PromptPanelProps {
  prompt: string;
  setPrompt: (s: string) => void;
  onGenerate: () => void;
  status: AppStatus;
  loadingMessage?: string;
  hasApiKey: boolean;
  onRevealApiKeySetup: () => void;
}

const PromptPanel: React.FC<PromptPanelProps> = ({
  prompt,
  setPrompt,
  onGenerate,
  status,
  loadingMessage,
  hasApiKey,
  onRevealApiKeySetup
}) => {
  const isGenerating = status === AppStatus.GENERATING_STYLE;
  const sectionColor = getSectionColor('theme-generator'); // Purple for Theme Generator section
  const hoverSectionColor = brightenHex(sectionColor, 0.18);
  const [isSetupButtonHovered, setIsSetupButtonHovered] = useState(false);

  if (!hasApiKey) {
    return (
      <div className={uiClass('bg-gray-900/50 border rounded-lg', UI_SPACING.panel, UI_SPACING.blockGap)} style={{ borderColor: `${sectionColor}50` }}>
        <label className={uiClass('block text-gray-300 uppercase tracking-[0.08em]', UI_TYPOGRAPHY.fieldLabel)}>New Style Prompt</label>
        <div className={uiClass('h-24 bg-gray-800/50 border rounded-md p-3 text-gray-500 flex items-center justify-center text-center italic', UI_TYPOGRAPHY.body)} style={{ borderColor: `${sectionColor}30` }}>
          Guest Mode (Read Only)
        </div>
        <button
          onClick={onRevealApiKeySetup}
          className={uiClass(UI_CONTROLS.button, 'w-full')}
          style={{
            backgroundColor: `${(isSetupButtonHovered ? hoverSectionColor : sectionColor)}20`,
            borderColor: `${(isSetupButtonHovered ? hoverSectionColor : sectionColor)}55`,
            color: isSetupButtonHovered ? hoverSectionColor : sectionColor
          }}
          onMouseEnter={() => setIsSetupButtonHovered(true)}
          onMouseLeave={() => setIsSetupButtonHovered(false)}
        >
          <ShieldCheck size={16} /> Set Up API Key to Generate
        </button>
      </div>
    );
  }

  return (
    <div className={uiClass('bg-gray-900/50 border rounded-lg', UI_SPACING.panel, UI_SPACING.blockGap)} style={{ borderColor: `${sectionColor}50` }}>
      <label className={uiClass('block text-gray-300 uppercase tracking-[0.08em]', UI_TYPOGRAPHY.fieldLabel)}>New Style Prompt</label>
      <textarea
        value={prompt}
        onChange={(e) => setPrompt(e.target.value)}
        placeholder="e.g., Cyberpunk neon night, cozy watercolor fantasy, matrix code..."
        className={uiClass(UI_CONTROLS.textarea, 'h-24')}
        style={{
          borderColor: `${sectionColor}50`,
          outlineColor: sectionColor
        }}
      />
      <button
        onClick={onGenerate}
        disabled={status !== AppStatus.IDLE || !prompt.trim()}
        className={uiClass(UI_CONTROLS.button, 'w-full')}
        style={{
          backgroundColor: isGenerating ? `${sectionColor}30` : sectionColor,
          borderColor: `${sectionColor}50`,
          color: isGenerating ? `${sectionColor}` : 'white',
          cursor: isGenerating ? 'not-allowed' : 'pointer',
          opacity: (status !== AppStatus.IDLE || !prompt.trim()) && !isGenerating ? '0.5' : '1'
        }}
      >
        {isGenerating ? (
          <span className="truncate animate-pulse">{loadingMessage || 'Generating...'}</span>
        ) : (
          <>
            <Play size={14} /> Generate Theme
          </>
        )}
      </button>
    </div>
  );
};

export default PromptPanel;
