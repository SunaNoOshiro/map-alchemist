
import React from 'react';
import { Sparkles, ArrowRight, ShieldCheck } from 'lucide-react';

interface AuthScreenProps {
  onConnect: () => void;
}

const AuthScreen: React.FC<AuthScreenProps> = ({ onConnect }) => {
  return (
    <div className="flex items-center justify-center h-screen w-screen bg-gray-900 text-white relative overflow-hidden">
      {/* Background Animation */}
      <div className="absolute top-0 left-0 w-full h-full opacity-10 pointer-events-none">
        <div className="absolute top-[-20%] left-[-20%] w-[60%] h-[60%] bg-blue-600 rounded-full blur-[150px]" />
        <div className="absolute bottom-[-20%] right-[-20%] w-[60%] h-[60%] bg-purple-600 rounded-full blur-[150px]" />
      </div>

      <div className="relative z-10 text-center space-y-8 p-12 bg-gray-800/80 backdrop-blur-md rounded-2xl shadow-2xl max-w-lg border border-gray-700">
        <div className="flex justify-center mb-4">
          <div className="p-4 bg-gray-700/50 rounded-full border border-gray-600">
            <Sparkles className="w-12 h-12 text-blue-400" />
          </div>
        </div>
        
        <div>
          <h1 className="text-4xl font-extrabold bg-gradient-to-r from-blue-400 via-purple-400 to-pink-400 bg-clip-text text-transparent mb-2">
            MapAlchemist
          </h1>
          <p className="text-lg text-gray-300 font-light">
            AI-Powered Map Style & Icon Generator
          </p>
        </div>

        <div className="bg-blue-900/20 border border-blue-800/50 p-4 rounded-lg text-left space-y-2">
           <div className="flex items-start gap-3">
             <ShieldCheck className="w-5 h-5 text-blue-400 flex-shrink-0 mt-0.5" />
             <p className="text-sm text-blue-200">
               Connect your Google Cloud Project to generate custom maps and assets with Gemini Pro.
             </p>
           </div>
        </div>

        <div className="space-y-4">
          <button 
            onClick={onConnect}
            className="w-full group relative px-8 py-4 bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-500 hover:to-purple-500 rounded-xl font-bold text-white shadow-lg shadow-blue-900/40 transition-all hover:scale-[1.02] active:scale-[0.98] flex items-center justify-center gap-3"
          >
            <span>Connect API Key</span>
            <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
          </button>
          
          <p className="text-xs text-gray-500">
            <a href="https://ai.google.dev/gemini-api/docs/billing" target="_blank" rel="noreferrer" className="text-blue-400 hover:text-blue-300 hover:underline transition-colors mt-1 inline-block">
              Billing Documentation
            </a>
          </p>
        </div>
      </div>
    </div>
  );
};

export default AuthScreen;
