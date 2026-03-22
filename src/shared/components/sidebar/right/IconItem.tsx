
import React, { useState, useEffect, useRef } from 'react';
import { Wand2, Image as ImageIcon, X, Lock } from 'lucide-react';
import { IconDefinition } from '@/types';
import { getCategoryColor } from '@/constants';
import { UI_CONTROLS, UI_TYPOGRAPHY, uiClass } from '@shared/styles/uiTokens';
import SidebarVisibilityActions from '../common/SidebarVisibilityActions';

interface IconItemProps {
    category: string;
    iconDef: IconDefinition | undefined;
    isSelected: boolean;
    onSelect: (cat: string | null) => void;
    onRegenerate: (cat: string, prompt: string) => void;
    isReadOnly?: boolean;
    mapVisibilityState?: {
        isVisible: boolean;
        isIsolated?: boolean;
        onToggle: () => void;
        onShowOnly: () => void;
    };
}

const IconItem: React.FC<IconItemProps> = ({
    category,
    iconDef,
    isSelected,
    onSelect,
    onRegenerate,
    isReadOnly,
    mapVisibilityState
}) => {
    const [localPrompt, setLocalPrompt] = useState(iconDef?.prompt || '');
    const isLoading = iconDef?.isLoading;
    const textareaRef = useRef<HTMLTextAreaElement>(null);
    const testId = `icon-item-${category.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`;

    // Sync state when prop changes
    useEffect(() => {
        if (iconDef?.prompt) {
            setLocalPrompt(iconDef.prompt);
        }
    }, [iconDef]);

    // Auto-resize textarea with a max height to keep the selected card fully visible
    useEffect(() => {
        if (isSelected && textareaRef.current) {
            const maxHeight = 80;
            textareaRef.current.style.height = 'auto';
            const nextHeight = Math.min(textareaRef.current.scrollHeight, maxHeight);
            textareaRef.current.style.height = `${nextHeight}px`;
            textareaRef.current.style.overflowY = textareaRef.current.scrollHeight > maxHeight ? 'auto' : 'hidden';
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
        // Get section color based on category group
        const sectionColor = getCategoryColor(category) || '#6366f1'; // Default to blue

        return (
            <div
                data-testid={testId}
                className="bg-gray-800 border rounded-lg p-3 mb-2 shadow-lg transition-all relative max-h-[520px] overflow-hidden"
                style={{ borderColor: `${sectionColor}50` }} // 50% opacity
                onClick={(e) => e.stopPropagation()}
            >
                <div className="flex justify-between items-start mb-2 pr-8 gap-3">
                    <div className="min-w-0">
                        <span className={uiClass(UI_TYPOGRAPHY.subheading)} style={{ color: sectionColor }}>{category}</span>
                    </div>
                    {mapVisibilityState && (
                        <SidebarVisibilityActions
                            isVisible={mapVisibilityState.isVisible}
                            isIsolated={mapVisibilityState.isIsolated}
                            onToggle={mapVisibilityState.onToggle}
                            onShowOnly={mapVisibilityState.onShowOnly}
                            entityLabel={category}
                            toggleTestId={`icon-map-subcategory-eye-${category.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`}
                            isolateTestId={`icon-map-subcategory-only-${category.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`}
                        />
                    )}
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
                <div className="w-full h-32 bg-gray-900 rounded-md border flex items-center justify-center overflow-hidden mb-2 relative group"
                    style={{
                        backgroundImage: `linear-gradient(45deg, #1f2937 25%, transparent 25%), linear-gradient(-45deg, #1f2937 25%, transparent 25%), linear-gradient(45deg, transparent 75%, #1f2937 75%), linear-gradient(-45deg, transparent 75%, #1f2937 75%)`,
                        backgroundSize: '20px 20px',
                        backgroundPosition: '0 0, 0 10px, 10px -10px, -10px 0px',
                        borderColor: `${sectionColor}50`
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
                <div className="space-y-1">
                    <label className={uiClass(UI_TYPOGRAPHY.tiny, 'text-gray-500 font-semibold uppercase')}>Art Direction Prompt</label>
                    {isReadOnly ? (
                        <div className={uiClass(UI_TYPOGRAPHY.compact, 'text-gray-400 italic bg-gray-900/50 p-2 rounded border max-h-16 overflow-y-auto')} style={{ borderColor: `${sectionColor}50` }}>
                            {localPrompt || "No specific prompt set."}
                        </div>
                    ) : (
                        <textarea
                            ref={textareaRef}
                            value={localPrompt}
                            onChange={(e) => setLocalPrompt(e.target.value)}
                            className={uiClass(UI_CONTROLS.textarea, 'bg-gray-900 min-h-[52px] max-h-24')}
                            style={{
                                borderColor: `${sectionColor}50`,
                                outlineColor: sectionColor
                            }}
                            placeholder={`Describe the ${category} icon...`}
                        />
                    )}
                </div>

                {/* Action Button */}
                <button
                    onClick={handleRegenerate}
                    disabled={isLoading || isReadOnly}
                    className={uiClass(UI_CONTROLS.button, 'w-full mt-2 normal-case tracking-normal text-xs')}
                    style={{
                        backgroundColor: isReadOnly ? '#27272a' : sectionColor,
                        borderColor: `${sectionColor}50`,
                        color: isReadOnly ? '#71717a' : 'white'
                    }}
                >
                    {isReadOnly ? <Lock size={12} /> : <Wand2 size={14} className={isLoading ? 'animate-spin' : ''} />}
                    {isLoading ? 'Generating...' : isReadOnly ? 'Locked (Guest Mode)' : 'Regenerate Icon'}
                </button>
            </div>
        );
    }

    // --- COMPACT VIEW (Unselected) ---
    // Get section color based on category group
    const sectionColor = getCategoryColor(category) || '#6366f1'; // Default to blue

    return (
        <div
            data-testid={testId}
            className="group flex items-center gap-3 p-2 rounded-md transition-all cursor-pointer border border-transparent hover:bg-gray-800/50"
            style={{ borderColor: `${sectionColor}50` }}
            onClick={() => onSelect(category)}
        >
            {/* Small Thumb with Checkerboard */}
            <div className="w-9 h-9 flex-shrink-0 bg-gray-950 rounded border flex items-center justify-center overflow-hidden"
                style={{
                    backgroundImage: `linear-gradient(45deg, #1f2937 25%, transparent 25%), linear-gradient(-45deg, #1f2937 25%, transparent 25%), linear-gradient(45deg, transparent 75%, #1f2937 75%), linear-gradient(-45deg, transparent 75%, #1f2937 75%)`,
                    backgroundSize: '10px 10px',
                    backgroundPosition: '0 0, 0 5px, 5px -5px, -5px 0px',
                    borderColor: `${sectionColor}50`
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
                <span className={uiClass(UI_TYPOGRAPHY.compact, 'font-medium text-gray-300 group-hover:text-white transition-colors')}>
                    {category}
                </span>
            </div>

            <div className="flex items-center gap-1">
                {mapVisibilityState && (
                    <SidebarVisibilityActions
                        isVisible={mapVisibilityState.isVisible}
                        isIsolated={mapVisibilityState.isIsolated}
                        onToggle={mapVisibilityState.onToggle}
                        onShowOnly={mapVisibilityState.onShowOnly}
                        entityLabel={category}
                        toggleTestId={`icon-map-subcategory-eye-${category.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`}
                        isolateTestId={`icon-map-subcategory-only-${category.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`}
                    />
                )}

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
        </div>
    );
};

export default IconItem;
