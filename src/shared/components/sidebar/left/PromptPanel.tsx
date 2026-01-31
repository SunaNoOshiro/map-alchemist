
import React from 'react';
import { Play, ShieldCheck } from 'lucide-react';
import { AppStatus } from '@/types';

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

  if (!hasApiKey) {
    return (
      <div className="p-3 sm:p-4 space-y-3 border-b border-gray-800 bg-gray-900/50 flex-shrink-0">
        <label className="block text-[10px] sm:text-xs font-semibold text-blue-400 uppercase tracking-wider">New Style Prompt</label>
        <div className="h-24 sm:h-20 bg-gray-800/50 border border-gray-700/50 rounded-xl p-3 text-sm text-gray-500 flex items-center justify-center text-center italic">
          Guest Mode (Read Only)
        </div>
        <button
          onClick={onConnectApi}
          className="w-full py-2.5 px-4 rounded-full font-medium text-sm transition-all flex items-center justify-center gap-2 bg-purple-900/30 hover:bg-purple-800/50 text-purple-200 border border-purple-800/50"
        >
          <ShieldCheck size={16} /> Connect API Key to Generate
        </button>
      </div>
    );
  }

  return (
    <div className="p-3 sm:p-4 space-y-3 border-b border-gray-800 bg-gray-900/50 flex-shrink-0">
      <label className="block text-[10px] sm:text-xs font-semibold text-blue-400 uppercase tracking-wider">New Style Prompt</label>
      <textarea
        value={prompt}
        onChange={(e) => setPrompt(e.target.value)}
        placeholder="e.g., Cyberpunk neon night, cozy watercolor fantasy, matrix code..."
        className="w-full h-24 sm:h-20 bg-gray-800 border border-gray-700 rounded-xl p-3 text-sm text-gray-200 placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none transition-colors"
      />
      <button
        onClick={onGenerate}
        disabled={status !== AppStatus.IDLE || !prompt.trim()}
        className={`w-full py-2.5 px-4 rounded-full font-medium text-sm transition-all flex items-center justify-center gap-2
          ${isGenerating
            ? 'bg-blue-900 text-blue-200 cursor-not-allowed animate-pulse'
            : 'bg-blue-600 hover:bg-blue-500 text-white shadow-lg shadow-blue-900/50'
          } disabled:opacity-50`}
      >
        {isGenerating ? (
          <span className="truncate">{loadingMessage || 'Generating...'}</span>
        ) : (
          <>
            <Play size={16} /> Generate Theme
          </>
        )}
      </button>
    </div>
  );
};

export default PromptPanel;
