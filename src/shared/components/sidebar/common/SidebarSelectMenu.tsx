import React from 'react';
import { ChevronDown } from 'lucide-react';
import { UI_CONTROLS, UI_TYPOGRAPHY, uiClass } from '@shared/styles/uiTokens';

export interface SidebarSelectOption {
  value: string;
  label: string;
  meta?: string;
  disabled?: boolean;
}

const toTestToken = (value: string): string =>
  value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');

interface SidebarSelectMenuProps {
  testId: string;
  label: string;
  currentLabel: string;
  isOpen: boolean;
  onToggle: () => void;
  options: SidebarSelectOption[];
  selectedValue: string;
  onSelect: (value: string) => void;
  menuClassName?: string;
}

const SidebarSelectMenu: React.FC<SidebarSelectMenuProps> = ({
  testId,
  label,
  currentLabel,
  isOpen,
  onToggle,
  options,
  selectedValue,
  onSelect,
  menuClassName
}) => {
  return (
    <div className="relative min-w-0">
      <span className={uiClass(UI_TYPOGRAPHY.tiny, 'mb-1 block text-gray-500 uppercase tracking-[0.12em]')}>
        {label}
      </span>
      <button
        type="button"
        onClick={onToggle}
        className={UI_CONTROLS.dropdownTrigger}
        data-testid={testId}
        aria-expanded={isOpen ? 'true' : 'false'}
      >
        <span className="min-w-0 flex-1 pr-2 text-left whitespace-normal break-normal leading-5">
          {currentLabel}
        </span>
        <ChevronDown className={uiClass('mt-0.5 h-3 w-3 shrink-0 text-gray-400 transition-transform', isOpen && 'rotate-180')} />
      </button>

      {isOpen && (
        <div
          className={uiClass(
            'absolute left-0 z-30 mt-1 min-w-full max-w-[min(30rem,calc(100vw-40px))] overflow-y-auto rounded-md border border-gray-700 bg-gray-700 shadow-2xl divide-y divide-gray-600/60',
            menuClassName
          )}
          style={{ width: 'max-content', maxHeight: '14rem' }}
          role="listbox"
        >
          {options.map((option) => {
            const isSelected = option.value === selectedValue;
            return (
              <button
                key={option.value}
                type="button"
                className={uiClass(
                  'flex w-full items-start gap-2 px-3 py-2 text-left text-gray-200 transition-colors hover:bg-gray-600',
                  UI_TYPOGRAPHY.compact,
                  option.disabled && 'cursor-not-allowed opacity-50 hover:bg-transparent'
                )}
                onMouseDown={(event) => {
                  event.preventDefault();
                }}
                onClick={() => {
                  if (!option.disabled) {
                    onSelect(option.value);
                  }
                }}
                data-testid={`${testId}-option-${toTestToken(option.value || option.label)}`}
                data-option-label={option.label}
                disabled={option.disabled}
              >
                <span className="mt-1 flex h-2 w-2 shrink-0 rounded-full bg-blue-400 transition-opacity" aria-hidden="true" style={{ opacity: isSelected ? 1 : 0 }} />
                <span className="min-w-0 flex-1">
                  <span className="block whitespace-nowrap leading-5">
                    {option.label}
                  </span>
                  {option.meta && (
                    <span className="mt-0.5 block text-[11px] leading-4 text-gray-400">
                      {option.meta}
                    </span>
                  )}
                </span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default SidebarSelectMenu;
