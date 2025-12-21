import React, { useState } from 'react';
import { AppStatus, MapStylePreset, LogEntry } from '@/types';
import { AiFactory } from '../services/AiFactory';
import { MAP_CATEGORIES } from '@/constants';
import { createLogger } from '@core/logger';

const logger = createLogger('MapGenerationHook');

interface UseMapGenerationProps {
    addLog: (msg: string, type?: LogEntry['type']) => void;
    setStyles: React.Dispatch<React.SetStateAction<MapStylePreset[]>>;
    setActiveStyleId: (id: string) => void;
    styles: MapStylePreset[];
    activeStyleId: string | null;
}

export const useMapGeneration = ({
    addLog,
    setStyles,
    setActiveStyleId,
    styles,
    activeStyleId
}: UseMapGenerationProps) => {
    const [status, setStatus] = useState<AppStatus>(AppStatus.IDLE);
    const [loadingMessage, setLoadingMessage] = useState<string>('');

    const handleGenerateStyle = async (prompt: string, hasApiKey: boolean, onConnectApi: () => void) => {
        if (!hasApiKey) {
            addLog("API Key required to generate styles.", "warning");
            onConnectApi();
            return;
        }

        if (!prompt.trim()) return;
        setStatus(AppStatus.GENERATING_STYLE);
        setLoadingMessage("Initializing...");
        addLog(`Starting generation for: "${prompt}"`, 'info');

        try {
            const aiService = AiFactory.getService();
            const newPreset = await aiService.generateMapTheme(
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

    const handleRegenerateIcon = async (category: string, userPrompt: string, hasApiKey: boolean) => {
        if (!hasApiKey) return;

        if (!activeStyleId) {
            addLog("No active style selected.", "warning");
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
            const aiService = AiFactory.getService();
            const imageUrl = await aiService.generateIconImage(category, effectivePrompt, '1K');

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

    return { status, loadingMessage, handleGenerateStyle, handleRegenerateIcon };
};
