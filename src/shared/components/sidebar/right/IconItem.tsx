
import React, { useState, useEffect, useRef } from 'react';
import { Wand2, Image as ImageIcon, X, Lock } from 'lucide-react';
import { IconDefinition } from '@/types';

interface IconItemProps {
    category: string;
    iconDef: IconDefinition | undefined;
    isSelected: boolean;
    onSelect: (cat: string | null) => void;
    onRegenerate: (cat: string, prompt: string) => void;
    isReadOnly?: boolean;
}

const IconItem: React.FC<IconItemProps> = ({
    category,
    iconDef,
    isSelected,
    onSelect,
    onRegenerate,
    isReadOnly
}) => {
    const [localPrompt, setLocalPrompt] = useState(iconDef?.prompt || '');
    const isLoading = iconDef?.isLoading;
    const textareaRef = useRef<HTMLTextAreaElement>(null);

    // Sync state when prop changes
    useEffect(() => {
        if (iconDef?.prompt) {
            setLocalPrompt(iconDef.prompt);
        }
    }, [iconDef]);

    // Auto-resize textarea
    useEffect(() => {
        if (isSelected && textareaRef.current) {
            textareaRef.current.style.height = 'auto';
            textareaRef.current.style.height = textareaRef.current.scrollHeight + 'px';
        }
    }, [localPrompt, isSelected]);

    const handleRegenerate = (e: React.MouseEvent) => {
        e.stopPropagation();
        if (isReadOnly) return;
        const p = localPrompt || `Icon for ${category}`;
        onRegenerate(category, p);
    };

    // --- EXPANDED VIEW (Selected) ---
    if (isSelected) {
        return (
            <div
                className="bg-gray-800 border border-blue-500/50 rounded-lg p-3 mb-2 shadow-lg transition-all relative"
                onClick={(e) => e.stopPropagation()}
            >
                <div className="flex justify-between items-start mb-2 pr-6">
                    <span className="text-sm font-bold text-blue-400">{category}</span>
                    <span className="text-[10px] text-gray-500 uppercase tracking-wider bg-gray-900 px-2 py-0.5 rounded">
                        Active
                    </span>
                </div>

                {/* Close Button */}
                <button
                    onClick={(e) => { e.stopPropagation(); onSelect(null); }}
                    className="absolute top-2 right-2 p-1 text-gray-500 hover:text-white bg-gray-900/50 hover:bg-gray-700 rounded-full transition-colors"
                    title="Close"
                >
                    <X size={14} />
                </button>

                {/* Large Preview with Checkerboard BG */}
                <div className="w-full aspect-square bg-gray-900 rounded-md border border-gray-700 flex items-center justify-center overflow-hidden mb-3 relative group"
                    style={{
                        backgroundImage: `linear-gradient(45deg, #1f2937 25%, transparent 25%), linear-gradient(-45deg, #1f2937 25%, transparent 25%), linear-gradient(45deg, transparent 75%, #1f2937 75%), linear-gradient(-45deg, transparent 75%, #1f2937 75%)`,
                        backgroundSize: '20px 20px',
                        backgroundPosition: '0 0, 0 10px, 10px -10px, -10px 0px'
                    }}
                >
                    {isLoading ? (
                        <div className="flex flex-col items-center gap-2 bg-gray-900/80 p-4 rounded-lg">
                            <Wand2 size={24} className="animate-spin text-blue-400" />
                            <span className="text-xs text-blue-400 animate-pulse">Designing...</span>
                        </div>
                    ) : iconDef?.imageUrl ? (
                        <img
                            src={iconDef.imageUrl}
                            alt={category}
                            className="w-full h-full object-contain p-4"
                        />
                    ) : (
                        <ImageIcon size={32} className="text-gray-600 opacity-30" />
                    )}
                </div>

                {/* Prompt Editing */}
                <div className="space-y-2">
                    <label className="text-[10px] text-gray-500 font-semibold uppercase">Art Direction Prompt</label>
                    {isReadOnly ? (
                        <div className="text-xs text-gray-400 italic bg-gray-900/50 p-2 rounded border border-gray-800">
                            {localPrompt || "No specific prompt set."}
                        </div>
                    ) : (
                        <textarea
                            ref={textareaRef}
                            value={localPrompt}
                            onChange={(e) => setLocalPrompt(e.target.value)}
                            className="w-full bg-gray-900 border border-gray-700 rounded p-2 text-xs text-gray-200 focus:border-blue-500 focus:outline-none resize-none min-h-[60px]"
                            placeholder={`Describe the ${category} icon...`}
                        />
                    )}
                </div>

                {/* Action Button */}
                <button
                    onClick={handleRegenerate}
                    disabled={isLoading || isReadOnly}
                    className={`w-full mt-3 py-2 rounded-md text-xs font-medium flex items-center justify-center gap-2 transition-all 
                    ${isReadOnly
                            ? 'bg-gray-800 text-gray-500 cursor-not-allowed border border-gray-700'
                            : 'bg-blue-600 hover:bg-blue-500 text-white disabled:opacity-50 disabled:cursor-not-allowed'
                        }`}
                >
                    {isReadOnly ? <Lock size={12} /> : <Wand2 size={14} className={isLoading ? 'animate-spin' : ''} />}
                    {isLoading ? 'Generating...' : isReadOnly ? 'Locked (Guest Mode)' : 'Regenerate Icon'}
                </button>
            </div>
        );
    }

    // --- COMPACT VIEW (Unselected) ---
    return (
        <div
            className="group flex items-center gap-3 p-2 rounded transition-all cursor-pointer border border-transparent hover:bg-gray-800/50 hover:border-gray-700"
            onClick={() => onSelect(category)}
        >
            {/* Small Thumb with Checkerboard */}
            <div className="w-9 h-9 flex-shrink-0 bg-gray-950 rounded border border-gray-700 flex items-center justify-center overflow-hidden"
                style={{
                    backgroundImage: `linear-gradient(45deg, #1f2937 25%, transparent 25%), linear-gradient(-45deg, #1f2937 25%, transparent 25%), linear-gradient(45deg, transparent 75%, #1f2937 75%), linear-gradient(-45deg, transparent 75%, #1f2937 75%)`,
                    backgroundSize: '10px 10px',
                    backgroundPosition: '0 0, 0 5px, 5px -5px, -5px 0px'
                }}
            >
                {isLoading ? (
                    <Wand2 size={12} className="animate-spin text-blue-400" />
                ) : iconDef?.imageUrl ? (
                    <img src={iconDef.imageUrl} alt={category} className="w-full h-full object-contain p-1" />
                ) : (
                    <ImageIcon size={14} className="text-gray-600 opacity-30" />
                )}
            </div>

            {/* Label */}
            <div className="flex-1 min-w-0">
                <span className="text-xs font-medium text-gray-300 group-hover:text-white transition-colors">
                    {category}
                </span>
            </div>

            {/* Quick Action */}
            {!isReadOnly && (
                <button
                    onClick={handleRegenerate}
                    disabled={isLoading}
                    className="p-2 text-gray-500 hover:text-blue-400 hover:bg-gray-700 rounded-full transition-all opacity-0 group-hover:opacity-100 disabled:opacity-30"
                    title="Quick Magic Regenerate"
                >
                    <Wand2 size={14} className={isLoading ? 'animate-spin' : ''} />
                </button>
            )}
        </div>
    );
};

export default IconItem;
