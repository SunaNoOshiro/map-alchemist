export interface IconDefinition {
  category: string;
  prompt: string;
  imageUrl: string | null; // Base64 data URI
  isLoading?: boolean;
}

export interface PopupStyle {
  backgroundColor: string;
  textColor: string;
  borderColor: string;
  borderRadius: string;
  fontFamily: string;
}

export interface MapStylePreset {
  id: string;
  name: string;
  prompt: string;
  iconTheme?: string; // AI-generated art direction for icons
  createdAt: string;
  mapStyleJson: any; // Mapbox Style Spec JSON
  palette?: Record<string, string>;
  iconsByCategory: Record<string, IconDefinition>;
  popupStyle: PopupStyle;
  isBundledDefault?: boolean;
}

export interface LogEntry {
  id: string;
  timestamp: string;
  message: string;
  type: 'info' | 'success' | 'error' | 'warning';
}

export type DisplayMode = 'NONE' | 'ICON_ONLY' | 'ICON_LABEL' | 'LABEL_ONLY';
export type VisualState = 'DEFAULT' | 'DIMMED' | 'HOVER' | 'SELECTED';

export interface PlaceMarker {
  id: string;
  lat: number;
  lng: number;
  title: string;

  // Taxonomy
  category: string;     // e.g., 'Food & Drink'
  subcategory: string;  // e.g., 'restaurant'
  iconKey: string;      // e.g., 'food.restaurant'

  // Data
  description?: string;
  rating?: number;
  user_ratings_total?: number;

  // Logic
  rank: number; // 0..100
  isCluster?: boolean;
  clusterCount?: number;

  // Runtime State
  displayMode?: DisplayMode;
  visualState?: VisualState;

  // Source Data
  tags?: Record<string, string>;
}

export type ImageSize = '1K' | '2K' | '4K';

export enum AppStatus {
  IDLE = 'IDLE',
  GENERATING_STYLE = 'GENERATING_STYLE',
  GENERATING_ICON = 'GENERATING_ICON',
}

// AI Provider Types
export type AiProvider = 'google-gemini';

export interface AiConfig {
  provider: AiProvider;
  model: string;
  apiKey: string;
  isCustomKey: boolean;
}
