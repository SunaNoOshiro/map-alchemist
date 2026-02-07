import React, { useEffect, useState, useCallback } from 'react';
import LeftSidebar from '@shared/components/sidebar/LeftSidebar';
import RightSidebar from '@shared/components/sidebar/RightSidebar';
import TopToolbar from '@shared/components/TopToolbar';
import MapView from '@features/map/components/MapView';
import MaputnikPublishModal from '@shared/components/MaputnikPublishModal';
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
    maputnikPublishInfo: { styleUrl: string; spriteBaseUrl: string } | null;
    maputnikDemoPoisEnabled: boolean;
    // Handlers
    setPrompt: (p: string) => void;
    onGenerate: () => void;
    onApplyStyle: (id: string) => void;
    onDeleteStyle: (id: string) => void;
    onExport: () => void;
    onExportPackage: () => void;
    onExportMaputnik: () => void;
    onPublishMaputnik: () => void;
    onClearGitHubToken: () => void;
    onImport: (e: React.ChangeEvent<HTMLInputElement>) => void;
    onClear: () => void;
    onConnectApi: () => void;
    onUpdateAiConfig: (config: Partial<any>) => void;
    onRegenerateIcon: (category: string, prompt: string) => void;
    onSelectStyle: (id: string) => void;
    onCloseMaputnikPublishInfo: () => void;
    onToggleMaputnikDemoPois: (enabled: boolean) => void;
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
    maputnikPublishInfo,
    maputnikDemoPoisEnabled,
    setPrompt,
    onGenerate,
    onApplyStyle,
    onDeleteStyle,
    onExport,
    onExportPackage,
    onExportMaputnik,
    onPublishMaputnik,
    onClearGitHubToken,
    onImport,
    onClear,
    onConnectApi,
    onUpdateAiConfig,
    onRegenerateIcon,
    onSelectStyle,
    onCloseMaputnikPublishInfo,
    onToggleMaputnikDemoPois
}) => {
    const [isLeftSidebarOpen, setIsLeftSidebarOpen] = useState(() => {
        if (typeof window === 'undefined') return true;
        return !window.matchMedia('(max-width: 639px)').matches;
    });
    const [isRightSidebarOpen, setIsRightSidebarOpen] = useState(() => {
        if (typeof window === 'undefined') return true;
        return !window.matchMedia('(max-width: 639px)').matches;
    });
    const [isMobile, setIsMobile] = useState(() => {
        if (typeof window === 'undefined') return false;
        return window.matchMedia('(max-width: 639px)').matches;
    });
    const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
    const [remixFocusCategory, setRemixFocusCategory] = useState<string | null>(null);

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

    const handleEditFromPopup = useCallback((category: string) => {
        if (isMobile) setIsLeftSidebarOpen(false);
        if (!isRightSidebarOpen) setIsRightSidebarOpen(true);
        setRemixFocusCategory(category);
        setSelectedCategory(category);
    }, [isMobile, isRightSidebarOpen]);

    useEffect(() => {
        if (!import.meta.env.DEV) return;
        (window as any).__mapAlchemistSetRemixFocus = (category: string) => {
            handleEditFromPopup(category);
        };
        (window as any).__mapAlchemistClearRemixFocus = () => {
            setRemixFocusCategory(null);
        };
        return () => {
            delete (window as any).__mapAlchemistSetRemixFocus;
            delete (window as any).__mapAlchemistClearRemixFocus;
        };
    }, [handleEditFromPopup]);

    const handleSelectCategory = (category: string | null) => {
        setRemixFocusCategory(null);
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
        <div className="flex h-full w-full bg-gray-900 text-white font-sans overflow-hidden relative">
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
                onExportPackage={onExportPackage}
                onExportMaputnik={onExportMaputnik}
                onPublishMaputnik={onPublishMaputnik}
                onClearGitHubToken={onClearGitHubToken}
                maputnikDemoPoisEnabled={maputnikDemoPoisEnabled}
                onToggleMaputnikDemoPois={onToggleMaputnikDemoPois}
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
                    isLeftSidebarOpen={isLeftSidebarOpen}
                    isRightSidebarOpen={isRightSidebarOpen}
                    onToggleLeftSidebar={toggleLeftSidebar}
                    onToggleRightSidebar={toggleRightSidebar}
                />

                <main className="flex-1 relative bg-gray-200 group overflow-hidden">
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
                remixFocusCategory={remixFocusCategory}
                onClearRemixFocus={() => setRemixFocusCategory(null)}
                onSelectCategory={handleSelectCategory}
                onRegenerateIcon={(cat, prompt) => onRegenerateIcon(cat, prompt)} // Wrapper to match signature if needed
                status={status}
                hasApiKey={hasApiKey}
            />

            <MaputnikPublishModal
                info={maputnikPublishInfo}
                onClose={onCloseMaputnikPublishInfo}
            />
        </div>
    );
};
