
import { MapStylePreset } from './types';
import { v4 as uuidv4 } from 'uuid';

// --- TAXONOMY & MAPPING ---

// Core Category Groups (for UI)
export const CATEGORY_GROUPS: Record<string, string[]> = {
  'Food & Drink': ['Restaurant', 'Cafe', 'Bar', 'Bakery', 'Night Club'],
  'Shopping': ['Supermarket', 'Store', 'Shopping Mall', 'Convenience Store', 'Clothing Store', 'Electronics'],
  'Health': ['Hospital', 'Pharmacy', 'Clinic', 'Dentist', 'Veterinary Care'],
  'Transport': ['Airport', 'Train Station', 'Subway Station', 'Bus Station', 'Gas Station', 'Parking'],
  'Services': ['Bank', 'ATM', 'Post Office', 'Police', 'Fire Station', 'Lodging'],
  'Attractions': ['Museum', 'Park', 'Tourist Attraction', 'Art Gallery', 'Movie Theater', 'Stadium', 'Zoo'],
  'Education': ['School', 'University', 'Library'],
  'Religious': ['Church', 'Mosque', 'Synagogue', 'Hindu Temple', 'Place of Worship']
};

// Palette used to colorize icons per high-level category group (matches the asset panel hues)
export const CATEGORY_COLORS: Record<string, string> = {
  'Food & Drink': '#f97316',
  'Shopping': '#6366f1',
  'Health': '#ef4444',
  'Transport': '#06b6d4',
  'Services': '#9ca3af',
  'Attractions': '#a855f7',
  'Education': '#14b8a6',
  'Religious': '#f59e0b'
};

export const getCategoryColor = (subcategory: string): string => {
  const group = Object.entries(CATEGORY_GROUPS).find(([, cats]) => cats.includes(subcategory))?.[0];
  if (group && CATEGORY_COLORS[group]) return CATEGORY_COLORS[group];
  return '#6b7280';
};

// Section Colors for Left Sidebar
export const SECTION_COLORS = {
  'ai-config': '#6366f1',      // Blue - matches Tailwind blue-500
  'theme-generator': '#a855f7', // Purple - matches Tailwind purple-500
  'theme-library': '#16a344',   // Green - matches Tailwind green-500
  'logs': '#6b7280',           // Gray - matches Tailwind gray-500
} as const;

export type SectionColorKey = keyof typeof SECTION_COLORS;

// Section Definitions - Centralized configuration for all sidebar sections
export const SECTIONS = [
  {
    id: 'theme-generator',
    title: 'Theme Generator',
    icon: 'Wand',
    color: SECTION_COLORS['theme-generator'],
    tailwindTextColor: 'text-purple-400',
    tailwindBorderColor: 'border-purple-500/30'
  },
  {
    id: 'theme-library',
    title: 'Theme Library',
    icon: 'Palette',
    color: SECTION_COLORS['theme-library'],
    tailwindTextColor: 'text-green-400',
    tailwindBorderColor: 'border-green-500/30'
  },
  {
    id: 'logs',
    title: 'Activity Logs',
    icon: 'FileText',
    color: SECTION_COLORS['logs'],
    tailwindTextColor: 'text-gray-400',
    tailwindBorderColor: 'border-gray-500/30'
  },
] as const;

export type SectionId = typeof SECTIONS[number]['id'];
export type Section = typeof SECTIONS[number];

// Helper function to get section by ID
export const getSectionById = (sectionId: SectionId): Section | undefined => {
  return SECTIONS.find(section => section.id === sectionId);
};

// Helper function to get section color by ID
export const getSectionColor = (sectionId: SectionId): string => {
  const section = getSectionById(sectionId);
  return section ? section.color : SECTION_COLORS['logs']; // Default to logs color
};

// Helper function to get tailwind text color by ID
export const getSectionTailwindTextColor = (sectionId: SectionId): string => {
  const section = getSectionById(sectionId);
  return section ? section.tailwindTextColor : 'text-gray-400';
};

// Helper function to get tailwind border color by ID
export const getSectionTailwindBorderColor = (sectionId: SectionId): string => {
  const section = getSectionById(sectionId);
  return section ? section.tailwindBorderColor : 'border-gray-500/30';
};

export const MAP_CATEGORIES = Object.values(CATEGORY_GROUPS).flat();

// OSM Tag Mapping
export const OSM_MAPPING: Record<string, { category: string, subcategory: string, baseRank: number }> = {
    // Amenity
    'amenity=restaurant': { category: 'Food & Drink', subcategory: 'Restaurant', baseRank: 60 },
    'amenity=cafe': { category: 'Food & Drink', subcategory: 'Cafe', baseRank: 50 },
    'amenity=bar': { category: 'Food & Drink', subcategory: 'Bar', baseRank: 55 },
    'amenity=pub': { category: 'Food & Drink', subcategory: 'Bar', baseRank: 55 },
    'amenity=fast_food': { category: 'Food & Drink', subcategory: 'Restaurant', baseRank: 45 },
    'amenity=nightclub': { category: 'Food & Drink', subcategory: 'Night Club', baseRank: 55 },
    
    'amenity=hospital': { category: 'Health', subcategory: 'Hospital', baseRank: 90 },
    'amenity=clinic': { category: 'Health', subcategory: 'Clinic', baseRank: 80 },
    'amenity=pharmacy': { category: 'Health', subcategory: 'Pharmacy', baseRank: 70 },
    'amenity=dentist': { category: 'Health', subcategory: 'Dentist', baseRank: 65 },
    
    'amenity=bank': { category: 'Services', subcategory: 'Bank', baseRank: 60 },
    'amenity=atm': { category: 'Services', subcategory: 'ATM', baseRank: 40 },
    'amenity=post_office': { category: 'Services', subcategory: 'Post Office', baseRank: 50 },
    'amenity=police': { category: 'Services', subcategory: 'Police', baseRank: 85 },
    'amenity=fire_station': { category: 'Services', subcategory: 'Fire Station', baseRank: 85 },
    
    'amenity=school': { category: 'Education', subcategory: 'School', baseRank: 60 },
    'amenity=university': { category: 'Education', subcategory: 'University', baseRank: 70 },
    'amenity=library': { category: 'Education', subcategory: 'Library', baseRank: 60 },

    'amenity=place_of_worship': { category: 'Religious', subcategory: 'Place of Worship', baseRank: 60 },
    'amenity=cinema': { category: 'Attractions', subcategory: 'Movie Theater', baseRank: 70 },
    'amenity=fuel': { category: 'Transport', subcategory: 'Gas Station', baseRank: 55 },
    'amenity=parking': { category: 'Transport', subcategory: 'Parking', baseRank: 45 },

    // Shop
    'shop=supermarket': { category: 'Shopping', subcategory: 'Supermarket', baseRank: 65 },
    'shop=convenience': { category: 'Shopping', subcategory: 'Convenience Store', baseRank: 40 },
    'shop=mall': { category: 'Shopping', subcategory: 'Shopping Mall', baseRank: 75 },
    'shop=clothes': { category: 'Shopping', subcategory: 'Clothing Store', baseRank: 50 },
    'shop=electronics': { category: 'Shopping', subcategory: 'Electronics', baseRank: 50 },
    'shop=bakery': { category: 'Food & Drink', subcategory: 'Bakery', baseRank: 50 },

    // Tourism
    'tourism=museum': { category: 'Attractions', subcategory: 'Museum', baseRank: 80 },
    'tourism=artwork': { category: 'Attractions', subcategory: 'Art Gallery', baseRank: 70 },
    'tourism=attraction': { category: 'Attractions', subcategory: 'Tourist Attraction', baseRank: 75 },
    'tourism=hotel': { category: 'Services', subcategory: 'Lodging', baseRank: 70 },
    'tourism=hostel': { category: 'Services', subcategory: 'Lodging', baseRank: 60 },
    'tourism=zoo': { category: 'Attractions', subcategory: 'Zoo', baseRank: 80 },

    // Leisure
    'leisure=park': { category: 'Attractions', subcategory: 'Park', baseRank: 70 },
    'leisure=stadium': { category: 'Attractions', subcategory: 'Stadium', baseRank: 80 },

    // Transport
    'aeroway=aerodrome': { category: 'Transport', subcategory: 'Airport', baseRank: 95 },
    'railway=station': { category: 'Transport', subcategory: 'Train Station', baseRank: 90 },
    'highway=bus_stop': { category: 'Transport', subcategory: 'Bus Station', baseRank: 75 }, // Simplification
};

export const FALLBACK_MAPPING = { category: 'Shopping', subcategory: 'Store', baseRank: 30 };

// --- VISIBILITY CONFIG (MinZoom Table) ---
export const VISIBILITY_CONFIG: Record<string, { minZoomIcon: number, minZoomLabel: number }> = {
    'Airport': { minZoomIcon: 10, minZoomLabel: 12 },
    'Hospital': { minZoomIcon: 12, minZoomLabel: 13 },
    'Museum': { minZoomIcon: 12, minZoomLabel: 13 },
    'Stadium': { minZoomIcon: 12, minZoomLabel: 13 },
    'Train Station': { minZoomIcon: 12, minZoomLabel: 13 },
    
    'University': { minZoomIcon: 13, minZoomLabel: 14 },
    'Zoo': { minZoomIcon: 13, minZoomLabel: 14 },
    'Tourist Attraction': { minZoomIcon: 13, minZoomLabel: 14 },
    'Shopping Mall': { minZoomIcon: 13, minZoomLabel: 14 },
    
    'Park': { minZoomIcon: 13, minZoomLabel: 14 },
    'Subway Station': { minZoomIcon: 13, minZoomLabel: 15 },
    
    'Restaurant': { minZoomIcon: 14, minZoomLabel: 16 },
    'Lodging': { minZoomIcon: 14, minZoomLabel: 16 },
    'Bank': { minZoomIcon: 14, minZoomLabel: 16 },
    'Supermarket': { minZoomIcon: 14, minZoomLabel: 16 },
    
    'Cafe': { minZoomIcon: 15, minZoomLabel: 17 },
    'Bar': { minZoomIcon: 15, minZoomLabel: 17 },
    'Store': { minZoomIcon: 15, minZoomLabel: 17 },
    'Gas Station': { minZoomIcon: 14, minZoomLabel: 17 },
    
    'Parking': { minZoomIcon: 15, minZoomLabel: 18 },
    'ATM': { minZoomIcon: 16, minZoomLabel: 18 },
    
    'default': { minZoomIcon: 15, minZoomLabel: 17 }
};

// --- APP DEFAULTS ---

export const DEFAULT_MAP_CENTER = { lat: 37.7749, lng: -122.4194 }; 
export const DEFAULT_ZOOM = 14; 

// Using OpenFreeMap which provides free hosted vector tiles
export const DEFAULT_STYLE_URL = 'https://tiles.openfreemap.org/styles/liberty';

export const DEFAULT_STYLE_PRESET: MapStylePreset = {
  id: 'default-style-standard',
  name: 'Standard Light',
  prompt: 'Clean standard map',
  createdAt: new Date().toISOString(),
  mapStyleJson: { version: 8, sources: {}, layers: [] }, // We use URL mostly, this is fallback/override
  iconsByCategory: {}, 
  popupStyle: {
    backgroundColor: '#ffffff',
    textColor: '#202124', 
    borderColor: '#dadce0', 
    borderRadius: '8px',
    fontFamily: 'Roboto, Arial, sans-serif'
  }
};
