import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PoiDetailsService } from '@/features/map/services/PoiDetailsService';

const createFeature = (propertyOverrides: Record<string, unknown> = {}) => ({
    geometry: {
        type: 'Point',
        coordinates: [-122.4194, 37.7749]
    },
    properties: {
        id: 'poi-1',
        title: 'Cafe Aurora',
        category: 'Food & Drink',
        subcategory: 'Cafe',
        description: 'Cozy neighborhood cafe',
        ...propertyOverrides
    }
});

const jsonResponse = (payload: unknown) => ({
    ok: true,
    status: 200,
    json: async () => payload
});

const readGoogleQuery = (url: string) => decodeURIComponent(new URL(url).searchParams.get('query') || '');

describe('PoiDetailsService', () => {
    beforeEach(() => {
        PoiDetailsService.resetForTesting();
        vi.restoreAllMocks();
    });

    it('builds immediate popup details from feature properties and preserves direct image candidates', () => {
        const details = PoiDetailsService.buildInitialDetails(createFeature({
            address: '123 Market St, San Francisco, CA',
            website: 'example.com',
            phone: '+1 415 555 0100',
            opening_hours: 'Mo-Fr 08:00-18:00',
            wikipedia: 'en:Cafe_Aurora',
            wikimedia_commons: 'File:Cafe_Aurora.jpg',
            image: 'https://images.example.com/cafe-aurora.jpg'
        }));

        expect(details.status).toBe('idle');
        expect(details.address).toContain('123 Market St');
        expect(details.website).toBe('https://example.com');
        expect(details.phone).toBe('+1 415 555 0100');
        expect(details.openingHours).toBe('Mo-Fr 08:00-18:00');
        expect(details.wikipediaUrl).toBe('https://en.wikipedia.org/wiki/Cafe_Aurora');
        expect(details.photoUrl).toBe('https://images.example.com/cafe-aurora.jpg');
        expect(details.photoCandidates).toEqual([
            expect.objectContaining({
                url: 'https://images.example.com/cafe-aurora.jpg',
                source: 'osm-image'
            })
        ]);
        expect(details.googleMapsUrl).toContain('google.com/maps/search/');
        expect(details.googleExactLocationUrl).toContain('google.com/maps/search/');
        expect(details.googleMapsUrl).toContain('utm_source=MapAlchemist');
    });

    it('hydrates popup details from Nominatim and Wikipedia, builds ranked photo candidates, and caches the result', async () => {
        const fetchMock = vi.fn(async (url: string) => {
            if (url.includes('/lookup?')) {
                return jsonResponse([
                    {
                        osm_id: 42,
                        osm_type: 'node',
                        display_name: 'Cafe Aurora, 123 Market St, San Francisco, California, 94103, United States',
                        address: {
                            house_number: '123',
                            road: 'Market St',
                            city: 'San Francisco',
                            state: 'California',
                            postcode: '94103',
                            country: 'United States'
                        },
                        extratags: {
                            website: 'https://aurora.example',
                            phone: '+1 415 555 0100',
                            opening_hours: 'Mo-Su 07:00-20:00',
                            wikipedia: 'en:Cafe_Aurora'
                        }
                    }
                ]);
            }

            if (url.includes('/api/rest_v1/page/summary/')) {
                return jsonResponse({
                    extract: 'Cafe Aurora is a historic gathering place in downtown San Francisco.',
                    thumbnail: {
                        source: 'https://upload.wikimedia.org/cafe-aurora-summary.jpg'
                    }
                });
            }

            if (url.includes('/w/api.php') && url.includes('titles=Cafe%20Aurora')) {
                return jsonResponse({
                    query: {
                        pages: [
                            {
                                title: 'Cafe Aurora',
                                thumbnail: {
                                    source: 'https://upload.wikimedia.org/cafe-aurora-pageimage.jpg'
                                }
                            }
                        ]
                    }
                });
            }

            throw new Error(`Unexpected URL: ${url}`);
        });

        vi.stubGlobal('fetch', fetchMock);

        const feature = createFeature({
            osm_id: 42,
            osm_type: 'node'
        });

        const first = await PoiDetailsService.getDetails(feature);
        const second = await PoiDetailsService.getDetails(feature);

        expect(first.status).toBe('loaded');
        expect(first.address).toBe('Market St 123, San Francisco, California, 94103, United States');
        expect(first.website).toBe('https://aurora.example');
        expect(first.phone).toBe('+1 415 555 0100');
        expect(first.openingHours).toBe('Mo-Su 07:00-20:00');
        expect(first.summary).toContain('historic gathering place');
        expect(first.photoUrl).toBe('https://upload.wikimedia.org/cafe-aurora-summary.jpg');
        expect(first.photoCandidates?.map((candidate) => candidate.url)).toEqual([
            'https://upload.wikimedia.org/cafe-aurora-summary.jpg',
            'https://upload.wikimedia.org/cafe-aurora-pageimage.jpg'
        ]);
        expect(first.wikipediaUrl).toBe('https://en.wikipedia.org/wiki/Cafe_Aurora');
        expect(first.osmUrl).toBe('https://www.openstreetmap.org/node/42');
        expect(readGoogleQuery(first.googleMapsUrl)).toBe(
            'Cafe Aurora, 123 Market St, San Francisco, California 94103, United States'
        );
        expect(readGoogleQuery(first.googleExactLocationUrl || '')).toBe('37.774900,-122.419400');
        expect(second).toEqual(first);
        expect(fetchMock).toHaveBeenCalledTimes(3);
    });

    it('falls back to reverse geocoding, resolves Commons thumbnails from Wikidata, and keeps wiki images as later candidates', async () => {
        const fetchMock = vi.fn(async (url: string) => {
            if (url.includes('/reverse?')) {
                return jsonResponse({
                    address: {
                        house_number: '1',
                        road: 'Main Plaza',
                        city: 'Kyiv',
                        country: 'Ukraine'
                    },
                    extratags: {
                        wikidata: 'Q123'
                    }
                });
            }

            if (url.includes('/Special:EntityData/Q123.json')) {
                return jsonResponse({
                    entities: {
                        Q123: {
                            claims: {
                                P18: [
                                    {
                                        mainsnak: {
                                            datavalue: {
                                                value: 'Plaza.jpg'
                                            }
                                        }
                                    }
                                ]
                            },
                            sitelinks: {
                                enwiki: {
                                    title: 'Plaza',
                                    url: 'https://en.wikipedia.org/wiki/Plaza'
                                }
                            }
                        }
                    }
                });
            }

            if (url.includes('commons.wikimedia.org/w/api.php') && url.includes('File%3APlaza.jpg')) {
                return jsonResponse({
                    query: {
                        pages: [
                            {
                                title: 'File:Plaza.jpg',
                                imageinfo: [
                                    {
                                        thumburl: 'https://upload.wikimedia.org/plaza-thumb.jpg',
                                        url: 'https://upload.wikimedia.org/plaza-original.jpg',
                                        descriptionurl: 'https://commons.wikimedia.org/wiki/File:Plaza.jpg',
                                        mime: 'image/jpeg'
                                    }
                                ]
                            }
                        ]
                    }
                });
            }

            if (url.includes('/api/rest_v1/page/summary/Plaza')) {
                return jsonResponse({
                    extract: 'Plaza is a public square.',
                    thumbnail: {
                        source: 'https://upload.wikimedia.org/plaza-summary.jpg'
                    }
                });
            }

            if (url.includes('/w/api.php') && url.includes('titles=Plaza')) {
                return jsonResponse({
                    query: {
                        pages: [
                            {
                                title: 'Plaza',
                                thumbnail: {
                                    source: 'https://upload.wikimedia.org/plaza-pageimage.jpg'
                                }
                            }
                        ]
                    }
                });
            }

            throw new Error(`Unexpected URL: ${url}`);
        });

        vi.stubGlobal('fetch', fetchMock);

        const details = await PoiDetailsService.getDetails(createFeature({
            title: 'Plaza',
            description: ''
        }));

        expect(details.status).toBe('loaded');
        expect(details.address).toBe('Main Plaza 1, Kyiv, Ukraine');
        expect(details.photoUrl).toBe('https://upload.wikimedia.org/plaza-thumb.jpg');
        expect(details.photoAttributionUrl).toBe('https://commons.wikimedia.org/wiki/File:Plaza.jpg');
        expect(details.photoCandidates?.map((candidate) => candidate.url)).toEqual([
            'https://upload.wikimedia.org/plaza-thumb.jpg',
            'https://upload.wikimedia.org/plaza-summary.jpg',
            'https://upload.wikimedia.org/plaza-pageimage.jpg'
        ]);
        expect(details.wikipediaUrl).toBe('https://en.wikipedia.org/wiki/Plaza');
        expect(fetchMock).toHaveBeenNthCalledWith(
            1,
            expect.stringContaining('/reverse?'),
            expect.any(Object)
        );
    });

    it('discovers a nearby Wikipedia image when the POI has no direct photo metadata', async () => {
        const fetchMock = vi.fn(async (url: string) => {
            if (url.includes('/lookup?')) {
                return jsonResponse([
                    {
                        osm_id: 77,
                        osm_type: 'node',
                        display_name: 'Atlas, Rockefeller Plaza 45, New York, New York, 10111, United States',
                        address: {
                            house_number: '45',
                            road: 'Rockefeller Plaza',
                            city: 'New York',
                            state: 'New York',
                            postcode: '10111',
                            country: 'United States'
                        },
                        extratags: {}
                    }
                ]);
            }

            if (url.includes('en.wikipedia.org/w/api.php') && url.includes('list=geosearch')) {
                return jsonResponse({
                    query: {
                        geosearch: [
                            {
                                pageid: 100,
                                title: 'Atlas (Rockefeller Center)',
                                dist: 18
                            },
                            {
                                pageid: 101,
                                title: 'Rockefeller Center',
                                dist: 28
                            },
                            {
                                pageid: 102,
                                title: 'New York City',
                                dist: 95
                            }
                        ]
                    }
                });
            }

            if (url.includes('en.wikipedia.org/w/api.php') && url.includes('Atlas%20(Rockefeller%20Center)')) {
                return jsonResponse({
                    query: {
                        pages: [
                            {
                                pageid: 100,
                                title: 'Atlas (Rockefeller Center)',
                                fullurl: 'https://en.wikipedia.org/wiki/Atlas_(Rockefeller_Center)',
                                thumbnail: {
                                    source: 'https://upload.wikimedia.org/atlas-nearby.jpg'
                                }
                            }
                        ]
                    }
                });
            }

            throw new Error(`Unexpected URL: ${url}`);
        });

        vi.stubGlobal('fetch', fetchMock);

        const details = await PoiDetailsService.getDetails(createFeature({
            title: 'Atlas',
            description: '',
            osm_id: 77,
            osm_type: 'node'
        }));

        expect(details.status).toBe('loaded');
        expect(details.photoUrl).toBe('https://upload.wikimedia.org/atlas-nearby.jpg');
        expect(details.photoCandidates).toEqual([
            expect.objectContaining({
                url: 'https://upload.wikimedia.org/atlas-nearby.jpg',
                source: 'wikipedia-geosearch',
                attributionUrl: 'https://en.wikipedia.org/wiki/Atlas_(Rockefeller_Center)'
            })
        ]);
        expect(fetchMock).toHaveBeenCalledWith(
            expect.stringContaining('en.wikipedia.org/w/api.php?action=query'),
            expect.any(Object)
        );
    });

    it('appends nearby Commons geotagged images when only a direct OSM image candidate exists', async () => {
        const fetchMock = vi.fn(async (url: string) => {
            if (url.includes('/lookup?')) {
                return jsonResponse([
                    {
                        osm_id: 88,
                        osm_type: 'node',
                        display_name: 'Hotel Biron, 45 Rose Street, San Francisco, California, 94102, United States',
                        address: {
                            house_number: '45',
                            road: 'Rose Street',
                            city: 'San Francisco',
                            state: 'California',
                            postcode: '94102',
                            country: 'United States'
                        },
                        extratags: {
                            image: 'https://images.example.com/broken-hotel-biron.jpg',
                            website: 'https://hotelbironwinebar.com'
                        }
                    }
                ]);
            }

            if (url.includes('en.wikipedia.org/w/api.php') && url.includes('list=geosearch')) {
                return jsonResponse({
                    query: {
                        geosearch: []
                    }
                });
            }

            if (url.includes('commons.wikimedia.org/w/api.php') && url.includes('list=geosearch')) {
                return jsonResponse({
                    query: {
                        geosearch: [
                            {
                                pageid: 201,
                                title: 'File:Hotel Biron wine bar SF.jpg',
                                dist: 22
                            },
                            {
                                pageid: 202,
                                title: 'File:Page Street and Gough Street intersection.jpg',
                                dist: 31
                            }
                        ]
                    }
                });
            }

            if (url.includes('commons.wikimedia.org/w/api.php') && url.includes('File%3AHotel%20Biron%20wine%20bar%20SF.jpg')) {
                return jsonResponse({
                    query: {
                        pages: [
                            {
                                title: 'File:Hotel Biron wine bar SF.jpg',
                                imageinfo: [
                                    {
                                        thumburl: 'https://upload.wikimedia.org/hotel-biron-commons-thumb.jpg',
                                        url: 'https://upload.wikimedia.org/hotel-biron-commons.jpg',
                                        descriptionurl: 'https://commons.wikimedia.org/wiki/File:Hotel_Biron_wine_bar_SF.jpg',
                                        mime: 'image/jpeg'
                                    }
                                ]
                            }
                        ]
                    }
                });
            }

            throw new Error(`Unexpected URL: ${url}`);
        });

        vi.stubGlobal('fetch', fetchMock);

        const details = await PoiDetailsService.getDetails(createFeature({
            title: 'Hôtel Biron',
            description: '',
            osm_id: 88,
            osm_type: 'node'
        }));

        expect(details.status).toBe('loaded');
        expect(details.photoCandidates?.map((candidate) => candidate.url)).toEqual([
            'https://images.example.com/broken-hotel-biron.jpg',
            'https://upload.wikimedia.org/hotel-biron-commons-thumb.jpg'
        ]);
        expect(details.photoCandidates?.[1]).toEqual(expect.objectContaining({
            source: 'commons-geosearch',
            attributionUrl: 'https://commons.wikimedia.org/wiki/File:Hotel_Biron_wine_bar_SF.jpg'
        }));
        expect(fetchMock).toHaveBeenCalledWith(
            expect.stringContaining('commons.wikimedia.org/w/api.php?action=query'),
            expect.any(Object)
        );
    });

    it('builds Google Maps search queries with postal-style street ordering and no coordinate hints', () => {
        const url = PoiDetailsService.buildGoogleMapsUrl(createFeature({
            'addr:housenumber': '52',
            'addr:street': 'Grove Street',
            'addr:city': 'San Francisco',
            'addr:state': 'CA',
            'addr:postcode': '94102',
            'addr:country': 'US'
        }));

        const query = readGoogleQuery(url);
        expect(query).toBe('Cafe Aurora, 52 Grove Street, San Francisco, CA 94102, US');
        expect(query).not.toContain('Grove Street 52');
        expect(query).not.toMatch(/-?\d+\.\d{6},-?\d+\.\d{6}/);
    });

    it('builds an exact Google location URL anchored to POI coordinates', () => {
        const url = PoiDetailsService.buildGoogleExactLocationUrl(createFeature());

        expect(url).toContain('google.com/maps/search/');
        expect(readGoogleQuery(url || '')).toBe('37.774900,-122.419400');
    });
});
