
import React, { useState } from 'react';
import { AlertCircle, Save } from 'lucide-react';

interface MapConfigErrorProps {
  error: string | null;
  onSaveKey: (key: string) => void;
}

const MapConfigError: React.FC<MapConfigErrorProps> = ({ error, onSaveKey }) => {
  const [inputKey, setInputKey] = useState('');

  return (
    <div className="absolute inset-0 z-50 flex items-center justify-center bg-gray-900 bg-opacity-95 p-6 text-center backdrop-blur-sm">
        <div className="max-w-md w-full bg-gray-800 p-6 rounded-xl border border-gray-700 shadow-2xl">
            <div className="flex justify-center mb-4">
                <AlertCircle className="text-red-400 w-10 h-10" />
            </div>
            <h3 className="text-xl font-bold text-white mb-2">Map Configuration Required</h3>
            <p className="text-gray-400 mb-6 text-sm">
                {error || "A valid Google Maps API Key is required to view the map."}
            </p>
            
            <div className="space-y-4">
                <div className="text-left">
                    <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">Enter Google Maps API Key</label>
                    <input 
                        type="text" 
                        value={inputKey}
                        onChange={(e) => setInputKey(e.target.value)}
                        placeholder="AIza..."
                        className="w-full bg-gray-900 border border-gray-600 rounded-lg px-4 py-2 text-white placeholder-gray-600 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    />
                    <p className="text-[10px] text-gray-500 mt-1">Key will be saved locally in your browser.</p>
                </div>
                <button 
                    onClick={() => onSaveKey(inputKey)}
                    disabled={!inputKey.trim()}
                    className="w-full flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-500 text-white font-medium py-2 px-4 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                    <Save size={16} /> Save & Reload
                </button>
            </div>
        </div>
    </div>
  );
};

export default MapConfigError;
