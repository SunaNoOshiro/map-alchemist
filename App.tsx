
import React, { useState, useEffect, useCallback } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { ChevronLeft, ChevronRight } from 'lucide-react';

import LeftSidebar from './components/sidebar/LeftSidebar';
import RightSidebar from './components/sidebar/RightSidebar';
import TopToolbar from './components/TopToolbar';
import MapView from './components/MapView';
import AuthScreen from './components/auth/AuthScreen';

import { MapStylePreset, LogEntry, AppStatus } from './types';
import { MAP_CATEGORIES, DEFAULT_STYLE_PRESET } from './constants';
import * as geminiService from './services/geminiService';
import { storageService } from './services/storage';
import { fetchDefaultThemes } from './services/defaultThemes';

function App() {
  const [hasApiKey, setHasApiKey] = useState<boolean>(false);
  const [isGuestMode, setIsGuestMode] = useState<boolean>(false);

  const [styles, setStyles] = useState<MapStylePreset[]>([]);
  const [activeStyleId, setActiveStyleId] = useState<string | null>(null);
  const [defaultThemes, setDefaultThemes] = useState<MapStylePreset[]>([DEFAULT_STYLE_PRESET]);
  const [defaultThemeIds, setDefaultThemeIds] = useState<string[]>([DEFAULT_STYLE_PRESET.id]);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  
  const [prompt, setPrompt] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [status, setStatus] = useState<AppStatus>(AppStatus.IDLE);
  const [loadingMessage, setLoadingMessage] = useState<string>('');
  
  const [isLeftSidebarOpen, setIsLeftSidebarOpen] = useState(true);
  const [isRightSidebarOpen, setIsRightSidebarOpen] = useState(true);
  
  const activeStyle = styles.find(s => s.id === activeStyleId) || null;
  const activeIcons = activeStyle ? activeStyle.iconsByCategory : {};

  // Check API Key
  useEffect(() => {
    const checkApiKey = async () => {
      if ((window as any).aistudio) {
        const has = await (window as any).aistudio.hasSelectedApiKey();
        setHasApiKey(has);
      } else {
        // Fallback for dev environments without the studio bridge
        setHasApiKey(true);
      }
    };
    checkApiKey();
  }, []);

  // Load Data
  useEffect(() => {
    const loadData = async () => {
        const savedStyles = await storageService.getStyles();
        if (savedStyles && savedStyles.length > 0) {
            setStyles(savedStyles);
            setActiveStyleId(savedStyles[0].id);

            const bundled = savedStyles.filter(s => s.isBundledDefault);
            if (bundled.length > 0) {
              setDefaultThemes(bundled);
              setDefaultThemeIds(bundled.map(s => s.id));
            }

            addLog("Loaded existing styles.", "info");
            return;
        }

        const { themes, defaultIds } = await fetchDefaultThemes();
        if (themes.length > 0) {
            setStyles(themes);
            setActiveStyleId(themes[0].id);
            setDefaultThemes(themes);
            setDefaultThemeIds(defaultIds);
            addLog("Bundled default themes loaded.", "info");
            return;
        }

        setStyles([DEFAULT_STYLE_PRESET]);
        setActiveStyleId(DEFAULT_STYLE_PRESET.id);
        setDefaultThemes([DEFAULT_STYLE_PRESET]);
        setDefaultThemeIds([DEFAULT_STYLE_PRESET.id]);
        addLog("Standard theme loaded.", "info");
    };
    loadData();
  }, []);

  // Save Data
  useEffect(() => {
    if (styles.length > 0) {
       storageService.saveStyles(styles);
    }
  }, [styles]);

  const addLog = (message: string, type: LogEntry['type'] = 'info') => {
    setLogs(prev => [...prev, {
      id: uuidv4(),
      timestamp: new Date().toISOString(),
      message,
      type
    }]);
  };

  const handleSelectKey = async () => {
    if ((window as any).aistudio) {
      try {
        await (window as any).aistudio.openSelectKey();
        const has = await (window as any).aistudio.hasSelectedApiKey();
        if (has) {
            setHasApiKey(true);
            setIsGuestMode(false);
            addLog("API Key connected successfully.", "success");
        }
      } catch (e) {
        console.error("Key selection failed", e);
        addLog("Failed to connect API Key.", "error");
      }
    } else {
      setHasApiKey(true);
    }
  };

  const handleGenerateStyle = async () => {
    if (!hasApiKey) {
        addLog("API Key required to generate styles.", "warning");
        handleSelectKey();
        return;
    }

    if (!prompt.trim()) return;
    setStatus(AppStatus.GENERATING_STYLE);
    setLoadingMessage("Initializing...");
    addLog(`Starting generation for: "${prompt}"`, 'info');

    try {
      const newPreset = await geminiService.generateMapTheme(
          prompt, 
          MAP_CATEGORIES,
          (msg) => {
              setLoadingMessage(msg);
              addLog(msg, "info");
          }
      );

      setStyles(prev => [newPreset, ...prev]);
      setActiveStyleId(newPreset.id);
      addLog("Theme generation complete!", "success");
    } catch (error) {
      addLog(`Failed to build theme: ${error}`, "error");
    } finally {
      setStatus(AppStatus.IDLE);
      setLoadingMessage("");
    }
  };

  const handleRegenerateIcon = async (category: string, userPrompt: string) => {
    if (!hasApiKey) return;

    if (!activeStyleId || defaultThemeIds.includes(activeStyleId)) {
        addLog("Cannot modify default theme assets.", "warning");
        return;
    }
    
    const style = styles.find(s => s.id === activeStyleId);
    const effectivePrompt = userPrompt || style?.iconTheme || style?.prompt || `Icon for ${category}`;

    setStatus(AppStatus.GENERATING_ICON);
    
    setStyles(prev => prev.map(s => {
        if (s.id === activeStyleId) {
            return {
                ...s,
                iconsByCategory: {
                    ...s.iconsByCategory,
                    [category]: { ...s.iconsByCategory[category], isLoading: true }
                }
            };
        }
        return s;
    }));
    
    addLog(`Regenerating ${category} icon...`, "info");

    try {
      const imageUrl = await geminiService.generateIconImage(category, effectivePrompt, '1K');
      
      setStyles(prev => prev.map(s => {
        if (s.id === activeStyleId) {
            return {
                ...s,
                iconsByCategory: {
                    ...s.iconsByCategory,
                    [category]: { 
                        category, 
                        prompt: effectivePrompt, 
                        imageUrl, 
                        isLoading: false 
                    }
                }
            };
        }
        return s;
    }));
      addLog(`Icon for ${category} updated.`, "success");

    } catch (error) {
      addLog(`Failed to generate icon: ${error}`, "error");
       setStyles(prev => prev.map(s => {
        if (s.id === activeStyleId) {
            return {
                ...s,
                iconsByCategory: {
                    ...s.iconsByCategory,
                    [category]: { ...s.iconsByCategory[category], isLoading: false }
                }
            };
        }
        return s;
    }));
    } finally {
      setStatus(AppStatus.IDLE);
    }
  };

  const handleEditFromPopup = (category: string) => {
      if (!isRightSidebarOpen) {
          setIsRightSidebarOpen(true);
      }
      setSelectedCategory(category);
  };

  const handleExport = () => {
    const customStyles = styles.filter(s => !defaultThemeIds.includes(s.id));
    if (customStyles.length === 0) {
      addLog("No custom styles to export.", "warning");
      return;
    }
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(customStyles));
    const node = document.createElement('a');
    node.setAttribute("href", dataStr);
    node.setAttribute("download", "map-styles.json");
    document.body.appendChild(node);
    node.click();
    node.remove();
    addLog(`Exported ${customStyles.length} custom styles.`, "info");
  };

  const handleImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (evt) => {
        try {
            const imported = JSON.parse(evt.target?.result as string);
            if (Array.isArray(imported)) {
                const validImports = imported.filter((s: MapStylePreset) => !defaultThemeIds.includes(s.id));
                setStyles(prev => [...prev, ...validImports]);
                addLog(`Imported ${validImports.length} styles.`, "success");
            }
        } catch (err) {
            addLog("Failed to parse JSON.", "error");
        }
    };
    reader.readAsText(file);
  };

  const handleClear = () => {
      if (confirm("Delete all custom styles? This will preserve the Default Standard theme.")) {
          const baseDefaults = defaultThemes.length > 0 ? defaultThemes : [DEFAULT_STYLE_PRESET];
          setStyles(baseDefaults);
          setActiveStyleId(baseDefaults[0].id);
          storageService.clearStyles();
          addLog("Custom styles cleared.", "warning");
      }
  };

  const handleDeleteStyle = (id: string) => {
      if (defaultThemeIds.includes(id)) {
          addLog("Cannot delete bundled default themes.", "warning");
          return;
      }
      setStyles(s => s.filter(x => x.id !== id));
      if (activeStyleId === id) {
          const fallback = defaultThemes[0] || DEFAULT_STYLE_PRESET;
          setActiveStyleId(fallback.id);
      }
      addLog("Style deleted.", "info");
  };

  const onMapLoad = useCallback((map: any) => {
      // Empty
  }, []);

  if (!hasApiKey && !isGuestMode) {
    return <AuthScreen onConnect={handleSelectKey} onGuestAccess={() => setIsGuestMode(true)} />;
  }

  return (
    <div className="flex h-full w-full bg-gray-900 text-white font-sans overflow-hidden">
      
      <LeftSidebar 
        isOpen={isLeftSidebarOpen}
        prompt={prompt}
        setPrompt={setPrompt}
        onGenerate={handleGenerateStyle}
        status={status}
        loadingMessage={loadingMessage}
        styles={styles}
        activeStyleId={activeStyleId}
        onApplyStyle={setActiveStyleId}
        onDeleteStyle={handleDeleteStyle}
        onExport={handleExport}
        onImport={handleImport}
        onClear={handleClear}
        logs={logs}
        hasApiKey={hasApiKey}
        onConnectApi={handleSelectKey}
      />
      
      <div className="flex-1 flex flex-col min-w-0 relative">
        <TopToolbar 
            styles={styles}
            activeStyleId={activeStyleId}
            onSelectStyle={setActiveStyleId}
            status={status}
        />
        
        <main className="flex-1 relative bg-gray-200 group overflow-hidden">
            <button 
              onClick={() => setIsLeftSidebarOpen(!isLeftSidebarOpen)}
              className="absolute left-0 top-1/2 -translate-y-1/2 z-30 bg-gray-800 border border-l-0 border-gray-700 text-gray-400 hover:text-white rounded-r-md p-1.5 shadow-lg opacity-50 hover:opacity-100 transition-all"
            >
              {isLeftSidebarOpen ? <ChevronLeft size={16} /> : <ChevronRight size={16} />}
            </button>

            <button 
              onClick={() => setIsRightSidebarOpen(!isRightSidebarOpen)}
              className="absolute right-0 top-1/2 -translate-y-1/2 z-30 bg-gray-800 border border-r-0 border-gray-700 text-gray-400 hover:text-white rounded-l-md p-1.5 shadow-lg opacity-50 hover:opacity-100 transition-all"
            >
              {isRightSidebarOpen ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}
            </button>

            <MapView
                apiKey={""}
                mapStyleJson={activeStyle ? activeStyle.mapStyleJson : DEFAULT_STYLE_PRESET.mapStyleJson}
                activeIcons={activeIcons}
                popupStyle={activeStyle ? activeStyle.popupStyle : DEFAULT_STYLE_PRESET.popupStyle}
                onMapLoad={onMapLoad}
                isDefaultTheme={activeStyleId ? defaultThemeIds.includes(activeStyleId) : false}
                onEditIcon={handleEditFromPopup}
            />
        </main>
      </div>

      <RightSidebar 
         isOpen={isRightSidebarOpen}
         activeIcons={activeIcons}
         selectedCategory={selectedCategory}
         onSelectCategory={setSelectedCategory}
         onRegenerateIcon={handleRegenerateIcon}
         status={status}
         hasApiKey={hasApiKey}
      />
    </div>
  );
}

export default App;
