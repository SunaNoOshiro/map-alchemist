import React, { useState, useEffect } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { MapStylePreset, LogEntry } from '@/types';
import { DEFAULT_STYLE_PRESET } from '@/constants';
import { storageService } from '@core/services/storage';
import { fetchDefaultThemes } from '@core/services/defaultThemes';
import { createLogger } from '@core/logger';

const logger = createLogger('StyleManagerHook');

export const useStyleManager = (addLog: (msg: string, type?: LogEntry['type']) => void) => {
    const [styles, setStyles] = useState<MapStylePreset[]>([]);
    const [activeStyleId, setActiveStyleId] = useState<string | null>(null);
    const [defaultThemes, setDefaultThemes] = useState<MapStylePreset[]>([DEFAULT_STYLE_PRESET]);
    const [defaultThemeIds, setDefaultThemeIds] = useState<string[]>([DEFAULT_STYLE_PRESET.id]);

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
                    // Re-generate IDs to avoid conflicts? Original didn't. 
                    // But filter out ones that might clash with defaults if logic demands.
                    // Original filtered '!defaultThemeIds.includes'.
                    // We need ensure we don't import duplicates or broken ones.
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

    return {
        styles,
        setStyles,
        activeStyleId,
        setActiveStyleId,
        defaultThemeIds,
        handleExport,
        handleImport,
        handleClear,
        handleDeleteStyle
    };
};
