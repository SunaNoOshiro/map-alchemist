
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

function App() {
  const [hasApiKey, setHasApiKey] = useState<boolean>(false);
  const [mapsApiKey] = useState<string>(storageService.getMapsApiKey);

  const [styles, setStyles] = useState<MapStylePreset[]>([]);
  const [activeStyleId, setActiveStyleId] = useState<string | null>(null);
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
        setHasApiKey(true);
      }
    };
    checkApiKey();
  }, []);

  // Load Data (Async for IndexedDB)
  useEffect(() => {
    const loadData = async () => {
        const savedStyles = await storageService.getStyles();
        if (savedStyles && savedStyles.length > 0) {
            setStyles(savedStyles);
            setActiveStyleId(savedStyles[0].id);
            addLog("Loaded existing styles.", "info");
        } else {
            setStyles([DEFAULT_STYLE_PRESET]);
            setActiveStyleId(DEFAULT_STYLE_PRESET.id);
            addLog("Standard theme loaded.", "info");
        }
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
        setHasApiKey(true);
      } catch (e) {
        console.error("Key selection failed", e);
      }
    } else {
      setHasApiKey(true);
    }
  };

  const handleGenerateStyle = async () => {
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
    if (!activeStyleId || activeStyleId === DEFAULT_STYLE_PRESET.id) {
        addLog("Cannot modify default theme assets.", "warning");
        return;
    }
    
    // Determine the best prompt to use:
    // 1. The user's specific input from the sidebar (userPrompt)
    // 2. OR the style's consistent 'iconTheme' art direction
    // 3. OR the style's main prompt
    const style = styles.find(s => s.id === activeStyleId);
    // If the user hasn't edited the input (it matches the default prompt/theme), use the theme.
    // Otherwise respect their manual override.
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
    // Only export custom styles, excluding the default preset
    const customStyles = styles.filter(s => s.id !== DEFAULT_STYLE_PRESET.id);
    
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
                // Filter out any potential duplicates of default style from import
                const validImports = imported.filter((s: MapStylePreset) => s.id !== DEFAULT_STYLE_PRESET.id);
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
          setStyles([DEFAULT_STYLE_PRESET]);
          setActiveStyleId(DEFAULT_STYLE_PRESET.id);
          storageService.clearStyles();
          addLog("Custom styles cleared.", "warning");
      }
  };

  const handleDeleteStyle = (id: string) => {
      if (id === DEFAULT_STYLE_PRESET.id) {
          addLog("Cannot delete the default theme.", "warning");
          return;
      }
      setStyles(s => s.filter(x => x.id !== id));
      if (activeStyleId === id) {
          setActiveStyleId(DEFAULT_STYLE_PRESET.id);
      }
      addLog("Style deleted.", "info");
  };

  const onMapLoad = useCallback((map: any) => {
      // Intentionally empty
  }, []);

  if (!hasApiKey) {
    return <AuthScreen onConnect={handleSelectKey} />;
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
                apiKey={mapsApiKey}
                mapStyleJson={activeStyle ? activeStyle.mapStyleJson : DEFAULT_STYLE_PRESET.mapStyleJson}
                activeIcons={activeIcons}
                popupStyle={activeStyle ? activeStyle.popupStyle : DEFAULT_STYLE_PRESET.popupStyle}
                onMapLoad={onMapLoad}
                isDefaultTheme={activeStyleId === DEFAULT_STYLE_PRESET.id}
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
      />
    </div>
  );
}

export default App;
