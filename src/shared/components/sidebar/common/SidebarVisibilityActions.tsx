import React from 'react';
import { Eye, EyeOff, Focus } from 'lucide-react';
import { UI_CONTROLS, uiClass } from '@shared/styles/uiTokens';

interface SidebarVisibilityActionsProps {
  isVisible: boolean;
  isIsolated?: boolean;
  onToggle: () => void;
  onShowOnly: () => void;
  entityLabel: string;
  toggleTestId?: string;
  isolateTestId?: string;
}

const actionButtonClass = (active: boolean) => uiClass(
  UI_CONTROLS.iconButton,
  active
    ? 'border-gray-500 bg-gray-800 text-gray-100 shadow-[inset_0_0_0_1px_rgba(255,255,255,0.03)]'
    : 'border-gray-700 bg-gray-900/70 text-gray-400'
);

const SidebarVisibilityActions: React.FC<SidebarVisibilityActionsProps> = ({
  isVisible,
  isIsolated = false,
  onToggle,
  onShowOnly,
  entityLabel,
  toggleTestId,
  isolateTestId
}) => (
  <div className="flex items-center gap-1">
    <button
      type="button"
      data-testid={toggleTestId}
      onClick={(event) => {
        event.stopPropagation();
        onToggle();
      }}
      className={actionButtonClass(isVisible)}
      aria-label={isVisible ? `Hide ${entityLabel} on the map` : `Show ${entityLabel} on the map`}
      title={isVisible ? `Hide ${entityLabel} on the map` : `Show ${entityLabel} on the map`}
    >
      {isVisible ? <Eye size={14} /> : <EyeOff size={14} />}
    </button>
    <button
      type="button"
      data-testid={isolateTestId}
      onClick={(event) => {
        event.stopPropagation();
        onShowOnly();
      }}
      className={uiClass(
        UI_CONTROLS.iconButton,
        isIsolated
          ? 'border-gray-500 bg-gray-800 text-gray-100 shadow-[inset_0_0_0_1px_rgba(255,255,255,0.03)]'
          : 'border-gray-700 bg-gray-900/70 text-gray-400 hover:bg-gray-800 hover:text-white'
      )}
      aria-label={isIsolated ? `Restore previous map visibility after isolating ${entityLabel}` : `Show only ${entityLabel} on the map`}
      title={isIsolated ? `Restore previous map visibility` : `Show only ${entityLabel} on the map`}
    >
      <Focus size={14} />
    </button>
  </div>
);

export default SidebarVisibilityActions;
