import React, { useState, useEffect } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { MapStylePreset, LogEntry } from '@/types';
import { DEFAULT_STYLE_PRESET } from '@/constants';
import { storageService } from '@core/services/storage';
import { fetchDefaultThemes } from '@core/services/defaultThemes';
import { MapStyleExportService } from '@features/styles/services/MapStyleExportService';
import { MaputnikExportService } from '@features/styles/services/MaputnikExportService';
import { GitHubPagesPublisher } from '@features/styles/services/GitHubPagesPublisher';
import { createLogger } from '@core/logger';

const logger = createLogger('StyleManagerHook');

export const useStyleManager = (addLog: (msg: string, type?: LogEntry['type']) => void) => {
    const [styles, setStyles] = useState<MapStylePreset[]>([]);
    const [activeStyleId, setActiveStyleId] = useState<string | null>(null);
    const [defaultThemes, setDefaultThemes] = useState<MapStylePreset[]>([DEFAULT_STYLE_PRESET]);
    const [defaultThemeIds, setDefaultThemeIds] = useState<string[]>([DEFAULT_STYLE_PRESET.id]);
    const [maputnikPublishInfo, setMaputnikPublishInfo] = useState<{
        styleUrl: string;
        spriteBaseUrl: string;
    } | null>(null);
    const [maputnikDemoPoisEnabled, setMaputnikDemoPoisEnabled] = useState(true);

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

    const GITHUB_TOKEN_KEY = 'mapAlchemistGithubToken';
    const GITHUB_REPO_KEY = 'mapAlchemistGithubRepo';
    const GITHUB_BRANCH_KEY = 'mapAlchemistGithubBranch';
    const MAPUTNIK_DEMO_POIS_KEY = 'mapAlchemistMaputnikDemoPois';

    useEffect(() => {
        if (typeof window === 'undefined') return;
        const stored = localStorage.getItem(MAPUTNIK_DEMO_POIS_KEY);
        if (stored === null) return;
        setMaputnikDemoPoisEnabled(stored !== 'false');
    }, []);

    const handleExportPackage = async () => {
        if (!activeStyleId) {
            addLog("No active style selected.", "warning");
            return;
        }

        const style = styles.find(s => s.id === activeStyleId);
        if (!style) {
            addLog("Active style not found.", "error");
            return;
        }

        try {
            const exportPackage = await MapStyleExportService.buildExportPackage(style);
            const safeName = style.name
                .toLowerCase()
                .replace(/[^a-z0-9]+/g, '-')
                .replace(/(^-|-$)/g, '') || 'map-alchemist-style';

            const dataStr = "data:application/json;charset=utf-8," + encodeURIComponent(JSON.stringify(exportPackage));
            const node = document.createElement('a');
            node.setAttribute("href", dataStr);
            node.setAttribute("download", `map-alchemist-${safeName}.json`);
            document.body.appendChild(node);
            node.click();
            node.remove();
            addLog(`Exported MapLibre package for "${style.name}".`, "success");
        } catch (error) {
            logger.error("Failed to export MapLibre package", error);
            addLog("Failed to export MapLibre package.", "error");
        }
    };

    const handleExportMaputnik = async () => {
        if (!activeStyleId) {
            addLog("No active style selected.", "warning");
            return;
        }

        const style = styles.find(s => s.id === activeStyleId);
        if (!style) {
            addLog("Active style not found.", "error");
            return;
        }

        const safeName = style.name
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, '-')
            .replace(/(^-|-$)/g, '') || 'map-alchemist-style';

        const defaultSpriteBase = `https://your-cdn.example.com/sprites/${safeName}`;
        const rawInput = prompt(
            "Enter sprite base URL (no extension). Example: https://cdn.example.com/sprites/my-style",
            defaultSpriteBase
        );

        if (!rawInput) {
            addLog("Maputnik export canceled.", "warning");
            return;
        }

        const spriteBaseUrl = rawInput
            .trim()
            .replace(/(@2x)?\.(png|json)$/i, '')
            .replace(/\/$/, '');

        if (!spriteBaseUrl) {
            addLog("Invalid sprite base URL.", "error");
            return;
        }

        const downloadBlob = (blob: Blob, filename: string) => {
            const url = URL.createObjectURL(blob);
            const node = document.createElement('a');
            node.setAttribute('href', url);
            node.setAttribute('download', filename);
            document.body.appendChild(node);
            node.click();
            node.remove();
            URL.revokeObjectURL(url);
        };

        try {
            const result = await MaputnikExportService.buildExport(style, {
                spriteBaseUrl,
                includeDemoPois: maputnikDemoPoisEnabled
            });

            const spriteBaseName = spriteBaseUrl.split('/').pop() || safeName;
            const styleBlob = new Blob([JSON.stringify(result.styleJson, null, 2)], { type: 'application/json' });
            const spriteJsonBlob = new Blob([JSON.stringify(result.spriteJson, null, 2)], { type: 'application/json' });
            const sprite2xJsonBlob = new Blob([JSON.stringify(result.sprite2xJson, null, 2)], { type: 'application/json' });

            downloadBlob(styleBlob, `maputnik-${safeName}-style.json`);
            downloadBlob(spriteJsonBlob, `${spriteBaseName}.json`);
            downloadBlob(result.spritePng, `${spriteBaseName}.png`);
            downloadBlob(sprite2xJsonBlob, `${spriteBaseName}@2x.json`);
            downloadBlob(result.sprite2xPng, `${spriteBaseName}@2x.png`);

            addLog("Maputnik export complete (style + sprites).", "success");
        } catch (error) {
            logger.error("Failed to export Maputnik assets", error);
            addLog("Failed to export Maputnik assets.", "error");
        }
    };

    const resolveGitHubTarget = () => {
        const envRepo = import.meta.env.VITE_DEPLOY_REPO as string | undefined;
        const envBranch = import.meta.env.VITE_DEPLOY_BRANCH as string | undefined;
        const envDeploy = import.meta.env.VITE_DEPLOY_ENV as string | undefined;

        const storedRepo = typeof window !== 'undefined' ? localStorage.getItem(GITHUB_REPO_KEY) : null;
        const storedBranch = typeof window !== 'undefined' ? localStorage.getItem(GITHUB_BRANCH_KEY) : null;

        return {
            repo: envRepo || storedRepo || '',
            branch: envBranch || storedBranch || '',
            deployEnv: envDeploy || ''
        };
    };

    const promptForGitHubTarget = (defaults: { repo: string; branch: string }) => {
        const repoInput = prompt('GitHub repo (owner/repo)', defaults.repo || 'SunaNoOshiro/map-alchemist');
        if (!repoInput) return null;

        const branchInput = prompt('GitHub branch to publish to', defaults.branch || 'main');
        if (!branchInput) return null;

        if (typeof window !== 'undefined') {
            localStorage.setItem(GITHUB_REPO_KEY, repoInput.trim());
            localStorage.setItem(GITHUB_BRANCH_KEY, branchInput.trim());
        }

        return { repo: repoInput.trim(), branch: branchInput.trim() };
    };

    const handlePublishMaputnik = async () => {
        if (!activeStyleId) {
            addLog('No active style selected.', 'warning');
            return;
        }

        const style = styles.find(s => s.id === activeStyleId);
        if (!style) {
            addLog('Active style not found.', 'error');
            return;
        }

        if (typeof window === 'undefined') {
            addLog('GitHub publish requires a browser environment.', 'error');
            return;
        }

        const safeName = style.name
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, '-')
            .replace(/(^-|-$)/g, '') || 'map-alchemist-style';

        let { repo, branch, deployEnv } = resolveGitHubTarget();

        if (deployEnv === 'preview' && repo && branch && branch !== 'main') {
            const usePreview = confirm(
                `Preview deploy detected. Publish to ${branch}?\\n` +
                'Press Cancel to choose a different branch.'
            );
            if (!usePreview) {
                const result = promptForGitHubTarget({ repo, branch: 'main' });
                if (!result) {
                    addLog('GitHub publish canceled.', 'warning');
                    return;
                }
                repo = result.repo;
                branch = result.branch;
            }
        }

        if (!repo || !branch) {
            const result = promptForGitHubTarget({ repo, branch });
            if (!result) {
                addLog('GitHub publish canceled.', 'warning');
                return;
            }
            repo = result.repo;
            branch = result.branch;
        }

        let token = localStorage.getItem(GITHUB_TOKEN_KEY) || '';
        if (!token) {
            const tokenInput = prompt('GitHub PAT (with contents: write)', '');
            if (!tokenInput) {
                addLog('GitHub publish canceled.', 'warning');
                return;
            }
            token = tokenInput.trim();
            localStorage.setItem(GITHUB_TOKEN_KEY, token);
        }

        const parsedRepo = GitHubPagesPublisher.parseGitHubRepo(repo);
        if (!parsedRepo) {
            addLog('Invalid GitHub repo. Use owner/repo.', 'error');
            return;
        }

        try {
            if (deployEnv === 'preview' && branch !== 'main') {
                addLog('Preview deploy detected. GitHub Pages usually serves only the configured branch.', 'warning');
            }
            const pagesBaseUrl = GitHubPagesPublisher.buildPagesBaseUrl(parsedRepo.owner, parsedRepo.repo);
            const spriteBaseUrl = `${pagesBaseUrl}/sprites/${safeName}`;

            addLog(`Publishing to GitHub Pages (${repo}@${branch})...`, 'info');

            const maputnikAssets = await MaputnikExportService.buildExport(style, {
                spriteBaseUrl,
                includeDemoPois: maputnikDemoPoisEnabled
            });

            const publishResult = await GitHubPagesPublisher.publish({
                repoInput: repo,
                branch,
                token,
                styleSlug: safeName,
                styleName: style.name,
                styleJson: maputnikAssets.styleJson,
                spriteJson: maputnikAssets.spriteJson,
                spritePng: maputnikAssets.spritePng,
                sprite2xJson: maputnikAssets.sprite2xJson,
                sprite2xPng: maputnikAssets.sprite2xPng
            });

            addLog(`Published style: ${publishResult.styleUrl}`, 'success');
            setMaputnikPublishInfo({
                styleUrl: publishResult.styleUrl,
                spriteBaseUrl: publishResult.spriteBaseUrl
            });
        } catch (error) {
            logger.error('GitHub publish failed', error);
            addLog('GitHub publish failed. Check console for details.', 'error');
        }
    };

    const handleClearGitHubToken = () => {
        if (typeof window === 'undefined') return;
        localStorage.removeItem(GITHUB_TOKEN_KEY);
        addLog('GitHub token cleared.', 'info');
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
        maputnikPublishInfo,
        clearMaputnikPublishInfo: () => setMaputnikPublishInfo(null),
        maputnikDemoPoisEnabled,
        setMaputnikDemoPoisEnabled: (value: boolean) => {
            setMaputnikDemoPoisEnabled(value);
            if (typeof window !== 'undefined') {
                localStorage.setItem(MAPUTNIK_DEMO_POIS_KEY, String(value));
            }
        },
        handleExport,
        handleImport,
        handleClear,
        handleDeleteStyle,
        handleExportPackage,
        handleExportMaputnik,
        handlePublishMaputnik,
        handleClearGitHubToken
    };
};
