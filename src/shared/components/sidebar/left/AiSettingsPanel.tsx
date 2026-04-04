import React, { useEffect, useRef, useState } from 'react';
import { BrainCircuit, ChevronDown, Key, Save } from 'lucide-react';
import { AiConfig } from '@/types';
import { getSectionColor } from '@/constants';
import { UI_CONTROLS, UI_SPACING, UI_TYPOGRAPHY, brightenHex, uiClass } from '@shared/styles/uiTokens';
import {
  AI_PROVIDERS,
  getAvailableImageModels,
  getDefaultIconGenerationMode,
  getIconGenerationModeDescription,
  getSupportedIconGenerationModes,
  getAvailableTextModels,
  getProviderDisplayName,
  ICON_GENERATION_MODE_LABELS
} from '@/constants/aiConstants';

interface AiSettingsPanelProps {
  aiConfig: AiConfig;
  availableTextModels: Record<string, string>;
  availableImageModels: Record<string, string>;
  onUpdateAiConfig: (config: Partial<AiConfig>) => void;
  onConnectApi: (apiKeyOverride?: string) => void;
  hasApiKey: boolean;
  apiKeyEditorRequest?: number;
}

const AiSettingsPanel: React.FC<AiSettingsPanelProps> = ({
  aiConfig,
  availableTextModels,
  availableImageModels,
  onUpdateAiConfig,
  onConnectApi,
  hasApiKey,
  apiKeyEditorRequest = 0
}) => {
  const [isProviderDropdownOpen, setIsProviderDropdownOpen] = useState(false);
  const [isTextModelDropdownOpen, setIsTextModelDropdownOpen] = useState(false);
  const [isImageModelDropdownOpen, setIsImageModelDropdownOpen] = useState(false);
  const [isModeDropdownOpen, setIsModeDropdownOpen] = useState(false);
  const [hoveredMode, setHoveredMode] = useState<AiConfig['iconGenerationMode'] | null>(null);
  const [apiKeyInput, setApiKeyInput] = useState(aiConfig.apiKey || '');
  const [showApiKey, setShowApiKey] = useState(false);
  const [isEditingApiKey, setIsEditingApiKey] = useState(false);
  const [hoveredAction, setHoveredAction] = useState<string | null>(null);
  const sectionColor = getSectionColor('ai-config'); // Blue for AI Configuration section
  const hoverSectionColor = brightenHex(sectionColor, 0.18);
  const providerDropdownRef = useRef<HTMLDivElement>(null);
  const textModelDropdownRef = useRef<HTMLDivElement>(null);
  const imageModelDropdownRef = useRef<HTMLDivElement>(null);
  const modeDropdownRef = useRef<HTMLDivElement>(null);
  const apiKeyInputRef = useRef<HTMLInputElement>(null);
  const currentTextModel = aiConfig.textModel || Object.keys(availableTextModels)[0] || '';
  const currentImageModel = aiConfig.imageModel || Object.keys(availableImageModels)[0] || '';
  const supportedIconModes = getSupportedIconGenerationModes(aiConfig.provider);
  const currentIconMode = supportedIconModes.includes(aiConfig.iconGenerationMode)
    ? aiConfig.iconGenerationMode
    : getDefaultIconGenerationMode(aiConfig.provider);
  const providerDisplayName = getProviderDisplayName(aiConfig.provider);
  const isUsingStudioKey = hasApiKey && !aiConfig.isCustomKey;
  const showCancelButton = isEditingApiKey && (aiConfig.isCustomKey || isUsingStudioKey);
  const trimmedApiKeyInput = apiKeyInput.trim();
  const isSaveEnabled = Boolean(trimmedApiKeyInput);
  const apiKeyInputClassName = uiClass(UI_CONTROLS.input, 'h-10 px-3 pr-20');
  const apiKeyFormStackClassName = 'space-y-4';
  const getSectionButtonStyle = (variant: 'primary' | 'secondary', isHovered: boolean, isEnabled = true) => {
    const accent = isHovered && isEnabled ? hoverSectionColor : sectionColor;
    return {
      backgroundColor: variant === 'primary'
        ? (isEnabled ? accent : `${sectionColor}10`)
        : `${accent}10`,
      borderColor: variant === 'primary'
        ? (isEnabled ? `${accent}55` : `${sectionColor}45`)
        : `${accent}40`,
      color: variant === 'primary'
        ? (isEnabled ? '#ffffff' : sectionColor)
        : accent
    } as const;
  };

  useEffect(() => {
    if (!isProviderDropdownOpen && !isTextModelDropdownOpen && !isImageModelDropdownOpen && !isModeDropdownOpen) {
      return;
    }

    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target as Node | null;
      const isInsideProvider = providerDropdownRef.current?.contains(target ?? null);
      const isInsideTextModel = textModelDropdownRef.current?.contains(target ?? null);
      const isInsideImageModel = imageModelDropdownRef.current?.contains(target ?? null);
      const isInsideMode = modeDropdownRef.current?.contains(target ?? null);

      if (!isInsideProvider && !isInsideTextModel && !isInsideImageModel && !isInsideMode) {
        setIsProviderDropdownOpen(false);
        setIsTextModelDropdownOpen(false);
        setIsImageModelDropdownOpen(false);
        setIsModeDropdownOpen(false);
        setHoveredMode(null);
      }
    };

    const handleFocusIn = (event: FocusEvent) => {
      const target = event.target as Node | null;
      const isInsideProvider = providerDropdownRef.current?.contains(target ?? null);
      const isInsideTextModel = textModelDropdownRef.current?.contains(target ?? null);
      const isInsideImageModel = imageModelDropdownRef.current?.contains(target ?? null);
      const isInsideMode = modeDropdownRef.current?.contains(target ?? null);

      if (!isInsideProvider && !isInsideTextModel && !isInsideImageModel && !isInsideMode) {
        setIsProviderDropdownOpen(false);
        setIsTextModelDropdownOpen(false);
        setIsImageModelDropdownOpen(false);
        setIsModeDropdownOpen(false);
        setHoveredMode(null);
      }
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsProviderDropdownOpen(false);
        setIsTextModelDropdownOpen(false);
        setIsImageModelDropdownOpen(false);
        setIsModeDropdownOpen(false);
        setHoveredMode(null);
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
  }, [isModeDropdownOpen, isTextModelDropdownOpen, isImageModelDropdownOpen, isProviderDropdownOpen]);

  useEffect(() => {
    if (!isEditingApiKey) {
      setApiKeyInput(aiConfig.apiKey || '');
    }
  }, [aiConfig.apiKey, isEditingApiKey]);

  useEffect(() => {
    if (apiKeyEditorRequest === 0) return;
    setIsEditingApiKey(true);
    setShowApiKey(false);
  }, [apiKeyEditorRequest]);

  useEffect(() => {
    if (!isEditingApiKey) return;

    const frame = window.requestAnimationFrame(() => {
      apiKeyInputRef.current?.focus();
      apiKeyInputRef.current?.select();
    });

    return () => {
      window.cancelAnimationFrame(frame);
    };
  }, [isEditingApiKey, apiKeyEditorRequest]);

  const handleProviderSelect = (provider: AiConfig['provider']) => {
    const nextTextModels = getAvailableTextModels(provider);
    const nextImageModels = getAvailableImageModels(provider);
    const nextIconModes = getSupportedIconGenerationModes(provider);
    const nextTextModel = Object.keys(nextTextModels)[0] || currentTextModel || aiConfig.textModel;
    const nextImageModel = Object.keys(nextImageModels)[0] || currentImageModel || aiConfig.imageModel;
    const nextIconMode = nextIconModes.includes(aiConfig.iconGenerationMode)
      ? aiConfig.iconGenerationMode
      : getDefaultIconGenerationMode(provider);
    onUpdateAiConfig({
      provider,
      textModel: nextTextModel,
      imageModel: nextImageModel,
      iconGenerationMode: nextIconMode
    });
    setIsProviderDropdownOpen(false);
  };

  const handleProviderToggle = () => {
    setIsProviderDropdownOpen((prev) => {
      const next = !prev;
      if (next) {
        setIsTextModelDropdownOpen(false);
        setIsImageModelDropdownOpen(false);
        setIsModeDropdownOpen(false);
      }
      return next;
    });
  };

  const handleTextModelToggle = () => {
    setIsTextModelDropdownOpen((prev) => {
      const next = !prev;
      if (next) {
        setIsProviderDropdownOpen(false);
        setIsImageModelDropdownOpen(false);
        setIsModeDropdownOpen(false);
      }
      return next;
    });
  };

  const handleTextModelSelect = (textModel: string) => {
    onUpdateAiConfig({ textModel });
    setIsTextModelDropdownOpen(false);
  };

  const handleImageModelToggle = () => {
    setIsImageModelDropdownOpen((prev) => {
      const next = !prev;
      if (next) {
        setIsProviderDropdownOpen(false);
        setIsTextModelDropdownOpen(false);
        setIsModeDropdownOpen(false);
      }
      return next;
    });
  };

  const handleImageModelSelect = (imageModel: string) => {
    onUpdateAiConfig({ imageModel });
    setIsImageModelDropdownOpen(false);
  };

  const handleModeToggle = () => {
    setIsModeDropdownOpen((prev) => {
      const next = !prev;
      if (next) {
        setIsProviderDropdownOpen(false);
        setIsTextModelDropdownOpen(false);
        setIsImageModelDropdownOpen(false);
        setHoveredMode(currentIconMode);
      }
      if (!next) {
        setHoveredMode(null);
      }
      return next;
    });
  };

  const handleModeSelect = (iconGenerationMode: AiConfig['iconGenerationMode']) => {
    onUpdateAiConfig({ iconGenerationMode });
    setIsModeDropdownOpen(false);
    setHoveredMode(null);
  };

  const handleApiKeyChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setApiKeyInput(e.target.value);
  };

  const handleApiKeySubmit = () => {
    if (!trimmedApiKeyInput) return;
    onUpdateAiConfig({ apiKey: trimmedApiKeyInput, isCustomKey: true });
    onConnectApi(trimmedApiKeyInput);
    setShowApiKey(false);
    setIsEditingApiKey(false);
  };

  const handleCancelApiKeyEdit = () => {
    setApiKeyInput(aiConfig.apiKey || '');
    setShowApiKey(false);
    setIsEditingApiKey(false);
  };

  const activeModeForDescription = (isModeDropdownOpen && hoveredMode)
    ? hoveredMode
    : currentIconMode;
  const modeDescriptionTone: Record<AiConfig['iconGenerationMode'], string> = {
    auto: 'text-emerald-300',
    'batch-async': 'text-cyan-300',
    atlas: 'text-blue-300',
    'per-icon': 'text-amber-300'
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
            <span className="truncate">{providerDisplayName}</span>
            <ChevronDown className="w-3 h-3 text-gray-400" />
          </button>

          {isProviderDropdownOpen && (
            <div className="absolute z-20 mt-1 w-full bg-gray-700 border rounded shadow-lg overflow-hidden divide-y divide-gray-600/60" style={{ borderColor: `${sectionColor}50` }}>
              {(Object.keys(AI_PROVIDERS) as AiConfig['provider'][]).map((provider) => (
                <div
                  key={provider}
                  onClick={() => handleProviderSelect(provider)}
                  className={uiClass('px-3 py-2 hover:bg-gray-600 cursor-pointer flex items-center gap-2 font-medium', UI_TYPOGRAPHY.compact)}
                >
                  {aiConfig.provider === provider && <span className="text-blue-400">●</span>}
                  {getProviderDisplayName(provider)}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Text Model Selection */}
      <div className={UI_SPACING.sectionGap}>
        <label className={uiClass(UI_TYPOGRAPHY.fieldLabel, 'text-gray-300 flex items-center gap-1')}>
          Text Model
        </label>
        <div className="relative" ref={textModelDropdownRef}>
          <button
            onClick={handleTextModelToggle}
            className={UI_CONTROLS.dropdownTrigger}
            style={{ borderColor: `${sectionColor}50`, color: '#d1d5db' }}
          >
            <span className="truncate">{availableTextModels[currentTextModel] || currentTextModel}</span>
            <ChevronDown className="w-3 h-3 text-gray-400" />
          </button>

          {isTextModelDropdownOpen && (
            <div className="absolute z-20 mt-1 w-full bg-gray-700 border rounded shadow-lg overflow-hidden max-h-32 overflow-y-auto divide-y divide-gray-600/60" style={{ borderColor: `${sectionColor}50` }}>
              {Object.entries(availableTextModels).map(([modelId, modelName]) => (
                <div
                  key={modelId}
                  onClick={() => handleTextModelSelect(modelId)}
                  className={uiClass('px-3 py-2 hover:bg-gray-600 cursor-pointer flex items-center gap-2 font-medium', UI_TYPOGRAPHY.compact)}
                >
                  {currentTextModel === modelId && <span className="text-blue-400">●</span>}
                  {modelName}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Image Model Selection */}
      <div className={UI_SPACING.sectionGap}>
        <label className={uiClass(UI_TYPOGRAPHY.fieldLabel, 'text-gray-300 flex items-center gap-1')}>
          Image Model
        </label>
        <div className="relative" ref={imageModelDropdownRef}>
          <button
            onClick={handleImageModelToggle}
            className={UI_CONTROLS.dropdownTrigger}
            style={{ borderColor: `${sectionColor}50`, color: '#d1d5db' }}
          >
            <span className="truncate">{availableImageModels[currentImageModel] || currentImageModel}</span>
            <ChevronDown className="w-3 h-3 text-gray-400" />
          </button>

          {isImageModelDropdownOpen && (
            <div className="absolute z-20 mt-1 w-full bg-gray-700 border rounded shadow-lg overflow-hidden max-h-32 overflow-y-auto divide-y divide-gray-600/60" style={{ borderColor: `${sectionColor}50` }}>
              {Object.entries(availableImageModels).map(([modelId, modelName]) => (
                <div
                  key={modelId}
                  onClick={() => handleImageModelSelect(modelId)}
                  className={uiClass('px-3 py-2 hover:bg-gray-600 cursor-pointer flex items-center gap-2 font-medium', UI_TYPOGRAPHY.compact)}
                >
                  {currentImageModel === modelId && <span className="text-blue-400">●</span>}
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
            <span className="truncate">{ICON_GENERATION_MODE_LABELS[currentIconMode]}</span>
            <ChevronDown className="w-3 h-3 text-gray-400" />
          </button>

          {isModeDropdownOpen && (
            <div
              className="absolute z-30 mt-1 w-full bg-gray-700 border rounded shadow-lg overflow-hidden divide-y divide-gray-600/60"
              style={{ borderColor: `${sectionColor}50` }}
              onMouseLeave={() => setHoveredMode(currentIconMode)}
            >
              <div className="px-3 py-2 bg-gray-800/70">
                <p
                  className={uiClass(UI_TYPOGRAPHY.tiny, modeDescriptionTone[activeModeForDescription])}
                  data-testid="icon-generation-mode-description"
                >
                  {getIconGenerationModeDescription(aiConfig.provider, activeModeForDescription)}
                </p>
              </div>
              {supportedIconModes.map((mode) => (
                <div
                  key={mode}
                  onClick={() => handleModeSelect(mode)}
                  onMouseEnter={() => setHoveredMode(mode)}
                  onFocus={() => setHoveredMode(mode)}
                  className={uiClass('px-3 py-2 hover:bg-gray-600 cursor-pointer flex items-center gap-2 font-medium', UI_TYPOGRAPHY.compact)}
                  data-testid={`icon-generation-mode-option-${mode}`}
                  title={getIconGenerationModeDescription(aiConfig.provider, mode)}
                >
                  {currentIconMode === mode && <span className="text-blue-400">●</span>}
                  {ICON_GENERATION_MODE_LABELS[mode]}
                </div>
              ))}
            </div>
          )}
        </div>
        {!isModeDropdownOpen && (
          <p
            className={uiClass(UI_TYPOGRAPHY.tiny, 'mt-1', modeDescriptionTone[activeModeForDescription])}
            data-testid="icon-generation-mode-description"
          >
            {getIconGenerationModeDescription(aiConfig.provider, activeModeForDescription)}
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
          <div className={apiKeyFormStackClassName}>
            <div className="relative">
              <input
                ref={apiKeyInputRef}
                type={showApiKey ? "text" : "password"}
                value={apiKeyInput}
                onChange={handleApiKeyChange}
                placeholder="Enter your API key"
                className={apiKeyInputClassName}
                style={{
                  borderColor: `${sectionColor}50`,
                  outlineColor: sectionColor
                }}
                autoComplete="off"
                data-1p-ignore="true"
                data-lpignore="true"
              />
              <button
                onClick={() => setShowApiKey(!showApiKey)}
                className={uiClass(UI_TYPOGRAPHY.compact, 'absolute right-5 top-1/2 -translate-y-1/2 transition-colors hover:text-white')}
                style={{
                  color: hoveredAction === 'show-edit' ? hoverSectionColor : sectionColor
                }}
                type="button"
                onMouseEnter={() => setHoveredAction('show-edit')}
                onMouseLeave={() => setHoveredAction(null)}
              >
                {showApiKey ? 'Hide' : 'Show'}
              </button>
            </div>
            <div className="flex gap-2">
                <button
                  onClick={handleApiKeySubmit}
                  className={uiClass(UI_CONTROLS.button, 'flex-1')}
                  style={getSectionButtonStyle('primary', hoveredAction === 'save-edit', isSaveEnabled)}
                  disabled={!isSaveEnabled}
                  onMouseEnter={() => setHoveredAction('save-edit')}
                  onMouseLeave={() => setHoveredAction(null)}
                >
                <Save className="w-2.5 h-2.5" />
                Save Key
              </button>
              {showCancelButton && (
                <button
                  onClick={handleCancelApiKeyEdit}
                  className={uiClass(UI_CONTROLS.subtleButton, 'flex-1')}
                  style={getSectionButtonStyle('secondary', hoveredAction === 'cancel-edit')}
                  type="button"
                  onMouseEnter={() => setHoveredAction('cancel-edit')}
                  onMouseLeave={() => setHoveredAction(null)}
                >
                  Cancel
                </button>
              )}
            </div>
            {!aiConfig.isCustomKey && !hasApiKey && (
              <p className={uiClass(UI_TYPOGRAPHY.tiny, 'text-gray-400')}>
                Add a Gemini or OpenAI key to generate styles and icons from this device.
              </p>
            )}
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
                    style={getSectionButtonStyle('secondary', hoveredAction === 'edit-saved')}
                    type="button"
                    onMouseEnter={() => setHoveredAction('edit-saved')}
                    onMouseLeave={() => setHoveredAction(null)}
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
            ) : isUsingStudioKey ? (
              <div className={uiClass(UI_CONTROLS.panelInset, UI_SPACING.sectionGap, 'px-3 py-3')} style={{ borderColor: `${sectionColor}50` }}>
                <p className={uiClass(UI_TYPOGRAPHY.compact, 'text-gray-300')}>
                  Using the connected Studio key for this device.
                </p>
                <button
                  onClick={() => setIsEditingApiKey(true)}
                  className={uiClass(UI_CONTROLS.subtleButton, 'w-full justify-center')}
                  style={getSectionButtonStyle('secondary', hoveredAction === 'use-custom')}
                  type="button"
                  onMouseEnter={() => setHoveredAction('use-custom')}
                  onMouseLeave={() => setHoveredAction(null)}
                >
                  Use Custom Key Instead
                </button>
              </div>
            ) : (
              <div className={apiKeyFormStackClassName}>
                <div className="relative">
                  <input
                    type={showApiKey ? 'text' : 'password'}
                    value={apiKeyInput}
                    onChange={handleApiKeyChange}
                    placeholder="Enter your API key"
                    className={apiKeyInputClassName}
                    style={{
                      borderColor: `${sectionColor}50`,
                      outlineColor: sectionColor
                    }}
                    autoComplete="off"
                    data-1p-ignore="true"
                    data-lpignore="true"
                  />
                  <button
                    onClick={() => setShowApiKey(!showApiKey)}
                    className={uiClass(UI_TYPOGRAPHY.compact, 'absolute right-5 top-1/2 -translate-y-1/2 transition-colors hover:text-white')}
                    style={{
                      color: hoveredAction === 'show-inline' ? hoverSectionColor : sectionColor
                    }}
                    type="button"
                    onMouseEnter={() => setHoveredAction('show-inline')}
                    onMouseLeave={() => setHoveredAction(null)}
                  >
                    {showApiKey ? 'Hide' : 'Show'}
                  </button>
                </div>
                <button
                  onClick={handleApiKeySubmit}
                  className={uiClass(UI_CONTROLS.button, 'w-full')}
                  style={getSectionButtonStyle('primary', hoveredAction === 'save-inline', isSaveEnabled)}
                  disabled={!isSaveEnabled}
                  onMouseEnter={() => setHoveredAction('save-inline')}
                  onMouseLeave={() => setHoveredAction(null)}
                >
                  <Save className="w-3 h-3" />
                  Save Key
                </button>
                <p className={uiClass(UI_TYPOGRAPHY.tiny, 'text-gray-400')}>
                  Add a Gemini or OpenAI key to generate styles and icons from this device.
                </p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default AiSettingsPanel;
