import { useState, useEffect } from 'react';
import { LogEntry } from '../../../types';

export const useAppAuth = (addLog: (msg: string, type?: LogEntry['type']) => void) => {
    const [hasApiKey, setHasApiKey] = useState<boolean>(false);
    const [isGuestMode, setIsGuestMode] = useState<boolean>(false);

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

    return { hasApiKey, isGuestMode, setIsGuestMode, handleSelectKey };
};
