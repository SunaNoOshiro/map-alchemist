import type { CSSProperties } from 'react';

export const sidebarIconClasses = {
  icon: 'h-2.5 w-2.5',
  label: 'text-[9px] font-medium leading-none',
  actionItemBase:
    'flex flex-col items-center justify-center gap-0.5 rounded border border-transparent bg-gray-800 p-1 text-xs transition-colors',
  iconButtonBase: 'rounded p-0.5 transition-colors',
};

export const getSectionColorStyle = (sectionColor: string): CSSProperties =>
  ({ '--section-color': sectionColor } as CSSProperties);
