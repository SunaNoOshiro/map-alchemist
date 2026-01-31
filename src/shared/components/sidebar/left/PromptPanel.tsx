
import React from 'react';
import { Play, ShieldCheck } from 'lucide-react';
import { AppStatus } from '@/types';
import { getSectionColor } from '@/constants';
import { getSectionColorStyle } from './sidebarIconStyles';

interface PromptPanelProps {
  prompt: string;
  setPrompt: (s: string) => void;
  onGenerate: () => void;
  status: AppStatus;
  loadingMessage?: string;
  hasApiKey: boolean;
  onConnectApi: () => void;
}

const PromptPanel: React.FC<PromptPanelProps> = ({
  prompt,
  setPrompt,
  onGenerate,
  status,
  loadingMessage,
  hasApiKey,
  onConnectApi
}) => {
  const isGenerating = status === AppStatus.GENERATING_STYLE;
  const sectionColor = getSectionColor('theme-generator'); // Purple for Theme Generator section
  const sectionColorStyle = getSectionColorStyle(sectionColor);

  if (!hasApiKey) {
    return (
      <div
        className="p-3 space-y-3 bg-gray-900/50 border rounded-lg"
        style={{ borderColor: `${sectionColor}50`, ...sectionColorStyle }}
      >
        <label className="block text-[10px] font-semibold uppercase tracking-wider text-[color:var(--section-color)]">
          New Style Prompt
        </label>
        <div
          className="h-20 bg-gray-800/50 border rounded-md p-3 text-xs text-gray-500 flex items-center justify-center text-center italic"
          style={{ borderColor: `${sectionColor}30` }}
        >
          Guest Mode (Read Only)
        </div>
        <button
          onClick={onConnectApi}
          className="w-full rounded-md border px-3 py-2 text-[10px] font-semibold uppercase tracking-wide transition-all flex items-center justify-center gap-2 text-[color:var(--section-color)] hover:bg-[color:var(--section-color)/0.12]"
          style={{ borderColor: `${sectionColor}50` }}
        >
          <ShieldCheck size={12} /> Connect API Key to Generate
        </button>
      </div>
    );
  }

  return (
    <div
      className="p-3 space-y-3 bg-gray-900/50 border rounded-lg"
      style={{ borderColor: `${sectionColor}50`, ...sectionColorStyle }}
    >
      <label className="block text-[10px] font-semibold uppercase tracking-wider text-[color:var(--section-color)]">
        New Style Prompt
      </label>
      <textarea
        value={prompt}
        onChange={(e) => setPrompt(e.target.value)}
        placeholder="e.g., Cyberpunk neon night, cozy watercolor fantasy, matrix code..."
        className="w-full h-20 bg-gray-800 border rounded px-2 py-1.5 text-xs text-gray-200 placeholder-gray-500 focus:outline-none resize-none transition-colors"
        style={{
          borderColor: `${sectionColor}50`,
          outlineColor: sectionColor
        }}
      />
      <button
        onClick={onGenerate}
        disabled={status !== AppStatus.IDLE || !prompt.trim()}
        className="w-full py-1.5 px-3 rounded font-semibold text-[10px] uppercase tracking-wide transition-all flex items-center justify-center gap-2"
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
