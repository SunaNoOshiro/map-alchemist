type UiClassValue = string | false | null | undefined;

export const uiClass = (...values: UiClassValue[]): string => values.filter(Boolean).join(' ');

export const brightenHex = (hex: string, amount: number): string => {
  const normalized = hex.replace('#', '');
  if (!/^[0-9a-fA-F]{6}$/.test(normalized)) {
    return hex;
  }

  const brighten = (value: number) => Math.min(255, Math.round(value + ((255 - value) * amount)));
  const channels = [0, 2, 4].map((index) => brighten(Number.parseInt(normalized.slice(index, index + 2), 16)));

  return `#${channels.map((channel) => channel.toString(16).padStart(2, '0')).join('')}`;
};

export const UI_TYPOGRAPHY = {
  appTitle: 'text-3xl leading-tight font-extrabold',
  appSubtitle: 'text-sm leading-5',
  heading: 'text-lg leading-6 font-bold',
  subheading: 'text-sm leading-5 font-semibold',
  sectionLabel: 'text-[11px] leading-4 font-bold uppercase tracking-[0.08em]',
  fieldLabel: 'text-xs leading-4 font-semibold',
  body: 'text-sm leading-5',
  compact: 'text-xs leading-4',
  meta: 'text-[11px] leading-4',
  tiny: 'text-[10px] leading-4',
  actionCaps: 'text-[10px] leading-4 font-bold uppercase tracking-[0.08em]',
  monoTiny: 'font-mono text-[10px] leading-4',
} as const;

export const UI_SPACING = {
  panel: 'p-3',
  panelLarge: 'p-4',
  blockGap: 'space-y-3',
  blockGapTight: 'space-y-2',
  rowGap: 'gap-2',
  sectionGap: 'space-y-1',
} as const;

export const UI_CONTROLS = {
  button: `inline-flex h-8 items-center justify-center gap-2 rounded-md border border-gray-700 bg-gray-800 px-3 text-gray-200 transition-colors hover:text-white focus:outline-none focus-visible:ring-1 focus-visible:ring-gray-500 focus-visible:ring-inset disabled:cursor-not-allowed disabled:opacity-60 ${UI_TYPOGRAPHY.actionCaps}`,
  subtleButton: `inline-flex h-8 items-center justify-center gap-2 rounded-md border border-gray-700 bg-transparent px-3 text-gray-400 transition-colors hover:text-white focus:outline-none focus-visible:ring-1 focus-visible:ring-gray-500 focus-visible:ring-inset disabled:cursor-not-allowed disabled:opacity-60 ${UI_TYPOGRAPHY.actionCaps}`,
  ghostButton: `inline-flex h-8 items-center justify-center gap-2 rounded-md px-3 text-gray-400 transition-colors hover:text-white focus:outline-none focus-visible:ring-1 focus-visible:ring-gray-500 focus-visible:ring-inset disabled:cursor-not-allowed disabled:opacity-60 ${UI_TYPOGRAPHY.actionCaps}`,
  dropdownTrigger: `flex h-8 w-full items-center justify-between rounded-md border border-gray-700 bg-gray-700 px-3 text-left text-gray-200 font-medium transition-colors hover:bg-gray-600 focus:outline-none focus-visible:ring-1 focus-visible:ring-gray-500 focus-visible:ring-inset ${UI_TYPOGRAPHY.compact}`,
  input: `h-8 w-full rounded-md border border-gray-700 bg-gray-700 px-3 text-gray-200 font-medium placeholder:text-gray-500 focus:border-transparent focus:outline-none focus:ring-1 focus:ring-gray-500 ${UI_TYPOGRAPHY.compact}`,
  textarea: `w-full resize-none rounded-md border border-gray-700 bg-gray-800 px-3 py-2 text-gray-200 placeholder:text-gray-500 focus:outline-none ${UI_TYPOGRAPHY.compact}`,
  checkbox: 'h-4 w-4 shrink-0 rounded border border-gray-600 bg-gray-700 text-blue-500 focus:ring-1 focus:ring-blue-500 focus:ring-offset-0',
  checkboxButton: `inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-md border border-gray-600 bg-gray-800 text-gray-300 transition-colors hover:border-gray-500 hover:bg-gray-700 focus:outline-none focus-visible:ring-1 focus-visible:ring-gray-500 focus-visible:ring-inset disabled:cursor-not-allowed disabled:opacity-50`,
  iconButton: `inline-flex h-8 w-8 items-center justify-center rounded-md border border-gray-700 bg-gray-900/70 text-gray-400 transition-colors hover:bg-gray-800 hover:text-white focus:outline-none focus-visible:ring-1 focus-visible:ring-gray-500 focus-visible:ring-inset disabled:cursor-not-allowed disabled:opacity-50`,
  panel: 'rounded-lg border border-gray-700 bg-gray-900/50',
  panelInset: 'rounded-md border border-gray-700 bg-gray-800',
  iconTile: 'flex flex-col items-center justify-center gap-1 rounded-md border border-gray-700 bg-gray-800 px-1.5 py-1.5 transition-colors hover:bg-gray-700',
} as const;
