import React, { useState } from 'react';
import { v4 as uuidv4 } from 'uuid';
import AuthScreen from './components/auth/AuthScreen';
import { MainLayout } from './layouts/MainLayout';
import { LogEntry } from './types';

// Hooks
import { useStyleManager } from './features/styles/hooks/useStyleManager';
import { useAppAuth } from './features/auth/hooks/useAppAuth';
import { useMapGeneration } from './features/ai/hooks/useMapGeneration';

function App() {
  // Shared State (Logs)
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const addLog = (message: string, type: LogEntry['type'] = 'info') => {
    setLogs(prev => [...prev, {
      id: uuidv4(),
      timestamp: new Date().toISOString(),
      message,
      type
    }]);
  };

  // State & Logic Hooks
  const { hasApiKey, isGuestMode, setIsGuestMode, handleSelectKey } = useAppAuth(addLog);

  const {
    styles, setStyles, activeStyleId, setActiveStyleId,
    handleExport, handleImport, handleClear, handleDeleteStyle
  } = useStyleManager(addLog);

  const {
    status, loadingMessage, handleGenerateStyle, handleRegenerateIcon
  } = useMapGeneration({
    addLog, setStyles, setActiveStyleId, styles, activeStyleId
  });

  // Local UI State
  const [prompt, setPrompt] = useState('');

  // 1. Auth Guard
  if (!hasApiKey && !isGuestMode) {
    return <AuthScreen onConnect={handleSelectKey} onGuestAccess={() => setIsGuestMode(true)} />;
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
      hasApiKey={hasApiKey}
      // Handlers
      setPrompt={setPrompt}
      onGenerate={() => handleGenerateStyle(prompt, hasApiKey, handleSelectKey)}
      onApplyStyle={setActiveStyleId}
      onDeleteStyle={handleDeleteStyle}
      onExport={handleExport}
      onImport={handleImport}
      onClear={handleClear}
      onConnectApi={handleSelectKey}
      onRegenerateIcon={(cat, p) => handleRegenerateIcon(cat, p, hasApiKey)}
      onSelectStyle={setActiveStyleId}
    />
  );
}

export default App;
