import React, { useState, useCallback } from 'react';
import { v4 as uuidv4 } from 'uuid';
import AuthScreen from '@features/auth/components/AuthScreen';
import { MainLayout } from '@shared/layouts/MainLayout';
import { LogEntry } from '@/types';

// Hooks
import { useStyleManager } from '@features/styles/hooks/useStyleManager';
import { useAppAuth } from '@features/auth/hooks/useAppAuth';
import { useMapGeneration } from '@features/ai/hooks/useMapGeneration';

const AppBootstrapShell = () => (
  <div className="h-screen w-screen overflow-hidden bg-gray-950 text-white" data-testid="app-bootstrap-shell" aria-hidden="true">
    <div className="h-16 border-b border-gray-800 bg-gray-900/95" />
    <div className="flex h-[calc(100vh-4rem)]">
      <div className="hidden w-80 border-r border-gray-800 bg-gray-900/90 sm:block" />
      <div className="flex-1 bg-[radial-gradient(circle_at_top,_rgba(59,130,246,0.12),_transparent_40%),linear-gradient(180deg,_#0f172a_0%,_#111827_100%)]" />
      <div className="hidden w-72 border-l border-gray-800 bg-gray-900/90 lg:block" />
    </div>
  </div>
);

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
    isAuthReady, hasApiKey, isGuestMode, setIsGuestMode, handleSelectKey,
    aiConfig, availableTextModels, availableImageModels, updateAiConfig, validateApiKey
  } = useAppAuth(addLog);

  const {
    styles, setStyles, activeStyleId, setActiveStyleId, isStylesReady,
    maputnikPublishStage, maputnikPublishInfo, maputnikPublishError,
    maputnikDemoPoisEnabled, setMaputnikDemoPoisEnabled,
    handleExport,
    handleImport,
    handleClear,
    handleDeleteStyle,
    handleExportPackage,
    handleExportMaputnik,
    handleOpenPublishMaputnik,
    handleConfirmPublishMaputnik,
    handleClosePublishMaputnik,
    handleClearGitHubToken
  } = useStyleManager(addLog);

  const {
    status, loadingMessage, handleGenerateStyle, handleRegenerateIcon
  } = useMapGeneration({
    addLog, setStyles, setActiveStyleId, styles, activeStyleId, aiConfig
  });

  // Local UI State
  const [prompt, setPrompt] = useState('');

  if (!isAuthReady) {
    return <AppBootstrapShell />;
  }

  // 1. Auth Guard
  if (!hasApiKey && !isGuestMode && !aiConfig.apiKey) {
    return (
      <AuthScreen
        onConnect={handleSelectKey}
        onGuestAccess={() => setIsGuestMode(true)}
        aiConfig={aiConfig}
        availableTextModels={availableTextModels}
        availableImageModels={availableImageModels}
        onUpdateAiConfig={updateAiConfig}
      />
    );
  }

  if (!isStylesReady) {
    return <AppBootstrapShell />;
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
      availableTextModels={availableTextModels}
      availableImageModels={availableImageModels}
      maputnikPublishStage={maputnikPublishStage}
      maputnikPublishInfo={maputnikPublishInfo}
      maputnikPublishError={maputnikPublishError}
      onConfirmMaputnikPublish={handleConfirmPublishMaputnik}
      onCloseMaputnikPublish={handleClosePublishMaputnik}
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
      onPublishMaputnik={handleOpenPublishMaputnik}
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
