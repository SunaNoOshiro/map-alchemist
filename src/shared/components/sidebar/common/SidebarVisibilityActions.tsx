import React from 'react';
import { Eye, EyeOff, Focus } from 'lucide-react';
import { UI_CONTROLS, uiClass } from '@shared/styles/uiTokens';

interface SidebarVisibilityActionsProps {
  isVisible: boolean;
  isIsolated?: boolean;
  onToggle: () => void;
  onShowOnly: () => void;
  entityLabel: string;
  accentColor?: string;
  toggleTestId?: string;
  isolateTestId?: string;
}

type AccentButtonStyle = React.CSSProperties & {
  '--sidebar-action-accent'?: string;
  '--sidebar-action-border'?: string;
  '--sidebar-action-bg'?: string;
  '--sidebar-action-text'?: string;
};

const actionButtonClass = (active: boolean, accentColor?: string) => uiClass(
  UI_CONTROLS.iconButton,
  accentColor
    ? 'hover:brightness-110'
    : active
      ? 'border-gray-500 bg-gray-800 text-gray-100 shadow-[inset_0_0_0_1px_rgba(255,255,255,0.03)]'
      : 'border-gray-700 bg-gray-900/70 text-gray-400'
);

const actionButtonStyle = (accentColor: string | undefined, active: boolean): React.CSSProperties | undefined => {
  if (!accentColor) {
    return undefined;
  }

  return {
    '--sidebar-action-accent': accentColor,
    '--sidebar-action-border': active ? `${accentColor}78` : `${accentColor}40`,
    '--sidebar-action-bg': active ? `${accentColor}24` : `${accentColor}12`,
    '--sidebar-action-text': active ? '#f8fafc' : accentColor,
    borderColor: 'var(--sidebar-action-border)',
    backgroundColor: 'var(--sidebar-action-bg)',
    color: 'var(--sidebar-action-text)',
    boxShadow: active ? `inset 0 0 0 1px ${accentColor}22` : undefined,
  } as AccentButtonStyle;
};

const SidebarVisibilityActions: React.FC<SidebarVisibilityActionsProps> = ({
  isVisible,
  isIsolated = false,
  onToggle,
  onShowOnly,
  entityLabel,
  accentColor,
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
      className={actionButtonClass(isVisible, accentColor)}
      style={actionButtonStyle(accentColor, isVisible)}
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
        actionButtonClass(isIsolated, accentColor),
        accentColor ? undefined : (!isIsolated && 'hover:bg-gray-800 hover:text-white')
      )}
      style={actionButtonStyle(accentColor, isIsolated)}
      aria-label={isIsolated ? `Restore previous map visibility after isolating ${entityLabel}` : `Show only ${entityLabel} on the map`}
      title={isIsolated ? `Restore previous map visibility` : `Show only ${entityLabel} on the map`}
    >
      <Focus size={14} />
    </button>
  </div>
);

export default SidebarVisibilityActions;
