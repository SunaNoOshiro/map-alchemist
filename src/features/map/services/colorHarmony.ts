import { ThemeColorTokens } from '@features/ai/services/themeSpec';
import { PopupStyle } from '@/types';

const HEX_COLOR_PATTERN = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i;

const clamp = (value: number, min: number, max: number): number => Math.min(max, Math.max(min, value));

export const normalizeHexColor = (color?: string): string | null => {
  if (!color) return null;

  const trimmed = color.trim();
  if (!HEX_COLOR_PATTERN.test(trimmed)) return null;

  if (trimmed.length === 4) {
    const [, r, g, b] = trimmed;
    return `#${r}${r}${g}${g}${b}${b}`.toLowerCase();
  }

  return trimmed.toLowerCase();
};

type Rgb = { r: number; g: number; b: number };

const hexToRgb = (color: string): Rgb | null => {
  const normalized = normalizeHexColor(color);
  if (!normalized) return null;
  const numeric = parseInt(normalized.slice(1), 16);
  return {
    r: (numeric >> 16) & 255,
    g: (numeric >> 8) & 255,
    b: numeric & 255
  };
};

const rgbToHex = ({ r, g, b }: Rgb): string => {
  const toHex = (channel: number) => clamp(Math.round(channel), 0, 255).toString(16).padStart(2, '0');
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
};

const toLinearSrgb = (channel: number): number => {
  const normalized = channel / 255;
  return normalized <= 0.04045
    ? normalized / 12.92
    : Math.pow((normalized + 0.055) / 1.055, 2.4);
};

const getRelativeLuminance = (color: string): number => {
  const rgb = hexToRgb(color);
  if (!rgb) return 0;

  const r = toLinearSrgb(rgb.r);
  const g = toLinearSrgb(rgb.g);
  const b = toLinearSrgb(rgb.b);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};

const mixColors = (baseColor: string, accentColor: string, accentWeight: number): string => {
  const base = hexToRgb(baseColor);
  const accent = hexToRgb(accentColor);

  if (!base && !accent) return '#111827';
  if (!base) return rgbToHex(accent as Rgb);
  if (!accent) return rgbToHex(base);

  const weight = clamp(accentWeight, 0, 1);
  const inverse = 1 - weight;

  return rgbToHex({
    r: base.r * inverse + accent.r * weight,
    g: base.g * inverse + accent.g * weight,
    b: base.b * inverse + accent.b * weight
  });
};

const deriveHarmonizedHalo = (surfaceColor: string, textColor: string): string => {
  const textIsLight = getRelativeLuminance(textColor) >= 0.55;
  const anchor = textIsLight ? '#05070a' : '#f8fbff';
  return mixColors(anchor, surfaceColor, 0.25);
};

export const deriveHarmonizedHaloFromThemeTokens = (tokens: ThemeColorTokens): string => {
  const background = normalizeHexColor(tokens.background) || '#ffffff';
  const land = normalizeHexColor(tokens.land) || background;
  const text = normalizeHexColor(tokens.textPrimary) || '#202124';
  const surface = mixColors(background, land, 0.5);
  return deriveHarmonizedHalo(surface, text);
};

export const deriveHarmonizedHaloFromPalette = (
  palette: Record<string, string> | undefined,
  popupStyle: Partial<PopupStyle> | undefined
): string => {
  const baseSurface = normalizeHexColor(palette?.land) || normalizeHexColor(popupStyle?.backgroundColor) || '#ffffff';
  const accentSurface = normalizeHexColor(popupStyle?.backgroundColor) || baseSurface;
  const text = normalizeHexColor(palette?.text) || normalizeHexColor(popupStyle?.textColor) || '#202124';
  const surface = mixColors(baseSurface, accentSurface, 0.5);
  return deriveHarmonizedHalo(surface, text);
};
