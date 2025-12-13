
import React from 'react';
import { AlertCircle } from 'lucide-react';

interface MapConfigErrorProps {
  error: string | null;
  onSaveKey: (key: string) => void;
}

const MapConfigError: React.FC<MapConfigErrorProps> = ({ error, onSaveKey }) => {
  // Currently unused with MapLibre free tiles, but good to keep for generic errors
  return (
    <div className="absolute inset-0 z-50 flex items-center justify-center bg-gray-900 bg-opacity-95 p-6 text-center backdrop-blur-sm">
        <div className="max-w-md w-full bg-gray-800 p-6 rounded-xl border border-gray-700 shadow-2xl">
            <div className="flex justify-center mb-4">
                <AlertCircle className="text-red-400 w-10 h-10" />
            </div>
            <h3 className="text-xl font-bold text-white mb-2">Map Error</h3>
            <p className="text-gray-400 mb-6 text-sm">
                {error || "An unexpected error occurred loading the map."}
            </p>
        </div>
    </div>
  );
};

export default MapConfigError;
