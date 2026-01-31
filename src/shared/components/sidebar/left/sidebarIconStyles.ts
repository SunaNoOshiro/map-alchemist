import type { CSSProperties } from 'react';

export const sidebarIconClasses = {
  icon: 'h-3 w-3',
  label: 'text-[10px] font-medium leading-none',
  actionItemBase:
    'flex flex-col items-center justify-center gap-0.5 rounded border border-transparent bg-gray-800 p-1.5 text-[10px] transition-colors',
  iconButtonBase: 'rounded p-0.5 transition-colors',
};

export const getSectionColorStyle = (sectionColor: string): CSSProperties =>
  ({ '--section-color': sectionColor } as CSSProperties);
