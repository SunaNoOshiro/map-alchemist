import { describe, expect, it } from 'vitest';
import { PopupGenerator } from '@/features/map/services/PopupGenerator';
import { PoiPopupDetails, PopupStyle } from '@/types';

const popupStyle: PopupStyle = {
  backgroundColor: '#ffcc00',
  textColor: '#101010',
  borderColor: '#303030',
  borderRadius: '10px',
  fontFamily: 'Noto Sans'
};

const baseFeature = {
  properties: {
    category: 'Food & Drink',
    subcategory: 'Cafe',
    title: 'Cafe Aurora',
    description: '',
    address: '',
    website: '',
    phone: '',
    opening_hours: '',
    cuisine: '',
    brand: '',
    operator: '',
  }
};

const baseDetails: PoiPopupDetails = {
  status: 'loaded',
  googleMapsUrl: 'https://www.google.com/maps/search/?api=1&query=Cafe%20Aurora'
};

describe('PopupGenerator', () => {
  it('renders a larger popup icon block when an icon is available', () => {
    const html = PopupGenerator.generateHtml(
      {
        properties: {
          category: 'Transport',
          subcategory: 'Bus Stop',
          title: 'Golden Gate Avenue',
          description: 'Bus stop details'
        }
      },
      popupStyle,
      { land: '#ffffff', text: '#111111', road: '#222222' },
      {
        'Bus Stop': {
          category: 'Transport',
          prompt: 'Bus icon',
          imageUrl: 'https://example.com/bus.png',
          isLoading: false
        }
      },
      false
    );

    expect(html).toContain('width:60px; height:60px;');
    expect(html).toContain('max-width:52px; max-height:52px;');
  });

  it('prefers iconKey image so popup icon matches the map symbol icon', () => {
    const html = PopupGenerator.generateHtml(
      {
        properties: {
          category: 'Transport',
          subcategory: 'Bus Stop',
          iconKey: 'Taxi Stand',
          title: 'Downtown Stop',
          description: 'Transit point'
        }
      },
      popupStyle,
      { land: '#ffffff', text: '#111111', road: '#222222' },
      {
        'Bus Stop': {
          category: 'Transport',
          prompt: 'Bus icon',
          imageUrl: 'https://example.com/bus.png',
          isLoading: false
        },
        'Taxi Stand': {
          category: 'Transport',
          prompt: 'Taxi icon',
          imageUrl: 'https://example.com/taxi.png',
          isLoading: false
        }
      },
      false
    );

    expect(html).toContain('https://example.com/taxi.png');
    expect(html).not.toContain('https://example.com/bus.png');
  });

  it('renders a unified popup frame and compact layout constraints', () => {
    const html = PopupGenerator.generateHtml(
      {
        properties: {
          category: 'Food & Drink',
          subcategory: 'Cafe',
          title: 'Cafe Aurora'
        }
      },
      popupStyle,
      { land: '#ffffff', text: '#111111', road: '#222222' },
      {},
      false
    );

    expect(html).toContain('data-mapalchemist-popup-frame-svg="true"');
    expect(html).toContain('data-mapalchemist-popup-frame-fill="true"');
    expect(html).toContain('data-mapalchemist-popup-frame-stroke="true"');
    expect(html).toContain('data-mapalchemist-popup-content="true"');
    expect(html).toContain('width:min(400px, calc(100vw - 40px)); max-width:400px;');
    expect(html).toContain('max-height:min(56vh, 388px);');
    expect(html).toContain('-webkit-line-clamp:3;');
    expect(html).toContain('grid-template-columns:repeat(auto-fit, minmax(150px, 1fr));');
  });

  it('renders enriched POI details, photo preview, and external links', () => {
    const details: PoiPopupDetails = {
      status: 'loaded',
      address: '123 Market St, San Francisco, CA',
      website: 'https://aurora.example',
      phone: '+1 415 555 0100',
      openingHours: 'Mo-Su 07:00-20:00',
      summary: 'Historic cafe with a bright corner patio.',
      wikipediaUrl: 'https://en.wikipedia.org/wiki/Cafe_Aurora',
      osmUrl: 'https://www.openstreetmap.org/node/42',
      googleMapsUrl: 'https://www.google.com/maps/search/?api=1&query=Cafe%20Aurora',
      googleExactLocationUrl: 'https://www.google.com/maps/search/?api=1&query=37.774900%2C-122.419400',
      photoUrl: 'https://upload.wikimedia.org/cafe-aurora.jpg',
      photoAttributionText: 'Wikimedia Commons',
      photoAttributionUrl: 'https://commons.wikimedia.org/wiki/File:Cafe_Aurora.jpg'
    };

    const html = PopupGenerator.generateHtml(
      baseFeature,
      popupStyle,
      { land: '#ffffff', text: '#111111', road: '#222222' },
      {},
      false,
      details
    );

    expect(html).toContain('data-testid="poi-popup-address"');
    expect(html).toContain('123 Market St, San Francisco, CA');
    expect(html).toContain('popup-google-maps-link');
    expect(html).toContain('Search in Google Maps');
    expect(html).toContain('popup-google-maps-exact-link');
    expect(html).toContain('Open Exact Location');
    expect(html).toContain('popup-osm-link');
    expect(html).toContain('popup-wikipedia-link');
    expect(html).toContain('data-testid="poi-popup-photo"');
    expect(html).toContain('Historic cafe with a bright corner patio.');
  });

  it('falls back to a compact summary label when rich summary text is absent', () => {
    const html = PopupGenerator.generateHtml(
      {
        properties: {
          category: 'Landmark',
          subcategory: 'Monument',
          title: 'Civic Marker',
          description: ''
        }
      },
      popupStyle,
      { land: '#ffffff', text: '#111111', road: '#222222' },
      {},
      false,
      {
        ...baseDetails,
        status: 'loaded'
      }
    );

    expect(html).toContain('data-testid="poi-popup-summary"');
    expect(html).toContain('Monument');
  });

  it('derives taller scenic photo frames and more compact business frames', () => {
    const scenicPresentation = PopupGenerator.derivePhotoPresentation(
      {
        properties: {
          category: 'Landmark',
          subcategory: 'Monument',
          title: 'Civic Marker'
        }
      },
      {
        ...baseDetails,
        photoUrl: 'https://upload.wikimedia.org/monument.jpg',
        photoCandidates: [
          {
            url: 'https://upload.wikimedia.org/monument.jpg',
            source: 'wikimedia-commons'
          }
        ]
      },
      {
        naturalWidth: 1600,
        naturalHeight: 900,
        popupWidth: 400
      }
    );

    const businessPresentation = PopupGenerator.derivePhotoPresentation(
      baseFeature,
      {
        ...baseDetails,
        photoUrl: 'https://upload.wikimedia.org/cafe.jpg',
        photoCandidates: [
          {
            url: 'https://upload.wikimedia.org/cafe.jpg',
            source: 'wikimedia-commons'
          }
        ]
      },
      {
        naturalWidth: 1600,
        naturalHeight: 900,
        popupWidth: 400
      }
    );

    expect(scenicPresentation.categoryProfile).toBe('scenic');
    expect(businessPresentation.categoryProfile).toBe('business');
    expect(scenicPresentation.frameHeight).toBeGreaterThan(businessPresentation.frameHeight);
  });

  it('renders low-resolution photos in a more compact frame with adaptive fit', () => {
    const lowResolution = PopupGenerator.derivePhotoPresentation(
      baseFeature,
      {
        ...baseDetails,
        photoUrl: 'https://upload.wikimedia.org/cafe-low.jpg',
        photoCandidates: [
          {
            url: 'https://upload.wikimedia.org/cafe-low.jpg',
            source: 'commons-geosearch'
          }
        ]
      },
      {
        naturalWidth: 320,
        naturalHeight: 240,
        popupWidth: 400
      }
    );

    const highResolution = PopupGenerator.derivePhotoPresentation(
      baseFeature,
      {
        ...baseDetails,
        photoUrl: 'https://upload.wikimedia.org/cafe-high.jpg',
        photoCandidates: [
          {
            url: 'https://upload.wikimedia.org/cafe-high.jpg',
            source: 'wikimedia-commons'
          }
        ]
      },
      {
        naturalWidth: 1800,
        naturalHeight: 1200,
        popupWidth: 400
      }
    );

    expect(lowResolution.resolutionBand).toBe('low');
    expect(highResolution.resolutionBand).toBe('high');
    expect(lowResolution.frameHeight).toBeLessThan(highResolution.frameHeight);
    expect(lowResolution.objectFit).toBe('contain');
  });

  it('covers all optional field combinations in rendered popup sections', () => {
    const optionalFields = [
      {
        name: 'photo',
        marker: 'data-testid="poi-popup-photo"',
        apply: (details: PoiPopupDetails) => ({
          ...details,
          photoUrl: 'https://upload.wikimedia.org/photo.jpg',
          photoAttributionText: 'Wikimedia Commons',
          photoAttributionUrl: 'https://commons.wikimedia.org/wiki/File:Photo.jpg'
        })
      },
      {
        name: 'address',
        marker: 'data-testid="poi-popup-address"',
        apply: (details: PoiPopupDetails) => ({ ...details, address: '123 Market St' })
      },
      {
        name: 'hours',
        marker: 'data-testid="poi-popup-hours"',
        apply: (details: PoiPopupDetails) => ({ ...details, openingHours: 'Mo-Fr 08:00-18:00' })
      },
      {
        name: 'cuisine',
        marker: 'data-testid="poi-popup-cuisine"',
        apply: (details: PoiPopupDetails) => ({ ...details, cuisine: 'coffee_shop' })
      },
      {
        name: 'brand',
        marker: 'data-testid="poi-popup-brand"',
        apply: (details: PoiPopupDetails) => ({ ...details, brand: 'Aurora' })
      },
      {
        name: 'operator',
        marker: 'data-testid="poi-popup-operator"',
        apply: (details: PoiPopupDetails) => ({ ...details, operator: 'Aurora Group' })
      },
      {
        name: 'phone',
        marker: 'data-testid="poi-popup-phone"',
        apply: (details: PoiPopupDetails) => ({ ...details, phone: '+1 415 555 0100' })
      },
      {
        name: 'website',
        marker: 'data-testid="poi-popup-website"',
        apply: (details: PoiPopupDetails) => ({ ...details, website: 'https://aurora.example' })
      },
      {
        name: 'google exact location',
        marker: 'popup-google-maps-exact-link',
        apply: (details: PoiPopupDetails) => ({
          ...details,
          googleExactLocationUrl: 'https://www.google.com/maps/search/?api=1&query=37.774900%2C-122.419400'
        })
      },
      {
        name: 'wikipedia',
        marker: 'popup-wikipedia-link',
        apply: (details: PoiPopupDetails) => ({ ...details, wikipediaUrl: 'https://en.wikipedia.org/wiki/Cafe_Aurora' })
      },
      {
        name: 'osm',
        marker: 'popup-osm-link',
        apply: (details: PoiPopupDetails) => ({ ...details, osmUrl: 'https://www.openstreetmap.org/node/42' })
      }
    ] as const;

    const totalCases = 1 << optionalFields.length;
    for (let mask = 0; mask < totalCases; mask += 1) {
      let details = { ...baseDetails };
      optionalFields.forEach((field, index) => {
        if ((mask & (1 << index)) !== 0) {
          details = field.apply(details);
        }
      });

      const html = PopupGenerator.generateHtml(
        baseFeature,
        popupStyle,
        { land: '#ffffff', text: '#111111', road: '#222222' },
        {},
        false,
        details
      );

      expect(html).toContain('popup-google-maps-link');
      optionalFields.forEach((field, index) => {
        const enabled = (mask & (1 << index)) !== 0;
        if (enabled) {
          expect(html, `expected ${field.name} marker for mask ${mask}`).toContain(field.marker);
        } else {
          expect(html, `expected ${field.name} marker to be absent for mask ${mask}`).not.toContain(field.marker);
        }
      });
    }
  });

  it('renders loading and error states without inventing missing optional sections', () => {
    const loadingHtml = PopupGenerator.generateHtml(
      baseFeature,
      popupStyle,
      { land: '#ffffff', text: '#111111', road: '#222222' },
      {},
      false,
      {
        ...baseDetails,
        status: 'loading'
      }
    );

    const errorHtml = PopupGenerator.generateHtml(
      baseFeature,
      popupStyle,
      { land: '#ffffff', text: '#111111', road: '#222222' },
      {},
      false,
      {
        ...baseDetails,
        status: 'error'
      }
    );

    expect(loadingHtml).toContain('data-testid="poi-popup-loading"');
    expect(loadingHtml).toContain('data-testid="poi-popup-loading-status"');
    expect(loadingHtml).toContain('data-testid="poi-popup-loading-line-primary"');
    expect(loadingHtml).toContain('data-testid="poi-popup-loading-line-secondary"');
    expect(loadingHtml).not.toContain('data-testid="poi-popup-loading-orbit"');
    expect(loadingHtml).not.toContain('data-testid="poi-popup-loading-shimmer"');
    expect(loadingHtml).not.toContain('data-testid="poi-popup-photo"');
    expect(errorHtml).toContain('data-testid="poi-popup-error"');
    expect(errorHtml).toContain('popup-google-maps-link');
    expect(errorHtml).not.toContain('popup-wikipedia-link');
  });
});
