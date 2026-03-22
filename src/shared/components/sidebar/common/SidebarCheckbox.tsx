import React from 'react';
import { Check } from 'lucide-react';
import { UI_CONTROLS, uiClass } from '@shared/styles/uiTokens';

interface SidebarCheckboxProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
  ariaLabel: string;
  testId?: string;
}

const SidebarCheckbox: React.FC<SidebarCheckboxProps> = ({
  checked,
  onChange,
  disabled = false,
  ariaLabel,
  testId
}) => (
  <button
    type="button"
    role="checkbox"
    aria-checked={checked ? 'true' : 'false'}
    aria-label={ariaLabel}
    disabled={disabled}
    data-testid={testId}
    className={uiClass(
      UI_CONTROLS.checkboxButton,
      checked
        ? 'border-gray-500 bg-gray-700 text-gray-100 shadow-[inset_0_0_0_1px_rgba(255,255,255,0.04)]'
        : 'text-transparent',
      disabled && 'pointer-events-none'
    )}
    onClick={(event) => {
      event.stopPropagation();
      if (!disabled) {
        onChange(!checked);
      }
    }}
  >
    <Check size={13} className={checked ? 'opacity-100' : 'opacity-0'} />
  </button>
);

export default SidebarCheckbox;
