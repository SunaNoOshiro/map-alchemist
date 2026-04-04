
import React, { useEffect, useRef, useState } from 'react';
import { ChevronDown, Palette, Settings2, Sparkles } from 'lucide-react';
import { AppStatus, MapStylePreset } from '@/types';
import { UI_CONTROLS, UI_TYPOGRAPHY, uiClass } from '@shared/styles/uiTokens';

interface TopToolbarProps {
  styles: MapStylePreset[];
  activeStyleId: string | null;
  onSelectStyle: (id: string) => void;
  status: AppStatus;
  isLeftSidebarOpen: boolean;
  isRightSidebarOpen: boolean;
  onToggleLeftSidebar: () => void;
  onToggleRightSidebar: () => void;
}

const TopToolbar: React.FC<TopToolbarProps> = ({
  styles,
  activeStyleId,
  onSelectStyle,
  status,
  isLeftSidebarOpen,
  isRightSidebarOpen,
  onToggleLeftSidebar,
  onToggleRightSidebar
}) => {
  const [isStyleMenuOpen, setIsStyleMenuOpen] = useState(false);
  const activeStyle = styles.find((style) => style.id === activeStyleId);
  const styleMenuRef = useRef<HTMLDivElement>(null);
  const sidebarToggleClass = uiClass(UI_CONTROLS.button, 'bg-gray-800');
  const styleTriggerClass = uiClass(
    UI_CONTROLS.dropdownTrigger,
    'bg-gray-800 border-gray-700 hover:bg-gray-700 disabled:cursor-not-allowed disabled:opacity-50'
  );

  useEffect(() => {
    if (!isStyleMenuOpen) {
      return;
    }

    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target as Node | null;
      if (styleMenuRef.current && target && !styleMenuRef.current.contains(target)) {
        setIsStyleMenuOpen(false);
      }
    };

    const handleFocusIn = (event: FocusEvent) => {
      const target = event.target as Node | null;
      if (styleMenuRef.current && target && !styleMenuRef.current.contains(target)) {
        setIsStyleMenuOpen(false);
      }
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsStyleMenuOpen(false);
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
  }, [isStyleMenuOpen]);

  return (
    <div className="min-h-[4rem] bg-gray-900 border-b border-gray-700 flex flex-col gap-2 px-4 py-2 sm:flex-row sm:items-center sm:justify-center sm:gap-2 relative z-20 shadow-md flex-shrink-0">
      <div className="order-2 flex w-full items-center gap-2 sm:hidden">
        {!isLeftSidebarOpen && (
          <button
            type="button"
            onClick={onToggleLeftSidebar}
            className={uiClass(sidebarToggleClass, 'flex-1')}
            aria-label="Open setup panel"
          >
            <Settings2 size={14} className="text-blue-300" />
            Setup
          </button>
        )}
        {!isRightSidebarOpen && (
          <button
            type="button"
            onClick={onToggleRightSidebar}
            data-testid="open-icons-sidebar"
            className={uiClass(sidebarToggleClass, 'flex-1')}
            aria-label="Open icon generation panel"
          >
            <Sparkles size={14} className="text-purple-300" />
            Icons
          </button>
        )}
      </div>

      <div className="hidden sm:flex items-center gap-2 order-1">
        {!isLeftSidebarOpen && (
          <button
            type="button"
            onClick={onToggleLeftSidebar}
            className={sidebarToggleClass}
            aria-label="Open setup panel"
          >
            <Settings2 size={14} className="text-blue-300" />
            Setup
          </button>
        )}
      </div>

      {/* Center: Active Style Selector */}
      <div className="flex flex-1 flex-col gap-2 sm:flex-row sm:items-center sm:justify-center order-1 sm:order-2 sm:flex-none sm:w-72">
        <div className="flex items-center gap-2">
          <Palette size={14} className="text-blue-400" />
          <label className={uiClass(UI_TYPOGRAPHY.actionCaps, 'text-blue-400')}>Active Map Theme</label>
        </div>
        <div className="relative w-full sm:w-64" ref={styleMenuRef}>
          <button
            type="button"
            onClick={() => setIsStyleMenuOpen(!isStyleMenuOpen)}
            disabled={status !== AppStatus.IDLE}
            className={styleTriggerClass}
            data-testid="active-style-trigger"
          >
            <span className="truncate">{activeStyle?.name || 'Select a style'}</span>
            <ChevronDown className="w-3 h-3 text-gray-400" />
          </button>

          {isStyleMenuOpen && (
            <div className="absolute z-30 mt-1 w-full bg-gray-800 border border-gray-700 rounded shadow-lg overflow-hidden max-h-52 overflow-y-auto divide-y divide-gray-700/80">
              {styles.map((style) => {
                const isActive = style.id === activeStyleId;
                return (
                  <button
                    key={style.id}
                    type="button"
                    onClick={() => {
                      onSelectStyle(style.id);
                      setIsStyleMenuOpen(false);
                    }}
                    className={uiClass('w-full px-3 py-2 text-left transition-colors flex items-center gap-2 font-medium', UI_TYPOGRAPHY.compact,
                      isActive
                        ? 'bg-gray-700 text-white'
                        : 'text-gray-200 hover:bg-gray-700'
                    )}
                  >
                    {isActive && <span className="text-blue-400">●</span>}
                    <span className="truncate">{style.name}</span>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>

      <div className="hidden sm:flex items-center gap-2 order-3">
        {!isRightSidebarOpen && (
          <button
            type="button"
            onClick={onToggleRightSidebar}
            data-testid="open-icons-sidebar"
            className={sidebarToggleClass}
            aria-label="Open icon generation panel"
          >
            <Sparkles size={14} className="text-purple-300" />
            Icons
          </button>
        )}
      </div>

      {/* Right: Status */}
      <div className="w-full sm:w-32 flex justify-start sm:justify-end order-4">
        {status !== AppStatus.IDLE && (
          <div className={uiClass('flex items-center gap-2 animate-pulse bg-blue-900/20 px-3 py-1 rounded-full border border-blue-900/50 whitespace-nowrap text-blue-400', UI_TYPOGRAPHY.compact)}>
            <div className="w-2 h-2 bg-blue-400 rounded-full"></div>
            {status === AppStatus.GENERATING_STYLE && 'Building...'}
            {status === AppStatus.GENERATING_ICON && 'Designing...'}
          </div>
        )}
      </div>

    </div>
  );
};

export default TopToolbar;
