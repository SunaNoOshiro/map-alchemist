import React, { useState } from 'react';
import { BrainCircuit, ChevronDown, Key, Settings, Save } from 'lucide-react';
import { AiConfig } from '@/types';
import { getSectionColor } from '@/constants';

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
  const [apiKeyInput, setApiKeyInput] = useState(aiConfig.apiKey || '');
  const [showApiKey, setShowApiKey] = useState(false);
  const [isEditingApiKey, setIsEditingApiKey] = useState(false);
  const sectionColor = getSectionColor('ai-config'); // Blue for AI Configuration section

  const handleProviderSelect = (provider: AiConfig['provider']) => {
    onUpdateAiConfig({ provider });
    setIsProviderDropdownOpen(false);
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
    <div className="bg-gray-800/50 border rounded-lg p-3 space-y-3" style={{ borderColor: `${sectionColor}50` }}>
      <div className="flex items-center gap-2 text-[10px] text-gray-500">
        <BrainCircuit className="w-3 h-3" style={{ color: `${sectionColor}90` }} />
        <span className="uppercase tracking-widest">AI setup</span>
      </div>
      {/* Provider Selection */}
      <div className="space-y-1">
        <label className="text-xs text-gray-300 font-medium flex items-center gap-1">
          AI Provider
        </label>
        <div className="relative">
          <button
            onClick={() => setIsProviderDropdownOpen(!isProviderDropdownOpen)}
            className="w-full bg-gray-700 hover:bg-gray-600 border rounded px-2 py-1.5 text-left flex items-center justify-between transition-colors text-xs"
            style={{ borderColor: `${sectionColor}50`, color: '#d1d5db' }}
          >
            <span className="truncate">Google Gemini</span>
            <ChevronDown className="w-3 h-3 text-gray-400" />
          </button>

          {isProviderDropdownOpen && (
            <div className="absolute z-20 mt-1 w-full bg-gray-700 border rounded shadow-lg overflow-hidden" style={{ borderColor: `${sectionColor}50` }}>
              <div
                onClick={() => handleProviderSelect('google-gemini')}
                className="px-2 py-1.5 hover:bg-gray-600 cursor-pointer flex items-center gap-2 text-xs"
              >
                <span className="text-blue-400">●</span>
                Google Gemini
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Model Selection */}
      <div className="space-y-1">
        <label className="text-xs text-gray-300 font-medium flex items-center gap-1">
          AI Model
        </label>
        <div className="relative">
          <button
            onClick={() => setIsModelDropdownOpen(!isModelDropdownOpen)}
            className="w-full bg-gray-700 hover:bg-gray-600 border rounded px-2 py-1.5 text-left flex items-center justify-between transition-colors text-xs"
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
                  className="px-2 py-1.5 hover:bg-gray-600 cursor-pointer flex items-center gap-2 text-xs"
                >
                  {aiConfig.model === modelId && <span className="text-blue-400">●</span>}
                  {modelName}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* API Key Section */}
      <div className="space-y-1">
        <div className="flex items-center justify-between">
          <label className="text-xs text-gray-300 font-medium flex items-center gap-1">
            <Key className="w-3 h-3" style={{ color: sectionColor }} />
            API Key
          </label>
          {hasApiKey && !aiConfig.isCustomKey && (
            <span className="text-[10px] bg-green-900/50 text-green-300 px-1.5 py-0.5 rounded-full border" style={{ borderColor: '#16a34a50' }}>
              Connected via Studio
            </span>
          )}
        </div>

        {isEditingApiKey ? (
          <div className="space-y-1">
            <div className="relative">
              <input
                type={showApiKey ? "text" : "password"}
                value={apiKeyInput}
                onChange={handleApiKeyChange}
                placeholder="Enter your API key"
                className="w-full bg-gray-700 border rounded px-2 py-1.5 pr-8 text-xs focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-transparent"
                style={{
                  borderColor: `${sectionColor}50`,
                  outlineColor: sectionColor
                }}
              />
              <button
                onClick={() => setShowApiKey(!showApiKey)}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-300 text-[10px]"
              >
                {showApiKey ? 'Hide' : 'Show'}
              </button>
            </div>
            <div className="flex gap-1">
              <button
                onClick={handleApiKeySubmit}
                className="flex-1 text-white text-xs py-1 rounded flex items-center justify-center gap-1 transition-colors"
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
                className="flex-1 bg-gray-600 hover:bg-gray-500 text-white text-xs py-1 rounded transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <div className="space-y-1">
            {aiConfig.isCustomKey ? (
              <div className="bg-gray-700 border rounded px-2 py-1.5 text-xs flex items-center justify-between" style={{ borderColor: `${sectionColor}50` }}>
                <span className="truncate">••••••••••••{aiConfig.apiKey.slice(-4)}</span>
                <div className="flex gap-1 ml-1">
                  <button
                    onClick={() => setIsEditingApiKey(true)}
                    className="text-[10px] text-blue-400 hover:text-blue-300"
                  >
                    Edit
                  </button>
                  <button
                    onClick={() => onUpdateAiConfig({ apiKey: '', isCustomKey: false })}
                    className="text-[10px] text-red-400 hover:text-red-300"
                  >
                    Clear
                  </button>
                </div>
              </div>
            ) : (
              <div className="space-y-1">
                <button
                  onClick={handleConnectWithConfig}
                  className="w-full bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-500 hover:to-purple-500 text-white text-xs py-1.5 rounded flex items-center justify-center gap-1 transition-all"
                >
                  <Settings className="w-3 h-3" />
                  Connect API Key
                </button>
                <button
                  onClick={() => setIsEditingApiKey(true)}
                  className="w-full text-[10px] text-gray-400 hover:text-gray-300"
                >
                  Or enter manually...
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Current Configuration */}
      <div className="bg-gray-700/50 border rounded p-2 text-[10px]" style={{ borderColor: `${sectionColor}50` }}>
        <div className="flex items-center gap-1">
          <span className="text-gray-400">Current:</span>
          <span className="bg-gray-600 px-1.5 py-0.5 rounded text-gray-200">
            {availableModels[aiConfig.model] || aiConfig.model}
          </span>
          {aiConfig.isCustomKey && (
            <span className="bg-green-600 px-1.5 py-0.5 rounded text-green-100 text-[9px]">
              Custom Key
            </span>
          )}
          {hasApiKey && !aiConfig.isCustomKey && (
            <span className="bg-blue-600 px-1.5 py-0.5 rounded text-blue-100 text-[9px]">
              Studio Connected
            </span>
          )}
        </div>
      </div>
    </div>
  );
};

export default AiSettingsPanel;
