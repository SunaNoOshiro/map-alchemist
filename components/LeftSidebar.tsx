
import React from 'react';
import { MapStylePreset, LogEntry, AppStatus } from '../types';
import { Trash2, Check, Terminal, Play, Download, Upload, Trash } from 'lucide-react';

interface LeftSidebarProps {
  isOpen: boolean;
  prompt: string;
  setPrompt: (s: string) => void;
  onGenerate: () => void;
  status: AppStatus;
  loadingMessage?: string;
  styles: MapStylePreset[];
  activeStyleId: string | null;
  onApplyStyle: (id: string) => void;
  onDeleteStyle: (id: string) => void;
  onExport: () => void;
  onImport: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onClear: () => void;
  logs: LogEntry[];
}

const LeftSidebar: React.FC<LeftSidebarProps> = ({
  isOpen,
  prompt,
  setPrompt,
  onGenerate,
  status,
  loadingMessage,
  styles,
  activeStyleId,
  onApplyStyle,
  onDeleteStyle,
  onExport,
  onImport,
  onClear,
  logs
}) => {
  const logRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    if (logRef.current) {
      logRef.current.scrollTop = logRef.current.scrollHeight;
    }
  }, [logs]);

  return (
    <div 
      className={`relative flex-shrink-0 bg-gray-900 border-r border-gray-700 flex flex-col h-full transition-all duration-300 ease-in-out ${isOpen ? 'w-80' : 'w-0 border-none'}`}
    >
      {/* Content wrapper to handle hiding content when width is 0 */}
      <div className={`flex flex-col h-full w-80 overflow-hidden ${!isOpen ? 'invisible' : 'visible'}`}>
        
        {/* Header */}
        <div className="p-4 border-b border-gray-800 flex-shrink-0">
          <h1 className="text-xl font-bold bg-gradient-to-r from-blue-400 to-purple-400 bg-clip-text text-transparent">
            MapAlchemist
          </h1>
          <p className="text-xs text-gray-500 mt-1">AI Map Style Generator</p>
        </div>

        {/* Prompt Area */}
        <div className="p-4 space-y-3 border-b border-gray-800 bg-gray-900/50 flex-shrink-0">
          <label className="block text-sm font-medium text-gray-300">New Style Prompt</label>
          <textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder="e.g., Cyberpunk neon night, cozy watercolor fantasy, matrix code..."
            className="w-full h-20 bg-gray-800 border border-gray-700 rounded-md p-3 text-sm text-gray-200 placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none transition-colors"
          />
          <button
            onClick={onGenerate}
            disabled={status !== AppStatus.IDLE || !prompt.trim()}
            className={`w-full py-2 px-4 rounded-md font-medium text-sm transition-all flex items-center justify-center gap-2
              ${status === AppStatus.GENERATING_STYLE 
                ? 'bg-blue-900 text-blue-200 cursor-not-allowed animate-pulse' 
                : 'bg-blue-600 hover:bg-blue-500 text-white shadow-lg shadow-blue-900/50'
              } disabled:opacity-50`}
          >
            {status === AppStatus.GENERATING_STYLE ? (
                <span className="truncate">{loadingMessage || 'Generating...'}</span>
            ) : (
              <>
                <Play size={16} /> Generate Theme
              </>
            )}
          </button>
        </div>

        {/* Saved Styles List */}
        <div className="flex-1 overflow-y-auto p-4 space-y-2 scrollbar-thin min-h-0">
          <div className="flex items-center justify-between mb-2">
              <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Style Library</h2>
              <span className="text-[10px] text-gray-600">{styles.length} Saved</span>
          </div>
          
          {styles.map((style) => (
            <div 
              key={style.id} 
              onClick={() => onApplyStyle(style.id)}
              className={`group p-3 rounded-lg border transition-all cursor-pointer ${
                activeStyleId === style.id 
                  ? 'bg-gray-800 border-blue-500/50 shadow-md transform scale-[1.02]' 
                  : 'bg-gray-800/30 border-gray-700/50 hover:border-gray-600 hover:bg-gray-800'
              }`}
            >
              <div className="flex justify-between items-start mb-1">
                <h3 className={`font-medium text-sm leading-tight pr-2 ${activeStyleId === style.id ? 'text-blue-400' : 'text-gray-300'}`}>
                  {style.name}
                </h3>
                {activeStyleId === style.id && <Check size={14} className="text-blue-500 flex-shrink-0" />}
              </div>
              
              <div className="flex items-center justify-between mt-2">
                 <span className="text-[10px] text-gray-500 truncate max-w-[120px]">
                  {new Date(style.createdAt).toLocaleDateString()}
                 </span>
                 <div className="flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                   <button 
                     onClick={(e) => { e.stopPropagation(); onDeleteStyle(style.id); }}
                     className="p-1.5 hover:bg-red-900/50 text-gray-500 hover:text-red-400 rounded transition-colors"
                     title="Delete Style"
                   >
                     <Trash2 size={12} />
                   </button>
                 </div>
              </div>
            </div>
          ))}
        </div>

        {/* Data Management Actions */}
        <div className="p-3 border-t border-gray-800 grid grid-cols-3 gap-2 bg-gray-900 flex-shrink-0">
            <button
                onClick={onExport}
                className="flex flex-col items-center justify-center p-2 bg-gray-800 hover:bg-gray-700 text-gray-400 hover:text-white rounded transition-colors"
                title="Export JSON"
            >
                <Download size={14} className="mb-1"/>
                <span className="text-[10px]">Export</span>
            </button>
            <label className="flex flex-col items-center justify-center p-2 bg-gray-800 hover:bg-gray-700 text-gray-400 hover:text-white rounded transition-colors cursor-pointer" title="Import JSON">
                <Upload size={14} className="mb-1"/>
                <span className="text-[10px]">Import</span>
                <input type="file" accept=".json" onChange={onImport} className="hidden" />
            </label>
            <button
                onClick={onClear}
                className="flex flex-col items-center justify-center p-2 bg-gray-800 hover:bg-red-900/30 text-gray-400 hover:text-red-400 rounded transition-colors"
                title="Reset All"
            >
                <Trash size={14} className="mb-1"/>
                <span className="text-[10px]">Clear</span>
            </button>
        </div>

        {/* Log Panel */}
        <div className="h-32 border-t border-gray-700 bg-black p-3 font-mono text-xs overflow-hidden flex flex-col flex-shrink-0">
          <div className="flex items-center gap-2 text-gray-500 mb-2">
              <Terminal size={12} />
              <span className="uppercase font-bold tracking-wider">System Log</span>
          </div>
          <div ref={logRef} className="flex-1 overflow-y-auto scrollbar-thin space-y-1">
              {logs.map((log) => (
                  <div key={log.id} className={`break-words leading-tight ${
                      log.type === 'error' ? 'text-red-400' : 
                      log.type === 'success' ? 'text-green-400' :
                      log.type === 'warning' ? 'text-yellow-400' : 'text-gray-400'
                  }`}>
                      <span className="opacity-40 mr-1">[{new Date(log.timestamp).toLocaleTimeString([], {hour12:false, hour:'2-digit', minute:'2-digit'})}]</span>
                      {log.message}
                  </div>
              ))}
              {logs.length === 0 && <span className="text-gray-700">Ready...</span>}
          </div>
        </div>
      </div>
    </div>
  );
};

export default LeftSidebar;
