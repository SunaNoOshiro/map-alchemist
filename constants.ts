
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

export const MAP_CATEGORIES = Object.values(CATEGORY_GROUPS).flat();

// Google Place Types -> Internal Subcategory Mapping
// Order matters: first match wins
export const TYPE_MAPPING: Record<string, { category: string, subcategory: string, baseRank: number }> = {
    'airport': { category: 'Transport', subcategory: 'Airport', baseRank: 95 },
    'subway_station': { category: 'Transport', subcategory: 'Subway Station', baseRank: 85 },
    'train_station': { category: 'Transport', subcategory: 'Train Station', baseRank: 90 },
    'light_rail_station': { category: 'Transport', subcategory: 'Subway Station', baseRank: 80 },
    'bus_station': { category: 'Transport', subcategory: 'Bus Station', baseRank: 75 },
    
    'hospital': { category: 'Health', subcategory: 'Hospital', baseRank: 90 },
    'police': { category: 'Services', subcategory: 'Police', baseRank: 85 },
    'fire_station': { category: 'Services', subcategory: 'Fire Station', baseRank: 85 },
    
    'museum': { category: 'Attractions', subcategory: 'Museum', baseRank: 80 },
    'zoo': { category: 'Attractions', subcategory: 'Zoo', baseRank: 80 },
    'stadium': { category: 'Attractions', subcategory: 'Stadium', baseRank: 80 },
    'tourist_attraction': { category: 'Attractions', subcategory: 'Tourist Attraction', baseRank: 75 },
    'park': { category: 'Attractions', subcategory: 'Park', baseRank: 70 },
    
    'university': { category: 'Education', subcategory: 'University', baseRank: 70 },
    'school': { category: 'Education', subcategory: 'School', baseRank: 60 },
    'library': { category: 'Education', subcategory: 'Library', baseRank: 60 },
    
    'shopping_mall': { category: 'Shopping', subcategory: 'Shopping Mall', baseRank: 75 },
    'supermarket': { category: 'Shopping', subcategory: 'Supermarket', baseRank: 65 },
    'department_store': { category: 'Shopping', subcategory: 'Store', baseRank: 60 },
    'clothing_store': { category: 'Shopping', subcategory: 'Clothing Store', baseRank: 50 },
    'electronics_store': { category: 'Shopping', subcategory: 'Electronics', baseRank: 50 },
    'convenience_store': { category: 'Shopping', subcategory: 'Convenience Store', baseRank: 40 },
    
    'restaurant': { category: 'Food & Drink', subcategory: 'Restaurant', baseRank: 60 },
    'bar': { category: 'Food & Drink', subcategory: 'Bar', baseRank: 55 },
    'night_club': { category: 'Food & Drink', subcategory: 'Night Club', baseRank: 55 },
    'cafe': { category: 'Food & Drink', subcategory: 'Cafe', baseRank: 50 },
    'bakery': { category: 'Food & Drink', subcategory: 'Bakery', baseRank: 50 },
    
    'lodging': { category: 'Services', subcategory: 'Lodging', baseRank: 70 },
    'bank': { category: 'Services', subcategory: 'Bank', baseRank: 60 },
    'atm': { category: 'Services', subcategory: 'ATM', baseRank: 40 },
    'post_office': { category: 'Services', subcategory: 'Post Office', baseRank: 50 },
    
    'gas_station': { category: 'Transport', subcategory: 'Gas Station', baseRank: 55 },
    'parking': { category: 'Transport', subcategory: 'Parking', baseRank: 45 },
    
    'church': { category: 'Religious', subcategory: 'Church', baseRank: 60 },
    'mosque': { category: 'Religious', subcategory: 'Mosque', baseRank: 60 },
    'synagogue': { category: 'Religious', subcategory: 'Synagogue', baseRank: 60 },
    'hindu_temple': { category: 'Religious', subcategory: 'Hindu Temple', baseRank: 60 },
    'place_of_worship': { category: 'Religious', subcategory: 'Place of Worship', baseRank: 55 },
};

export const FALLBACK_MAPPING = { category: 'Shopping', subcategory: 'Store', baseRank: 30 };

// --- VISIBILITY CONFIG (MinZoom Table) ---
// Defines when icons and labels start appearing
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
    'Hotel': { minZoomIcon: 14, minZoomLabel: 16 },
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
export const GOOGLE_MAPS_API_KEY = 'AIzaSyD0PiGWS7WgeCLQ-GJFuPgcAd2n0Ibrpgg'; 

export const STANDARD_LIGHT_STYLE: any[] = [];

export const DEFAULT_STYLE_PRESET: MapStylePreset = {
  id: 'default-style-standard',
  name: 'Standard Light',
  prompt: 'Clean standard map',
  createdAt: new Date().toISOString(),
  mapStyleJson: STANDARD_LIGHT_STYLE,
  iconsByCategory: {}, 
  popupStyle: {
    backgroundColor: '#ffffff',
    textColor: '#202124', 
    borderColor: '#dadce0', 
    borderRadius: '8px',
    fontFamily: 'Roboto, Arial, sans-serif'
  }
};
