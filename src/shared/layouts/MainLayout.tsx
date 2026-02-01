import React, { useEffect, useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import LeftSidebar from '@shared/components/sidebar/LeftSidebar';
import RightSidebar from '@shared/components/sidebar/RightSidebar';
import TopToolbar from '@shared/components/TopToolbar';
import MapView from '@features/map/components/MapView';
import { MapStylePreset, LogEntry, AppStatus } from '@/types';
import { normalizePopupStyle } from '@core/services/defaultThemes';
import { DEFAULT_STYLE_PRESET } from '@/constants';

interface MainLayoutProps {
    // State
    styles: MapStylePreset[];
    activeStyleId: string | null;
    status: AppStatus;
    logs: LogEntry[];
    loadingMessage: string;
    prompt: string;
    hasApiKey: boolean;
    aiConfig: any;
    availableModels: Record<string, string>;
    // Handlers
    setPrompt: (p: string) => void;
    onGenerate: () => void;
    onApplyStyle: (id: string) => void;
    onDeleteStyle: (id: string) => void;
    onExport: () => void;
    onImport: (e: React.ChangeEvent<HTMLInputElement>) => void;
    onClear: () => void;
    onConnectApi: () => void;
    onUpdateAiConfig: (config: Partial<any>) => void;
    onRegenerateIcon: (category: string, prompt: string) => void;
    onSelectStyle: (id: string) => void;
}

export const MainLayout: React.FC<MainLayoutProps> = ({
    styles,
    activeStyleId,
    status,
    logs,
    loadingMessage,
    prompt,
    hasApiKey,
    aiConfig,
    availableModels,
    setPrompt,
    onGenerate,
    onApplyStyle,
    onDeleteStyle,
    onExport,
    onImport,
    onClear,
    onConnectApi,
    onUpdateAiConfig,
    onRegenerateIcon,
    onSelectStyle
}) => {
    const [isLeftSidebarOpen, setIsLeftSidebarOpen] = useState(true);
    const [isRightSidebarOpen, setIsRightSidebarOpen] = useState(true);
    const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
    const [isMobile, setIsMobile] = useState(() => {
        if (typeof window === 'undefined') return false;
        return window.matchMedia('(max-width: 639px)').matches;
    });

    useEffect(() => {
        if (typeof window === 'undefined') return;
        const mediaQuery = window.matchMedia('(max-width: 639px)');
        const handleChange = (event: MediaQueryListEvent) => {
            setIsMobile(event.matches);
        };
        setIsMobile(mediaQuery.matches);
        mediaQuery.addEventListener('change', handleChange);
        return () => mediaQuery.removeEventListener('change', handleChange);
    }, []);

    useEffect(() => {
        if (isMobile) {
            setIsLeftSidebarOpen(false);
            setIsRightSidebarOpen(false);
        }
    }, [isMobile]);

    const activeStyle = styles.find(s => s.id === activeStyleId) || null;
    const activeIcons = activeStyle ? activeStyle.iconsByCategory : {};

    const handleEditFromPopup = (category: string) => {
        if (isMobile) setIsLeftSidebarOpen(false);
        if (!isRightSidebarOpen) setIsRightSidebarOpen(true);
        setSelectedCategory(category);
    };

    const toggleLeftSidebar = () => {
        setIsLeftSidebarOpen((prev) => {
            const next = !prev;
            if (isMobile && next) setIsRightSidebarOpen(false);
            return next;
        });
    };

    const toggleRightSidebar = () => {
        setIsRightSidebarOpen((prev) => {
            const next = !prev;
            if (isMobile && next) setIsLeftSidebarOpen(false);
            return next;
        });
    };

    return (
        <div className="flex h-full w-full bg-gray-900 text-white font-sans overflow-hidden">
            <LeftSidebar
                isOpen={isLeftSidebarOpen}
                onClose={() => setIsLeftSidebarOpen(false)}
                prompt={prompt}
                setPrompt={setPrompt}
                onGenerate={onGenerate}
                status={status}
                loadingMessage={loadingMessage}
                styles={styles}
                activeStyleId={activeStyleId}
                onApplyStyle={onApplyStyle}
                onDeleteStyle={onDeleteStyle}
                onExport={onExport}
                onImport={onImport}
                onClear={onClear}
                logs={logs}
                hasApiKey={hasApiKey}
                onConnectApi={onConnectApi}
                aiConfig={aiConfig}
                availableModels={availableModels}
                onUpdateAiConfig={onUpdateAiConfig}
            />

            <div className="flex-1 flex flex-col min-w-0 relative">
                <TopToolbar
                    styles={styles}
                    activeStyleId={activeStyleId}
                    onSelectStyle={onSelectStyle}
                    status={status}
                />
                <div className="sm:hidden px-4 py-2 border-b border-gray-800 bg-gray-900 flex items-center gap-2">
                    <button
                        type="button"
                        onClick={toggleLeftSidebar}
                        className={`flex-1 border border-gray-700 rounded-md px-3 py-2 text-xs font-semibold uppercase tracking-widest ${
                            isLeftSidebarOpen ? 'bg-blue-600 text-white border-blue-500' : 'bg-gray-800 text-gray-300'
                        }`}
                    >
                        Controls
                    </button>
                    <button
                        type="button"
                        onClick={toggleRightSidebar}
                        className={`flex-1 border border-gray-700 rounded-md px-3 py-2 text-xs font-semibold uppercase tracking-widest ${
                            isRightSidebarOpen ? 'bg-purple-600 text-white border-purple-500' : 'bg-gray-800 text-gray-300'
                        }`}
                    >
                        Icons
                    </button>
                </div>

                <main className="flex-1 relative bg-gray-200 group overflow-hidden">
                    <button
                        onClick={toggleLeftSidebar}
                        className="hidden sm:flex absolute left-0 top-1/2 -translate-y-1/2 z-30 bg-gray-800 border border-l-0 border-gray-700 text-gray-400 hover:text-white rounded-r-md p-1.5 shadow-lg opacity-50 hover:opacity-100 transition-all"
                    >
                        {isLeftSidebarOpen ? <ChevronLeft size={16} /> : <ChevronRight size={16} />}
                    </button>

                    <button
                        onClick={toggleRightSidebar}
                        className="hidden sm:flex absolute right-0 top-1/2 -translate-y-1/2 z-30 bg-gray-800 border border-r-0 border-gray-700 text-gray-400 hover:text-white rounded-l-md p-1.5 shadow-lg opacity-50 hover:opacity-100 transition-all"
                    >
                        {isRightSidebarOpen ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}
                    </button>

                    <MapView
                        apiKey={""}
                        mapStyleJson={activeStyle ? activeStyle.mapStyleJson : DEFAULT_STYLE_PRESET.mapStyleJson}
                        palette={activeStyle?.palette}
                        activeIcons={activeIcons}
                        popupStyle={normalizePopupStyle(
                            activeStyle?.popupStyle || (activeStyle as any)?.mapStyleJson?.popupStyle
                        )}
                        isDefaultTheme={activeStyleId ? DEFAULT_STYLE_PRESET.id === activeStyleId : false} // Simplified default check for layout
                        onEditIcon={handleEditFromPopup}
                        isThemeSelected={!!activeStyleId}
                        activeThemeName={activeStyle?.name}
                    />
                </main>
            </div>

            <RightSidebar
                isOpen={isRightSidebarOpen}
                onClose={() => setIsRightSidebarOpen(false)}
                activeIcons={activeIcons}
                selectedCategory={selectedCategory}
                onSelectCategory={setSelectedCategory}
                onRegenerateIcon={(cat, prompt) => onRegenerateIcon(cat, prompt)} // Wrapper to match signature if needed
                status={status}
                hasApiKey={hasApiKey}
            />
        </div>
    );
};
