
import React, { useState } from 'react';
import { MapStylePreset, LogEntry, AppStatus, AiConfig } from '@/types';
import SidebarContainer from './SidebarContainer';
import PromptPanel from './left/PromptPanel';
import StyleLibrary from './left/StyleLibrary';
import ActionPanel from './left/ActionPanel';
import LogConsole from './left/LogConsole';
import AiSettingsPanel from './left/AiSettingsPanel';
import { ChevronDown, ChevronRight, BrainCircuit, Wand, Palette, FileText } from 'lucide-react';
import { SECTIONS } from '@/constants';

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
  aiConfig: AiConfig;
  availableModels: Record<string, string>;
  onUpdateAiConfig: (config: Partial<AiConfig>) => void;
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
  onConnectApi,
  aiConfig,
  availableModels,
  onUpdateAiConfig
}) => {
  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({
    'ai-config': false,  // Collapsed by default as requested
    'theme-generator': true,
    'theme-library': true,
    'logs': true,
  });

  const toggleSection = (sectionId: string) => {
    setExpandedSections(prev => ({ ...prev, [sectionId]: !prev[sectionId] }));
  };

  return (
    <SidebarContainer isOpen={isOpen} width="w-full sm:w-80" side="left">
      {/* Header */}
      <div className="p-4 border-b border-gray-800 flex-shrink-0 bg-gray-900">
        <h1 className="text-xl font-bold bg-gradient-to-r from-blue-400 to-purple-400 bg-clip-text text-transparent">
          MapAlchemist
        </h1>
        <p className="text-xs text-gray-500 mt-1">AI Map Style Generator</p>
      </div>

      {/* Scrollable Content with Sections */}
      <div className="flex-1 overflow-y-auto p-2 space-y-4 scrollbar-thin">
        {SECTIONS.map((section) => {
          const isExpanded = expandedSections[section.id];
          const Icon = section.icon === 'BrainCircuit' ? BrainCircuit :
                       section.icon === 'Wand' ? Wand :
                       section.icon === 'Palette' ? Palette :
                       section.icon === 'FileText' ? FileText : BrainCircuit;

          return (
            <div key={section.id} className="space-y-1">
              {/* Section Header */}
              <div
                onClick={() => toggleSection(section.id)}
                className={`flex items-center gap-2 px-2 py-1.5 cursor-pointer select-none border-b ${section.tailwindBorderColor} bg-gray-900/50 hover:bg-gray-800/50 transition-colors sticky top-0 z-10 backdrop-blur-sm`}
              >
                {isExpanded ? <ChevronDown size={12} className={section.tailwindTextColor} /> : <ChevronRight size={12} className={section.tailwindTextColor} />}
                <Icon size={12} className={section.tailwindTextColor} />
                <span className={`text-[10px] font-bold uppercase tracking-widest ${section.tailwindTextColor}`}>
                  {section.title}
                </span>
              </div>

              {/* Section Content */}
              {isExpanded && (
                <div className="pl-1 space-y-1">
                  {section.id === 'ai-config' && (
                    <div className="p-2">
                      <AiSettingsPanel
                        aiConfig={aiConfig}
                        availableModels={availableModels}
                        onUpdateAiConfig={onUpdateAiConfig}
                        onConnectApi={onConnectApi}
                        hasApiKey={hasApiKey}
                        isCollapsed={false}  // Managed by parent section state
                      />
                    </div>
                  )}

                  {section.id === 'theme-generator' && (
                    <div className="p-2">
                      <PromptPanel
                        prompt={prompt}
                        setPrompt={setPrompt}
                        onGenerate={onGenerate}
                        status={status}
                        loadingMessage={loadingMessage}
                        hasApiKey={hasApiKey}
                        onConnectApi={onConnectApi}
                      />
                    </div>
                  )}

                  {section.id === 'theme-library' && (
                    <div className="p-2">
                      <StyleLibrary
                        styles={styles}
                        activeStyleId={activeStyleId}
                        onApplyStyle={onApplyStyle}
                        onDeleteStyle={onDeleteStyle}
                      />
                      <div className="mt-2">
                        <ActionPanel
                          onExport={onExport}
                          onImport={onImport}
                          onClear={onClear}
                        />
                      </div>
                    </div>
                  )}

                  {section.id === 'logs' && (
                    <div className="p-2">
                      <LogConsole logs={logs} />
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </SidebarContainer>
  );
};

export default LeftSidebar;
