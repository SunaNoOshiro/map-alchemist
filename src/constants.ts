
import { MapStylePreset } from './types';
import { v4 as uuidv4 } from 'uuid';

// --- TAXONOMY & MAPPING ---

// Core Category Groups (for UI)
export const CATEGORY_GROUPS: Record<string, string[]> = {
  'Food & Drink': [
    'Restaurant',
    'Cafe',
    'Bar',
    'Bakery',
    'Fast Food',
    'Ice Cream',
    'Brewery',
    'Night Club',
    'Deli',
    'Butcher',
    'Seafood',
    'Greengrocer',
    'Confectionery'
  ],
  'Shopping': [
    'Supermarket',
    'Grocery',
    'Convenience Store',
    'Department Store',
    'Shopping Mall',
    'Clothing Store',
    'Electronics Store',
    'Bookstore',
    'Furniture Store',
    'Hardware Store',
    'Sports Shop',
    'Gift Shop',
    'Jewelry Store',
    'Florist',
    'Market',
    'Liquor Store',
    'Variety Store'
  ],
  'Health': ['Hospital', 'Clinic', 'Doctors', 'Dentist', 'Pharmacy', 'Veterinary Care'],
  'Transport': [
    'Airport',
    'Ferry Terminal',
    'Train Station',
    'Subway Station',
    'Tram Stop',
    'Bus Station',
    'Bus Stop',
    'Taxi Stand',
    'Car Rental',
    'Car Sharing',
    'Bike Rental',
    'Bike Parking',
    'Bicycle Repair',
    'Parking',
    'Gas Station',
    'Charging Station',
    'Rest Area'
  ],
  'Accommodation': ['Hotel', 'Hostel', 'Motel', 'Guest House', 'Camping', 'Caravan Park'],
  'Services': [
    'Bank',
    'ATM',
    'Bureau de Change',
    'Car Wash',
    'Car Repair',
    'Laundry',
    'Hairdresser',
    'Courier',
    'Office',
    'Insurance'
  ],
  'Public Services': [
    'Police',
    'Fire Station',
    'Ambulance Station',
    'Post Office',
    'Post Box',
    'Public Toilets',
    'Recycling',
    'Shelter',
    'Social Facility',
    'Drinking Water',
    'Fountain',
    'Information Center'
  ],
  'Civic': ['Town Hall', 'Courthouse', 'Embassy', 'Community Center', 'Government Office'],
  'Entertainment': [
    'Cinema',
    'Theatre',
    'Arts Centre',
    'Concert Hall',
    'Casino',
    'Bowling Alley',
    'Theme Park',
    'Aquarium'
  ],
  'Attractions': [
    'Museum',
    'Art Gallery',
    'Tourist Attraction',
    'Zoo',
    'Landmark',
    'Viewpoint',
    'Monument',
    'Castle',
    'Memorial',
    'Ruins',
    'Archaeological Site',
    'Fort',
    'Lighthouse',
    'Tower'
  ],
  'Nature': ['Park', 'Garden', 'Nature Reserve', 'Beach', 'Waterfall', 'Peak', 'Spring'],
  'Sports & Leisure': [
    'Stadium',
    'Sports Centre',
    'Gym',
    'Swimming Pool',
    'Playground',
    'Golf Course',
    'Pitch',
    'Track',
    'Ice Rink',
    'Skatepark',
    'Water Park',
    'Marina',
    'Outdoor Fitness'
  ],
  'Education': ['School', 'University', 'College', 'Library', 'Kindergarten'],
  'Religious': ['Church', 'Mosque', 'Synagogue', 'Hindu Temple', 'Buddhist Temple', 'Place of Worship']
};

// Palette used to colorize icons per high-level category group (matches the asset panel hues)
export const CATEGORY_COLORS: Record<string, string> = {
  'Food & Drink': '#f97316',
  'Shopping': '#6366f1',
  'Health': '#ef4444',
  'Transport': '#06b6d4',
  'Accommodation': '#22c55e',
  'Services': '#9ca3af',
  'Public Services': '#0ea5e9',
  'Civic': '#8b5cf6',
  'Entertainment': '#f59e0b',
  'Attractions': '#a855f7',
  'Nature': '#10b981',
  'Sports & Leisure': '#14b8a6',
  'Education': '#84cc16',
  'Religious': '#f472b6'
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
    id: 'ai-config',
    title: 'AI Configuration',
    icon: 'BrainCircuit',
    color: SECTION_COLORS['ai-config'],
    tailwindTextColor: 'text-blue-400',
    tailwindBorderColor: 'border-blue-500/30'
  },
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
    // Amenity - Food & Drink
    'amenity=restaurant': { category: 'Food & Drink', subcategory: 'Restaurant', baseRank: 60 },
    'amenity=fast_food': { category: 'Food & Drink', subcategory: 'Fast Food', baseRank: 45 },
    'amenity=food_court': { category: 'Food & Drink', subcategory: 'Restaurant', baseRank: 45 },
    'amenity=cafe': { category: 'Food & Drink', subcategory: 'Cafe', baseRank: 50 },
    'amenity=ice_cream': { category: 'Food & Drink', subcategory: 'Ice Cream', baseRank: 45 },
    'amenity=bar': { category: 'Food & Drink', subcategory: 'Bar', baseRank: 55 },
    'amenity=pub': { category: 'Food & Drink', subcategory: 'Bar', baseRank: 55 },
    'amenity=biergarten': { category: 'Food & Drink', subcategory: 'Brewery', baseRank: 55 },
    'amenity=nightclub': { category: 'Food & Drink', subcategory: 'Night Club', baseRank: 55 },

    // Amenity - Entertainment & Civic
    'amenity=cinema': { category: 'Entertainment', subcategory: 'Cinema', baseRank: 70 },
    'amenity=theatre': { category: 'Entertainment', subcategory: 'Theatre', baseRank: 70 },
    'amenity=arts_centre': { category: 'Entertainment', subcategory: 'Arts Centre', baseRank: 65 },
    'amenity=concert_hall': { category: 'Entertainment', subcategory: 'Concert Hall', baseRank: 65 },
    'amenity=casino': { category: 'Entertainment', subcategory: 'Casino', baseRank: 65 },
    'amenity=community_centre': { category: 'Civic', subcategory: 'Community Center', baseRank: 60 },
    'amenity=townhall': { category: 'Civic', subcategory: 'Town Hall', baseRank: 70 },
    'amenity=courthouse': { category: 'Civic', subcategory: 'Courthouse', baseRank: 70 },
    'amenity=embassy': { category: 'Civic', subcategory: 'Embassy', baseRank: 70 },

    // Amenity - Health
    'amenity=hospital': { category: 'Health', subcategory: 'Hospital', baseRank: 90 },
    'amenity=clinic': { category: 'Health', subcategory: 'Clinic', baseRank: 80 },
    'amenity=doctors': { category: 'Health', subcategory: 'Doctors', baseRank: 70 },
    'amenity=pharmacy': { category: 'Health', subcategory: 'Pharmacy', baseRank: 70 },
    'amenity=dentist': { category: 'Health', subcategory: 'Dentist', baseRank: 65 },
    'amenity=veterinary': { category: 'Health', subcategory: 'Veterinary Care', baseRank: 65 },
    'healthcare=hospital': { category: 'Health', subcategory: 'Hospital', baseRank: 90 },
    'healthcare=clinic': { category: 'Health', subcategory: 'Clinic', baseRank: 80 },
    'healthcare=doctor': { category: 'Health', subcategory: 'Doctors', baseRank: 70 },
    'healthcare=dentist': { category: 'Health', subcategory: 'Dentist', baseRank: 65 },
    'healthcare=pharmacy': { category: 'Health', subcategory: 'Pharmacy', baseRank: 70 },
    'healthcare=physiotherapist': { category: 'Health', subcategory: 'Clinic', baseRank: 60 },
    'healthcare=veterinary': { category: 'Health', subcategory: 'Veterinary Care', baseRank: 65 },
    'healthcare=alternative': { category: 'Health', subcategory: 'Clinic', baseRank: 55 },
    'healthcare=optometrist': { category: 'Health', subcategory: 'Clinic', baseRank: 55 },
    'healthcare=midwife': { category: 'Health', subcategory: 'Clinic', baseRank: 55 },
    'healthcare=psychotherapist': { category: 'Health', subcategory: 'Clinic', baseRank: 55 },

    // Amenity - Services
    'amenity=bank': { category: 'Services', subcategory: 'Bank', baseRank: 60 },
    'amenity=atm': { category: 'Services', subcategory: 'ATM', baseRank: 40 },
    'amenity=bureau_de_change': { category: 'Services', subcategory: 'Bureau de Change', baseRank: 45 },
    'amenity=car_wash': { category: 'Services', subcategory: 'Car Wash', baseRank: 35 },
    'amenity=car_repair': { category: 'Services', subcategory: 'Car Repair', baseRank: 35 },
    'amenity=laundry': { category: 'Services', subcategory: 'Laundry', baseRank: 35 },
    'amenity=hairdresser': { category: 'Services', subcategory: 'Hairdresser', baseRank: 35 },
    'amenity=courier': { category: 'Services', subcategory: 'Courier', baseRank: 35 },
    'amenity=office': { category: 'Services', subcategory: 'Office', baseRank: 40 },

    // Amenity - Public Services
    'amenity=police': { category: 'Public Services', subcategory: 'Police', baseRank: 85 },
    'amenity=fire_station': { category: 'Public Services', subcategory: 'Fire Station', baseRank: 85 },
    'amenity=ambulance_station': { category: 'Public Services', subcategory: 'Ambulance Station', baseRank: 85 },
    'amenity=post_office': { category: 'Public Services', subcategory: 'Post Office', baseRank: 50 },
    'amenity=post_box': { category: 'Public Services', subcategory: 'Post Box', baseRank: 40 },
    'amenity=toilets': { category: 'Public Services', subcategory: 'Public Toilets', baseRank: 35 },
    'amenity=recycling': { category: 'Public Services', subcategory: 'Recycling', baseRank: 35 },
    'amenity=shelter': { category: 'Public Services', subcategory: 'Shelter', baseRank: 35 },
    'amenity=social_facility': { category: 'Public Services', subcategory: 'Social Facility', baseRank: 35 },
    'amenity=drinking_water': { category: 'Public Services', subcategory: 'Drinking Water', baseRank: 35 },
    'amenity=fountain': { category: 'Public Services', subcategory: 'Fountain', baseRank: 35 },

    // Amenity - Education & Religion
    'amenity=school': { category: 'Education', subcategory: 'School', baseRank: 60 },
    'amenity=college': { category: 'Education', subcategory: 'College', baseRank: 65 },
    'amenity=university': { category: 'Education', subcategory: 'University', baseRank: 70 },
    'amenity=kindergarten': { category: 'Education', subcategory: 'Kindergarten', baseRank: 55 },
    'amenity=library': { category: 'Education', subcategory: 'Library', baseRank: 60 },
    'amenity=place_of_worship': { category: 'Religious', subcategory: 'Place of Worship', baseRank: 60 },
    'religion=christian': { category: 'Religious', subcategory: 'Church', baseRank: 60 },
    'religion=muslim': { category: 'Religious', subcategory: 'Mosque', baseRank: 60 },
    'religion=jewish': { category: 'Religious', subcategory: 'Synagogue', baseRank: 60 },
    'religion=hindu': { category: 'Religious', subcategory: 'Hindu Temple', baseRank: 60 },
    'religion=buddhist': { category: 'Religious', subcategory: 'Buddhist Temple', baseRank: 60 },
    'religion=shinto': { category: 'Religious', subcategory: 'Place of Worship', baseRank: 60 },

    // Amenity - Transport
    'amenity=fuel': { category: 'Transport', subcategory: 'Gas Station', baseRank: 55 },
    'amenity=charging_station': { category: 'Transport', subcategory: 'Charging Station', baseRank: 50 },
    'amenity=parking': { category: 'Transport', subcategory: 'Parking', baseRank: 45 },
    'amenity=parking_entrance': { category: 'Transport', subcategory: 'Parking', baseRank: 45 },
    'amenity=parking_space': { category: 'Transport', subcategory: 'Parking', baseRank: 40 },
    'amenity=taxi': { category: 'Transport', subcategory: 'Taxi Stand', baseRank: 45 },
    'amenity=car_rental': { category: 'Transport', subcategory: 'Car Rental', baseRank: 45 },
    'amenity=car_sharing': { category: 'Transport', subcategory: 'Car Sharing', baseRank: 45 },
    'amenity=bicycle_rental': { category: 'Transport', subcategory: 'Bike Rental', baseRank: 45 },
    'amenity=bicycle_parking': { category: 'Transport', subcategory: 'Bike Parking', baseRank: 35 },
    'amenity=bicycle_repair_station': { category: 'Transport', subcategory: 'Bicycle Repair', baseRank: 35 },
    'amenity=bus_station': { category: 'Transport', subcategory: 'Bus Station', baseRank: 75 },

    // Amenity - Shopping
    'amenity=marketplace': { category: 'Shopping', subcategory: 'Market', baseRank: 50 },

    // Shop
    'shop=supermarket': { category: 'Shopping', subcategory: 'Supermarket', baseRank: 65 },
    'shop=grocery': { category: 'Shopping', subcategory: 'Grocery', baseRank: 55 },
    'shop=convenience': { category: 'Shopping', subcategory: 'Convenience Store', baseRank: 40 },
    'shop=mall': { category: 'Shopping', subcategory: 'Shopping Mall', baseRank: 75 },
    'shop=department_store': { category: 'Shopping', subcategory: 'Department Store', baseRank: 70 },
    'shop=clothes': { category: 'Shopping', subcategory: 'Clothing Store', baseRank: 50 },
    'shop=shoes': { category: 'Shopping', subcategory: 'Clothing Store', baseRank: 45 },
    'shop=electronics': { category: 'Shopping', subcategory: 'Electronics Store', baseRank: 50 },
    'shop=books': { category: 'Shopping', subcategory: 'Bookstore', baseRank: 45 },
    'shop=furniture': { category: 'Shopping', subcategory: 'Furniture Store', baseRank: 45 },
    'shop=hardware': { category: 'Shopping', subcategory: 'Hardware Store', baseRank: 45 },
    'shop=sports': { category: 'Shopping', subcategory: 'Sports Shop', baseRank: 45 },
    'shop=gift': { category: 'Shopping', subcategory: 'Gift Shop', baseRank: 40 },
    'shop=jewelry': { category: 'Shopping', subcategory: 'Jewelry Store', baseRank: 45 },
    'shop=florist': { category: 'Shopping', subcategory: 'Florist', baseRank: 40 },
    'shop=alcohol': { category: 'Shopping', subcategory: 'Liquor Store', baseRank: 40 },
    'shop=beverages': { category: 'Shopping', subcategory: 'Liquor Store', baseRank: 40 },
    'shop=variety_store': { category: 'Shopping', subcategory: 'Variety Store', baseRank: 40 },
    'shop=bakery': { category: 'Food & Drink', subcategory: 'Bakery', baseRank: 50 },
    'shop=butcher': { category: 'Food & Drink', subcategory: 'Butcher', baseRank: 45 },
    'shop=seafood': { category: 'Food & Drink', subcategory: 'Seafood', baseRank: 45 },
    'shop=greengrocer': { category: 'Food & Drink', subcategory: 'Greengrocer', baseRank: 40 },
    'shop=deli': { category: 'Food & Drink', subcategory: 'Deli', baseRank: 40 },
    'shop=confectionery': { category: 'Food & Drink', subcategory: 'Confectionery', baseRank: 40 },

    // Tourism - Attractions & Entertainment
    'tourism=museum': { category: 'Attractions', subcategory: 'Museum', baseRank: 80 },
    'tourism=artwork': { category: 'Attractions', subcategory: 'Monument', baseRank: 70 },
    'tourism=gallery': { category: 'Attractions', subcategory: 'Art Gallery', baseRank: 70 },
    'tourism=attraction': { category: 'Attractions', subcategory: 'Tourist Attraction', baseRank: 75 },
    'tourism=viewpoint': { category: 'Attractions', subcategory: 'Viewpoint', baseRank: 70 },
    'tourism=zoo': { category: 'Attractions', subcategory: 'Zoo', baseRank: 80 },
    'tourism=information': { category: 'Public Services', subcategory: 'Information Center', baseRank: 45 },
    'tourism=aquarium': { category: 'Entertainment', subcategory: 'Aquarium', baseRank: 75 },
    'tourism=theme_park': { category: 'Entertainment', subcategory: 'Theme Park', baseRank: 75 },
    'tourism=picnic_site': { category: 'Nature', subcategory: 'Park', baseRank: 55 },

    // Tourism - Accommodation
    'tourism=hotel': { category: 'Accommodation', subcategory: 'Hotel', baseRank: 70 },
    'tourism=hostel': { category: 'Accommodation', subcategory: 'Hostel', baseRank: 60 },
    'tourism=motel': { category: 'Accommodation', subcategory: 'Motel', baseRank: 60 },
    'tourism=guest_house': { category: 'Accommodation', subcategory: 'Guest House', baseRank: 60 },
    'tourism=chalet': { category: 'Accommodation', subcategory: 'Guest House', baseRank: 55 },
    'tourism=apartment': { category: 'Accommodation', subcategory: 'Guest House', baseRank: 55 },
    'tourism=camp_site': { category: 'Accommodation', subcategory: 'Camping', baseRank: 55 },
    'tourism=caravan_site': { category: 'Accommodation', subcategory: 'Caravan Park', baseRank: 55 },

    // Leisure - Nature & Sports
    'leisure=park': { category: 'Nature', subcategory: 'Park', baseRank: 70 },
    'leisure=garden': { category: 'Nature', subcategory: 'Garden', baseRank: 65 },
    'leisure=nature_reserve': { category: 'Nature', subcategory: 'Nature Reserve', baseRank: 70 },
    'leisure=playground': { category: 'Sports & Leisure', subcategory: 'Playground', baseRank: 55 },
    'leisure=sports_centre': { category: 'Sports & Leisure', subcategory: 'Sports Centre', baseRank: 70 },
    'leisure=stadium': { category: 'Sports & Leisure', subcategory: 'Stadium', baseRank: 80 },
    'leisure=pitch': { category: 'Sports & Leisure', subcategory: 'Pitch', baseRank: 65 },
    'leisure=track': { category: 'Sports & Leisure', subcategory: 'Track', baseRank: 60 },
    'leisure=swimming_pool': { category: 'Sports & Leisure', subcategory: 'Swimming Pool', baseRank: 65 },
    'leisure=fitness_centre': { category: 'Sports & Leisure', subcategory: 'Gym', baseRank: 60 },
    'leisure=golf_course': { category: 'Sports & Leisure', subcategory: 'Golf Course', baseRank: 65 },
    'leisure=miniature_golf': { category: 'Sports & Leisure', subcategory: 'Golf Course', baseRank: 55 },
    'leisure=ice_rink': { category: 'Sports & Leisure', subcategory: 'Ice Rink', baseRank: 60 },
    'leisure=skatepark': { category: 'Sports & Leisure', subcategory: 'Skatepark', baseRank: 55 },
    'leisure=water_park': { category: 'Sports & Leisure', subcategory: 'Water Park', baseRank: 60 },
    'leisure=marina': { category: 'Sports & Leisure', subcategory: 'Marina', baseRank: 60 },
    'leisure=bowling_alley': { category: 'Entertainment', subcategory: 'Bowling Alley', baseRank: 60 },
    'leisure=fitness_station': { category: 'Sports & Leisure', subcategory: 'Outdoor Fitness', baseRank: 55 },

    // Historic
    'historic=monument': { category: 'Attractions', subcategory: 'Monument', baseRank: 70 },
    'historic=memorial': { category: 'Attractions', subcategory: 'Memorial', baseRank: 70 },
    'historic=castle': { category: 'Attractions', subcategory: 'Castle', baseRank: 75 },
    'historic=ruins': { category: 'Attractions', subcategory: 'Ruins', baseRank: 65 },
    'historic=archaeological_site': { category: 'Attractions', subcategory: 'Archaeological Site', baseRank: 70 },
    'historic=fort': { category: 'Attractions', subcategory: 'Fort', baseRank: 70 },
    'historic=wayside_shrine': { category: 'Attractions', subcategory: 'Monument', baseRank: 60 },
    'historic=wayside_cross': { category: 'Attractions', subcategory: 'Monument', baseRank: 60 },

    // Man-made
    'man_made=lighthouse': { category: 'Attractions', subcategory: 'Lighthouse', baseRank: 70 },
    'man_made=tower': { category: 'Attractions', subcategory: 'Tower', baseRank: 65 },
    'man_made=water_tower': { category: 'Attractions', subcategory: 'Tower', baseRank: 65 },
    'man_made=windmill': { category: 'Attractions', subcategory: 'Landmark', baseRank: 60 },

    // Office
    'office=government': { category: 'Civic', subcategory: 'Government Office', baseRank: 70 },
    'office=company': { category: 'Services', subcategory: 'Office', baseRank: 40 },
    'office=insurance': { category: 'Services', subcategory: 'Insurance', baseRank: 40 },

    // Nature
    'natural=beach': { category: 'Nature', subcategory: 'Beach', baseRank: 70 },
    'natural=peak': { category: 'Nature', subcategory: 'Peak', baseRank: 65 },
    'natural=waterfall': { category: 'Nature', subcategory: 'Waterfall', baseRank: 65 },
    'natural=spring': { category: 'Nature', subcategory: 'Spring', baseRank: 60 },

    // Transport
    'aeroway=aerodrome': { category: 'Transport', subcategory: 'Airport', baseRank: 95 },
    'aeroway=terminal': { category: 'Transport', subcategory: 'Airport', baseRank: 90 },
    'aeroway=helipad': { category: 'Transport', subcategory: 'Airport', baseRank: 85 },
    'railway=station': { category: 'Transport', subcategory: 'Train Station', baseRank: 90 },
    'railway=halt': { category: 'Transport', subcategory: 'Train Station', baseRank: 70 },
    'railway=tram_stop': { category: 'Transport', subcategory: 'Tram Stop', baseRank: 70 },
    'railway=subway_entrance': { category: 'Transport', subcategory: 'Subway Station', baseRank: 70 },
    'highway=bus_stop': { category: 'Transport', subcategory: 'Bus Stop', baseRank: 65 },
    'highway=services': { category: 'Transport', subcategory: 'Rest Area', baseRank: 45 },
    'highway=rest_area': { category: 'Transport', subcategory: 'Rest Area', baseRank: 45 },
    'railway=platform': { category: 'Transport', subcategory: 'Train Station', baseRank: 70 },
    'public_transport=station': { category: 'Transport', subcategory: 'Train Station', baseRank: 75 },
    'public_transport=stop_position': { category: 'Transport', subcategory: 'Bus Stop', baseRank: 60 },
    'public_transport=platform': { category: 'Transport', subcategory: 'Bus Stop', baseRank: 60 },
    'amenity=ferry_terminal': { category: 'Transport', subcategory: 'Ferry Terminal', baseRank: 80 },
};

export const FALLBACK_MAPPING = { category: 'Shopping', subcategory: 'Grocery', baseRank: 30 };

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
    'Hotel': { minZoomIcon: 14, minZoomLabel: 16 },
    'Bank': { minZoomIcon: 14, minZoomLabel: 16 },
    'Supermarket': { minZoomIcon: 14, minZoomLabel: 16 },
    
    'Cafe': { minZoomIcon: 15, minZoomLabel: 17 },
    'Bar': { minZoomIcon: 15, minZoomLabel: 17 },
    'Grocery': { minZoomIcon: 15, minZoomLabel: 17 },
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
