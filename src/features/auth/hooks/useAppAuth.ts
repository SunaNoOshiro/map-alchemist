import { useState, useEffect } from 'react';
import { LogEntry, AiConfig, AiProvider } from '@/types';
import { DEFAULT_AI_CONFIG, getAvailableModels } from '@/constants/aiConstants';
import { createLogger } from '@core/logger';

const logger = createLogger('AuthHook');
const AI_CONFIG_STORAGE_KEY = 'mapAlchemistAiConfig';

export const useAppAuth = (addLog: (msg: string, type?: LogEntry['type']) => void) => {
    const [hasApiKey, setHasApiKey] = useState<boolean>(false);
    const [isGuestMode, setIsGuestMode] = useState<boolean>(false);
    const [aiConfig, setAiConfig] = useState<AiConfig>(DEFAULT_AI_CONFIG);
    const [availableModels, setAvailableModels] = useState<Record<string, string>>({});

    // Load AI config from storage on init
    useEffect(() => {
        const loadConfig = () => {
            try {
                const savedConfig = localStorage.getItem(AI_CONFIG_STORAGE_KEY);
                if (savedConfig) {
                    const parsed = JSON.parse(savedConfig);
                    setAiConfig(prev => ({
                        ...prev,
                        ...parsed,
                        // Ensure we have valid defaults
                        provider: parsed.provider || DEFAULT_AI_CONFIG.provider,
                        model: parsed.model || DEFAULT_AI_CONFIG.model,
                        apiKey: parsed.apiKey || '',
                        isCustomKey: parsed.isCustomKey || false
                    }));
                }
            } catch (e) {
                logger.error("Failed to load AI config", e);
            }
        };

        const checkApiKey = async () => {
            if ((window as any).aistudio) {
                const has = await (window as any).aistudio.hasSelectedApiKey();
                setHasApiKey(has);
            } else {
                setHasApiKey(false);
            }
        };

        loadConfig();
        checkApiKey();
    }, []);

    // Update available models when provider changes
    useEffect(() => {
        setAvailableModels(getAvailableModels(aiConfig.provider));
    }, [aiConfig.provider]);

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
                logger.error("Key selection failed", e);
                addLog("Failed to connect API Key.", "error");
            }
        } else {
            setHasApiKey(true);
        }
    };

    const updateAiConfig = (newConfig: Partial<AiConfig>) => {
        const updatedConfig = { ...aiConfig, ...newConfig };

        // If API key is provided and different from default, mark as custom
        if (newConfig.apiKey && newConfig.apiKey !== DEFAULT_AI_CONFIG.apiKey) {
            updatedConfig.isCustomKey = true;
        }

        setAiConfig(updatedConfig);

        // Save to localStorage
        try {
            localStorage.setItem(AI_CONFIG_STORAGE_KEY, JSON.stringify(updatedConfig));
        } catch (e) {
            logger.error("Failed to save AI config", e);
        }
    };

    const validateApiKey = (): boolean => {
        if (!aiConfig.apiKey && !hasApiKey) {
            return false;
        }
        return true;
    };

    return {
        hasApiKey,
        isGuestMode,
        setIsGuestMode,
        handleSelectKey,
        aiConfig,
        availableModels,
        updateAiConfig,
        validateApiKey
    };
};
