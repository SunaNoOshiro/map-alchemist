import { useState, useEffect } from 'react';
import { LogEntry, AiConfig } from '@/types';
import {
    DEFAULT_AI_CONFIG,
    getAvailableImageModels,
    getAvailableTextModels,
    sanitizeAiConfig
} from '@/constants/aiConstants';
import { createLogger } from '@core/logger';

const logger = createLogger('AuthHook');
const AI_CONFIG_STORAGE_KEY = 'mapAlchemistAiConfig';
const GUEST_MODE_STORAGE_KEY = 'mapAlchemistGuestMode';
const hasUsableApiKey = (value: string | undefined | null): boolean => Boolean(value?.trim());

export const useAppAuth = (addLog: (msg: string, type?: LogEntry['type']) => void) => {
    const [hasApiKey, setHasApiKey] = useState<boolean>(false);
    const [isGuestMode, setIsGuestMode] = useState<boolean>(false);
    const [isAuthReady, setIsAuthReady] = useState<boolean>(false);
    const [aiConfig, setAiConfig] = useState<AiConfig>(DEFAULT_AI_CONFIG);
    const [availableTextModels, setAvailableTextModels] = useState<Record<string, string>>({});
    const [availableImageModels, setAvailableImageModels] = useState<Record<string, string>>({});

    // Load AI config from storage on init
    useEffect(() => {
        let cancelled = false;

        const loadConfig = () => {
            try {
                const savedConfig = localStorage.getItem(AI_CONFIG_STORAGE_KEY);
                if (savedConfig) {
                    const parsed = JSON.parse(savedConfig);
                    if (!cancelled) {
                        const sanitizedConfig = sanitizeAiConfig(parsed);
                        setAiConfig(sanitizedConfig);
                        setHasApiKey(hasUsableApiKey(sanitizedConfig.apiKey));
                    }
                }
            } catch (e) {
                logger.error("Failed to load AI config", e);
            }

            try {
                if (!cancelled) {
                    setIsGuestMode(localStorage.getItem(GUEST_MODE_STORAGE_KEY) === 'true');
                }
            } catch (e) {
                logger.error("Failed to load guest mode", e);
            }
        };

        loadConfig();
        if (!cancelled) {
            setIsAuthReady(true);
        }

        return () => {
            cancelled = true;
        };
    }, []);

    // Update available models when provider changes
    useEffect(() => {
        const textModels = getAvailableTextModels(aiConfig.provider);
        const imageModels = getAvailableImageModels(aiConfig.provider);
        setAvailableTextModels(textModels);
        setAvailableImageModels(imageModels);
    }, [aiConfig.provider]);

    const persistGuestMode = (value: boolean) => {
        setIsGuestMode(value);
        try {
            if (value) {
                localStorage.setItem(GUEST_MODE_STORAGE_KEY, 'true');
            } else {
                localStorage.removeItem(GUEST_MODE_STORAGE_KEY);
            }
        } catch (e) {
            logger.error("Failed to persist guest mode", e);
        }
    };

    const handleSelectKey = (apiKeyOverride?: string) => {
        const nextApiKey = typeof apiKeyOverride === 'string' ? apiKeyOverride.trim() : aiConfig.apiKey.trim();
        if (hasUsableApiKey(nextApiKey)) {
            setHasApiKey(true);
            persistGuestMode(false);
            addLog("API key connected successfully.", "success");
            return;
        }

        setHasApiKey(false);
        addLog("Enter an API key in AI Configuration before continuing.", "warning");
    };

    const updateAiConfig = (newConfig: Partial<AiConfig>) => {
        const mergedConfig: AiConfig = {
            ...aiConfig,
            ...newConfig,
        };

        // If API key is provided and different from default, mark as custom
        if (newConfig.apiKey && newConfig.apiKey !== DEFAULT_AI_CONFIG.apiKey) {
            mergedConfig.isCustomKey = true;
        }

        const updatedConfig = sanitizeAiConfig(mergedConfig);
        setAiConfig(updatedConfig);
        setHasApiKey(hasUsableApiKey(updatedConfig.apiKey));

        // Save to localStorage
        try {
            localStorage.setItem(AI_CONFIG_STORAGE_KEY, JSON.stringify(updatedConfig));
        } catch (e) {
            logger.error("Failed to save AI config", e);
        }
    };

    return {
        isAuthReady,
        hasApiKey,
        isGuestMode,
        setIsGuestMode: persistGuestMode,
        handleSelectKey,
        aiConfig,
        availableTextModels,
        availableImageModels,
        updateAiConfig
    };
};
