
import React from 'react';
import { Check, Trash2 } from 'lucide-react';
import { MapStylePreset } from '../../../types';

interface StyleLibraryProps {
  styles: MapStylePreset[];
  activeStyleId: string | null;
  onApplyStyle: (id: string) => void;
  onDeleteStyle: (id: string) => void;
}

const StyleLibrary: React.FC<StyleLibraryProps> = ({ styles, activeStyleId, onApplyStyle, onDeleteStyle }) => {
  return (
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
  );
};

export default StyleLibrary;
