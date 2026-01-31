
import React from 'react';
import { MapStylePreset, LogEntry, AppStatus } from '@/types';
import SidebarContainer from './SidebarContainer';
import PromptPanel from './left/PromptPanel';
import StyleLibrary from './left/StyleLibrary';
import ActionPanel from './left/ActionPanel';
import LogConsole from './left/LogConsole';

interface LeftSidebarProps {
  isOpen: boolean;
  prompt: string;
  setPrompt: (s: string) => void;
  onGenerate: () => void;
  status: AppStatus;
  loadingMessage?: string;
  styles: MapStylePreset[];
  activeStyleId: string | null;
  onApplyStyle: (id: string) => void;
  onDeleteStyle: (id: string) => void;
  onExport: () => void;
  onImport: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onClear: () => void;
  logs: LogEntry[];
  hasApiKey: boolean;
  onConnectApi: () => void;
}

const LeftSidebar: React.FC<LeftSidebarProps> = ({
  isOpen,
  prompt,
  setPrompt,
  onGenerate,
  status,
  loadingMessage,
  styles,
  activeStyleId,
  onApplyStyle,
  onDeleteStyle,
  onExport,
  onImport,
  onClear,
  logs,
  hasApiKey,
  onConnectApi
}) => {
  return (
    <SidebarContainer isOpen={isOpen} width="w-72 sm:w-80" side="left">
      {/* Header */}
      <div className="p-3 sm:p-4 border-b border-gray-800 flex-shrink-0 bg-gray-900/70 backdrop-blur">
        <h1 className="text-lg sm:text-xl font-bold bg-gradient-to-r from-blue-400 via-cyan-300 to-purple-400 bg-clip-text text-transparent">
          MapAlchemist
        </h1>
        <p className="text-[10px] sm:text-xs text-gray-500 mt-1">AI Map Style Generator</p>
      </div>

      <PromptPanel
        prompt={prompt}
        setPrompt={setPrompt}
        onGenerate={onGenerate}
        status={status}
        loadingMessage={loadingMessage}
        hasApiKey={hasApiKey}
        onConnectApi={onConnectApi}
      />

      <StyleLibrary
        styles={styles}
        activeStyleId={activeStyleId}
        onApplyStyle={onApplyStyle}
        onDeleteStyle={onDeleteStyle}
      />

      <ActionPanel
        onExport={onExport}
        onImport={onImport}
        onClear={onClear}
      />

      <LogConsole logs={logs} />
    </SidebarContainer>
  );
};

export default LeftSidebar;
