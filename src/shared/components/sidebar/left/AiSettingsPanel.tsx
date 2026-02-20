import React, { useEffect, useRef, useState } from 'react';
import { BrainCircuit, ChevronDown, Key, Settings, Save } from 'lucide-react';
import { AiConfig } from '@/types';
import { getSectionColor } from '@/constants';
import { UI_CONTROLS, UI_SPACING, UI_TYPOGRAPHY, uiClass } from '@shared/styles/uiTokens';
import { ICON_GENERATION_MODE_LABELS } from '@/constants/aiConstants';

interface AiSettingsPanelProps {
  aiConfig: AiConfig;
  availableModels: Record<string, string>;
  onUpdateAiConfig: (config: Partial<AiConfig>) => void;
  onConnectApi: () => void;
  hasApiKey: boolean;
}

const AiSettingsPanel: React.FC<AiSettingsPanelProps> = ({
  aiConfig,
  availableModels,
  onUpdateAiConfig,
  onConnectApi,
  hasApiKey
}) => {
  const [isProviderDropdownOpen, setIsProviderDropdownOpen] = useState(false);
  const [isModelDropdownOpen, setIsModelDropdownOpen] = useState(false);
  const [isModeDropdownOpen, setIsModeDropdownOpen] = useState(false);
  const [apiKeyInput, setApiKeyInput] = useState(aiConfig.apiKey || '');
  const [showApiKey, setShowApiKey] = useState(false);
  const [isEditingApiKey, setIsEditingApiKey] = useState(false);
  const sectionColor = getSectionColor('ai-config'); // Blue for AI Configuration section
  const providerDropdownRef = useRef<HTMLDivElement>(null);
  const modelDropdownRef = useRef<HTMLDivElement>(null);
  const modeDropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isProviderDropdownOpen && !isModelDropdownOpen && !isModeDropdownOpen) {
      return;
    }

    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target as Node | null;
      const isInsideProvider = providerDropdownRef.current?.contains(target ?? null);
      const isInsideModel = modelDropdownRef.current?.contains(target ?? null);
      const isInsideMode = modeDropdownRef.current?.contains(target ?? null);

      if (!isInsideProvider && !isInsideModel && !isInsideMode) {
        setIsProviderDropdownOpen(false);
        setIsModelDropdownOpen(false);
        setIsModeDropdownOpen(false);
      }
    };

    const handleFocusIn = (event: FocusEvent) => {
      const target = event.target as Node | null;
      const isInsideProvider = providerDropdownRef.current?.contains(target ?? null);
      const isInsideModel = modelDropdownRef.current?.contains(target ?? null);
      const isInsideMode = modeDropdownRef.current?.contains(target ?? null);

      if (!isInsideProvider && !isInsideModel && !isInsideMode) {
        setIsProviderDropdownOpen(false);
        setIsModelDropdownOpen(false);
        setIsModeDropdownOpen(false);
      }
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsProviderDropdownOpen(false);
        setIsModelDropdownOpen(false);
        setIsModeDropdownOpen(false);
      }
    };

    document.addEventListener('pointerdown', handlePointerDown);
    document.addEventListener('focusin', handleFocusIn);
    document.addEventListener('keydown', handleKeyDown);

    return () => {
      document.removeEventListener('pointerdown', handlePointerDown);
      document.removeEventListener('focusin', handleFocusIn);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isModeDropdownOpen, isModelDropdownOpen, isProviderDropdownOpen]);

  const handleProviderSelect = (provider: AiConfig['provider']) => {
    onUpdateAiConfig({ provider });
    setIsProviderDropdownOpen(false);
  };

  const handleProviderToggle = () => {
    setIsProviderDropdownOpen((prev) => {
      const next = !prev;
      if (next) {
        setIsModelDropdownOpen(false);
        setIsModeDropdownOpen(false);
      }
      return next;
    });
  };

  const handleModelToggle = () => {
    setIsModelDropdownOpen((prev) => {
      const next = !prev;
      if (next) {
        setIsProviderDropdownOpen(false);
        setIsModeDropdownOpen(false);
      }
      return next;
    });
  };

  const handleModelSelect = (model: string) => {
    onUpdateAiConfig({ model });
    setIsModelDropdownOpen(false);
  };

  const handleModeToggle = () => {
    setIsModeDropdownOpen((prev) => {
      const next = !prev;
      if (next) {
        setIsProviderDropdownOpen(false);
        setIsModelDropdownOpen(false);
      }
      return next;
    });
  };

  const handleModeSelect = (iconGenerationMode: AiConfig['iconGenerationMode']) => {
    onUpdateAiConfig({ iconGenerationMode });
    setIsModeDropdownOpen(false);
  };

  const handleApiKeyChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setApiKeyInput(e.target.value);
  };

  const handleApiKeySubmit = () => {
    onUpdateAiConfig({ apiKey: apiKeyInput, isCustomKey: true });
    setIsEditingApiKey(false);
  };

  const handleConnectWithConfig = () => {
    if (apiKeyInput.trim()) {
      handleApiKeySubmit();
    } else {
      onConnectApi();
    }
  };

  return (
    <div className={uiClass('bg-gray-800/50 border rounded-lg', UI_SPACING.panel, UI_SPACING.blockGap)} style={{ borderColor: `${sectionColor}50` }}>
      <div className={uiClass('flex items-center gap-2 text-gray-500', UI_TYPOGRAPHY.tiny)}>
        <BrainCircuit className="w-3 h-3" style={{ color: `${sectionColor}90` }} />
        <span className="uppercase tracking-[0.08em] font-semibold">AI setup</span>
      </div>
      {/* Provider Selection */}
      <div className={UI_SPACING.sectionGap}>
        <label className={uiClass(UI_TYPOGRAPHY.fieldLabel, 'text-gray-300 flex items-center gap-1')}>
          AI Provider
        </label>
        <div className="relative" ref={providerDropdownRef}>
          <button
            onClick={handleProviderToggle}
            className={UI_CONTROLS.dropdownTrigger}
            style={{ borderColor: `${sectionColor}50`, color: '#d1d5db' }}
          >
            <span className="truncate">Google Gemini</span>
            <ChevronDown className="w-3 h-3 text-gray-400" />
          </button>

          {isProviderDropdownOpen && (
            <div className="absolute z-20 mt-1 w-full bg-gray-700 border rounded shadow-lg overflow-hidden" style={{ borderColor: `${sectionColor}50` }}>
              <div
                onClick={() => handleProviderSelect('google-gemini')}
                className={uiClass('px-3 py-2 hover:bg-gray-600 cursor-pointer flex items-center gap-2 font-medium', UI_TYPOGRAPHY.compact)}
              >
                <span className="text-blue-400">●</span>
                Google Gemini
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Model Selection */}
      <div className={UI_SPACING.sectionGap}>
        <label className={uiClass(UI_TYPOGRAPHY.fieldLabel, 'text-gray-300 flex items-center gap-1')}>
          AI Model
        </label>
        <div className="relative" ref={modelDropdownRef}>
          <button
            onClick={handleModelToggle}
            className={UI_CONTROLS.dropdownTrigger}
            style={{ borderColor: `${sectionColor}50`, color: '#d1d5db' }}
          >
            <span className="truncate">{availableModels[aiConfig.model] || aiConfig.model}</span>
            <ChevronDown className="w-3 h-3 text-gray-400" />
          </button>

          {isModelDropdownOpen && (
            <div className="absolute z-20 mt-1 w-full bg-gray-700 border rounded shadow-lg overflow-hidden max-h-32 overflow-y-auto" style={{ borderColor: `${sectionColor}50` }}>
              {Object.entries(availableModels).map(([modelId, modelName]) => (
                <div
                  key={modelId}
                  onClick={() => handleModelSelect(modelId)}
                  className={uiClass('px-3 py-2 hover:bg-gray-600 cursor-pointer flex items-center gap-2 font-medium', UI_TYPOGRAPHY.compact)}
                >
                  {aiConfig.model === modelId && <span className="text-blue-400">●</span>}
                  {modelName}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Icon Generation Mode */}
      <div className={UI_SPACING.sectionGap}>
        <label className={uiClass(UI_TYPOGRAPHY.fieldLabel, 'text-gray-300 flex items-center gap-1')}>
          Icon Generation
        </label>
        <div className="relative" ref={modeDropdownRef}>
          <button
            onClick={handleModeToggle}
            className={UI_CONTROLS.dropdownTrigger}
            style={{ borderColor: `${sectionColor}50`, color: '#d1d5db' }}
            data-testid="icon-generation-mode-trigger"
            aria-label="Icon generation mode"
          >
            <span className="truncate">{ICON_GENERATION_MODE_LABELS[aiConfig.iconGenerationMode]}</span>
            <ChevronDown className="w-3 h-3 text-gray-400" />
          </button>

          {isModeDropdownOpen && (
            <div className="absolute z-20 mt-1 w-full bg-gray-700 border rounded shadow-lg overflow-hidden" style={{ borderColor: `${sectionColor}50` }}>
              {(Object.keys(ICON_GENERATION_MODE_LABELS) as Array<AiConfig['iconGenerationMode']>).map((mode) => (
                <div
                  key={mode}
                  onClick={() => handleModeSelect(mode)}
                  className={uiClass('px-3 py-2 hover:bg-gray-600 cursor-pointer flex items-center gap-2 font-medium', UI_TYPOGRAPHY.compact)}
                  data-testid={`icon-generation-mode-option-${mode}`}
                >
                  {aiConfig.iconGenerationMode === mode && <span className="text-blue-400">●</span>}
                  {ICON_GENERATION_MODE_LABELS[mode]}
                </div>
              ))}
            </div>
          )}
        </div>
        {aiConfig.iconGenerationMode === 'per-icon' && (
          <p className={uiClass(UI_TYPOGRAPHY.tiny, 'text-amber-300 mt-1')}>
            Per-icon mode is capped per run to control API spend. Use Atlas/Auto for full coverage at lower cost.
          </p>
        )}
      </div>

      {/* API Key Section */}
      <div className={UI_SPACING.sectionGap}>
        <div className="flex items-center justify-between">
          <label className={uiClass(UI_TYPOGRAPHY.fieldLabel, 'text-gray-300 flex items-center gap-1')}>
            <Key className="w-3 h-3" style={{ color: sectionColor }} />
            API Key
          </label>
          {hasApiKey && !aiConfig.isCustomKey && (
            <span className={uiClass(UI_TYPOGRAPHY.tiny, 'bg-green-900/50 text-green-300 px-1.5 py-0.5 rounded-full border')} style={{ borderColor: '#16a34a50' }}>
              Connected via Studio
            </span>
          )}
        </div>

        {isEditingApiKey ? (
          <div className={UI_SPACING.sectionGap}>
            <div className="relative">
              <input
                type={showApiKey ? "text" : "password"}
                value={apiKeyInput}
                onChange={handleApiKeyChange}
                placeholder="Enter your API key"
                className={uiClass(UI_CONTROLS.input, 'pr-10')}
                style={{
                  borderColor: `${sectionColor}50`,
                  outlineColor: sectionColor
                }}
              />
              <button
                onClick={() => setShowApiKey(!showApiKey)}
                className={uiClass(UI_TYPOGRAPHY.tiny, 'absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-300')}
              >
                {showApiKey ? 'Hide' : 'Show'}
              </button>
            </div>
            <div className="flex gap-1">
              <button
                onClick={handleApiKeySubmit}
                className={uiClass(UI_CONTROLS.button, 'flex-1 text-white')}
                style={{
                  backgroundColor: sectionColor,
                  borderColor: `${sectionColor}50`
                }}
              >
                <Save className="w-2.5 h-2.5" />
                Save
              </button>
              <button
                onClick={() => setIsEditingApiKey(false)}
                className={uiClass(UI_CONTROLS.button, 'flex-1 bg-gray-600 hover:bg-gray-500 text-white')}
              >
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <div className={UI_SPACING.sectionGap}>
            {aiConfig.isCustomKey ? (
              <div className={uiClass(UI_CONTROLS.panelInset, UI_TYPOGRAPHY.compact, 'px-3 py-2 flex items-center justify-between gap-2')} style={{ borderColor: `${sectionColor}50` }}>
                <span className="truncate text-gray-200">••••••••••••{aiConfig.apiKey.slice(-4)}</span>
                <div className="flex items-center gap-1 ml-1">
                  <button
                    onClick={() => setIsEditingApiKey(true)}
                    className={uiClass(
                      UI_TYPOGRAPHY.tiny,
                      'inline-flex h-6 items-center rounded border px-2 normal-case tracking-normal text-gray-300 transition-colors hover:text-white',
                    )}
                    style={{
                      borderColor: `${sectionColor}50`,
                      backgroundColor: `${sectionColor}16`,
                    }}
                    type="button"
                  >
                    Edit
                  </button>
                  <button
                    onClick={() => onUpdateAiConfig({ apiKey: '', isCustomKey: false })}
                    className={uiClass(
                      UI_TYPOGRAPHY.tiny,
                      'inline-flex h-6 items-center rounded border px-2 normal-case tracking-normal text-gray-300 transition-colors hover:text-red-300 hover:bg-red-500/10',
                    )}
                    style={{ borderColor: '#ef44444a' }}
                    type="button"
                  >
                    Clear
                  </button>
                </div>
              </div>
            ) : (
              <div className={UI_SPACING.sectionGap}>
                <button
                  onClick={handleConnectWithConfig}
                  className={uiClass(UI_CONTROLS.button, 'w-full bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-500 hover:to-purple-500 text-white border-transparent')}
                >
                  <Settings className="w-3 h-3" />
                  Connect API Key
                </button>
                <button
                  onClick={() => setIsEditingApiKey(true)}
                  className={uiClass(UI_TYPOGRAPHY.tiny, 'w-full text-gray-400 hover:text-gray-300')}
                >
                  Or enter manually...
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Current Configuration */}
      <div className={uiClass('bg-gray-700/50 border rounded p-2', UI_TYPOGRAPHY.tiny)} style={{ borderColor: `${sectionColor}50` }}>
        <div className="flex items-center gap-1">
          <span className="text-gray-400">Current:</span>
          <span className={uiClass('bg-gray-600 px-1.5 py-0.5 rounded text-gray-200', UI_TYPOGRAPHY.tiny)}>
            {availableModels[aiConfig.model] || aiConfig.model}
          </span>
          <span className={uiClass('bg-gray-600 px-1.5 py-0.5 rounded text-gray-200', UI_TYPOGRAPHY.tiny)}>
            {ICON_GENERATION_MODE_LABELS[aiConfig.iconGenerationMode]}
          </span>
          {aiConfig.isCustomKey && (
            <span className={uiClass('bg-green-600 px-1.5 py-0.5 rounded text-green-100', UI_TYPOGRAPHY.tiny)}>
              Custom Key
            </span>
          )}
          {hasApiKey && !aiConfig.isCustomKey && (
            <span className={uiClass('bg-blue-600 px-1.5 py-0.5 rounded text-blue-100', UI_TYPOGRAPHY.tiny)}>
              Studio Connected
            </span>
          )}
        </div>
      </div>
    </div>
  );
};

export default AiSettingsPanel;
