export {};

declare global {
  interface Window {
    __mapAlchemistSetRemixFocus?: (category: string) => void;
    __mapAlchemistClearRemixFocus?: () => void;
  }
}
