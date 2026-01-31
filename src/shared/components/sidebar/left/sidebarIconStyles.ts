import type { CSSProperties } from 'react';

export const sidebarIconClasses = {
  icon: 'h-3 w-3',
  label: 'text-[10px] font-medium leading-none',
  actionItem:
    'flex flex-col items-center justify-center gap-0.5 rounded border border-transparent bg-gray-800 p-1.5 text-[color:var(--section-color)] transition-colors hover:bg-[color:var(--section-color)/0.12] hover:text-[color:var(--section-color)]',
  iconButton:
    'rounded p-0.5 text-[color:var(--section-color)] opacity-70 transition-colors hover:bg-[color:var(--section-color)/0.12] hover:opacity-100',
};

export const getSectionColorStyle = (sectionColor: string): CSSProperties =>
  ({ '--section-color': sectionColor } as CSSProperties);
