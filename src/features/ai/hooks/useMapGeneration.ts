import React, { useState } from 'react';
import { AppStatus, MapStylePreset, LogEntry, AiConfig } from '@/types';
import { AiFactory } from '../services/AiFactory';
import { getStyleSeedPoiCategories } from '@features/map/services/poiIconResolver';
import { createLogger } from '@core/logger';

const logger = createLogger('MapGenerationHook');

interface UseMapGenerationProps {
    addLog: (msg: string, type?: LogEntry['type']) => void;
    setStyles: React.Dispatch<React.SetStateAction<MapStylePreset[]>>;
    setActiveStyleId: (id: string) => void;
    styles: MapStylePreset[];
    activeStyleId: string | null;
    aiConfig: AiConfig;
}

export const useMapGeneration = ({
    addLog,
    setStyles,
    setActiveStyleId,
    styles,
    activeStyleId,
    aiConfig
}: UseMapGenerationProps) => {
    const [status, setStatus] = useState<AppStatus>(AppStatus.IDLE);
    const [loadingMessage, setLoadingMessage] = useState<string>('');
    const invalidKeyPattern = /invalid gemini api key|invalid openai api key|invalid api key|api key not valid|api_key_invalid|incorrect api key/i;

    const handleGenerateStyle = async (prompt: string, hasApiKey: boolean, onConnectApi: () => void) => {
        if (!hasApiKey && !aiConfig.apiKey) {
            addLog("API Key required to generate styles.", "warning");
            onConnectApi();
            return;
        }

        if (!prompt.trim()) return;
        setStatus(AppStatus.GENERATING_STYLE);
        setLoadingMessage("Initializing...");
        addLog(`Starting generation for: "${prompt}"`, 'info');

        try {
            const aiService = AiFactory.getService(aiConfig);
            const newPreset = await aiService.generateMapTheme(
                prompt,
                getStyleSeedPoiCategories(),
                (msg) => {
                    setLoadingMessage(msg);
                    addLog(msg, "info");
                }
            );

            setStyles(prev => [newPreset, ...prev]);
            setActiveStyleId(newPreset.id);
            addLog("Theme generation complete!", "success");
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            if (invalidKeyPattern.test(errorMessage)) {
                addLog("Invalid API key. Reconnect a valid key in AI Configuration.", "error");
                onConnectApi();
            } else {
                addLog(`Failed to build theme: ${errorMessage}`, "error");
            }
        } finally {
            setStatus(AppStatus.IDLE);
            setLoadingMessage("");
        }
    };

    const handleRegenerateIcon = async (category: string, userPrompt: string, hasApiKey: boolean) => {
        if (!hasApiKey && !aiConfig.apiKey) return;

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
            const aiService = AiFactory.getService(aiConfig);
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
            const errorMessage = error instanceof Error ? error.message : String(error);
            if (invalidKeyPattern.test(errorMessage)) {
                addLog("Invalid API key. Reconnect a valid key in AI Configuration.", "error");
            } else {
                addLog(`Failed to generate icon: ${errorMessage}`, "error");
            }
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
