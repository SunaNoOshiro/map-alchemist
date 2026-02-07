import React, { useState, useCallback } from 'react';
import { v4 as uuidv4 } from 'uuid';
import AuthScreen from '@features/auth/components/AuthScreen';
import { MainLayout } from '@shared/layouts/MainLayout';
import { LogEntry } from '@/types';

// Hooks
import { useStyleManager } from '@features/styles/hooks/useStyleManager';
import { useAppAuth } from '@features/auth/hooks/useAppAuth';
import { useMapGeneration } from '@features/ai/hooks/useMapGeneration';

function App() {
  // Shared State (Logs)
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const addLog = useCallback((message: string, type: LogEntry['type'] = 'info') => {
    setLogs(prev => [...prev, {
      id: uuidv4(),
      timestamp: new Date().toISOString(),
      message,
      type
    }]);
  }, []);

  // State & Logic Hooks
  const {
    hasApiKey, isGuestMode, setIsGuestMode, handleSelectKey,
    aiConfig, availableModels, updateAiConfig, validateApiKey
  } = useAppAuth(addLog);

  const {
    styles, setStyles, activeStyleId, setActiveStyleId,
    maputnikPublishInfo, clearMaputnikPublishInfo,
    maputnikDemoPoisEnabled, setMaputnikDemoPoisEnabled,
    handleExport,
    handleImport,
    handleClear,
    handleDeleteStyle,
    handleExportPackage,
    handleExportMaputnik,
    handlePublishMaputnik,
    handleClearGitHubToken
  } = useStyleManager(addLog);

  const {
    status, loadingMessage, handleGenerateStyle, handleRegenerateIcon
  } = useMapGeneration({
    addLog, setStyles, setActiveStyleId, styles, activeStyleId, aiConfig
  });

  // Local UI State
  const [prompt, setPrompt] = useState('');

  // 1. Auth Guard
  if (!hasApiKey && !isGuestMode && !aiConfig.apiKey) {
    return (
      <AuthScreen
        onConnect={handleSelectKey}
        onGuestAccess={() => setIsGuestMode(true)}
        aiConfig={aiConfig}
        availableModels={availableModels}
        onUpdateAiConfig={updateAiConfig}
      />
    );
  }

  // 2. Main Application
  return (
    <MainLayout
      // State
      styles={styles}
      activeStyleId={activeStyleId}
      status={status}
      logs={logs}
      loadingMessage={loadingMessage}
      prompt={prompt}
      hasApiKey={hasApiKey || !!aiConfig.apiKey}
      aiConfig={aiConfig}
      availableModels={availableModels}
      maputnikPublishInfo={maputnikPublishInfo}
      onCloseMaputnikPublishInfo={clearMaputnikPublishInfo}
      maputnikDemoPoisEnabled={maputnikDemoPoisEnabled}
      onToggleMaputnikDemoPois={setMaputnikDemoPoisEnabled}
      // Handlers
      setPrompt={setPrompt}
      onGenerate={() => handleGenerateStyle(prompt, hasApiKey || !!aiConfig.apiKey, handleSelectKey)}
      onApplyStyle={setActiveStyleId}
      onDeleteStyle={handleDeleteStyle}
      onExport={handleExport}
      onExportPackage={handleExportPackage}
      onExportMaputnik={handleExportMaputnik}
      onPublishMaputnik={handlePublishMaputnik}
      onClearGitHubToken={handleClearGitHubToken}
      onImport={handleImport}
      onClear={handleClear}
      onConnectApi={handleSelectKey}
      onUpdateAiConfig={updateAiConfig}
      onRegenerateIcon={(cat, p) => handleRegenerateIcon(cat, p, hasApiKey || !!aiConfig.apiKey)}
      onSelectStyle={setActiveStyleId}
    />
  );
}

export default App;
