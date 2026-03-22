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

export interface MapStyleExportPackage {
  formatVersion: string;
  generatedAt: string;
  styleId: string;
  styleName: string;
  prompt?: string;
  iconTheme?: string;
  palette: Record<string, string>;
  popupStyle: PopupStyle;
  styleJson: Record<string, unknown>;
  iconsByCategory: Record<string, IconDefinition>;
  baseStyleUrl: string;
  placesSourceId: string;
  poiLayerId: string;
  notes: string[];
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
  address?: string;
  website?: string;
  phone?: string;
  opening_hours?: string;
  wikidata?: string;
  wikipedia?: string;
  image?: string;
  wikimedia_commons?: string;
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

export interface PoiPopupDetails {
  status: 'idle' | 'loading' | 'loaded' | 'error';
  address?: string;
  website?: string;
  phone?: string;
  openingHours?: string;
  summary?: string;
  cuisine?: string;
  operator?: string;
  brand?: string;
  wikipediaUrl?: string;
  osmUrl?: string;
  googleMapsUrl: string;
  googleExactLocationUrl?: string;
  photoUrl?: string;
  photoAttributionText?: string;
  photoAttributionUrl?: string;
  photoCandidates?: PoiPopupPhotoCandidate[];
}

export interface PopupPhotoPresentation {
  categoryProfile: 'scenic' | 'business' | 'compact';
  resolutionBand: 'unknown' | 'low' | 'medium' | 'high';
  frameHeight: number;
  objectFit: 'cover' | 'contain';
  objectPosition: string;
  surfaceColor: string;
}

export interface PoiPopupPhotoCandidate {
  url: string;
  attributionText?: string;
  attributionUrl?: string;
  width?: number;
  height?: number;
  source:
    | 'osm-image'
    | 'wikimedia-commons'
    | 'commons-geosearch'
    | 'wikipedia-thumbnail'
    | 'wikipedia-pageimage'
    | 'wikipedia-geosearch'
    | 'wikidata-image'
    | 'commons-pageimage';
}

export interface LoadedPoiSearchItem {
  id: string;
  title: string;
  category: string;
  subcategory: string;
  taxonomyKey: string;
  iconKey: string;
  coordinates: [number, number];
  address?: string;
  website?: string;
  openingHours?: string;
  hasPhoto: boolean;
  hasWebsite: boolean;
  isOpenNow: boolean;
  shownOnMap: boolean;
}

export interface PoiSearchFilters {
  query: string;
  category: string;
  subcategory: string;
  hasPhoto: boolean;
  hasWebsite: boolean;
  openNow: boolean;
}

export interface PoiTaxonomySummarySubcategory {
  subcategory: string;
  taxonomyKey: string;
  count: number;
  shownCount: number;
}

export interface PoiTaxonomySummaryCategory {
  category: string;
  count: number;
  shownCount: number;
  subcategoryCount: number;
  visibleSubcategoryCount: number;
  subcategories: PoiTaxonomySummarySubcategory[];
}

export interface PoiMapVisibilityIsolationState {
  kind: 'category' | 'subcategory';
  key: string;
  previousHiddenCategories: string[];
  previousHiddenSubcategories: string[];
}

export interface PoiMapVisibilityFilters {
  hiddenCategories: string[];
  hiddenSubcategories: string[];
  isolation?: PoiMapVisibilityIsolationState | null;
}

export type RightSidebarMode = 'icons' | 'places';

export type ImageSize = '1K' | '2K' | '4K';
export type IconGenerationMode = 'auto' | 'batch-async' | 'atlas' | 'per-icon';

export enum AppStatus {
  IDLE = 'IDLE',
  GENERATING_STYLE = 'GENERATING_STYLE',
  GENERATING_ICON = 'GENERATING_ICON',
}

// AI Provider Types
export type AiProvider = 'google-gemini' | 'openai';

export interface AiConfig {
  provider: AiProvider;
  textModel: string;
  imageModel: string;
  apiKey: string;
  isCustomKey: boolean;
  iconGenerationMode: IconGenerationMode;
}
