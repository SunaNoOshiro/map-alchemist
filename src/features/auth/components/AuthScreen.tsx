import React, { useEffect, useRef, useState } from 'react';
import { Sparkles, ArrowRight, ShieldCheck, Eye, ChevronDown, Key, BrainCircuit } from 'lucide-react';
import { AiConfig } from '@/types';
import { UI_CONTROLS, UI_SPACING, UI_TYPOGRAPHY, uiClass } from '@shared/styles/uiTokens';

interface AuthScreenProps {
  onConnect: () => void;
  onGuestAccess: () => void;
  aiConfig: AiConfig;
  availableModels: Record<string, string>;
  onUpdateAiConfig: (config: Partial<AiConfig>) => void;
}

const AuthScreen: React.FC<AuthScreenProps> = ({ onConnect, onGuestAccess, aiConfig, availableModels, onUpdateAiConfig }) => {
  const [isProviderDropdownOpen, setIsProviderDropdownOpen] = useState(false);
  const [isModelDropdownOpen, setIsModelDropdownOpen] = useState(false);
  const [apiKeyInput, setApiKeyInput] = useState(aiConfig.apiKey || '');
  const [showApiKey, setShowApiKey] = useState(false);
  const providerDropdownRef = useRef<HTMLDivElement>(null);
  const modelDropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isProviderDropdownOpen && !isModelDropdownOpen) {
      return;
    }

    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target as Node | null;
      const isInsideProvider = providerDropdownRef.current?.contains(target ?? null);
      const isInsideModel = modelDropdownRef.current?.contains(target ?? null);

      if (!isInsideProvider && !isInsideModel) {
        setIsProviderDropdownOpen(false);
        setIsModelDropdownOpen(false);
      }
    };

    const handleFocusIn = (event: FocusEvent) => {
      const target = event.target as Node | null;
      const isInsideProvider = providerDropdownRef.current?.contains(target ?? null);
      const isInsideModel = modelDropdownRef.current?.contains(target ?? null);

      if (!isInsideProvider && !isInsideModel) {
        setIsProviderDropdownOpen(false);
        setIsModelDropdownOpen(false);
      }
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsProviderDropdownOpen(false);
        setIsModelDropdownOpen(false);
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
  }, [isModelDropdownOpen, isProviderDropdownOpen]);

  const handleProviderSelect = (provider: AiConfig['provider']) => {
    onUpdateAiConfig({ provider, model: Object.keys(availableModels)[0] || 'gemini-2.5-flash' });
    setIsProviderDropdownOpen(false);
  };

  const handleProviderToggle = () => {
    setIsProviderDropdownOpen((prev) => {
      const next = !prev;
      if (next) {
        setIsModelDropdownOpen(false);
      }
      return next;
    });
  };

  const handleModelToggle = () => {
    setIsModelDropdownOpen((prev) => {
      const next = !prev;
      if (next) {
        setIsProviderDropdownOpen(false);
      }
      return next;
    });
  };

  const handleModelSelect = (model: string) => {
    onUpdateAiConfig({ model });
    setIsModelDropdownOpen(false);
  };

  const handleApiKeyChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setApiKeyInput(e.target.value);
  };

  const handleApiKeySubmit = () => {
    onUpdateAiConfig({ apiKey: apiKeyInput, isCustomKey: true });
  };

  const handleConnectWithConfig = () => {
    if (apiKeyInput.trim()) {
      handleApiKeySubmit();
    }
    onConnect();
  };

  return (
    <div className="flex items-center justify-center min-h-screen w-screen bg-gray-900 text-white relative overflow-y-auto px-4 py-6">
      {/* Background Animation */}
      <div className="absolute top-0 left-0 w-full h-full opacity-10 pointer-events-none">
        <div className="absolute top-[-20%] left-[-20%] w-[60%] h-[60%] bg-blue-600 rounded-full blur-[150px]" />
        <div className="absolute bottom-[-20%] right-[-20%] w-[60%] h-[60%] bg-purple-600 rounded-full blur-[150px]" />
      </div>

      <div className="relative z-10 text-center space-y-6 w-full max-w-2xl p-6 bg-gray-800/80 backdrop-blur-md rounded-2xl shadow-2xl border border-gray-700">
        <div className="flex justify-center mb-4">
          <div className="p-4 bg-gray-700/50 rounded-full border border-gray-600">
            <Sparkles className="w-12 h-12 text-blue-400" />
          </div>
        </div>

        <div>
          <h1 className={uiClass('bg-gradient-to-r from-blue-400 via-purple-400 to-pink-400 bg-clip-text text-transparent mb-2', UI_TYPOGRAPHY.appTitle)}>
            MapAlchemist
          </h1>
          <p className={uiClass(UI_TYPOGRAPHY.body, 'text-gray-300 font-light')}>
            AI-Powered Map Style & Icon Generator
          </p>
        </div>

        {/* AI Configuration Section */}
        <div className={uiClass('bg-gray-800/50 border border-gray-700 rounded-lg', UI_SPACING.panelLarge, 'space-y-4')}>
          <h3 className={uiClass(UI_TYPOGRAPHY.sectionLabel, 'text-gray-200 flex items-center gap-2')}>
            <BrainCircuit className="w-4 h-4" />
            AI Configuration
          </h3>

          {/* Provider Selection */}
          <div className={UI_SPACING.blockGapTight}>
            <label className={uiClass(UI_TYPOGRAPHY.fieldLabel, 'text-gray-300 flex items-center gap-1')}>
              AI Provider
            </label>
            <div className="relative" ref={providerDropdownRef}>
              <button
                onClick={handleProviderToggle}
                className={UI_CONTROLS.dropdownTrigger}
              >
                <span className="truncate">Google Gemini</span>
                <ChevronDown className="w-4 h-4 text-gray-400" />
              </button>

              {isProviderDropdownOpen && (
                <div className="absolute z-20 mt-1 w-full bg-gray-700 border border-gray-600 rounded-lg shadow-lg overflow-hidden">
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
          <div className={UI_SPACING.blockGapTight}>
            <label className={uiClass(UI_TYPOGRAPHY.fieldLabel, 'text-gray-300 flex items-center gap-1')}>
              AI Model
            </label>
            <div className="relative" ref={modelDropdownRef}>
              <button
                onClick={handleModelToggle}
                className={UI_CONTROLS.dropdownTrigger}
              >
                <span className="truncate">{availableModels[aiConfig.model] || aiConfig.model}</span>
                <ChevronDown className="w-4 h-4 text-gray-400" />
              </button>

              {isModelDropdownOpen && (
                <div className="absolute z-20 mt-1 w-full bg-gray-700 border border-gray-600 rounded-lg shadow-lg overflow-hidden max-h-48 overflow-y-auto">
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

          {/* API Key Input */}
          <div className={UI_SPACING.blockGapTight}>
            <label className={uiClass(UI_TYPOGRAPHY.fieldLabel, 'text-gray-300 font-medium flex items-center gap-1')}>
              <Key className="w-4 h-4" />
              API Key
            </label>
            <div className="relative">
              <input
                type={showApiKey ? "text" : "password"}
                value={apiKeyInput}
                onChange={handleApiKeyChange}
                placeholder="Enter your API key or use Studio connection"
                className={uiClass(UI_CONTROLS.input, 'pr-14 border-gray-600')}
              />
              <button
                onClick={() => setShowApiKey(!showApiKey)}
                className={uiClass(UI_TYPOGRAPHY.compact, 'absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-300')}
              >
                {showApiKey ? 'Hide' : 'Show'}
              </button>
            </div>
            {apiKeyInput && (
              <button
                onClick={handleApiKeySubmit}
                className={uiClass(UI_TYPOGRAPHY.compact, 'text-blue-400 hover:text-blue-300 hover:underline mt-1')}
              >
                Save API Key
              </button>
            )}
          </div>
        </div>

        <div className={uiClass('bg-blue-900/20 border border-blue-800/50 p-4 rounded-lg text-left', UI_SPACING.blockGapTight)}>
           <div className="flex items-start gap-3">
             <ShieldCheck className="w-5 h-5 text-blue-400 flex-shrink-0 mt-0.5" />
             <p className={uiClass(UI_TYPOGRAPHY.body, 'text-blue-200')}>
               Connect your Google Cloud Project to generate custom maps and assets with Gemini Pro.
             </p>
           </div>
        </div>

        <div className="space-y-4">
          <button
            onClick={handleConnectWithConfig}
            className={uiClass(UI_CONTROLS.button, 'w-full h-10 group relative bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-500 hover:to-purple-500 rounded-xl text-white shadow-lg shadow-blue-900/40 transition-all hover:scale-[1.02] active:scale-[0.98] normal-case tracking-normal text-sm font-semibold')}
          >
            <span>Connect API Key</span>
            <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
          </button>

          <button
            onClick={onGuestAccess}
            className={uiClass(UI_CONTROLS.button, 'w-full h-10 bg-gray-700/50 hover:bg-gray-700 rounded-xl normal-case tracking-normal text-sm font-medium text-gray-300 hover:text-white border-transparent')}
          >
            <Eye className="w-4 h-4" />
            <span>Continue as Guest (View Only)</span>
          </button>

          <p className={uiClass(UI_TYPOGRAPHY.compact, 'text-gray-500')}>
            <a href="https://ai.google.dev/gemini-api/docs/billing" target="_blank" rel="noreferrer" className={uiClass(UI_TYPOGRAPHY.compact, 'text-blue-400 hover:text-blue-300 hover:underline transition-colors mt-1 inline-block')}>
              Billing Documentation
            </a>
          </p>
        </div>
      </div>
    </div>
  );
};

export default AuthScreen;
