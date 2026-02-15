
import React from 'react';
import { MapStylePreset } from '@/types';
import { getSectionColor } from '@/constants';
import { UI_TYPOGRAPHY, uiClass } from '@shared/styles/uiTokens';

interface StyleLibraryProps {
  styles: MapStylePreset[];
  activeStyleId: string | null;
  onApplyStyle: (id: string) => void;
  onDeleteStyle: (id: string) => void;
}

const StyleLibrary: React.FC<StyleLibraryProps> = ({ styles, activeStyleId, onApplyStyle, onDeleteStyle }) => {
  const sectionColor = getSectionColor('theme-library'); // Green for Theme Library section

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between mb-2">
        <span className={uiClass(UI_TYPOGRAPHY.tiny, 'text-gray-500')}>Saved styles</span>
        <span className={uiClass(UI_TYPOGRAPHY.tiny, 'text-gray-600')}>{styles.length} Saved</span>
      </div>

      <div className="space-y-1 max-h-64 overflow-y-auto scrollbar-thin">
        {styles.map((style) => {
          const isActive = activeStyleId === style.id;

          return (
            <div
              key={style.id}
              onClick={() => onApplyStyle(style.id)}
              className={uiClass(
                'group relative rounded-md border p-2.5 transition-colors cursor-pointer',
                isActive ? 'bg-gray-800/80' : 'bg-gray-900/40 hover:bg-gray-800/60'
              )}
              style={{
                borderColor: isActive ? `${sectionColor}55` : `${sectionColor}25`,
                boxShadow: isActive ? `inset 0 0 0 1px ${sectionColor}22` : 'none',
              }}
            >
              {isActive && (
                <span
                  className="absolute left-0 top-1 bottom-1 w-0.5 rounded-full"
                  style={{ backgroundColor: sectionColor }}
                  aria-hidden="true"
                />
              )}
              <div className="flex items-start justify-between gap-2 pl-1">
                <div className="flex-1 min-w-0">
                  <h3 className={uiClass('font-semibold leading-tight text-gray-200', UI_TYPOGRAPHY.compact)}>
                    {style.name}
                  </h3>
                  <span className={uiClass(UI_TYPOGRAPHY.tiny, 'text-gray-500 truncate max-w-[120px] block mt-0.5')}>
                    {new Date(style.createdAt).toLocaleDateString()}
                  </span>
                </div>
                <div className="flex items-center gap-1 ml-1">
                  <button
                    onClick={(e) => { e.stopPropagation(); onDeleteStyle(style.id); }}
                    className={uiClass(
                      UI_TYPOGRAPHY.tiny,
                      'inline-flex h-6 items-center rounded border px-2 transition-colors',
                      isActive
                        ? 'border-gray-600 text-gray-300 hover:border-red-500/50 hover:bg-red-500/10 hover:text-red-300'
                        : 'border-transparent text-gray-500 opacity-0 group-hover:opacity-100 hover:border-red-500/40 hover:bg-red-500/10 hover:text-red-300'
                    )}
                    title="Delete Style"
                    type="button"
                  >
                    Delete
                  </button>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default StyleLibrary;
