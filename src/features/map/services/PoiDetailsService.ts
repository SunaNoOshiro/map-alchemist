import { createLogger } from '@core/logger';
import { PoiPopupDetails, PoiPopupPhotoCandidate } from '@/types';

const logger = createLogger('PoiDetailsService');
const NOMINATIM_BASE_URL = 'https://nominatim.openstreetmap.org';
const WIKIDATA_ENTITY_BASE_URL = 'https://www.wikidata.org/wiki/Special:EntityData';
const COMMONS_FILE_PATH_BASE_URL = 'https://commons.wikimedia.org/wiki/Special:FilePath';
const COMMONS_FILE_PAGE_BASE_URL = 'https://commons.wikimedia.org/wiki';
const COMMONS_API_BASE_URL = 'https://commons.wikimedia.org/w/api.php';
const GOOGLE_MAPS_SEARCH_BASE_URL = 'https://www.google.com/maps/search/';
const NOMINATIM_MIN_REQUEST_INTERVAL_MS = 1100;

type NominatimRecord = {
    osm_id?: number | string;
    osm_type?: string;
    lat?: string;
    lon?: string;
    name?: string;
    display_name?: string;
    address?: Record<string, string>;
    extratags?: Record<string, string>;
    namedetails?: Record<string, string>;
};

type WikipediaSummaryRecord = {
    extract?: string;
    thumbnail?: {
        source?: string;
    };
};

type WikidataEntityResponse = {
    entities?: Record<string, {
        claims?: Record<string, Array<{
            mainsnak?: {
                datavalue?: {
                    value?: unknown;
                };
            };
        }>>;
        sitelinks?: Record<string, {
            title?: string;
            url?: string;
        }>;
    }>;
};

type CommonsImageInfoResponse = {
    query?: {
        pages?: Array<{
            missing?: boolean;
            title?: string;
            thumbnail?: {
                source?: string;
            };
            imageinfo?: Array<{
                url?: string;
                thumburl?: string;
                descriptionurl?: string;
                descriptionshorturl?: string;
                mime?: string;
            }>;
        }>;
    };
};

type WikipediaPageImagesResponse = {
    query?: {
        pages?: Array<{
            missing?: boolean;
            pageid?: number;
            title?: string;
            fullurl?: string;
            thumbnail?: {
                source?: string;
            };
            original?: {
                source?: string;
            };
        }>;
    };
};

type WikipediaGeoSearchResponse = {
    query?: {
        geosearch?: Array<{
            pageid?: number;
            title?: string;
            dist?: number;
            lat?: number;
            lon?: number;
        }>;
    };
};

type CommonsGeoSearchResponse = {
    query?: {
        geosearch?: Array<{
            pageid?: number;
            title?: string;
            dist?: number;
            lat?: number;
            lon?: number;
        }>;
    };
};

const sanitizeText = (value: unknown): string | undefined => {
    if (typeof value !== 'string' && typeof value !== 'number') return undefined;
    const trimmed = String(value).trim();
    return trimmed || undefined;
};

const sanitizeUrl = (value: unknown): string | undefined => {
    const raw = sanitizeText(value);
    if (!raw) return undefined;
    if (/^https?:\/\//i.test(raw)) return raw;
    if (/^\/\//.test(raw)) return `https:${raw}`;
    if (/^[a-z][a-z0-9+.-]*:/i.test(raw)) return undefined;
    return `https://${raw}`;
};

const sanitizePhone = (value: unknown): string | undefined => {
    const raw = sanitizeText(value);
    if (!raw) return undefined;
    return raw.replace(/\s+/g, ' ');
};

const buildTelUrl = (value: string | undefined): string | undefined => {
    if (!value) return undefined;
    const normalized = value.replace(/[^+\d]/g, '');
    return normalized ? `tel:${normalized}` : undefined;
};

const encodePathSegment = (value: string): string =>
    encodeURIComponent(value).replace(/%2F/g, '/');

const normalizeOsmTypeCode = (value: unknown): 'N' | 'W' | 'R' | undefined => {
    const raw = sanitizeText(value)?.toLowerCase();
    if (!raw) return undefined;
    if (raw === 'n' || raw === 'node') return 'N';
    if (raw === 'w' || raw === 'way') return 'W';
    if (raw === 'r' || raw === 'relation') return 'R';
    return undefined;
};

const normalizeOsmTypePath = (value: unknown): 'node' | 'way' | 'relation' | undefined => {
    const code = normalizeOsmTypeCode(value);
    if (code === 'N') return 'node';
    if (code === 'W') return 'way';
    if (code === 'R') return 'relation';
    return undefined;
};

const composeAddress = (parts: Array<unknown>): string | undefined => {
    const normalized = parts
        .map((part) => sanitizeText(part))
        .filter((part): part is string => Boolean(part));

    if (normalized.length === 0) return undefined;
    return normalized.join(', ');
};

const parseCoordinates = (feature: any): { lng: number; lat: number } | null => {
    const coordinates = feature?.geometry?.coordinates;
    if (!Array.isArray(coordinates) || coordinates.length < 2) return null;

    const lng = Number(coordinates[0]);
    const lat = Number(coordinates[1]);
    if (!Number.isFinite(lng) || !Number.isFinite(lat)) return null;
    if (Math.abs(lng) > 180 || Math.abs(lat) > 90) return null;

    return { lng, lat };
};

const buildAddressFromObject = (address: Record<string, string> | undefined): string | undefined => {
    if (!address) return undefined;

    const house = sanitizeText(address.house_number);
    const road = sanitizeText(address.road);
    const line1 = [road, house].filter(Boolean).join(' ').trim();

    return composeAddress([
        line1,
        address.neighbourhood,
        address.suburb,
        address.city || address.town || address.village || address.hamlet,
        address.state,
        address.postcode,
        address.country
    ]);
};

const buildGoogleQueryAddress = (
    properties: Record<string, unknown>,
    addressObject?: Record<string, string>
): string | undefined => {
    const houseNumber = sanitizeText(properties['addr:housenumber']) || sanitizeText(addressObject?.house_number);
    const road = sanitizeText(properties['addr:street']) || sanitizeText(addressObject?.road);
    const city =
        sanitizeText(properties['addr:city']) ||
        sanitizeText(addressObject?.city) ||
        sanitizeText(addressObject?.town) ||
        sanitizeText(addressObject?.village) ||
        sanitizeText(addressObject?.hamlet);
    const state = sanitizeText(properties['addr:state']) || sanitizeText(addressObject?.state);
    const postcode = sanitizeText(properties['addr:postcode']) || sanitizeText(addressObject?.postcode);
    const country = sanitizeText(properties['addr:country']) || sanitizeText(addressObject?.country);

    const line1 = [houseNumber, road].filter(Boolean).join(' ').trim();
    const region = [state, postcode].filter(Boolean).join(' ').trim();

    return composeAddress([
        line1,
        city,
        region,
        country
    ]);
};

const buildAddressFromProperties = (properties: Record<string, unknown>): string | undefined =>
    composeAddress([
        [sanitizeText(properties['addr:street']), sanitizeText(properties['addr:housenumber'])].filter(Boolean).join(' ').trim(),
        properties['addr:city'],
        properties['addr:state'],
        properties['addr:postcode'],
        properties['addr:country'],
        properties.address
    ]);

const buildWikipediaUrl = (value: unknown): string | undefined => {
    const raw = sanitizeText(value);
    if (!raw) return undefined;
    if (/^https?:\/\//i.test(raw)) return raw;

    const separatorIndex = raw.indexOf(':');
    if (separatorIndex <= 0) return undefined;

    const lang = raw.slice(0, separatorIndex).trim();
    const title = raw.slice(separatorIndex + 1).trim().replace(/ /g, '_');
    if (!lang || !title) return undefined;

    return `https://${lang}.wikipedia.org/wiki/${encodePathSegment(title)}`;
};

const buildWikipediaSummaryUrl = (value: unknown): string | undefined => {
    const raw = sanitizeText(value);
    if (!raw) return undefined;
    if (/^https?:\/\//i.test(raw)) {
        const match = raw.match(/^https?:\/\/([a-z-]+)\.wikipedia\.org\/wiki\/(.+)$/i);
        if (!match) return undefined;
        return `https://${match[1]}.wikipedia.org/api/rest_v1/page/summary/${encodePathSegment(decodeURIComponent(match[2]))}`;
    }

    const separatorIndex = raw.indexOf(':');
    if (separatorIndex <= 0) return undefined;

    const lang = raw.slice(0, separatorIndex).trim();
    const title = raw.slice(separatorIndex + 1).trim().replace(/ /g, '_');
    if (!lang || !title) return undefined;

    return `https://${lang}.wikipedia.org/api/rest_v1/page/summary/${encodePathSegment(title)}`;
};

const buildCommonsFilePathUrl = (value: unknown): string | undefined => {
    const raw = sanitizeText(value);
    if (!raw) return undefined;
    if (/^https?:\/\//i.test(raw)) return raw;

    const normalized = raw.startsWith('File:')
        ? raw
        : raw.startsWith('Image:')
            ? raw.replace(/^Image:/, 'File:')
            : `File:${raw}`;
    if (!normalized) return undefined;
    return `${COMMONS_FILE_PATH_BASE_URL}/${encodePathSegment(normalized)}`;
};

const buildCommonsFilePageUrl = (value: unknown): string | undefined => {
    const raw = sanitizeText(value);
    if (!raw) return undefined;
    if (/^https?:\/\//i.test(raw)) return raw;

    const normalized = raw.startsWith('File:')
        ? raw
        : raw.startsWith('Image:')
            ? raw.replace(/^Image:/, 'File:')
            : `File:${raw}`;
    if (!normalized) return undefined;
    return `${COMMONS_FILE_PAGE_BASE_URL}/${encodePathSegment(normalized)}`;
};

const normalizeCommonsPageTitle = (value: string): string => {
    const trimmed = value.trim().replace(/_/g, ' ');
    if (/^(File|Image|Category):/i.test(trimmed)) {
        const [namespace, ...rest] = trimmed.split(':');
        return `${namespace[0].toUpperCase()}${namespace.slice(1).toLowerCase()}:${rest.join(':').trim()}`;
    }
    return trimmed;
};

const extractCommonsPageTitle = (value: unknown): string | undefined => {
    const raw = sanitizeText(value);
    if (!raw) return undefined;

    if (/^(File|Image|Category):/i.test(raw)) {
        return normalizeCommonsPageTitle(raw);
    }

    const filePathMatch = raw.match(/^https?:\/\/commons\.wikimedia\.org\/wiki\/Special:(?:FilePath|Redirect\/file)\/(.+)$/i);
    if (filePathMatch?.[1]) {
        return normalizeCommonsPageTitle(decodeURIComponent(filePathMatch[1]));
    }

    const pageMatch = raw.match(/^https?:\/\/(?:commons\.wikimedia\.org|[a-z-]+\.wikipedia\.org)\/wiki\/(.+)$/i);
    if (pageMatch?.[1] && /^(File|Image|Category):/i.test(decodeURIComponent(pageMatch[1]))) {
        return normalizeCommonsPageTitle(decodeURIComponent(pageMatch[1]));
    }

    if (!/^[a-z][a-z0-9+.-]*:/i.test(raw) && /\.(avif|gif|jpe?g|png|svg|webp)$/i.test(raw)) {
        return `File:${raw}`;
    }

    return undefined;
};

const isRenderableImageMime = (value: unknown): boolean => {
    const mime = sanitizeText(value);
    return !mime || mime.startsWith('image/');
};

const buildCommonsImageInfoUrl = (pageTitle: string): string =>
    `${COMMONS_API_BASE_URL}?action=query&format=json&formatversion=2&origin=*&prop=imageinfo&iiprop=url|mime&iiurlwidth=960&titles=${encodeURIComponent(pageTitle)}`;

const buildCommonsPageImagesUrl = (pageTitle: string): string =>
    `${COMMONS_API_BASE_URL}?action=query&format=json&formatversion=2&origin=*&prop=pageimages&piprop=thumbnail|original|name&pithumbsize=960&titles=${encodeURIComponent(pageTitle)}`;

const buildCommonsGeoSearchUrl = (
    coords: { lat: number; lng: number },
    radius = 350,
    limit = 8
): string =>
    `${COMMONS_API_BASE_URL}?action=query&format=json&formatversion=2&origin=*&list=geosearch&gsnamespace=6&gscoord=${encodeURIComponent(`${coords.lat}|${coords.lng}`)}&gsradius=${encodeURIComponent(String(radius))}&gslimit=${encodeURIComponent(String(limit))}`;

const buildWikipediaPageImagesUrl = (wikipediaUrl: string): string | undefined => {
    const raw = sanitizeText(wikipediaUrl);
    if (!raw) return undefined;

    const match = raw.match(/^https?:\/\/([a-z-]+)\.wikipedia\.org\/wiki\/(.+)$/i);
    if (!match) return undefined;

    return `https://${match[1]}.wikipedia.org/w/api.php?action=query&format=json&formatversion=2&origin=*&prop=pageimages|info&inprop=url&piprop=thumbnail|original|name&pithumbsize=960&titles=${encodeURIComponent(decodeURIComponent(match[2]).replace(/_/g, ' '))}`;
};

const buildWikipediaTitlesPageImagesUrl = (language: string, titles: string[]): string | undefined => {
    const normalizedTitles = titles
        .map((title) => sanitizeText(title))
        .filter((title): title is string => Boolean(title));
    if (!language || normalizedTitles.length === 0) return undefined;

    return `https://${language}.wikipedia.org/w/api.php?action=query&format=json&formatversion=2&origin=*&prop=pageimages|info&inprop=url&piprop=thumbnail|original|name&pithumbsize=960&titles=${encodeURIComponent(normalizedTitles.join('|'))}`;
};

const buildWikipediaGeoSearchUrl = (
    language: string,
    coords: { lat: number; lng: number },
    radius = 400,
    limit = 8
): string =>
    `https://${language}.wikipedia.org/w/api.php?action=query&format=json&formatversion=2&origin=*&list=geosearch&gscoord=${encodeURIComponent(`${coords.lat}|${coords.lng}`)}&gsradius=${encodeURIComponent(String(radius))}&gslimit=${encodeURIComponent(String(limit))}`;

const buildWikipediaTitleUrl = (language: string, title: string): string =>
    `https://${language}.wikipedia.org/wiki/${encodePathSegment(title.replace(/ /g, '_'))}`;

const extractWikipediaLanguage = (wikipediaUrl: string | undefined): string | undefined => {
    const raw = sanitizeText(wikipediaUrl);
    const match = raw?.match(/^https?:\/\/([a-z-]+)\.wikipedia\.org\/wiki\//i);
    return sanitizeText(match?.[1]);
};

const createPhotoCandidate = (
    url: unknown,
    source: PoiPopupPhotoCandidate['source'],
    options?: {
        attributionText?: string;
        attributionUrl?: string;
    }
): PoiPopupPhotoCandidate | undefined => {
    const normalizedUrl = sanitizeUrl(url);
    if (!normalizedUrl) return undefined;

    return {
        url: normalizedUrl,
        source,
        attributionText: sanitizeText(options?.attributionText),
        attributionUrl: sanitizeUrl(options?.attributionUrl)
    };
};

const sanitizeDirectImageUrl = (value: unknown): string | undefined => {
    const normalizedUrl = sanitizeUrl(value);
    if (!normalizedUrl) return undefined;

    try {
        const parsed = new URL(normalizedUrl);
        if (/\/wiki\//i.test(parsed.pathname) || /\/app\/\?/i.test(parsed.pathname)) {
            return undefined;
        }
    } catch (_error) {
        return undefined;
    }

    if (/\.(?:html?|php)(?:[?#].*)?$/i.test(normalizedUrl)) {
        return undefined;
    }

    return normalizedUrl;
};

const normalizeComparisonText = (value: unknown): string => {
    const raw = sanitizeText(value)?.toLowerCase() || '';
    return raw
        .normalize('NFKD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^\p{L}\p{N}]+/gu, ' ')
        .trim();
};

const tokenizeComparisonText = (value: unknown): string[] =>
    normalizeComparisonText(value)
        .split(/\s+/)
        .filter((token) => token.length > 1);

const computeTokenOverlap = (left: string[], right: string[]): number => {
    if (left.length === 0 || right.length === 0) return 0;
    const leftSet = new Set(left);
    const rightSet = new Set(right);
    let shared = 0;
    leftSet.forEach((token) => {
        if (rightSet.has(token)) shared += 1;
    });

    return shared / Math.max(leftSet.size, rightSet.size, 1);
};

const dedupePhotoCandidates = (candidates: Array<PoiPopupPhotoCandidate | undefined>): PoiPopupPhotoCandidate[] => {
    const seen = new Set<string>();
    const unique: PoiPopupPhotoCandidate[] = [];

    candidates.forEach((candidate) => {
        if (!candidate?.url) return;
        const key = candidate.url.trim();
        if (!key || seen.has(key)) return;
        seen.add(key);
        unique.push(candidate);
    });

    return unique;
};

const hasResolvedFallbackPhotoCandidate = (details: PoiPopupDetails): boolean =>
    Boolean(details.photoCandidates?.some((candidate) => candidate.source !== 'osm-image'));

const extractEntityImageFiles = (response: WikidataEntityResponse, entityId: string): string[] => {
    const entity = response.entities?.[entityId];
    const files = entity?.claims?.P18
        ?.map((claim) => sanitizeText(claim?.mainsnak?.datavalue?.value))
        .filter((value): value is string => Boolean(value)) || [];

    return Array.from(new Set(files));
};

const extractEntityWikipediaUrl = (response: WikidataEntityResponse, entityId: string): string | undefined => {
    const entity = response.entities?.[entityId];
    if (!entity?.sitelinks) return undefined;

    const preferredLanguages = Array.from(new Set([
        sanitizeText(typeof navigator !== 'undefined' ? navigator.language : undefined)?.split('-')[0],
        'en'
    ].filter((value): value is string => Boolean(value))));

    for (const language of preferredLanguages) {
        const sitelink = entity.sitelinks[`${language}wiki`];
        if (sanitizeUrl(sitelink?.url)) return sanitizeUrl(sitelink?.url);
        if (sanitizeText(sitelink?.title)) {
            return `https://${language}.wikipedia.org/wiki/${encodePathSegment(String(sitelink?.title).replace(/ /g, '_'))}`;
        }
    }

    const firstSitelink = Object.entries(entity.sitelinks).find(([key]) => key.endsWith('wiki'))?.[1];
    if (sanitizeUrl(firstSitelink?.url)) return sanitizeUrl(firstSitelink?.url);

    return undefined;
};

const extractEntityCommonsPageTitle = (response: WikidataEntityResponse, entityId: string): string | undefined => {
    const entity = response.entities?.[entityId];
    if (!entity) return undefined;

    const commonsSitelink = entity.sitelinks?.commonswiki;
    const commonsTitle = sanitizeText(commonsSitelink?.title);
    if (commonsTitle && /^(File|Image|Category):/i.test(commonsTitle)) {
        return normalizeCommonsPageTitle(commonsTitle);
    }

    const commonsCategory = sanitizeText(entity.claims?.P373?.[0]?.mainsnak?.datavalue?.value);
    if (commonsCategory) {
        return normalizeCommonsPageTitle(
            commonsCategory.startsWith('Category:') ? commonsCategory : `Category:${commonsCategory}`
        );
    }

    return undefined;
};

const buildGoogleMapsUrl = (
    feature: any,
    options?: {
        addressOverride?: string;
        addressObject?: Record<string, string>;
    }
): string => {
    const properties = (feature?.properties || {}) as Record<string, unknown>;
    const coords = parseCoordinates(feature);
    const title = sanitizeText(properties.title) || sanitizeText(properties.name);
    const address =
        buildGoogleQueryAddress(properties, options?.addressObject) ||
        options?.addressOverride ||
        buildAddressFromProperties(properties);
    const query = sanitizeText(
        address
            ? [title, address].filter(Boolean).join(', ')
            : title || (coords ? `${coords.lat.toFixed(6)},${coords.lng.toFixed(6)}` : '')
    ) || 'points of interest';

    return `${GOOGLE_MAPS_SEARCH_BASE_URL}?api=1&query=${encodeURIComponent(query)}&utm_source=MapAlchemist&utm_campaign=place_details_search`;
};

const buildGoogleExactLocationUrl = (feature: any): string | undefined => {
    const coords = parseCoordinates(feature);
    if (!coords) return undefined;

    return `${GOOGLE_MAPS_SEARCH_BASE_URL}?api=1&query=${encodeURIComponent(`${coords.lat.toFixed(6)},${coords.lng.toFixed(6)}`)}&utm_source=MapAlchemist&utm_campaign=exact_place_location`;
};

const buildOpenStreetMapUrl = (feature: any): string | undefined => {
    const properties = (feature?.properties || {}) as Record<string, unknown>;
    const osmId = sanitizeText(properties.osmId ?? properties.osm_id);
    const osmTypePath = normalizeOsmTypePath(properties.osmType ?? properties.osm_type);
    if (osmId && osmTypePath) {
        return `https://www.openstreetmap.org/${osmTypePath}/${encodeURIComponent(osmId)}`;
    }

    const coords = parseCoordinates(feature);
    if (!coords) return undefined;

    return `https://www.openstreetmap.org/?mlat=${coords.lat}&mlon=${coords.lng}#map=19/${coords.lat}/${coords.lng}`;
};

const mergePreferred = (...values: Array<string | undefined>): string | undefined =>
    values.find((value) => Boolean(sanitizeText(value)));

const withPhotoCandidates = (
    details: PoiPopupDetails,
    ...candidateGroups: Array<Array<PoiPopupPhotoCandidate | undefined> | undefined>
): PoiPopupDetails => {
    const merged = dedupePhotoCandidates([
        ...(details.photoCandidates || []),
        ...candidateGroups.flatMap((group) => group || [])
    ]);
    const primary = merged[0];

    return {
        ...details,
        photoCandidates: merged.length > 0 ? merged : undefined,
        photoUrl: primary?.url,
        photoAttributionText: primary?.attributionText,
        photoAttributionUrl: primary?.attributionUrl
    };
};

export class PoiDetailsService {
    private static readonly resolvedCache = new Map<string, PoiPopupDetails>();
    private static readonly pendingCache = new Map<string, Promise<PoiPopupDetails>>();
    private static nominatimQueue: Promise<void> = Promise.resolve();
    private static lastNominatimRequestAt = 0;

    static resetForTesting(): void {
        PoiDetailsService.resolvedCache.clear();
        PoiDetailsService.pendingCache.clear();
        PoiDetailsService.nominatimQueue = Promise.resolve();
        PoiDetailsService.lastNominatimRequestAt = 0;
    }

    static buildInitialDetails(feature: any): PoiPopupDetails {
        const properties = (feature?.properties || {}) as Record<string, unknown>;
        const address = buildAddressFromProperties(properties);
        const website = sanitizeUrl(properties.website ?? properties['contact:website']);
        const phone = sanitizePhone(properties.phone ?? properties['contact:phone']);
        const openingHours = sanitizeText(properties.openingHours ?? properties.opening_hours ?? properties['contact:opening_hours']);
        const wikipediaUrl = buildWikipediaUrl(properties.wikipedia);
        const osmUrl = buildOpenStreetMapUrl(feature);
        const summary = sanitizeText(properties.summary ?? properties.description);

        const directImage = sanitizeDirectImageUrl(properties.image);
        const initialPhotoCandidates = dedupePhotoCandidates([
            createPhotoCandidate(directImage, 'osm-image')
        ]);
        const primaryPhoto = initialPhotoCandidates[0];

        return {
            status: 'idle',
            address,
            website,
            phone,
            openingHours,
            summary,
            cuisine: sanitizeText(properties.cuisine),
            operator: sanitizeText(properties.operator),
            brand: sanitizeText(properties.brand),
            wikipediaUrl,
            osmUrl,
            googleMapsUrl: buildGoogleMapsUrl(feature, { addressOverride: address }),
            googleExactLocationUrl: buildGoogleExactLocationUrl(feature),
            photoUrl: primaryPhoto?.url,
            photoAttributionText: primaryPhoto?.attributionText,
            photoAttributionUrl: primaryPhoto?.attributionUrl,
            photoCandidates: initialPhotoCandidates.length > 0 ? initialPhotoCandidates : undefined
        };
    }

    static async getDetails(feature: any): Promise<PoiPopupDetails> {
        const cacheKey = PoiDetailsService.buildCacheKey(feature);
        const cached = PoiDetailsService.resolvedCache.get(cacheKey);
        if (cached) return cached;

        const pending = PoiDetailsService.pendingCache.get(cacheKey);
        if (pending) return pending;

        const promise = PoiDetailsService.loadDetails(feature)
            .then((details) => {
                PoiDetailsService.resolvedCache.set(cacheKey, details);
                PoiDetailsService.pendingCache.delete(cacheKey);
                return details;
            })
            .catch((error) => {
                PoiDetailsService.pendingCache.delete(cacheKey);
                logger.warn('Failed to enrich POI details', error);

                const fallback = {
                    ...PoiDetailsService.buildInitialDetails(feature),
                    status: 'error' as const
                };
                PoiDetailsService.resolvedCache.set(cacheKey, fallback);
                return fallback;
            });

        PoiDetailsService.pendingCache.set(cacheKey, promise);
        return promise;
    }

    static buildGoogleMapsUrl(
        feature: any,
        options?: {
            addressOverride?: string;
            addressObject?: Record<string, string>;
        }
    ): string {
        return buildGoogleMapsUrl(feature, options);
    }

    static buildGoogleExactLocationUrl(feature: any): string | undefined {
        return buildGoogleExactLocationUrl(feature);
    }

    private static buildCacheKey(feature: any): string {
        const properties = (feature?.properties || {}) as Record<string, unknown>;
        const osmType = normalizeOsmTypeCode(properties.osmType ?? properties.osm_type);
        const osmId = sanitizeText(properties.osmId ?? properties.osm_id);
        if (osmType && osmId) {
            return `${osmType}:${osmId}`;
        }

        const coords = parseCoordinates(feature);
        const title = sanitizeText(properties.title) || sanitizeText(properties.name) || 'poi';
        if (coords) {
            return `${title}:${coords.lat.toFixed(5)}:${coords.lng.toFixed(5)}`;
        }

        return `${title}:${sanitizeText(properties.id) || 'unknown'}`;
    }

    private static async resolveCommonsImageCandidate(
        reference: unknown,
        source: PoiPopupPhotoCandidate['source']
    ): Promise<PoiPopupPhotoCandidate | undefined> {
        const pageTitle = extractCommonsPageTitle(reference);
        if (!pageTitle || !/^(File|Image):/i.test(pageTitle)) return undefined;

        const response = await PoiDetailsService.fetchJson<CommonsImageInfoResponse>(
            buildCommonsImageInfoUrl(pageTitle)
        );
        const page = response.query?.pages?.[0];
        const imageInfo = page?.imageinfo?.[0];
        if (page?.missing || !imageInfo || !isRenderableImageMime(imageInfo.mime)) return undefined;

        return createPhotoCandidate(
            imageInfo.thumburl || imageInfo.url,
            source,
            {
                attributionText: 'Wikimedia Commons',
                attributionUrl: sanitizeUrl(imageInfo.descriptionurl) || buildCommonsFilePageUrl(pageTitle)
            }
        );
    }

    private static async resolveCommonsPageCandidate(reference: unknown): Promise<PoiPopupPhotoCandidate | undefined> {
        const pageTitle = extractCommonsPageTitle(reference);
        if (!pageTitle || /^(File|Image):/i.test(pageTitle)) return undefined;

        const response = await PoiDetailsService.fetchJson<CommonsImageInfoResponse>(
            buildCommonsPageImagesUrl(pageTitle)
        );
        const page = response.query?.pages?.[0];
        if (page?.missing) return undefined;

        return createPhotoCandidate(
            page?.thumbnail?.source || page?.imageinfo?.[0]?.thumburl || page?.imageinfo?.[0]?.url,
            'commons-pageimage',
            {
                attributionText: 'Wikimedia Commons',
                attributionUrl: buildCommonsFilePageUrl(pageTitle)
            }
        );
    }

    private static async fetchWikipediaPageImage(wikipediaUrl: string): Promise<PoiPopupPhotoCandidate | undefined> {
        const pageImagesUrl = buildWikipediaPageImagesUrl(wikipediaUrl);
        if (!pageImagesUrl) return undefined;

        const response = await PoiDetailsService.fetchJson<WikipediaPageImagesResponse>(pageImagesUrl);
        const page = response.query?.pages?.[0];
        if (page?.missing) return undefined;

        return createPhotoCandidate(
            page?.thumbnail?.source || page?.original?.source,
            'wikipedia-pageimage',
            {
                attributionText: 'Wikipedia',
                attributionUrl: wikipediaUrl
            }
        );
    }

    private static selectNearbyWikipediaMatches(
        feature: any,
        results: Array<{ title?: string; dist?: number }>
    ): Array<{ title: string; dist: number }> {
        const properties = (feature?.properties || {}) as Record<string, unknown>;
        const title = sanitizeText(properties.title) || sanitizeText(properties.name);
        if (!title) return [];

        const normalizedTitle = normalizeComparisonText(title);
        const normalizedCategory = normalizeComparisonText(
            [sanitizeText(properties.subcategory), sanitizeText(properties.category)].filter(Boolean).join(' ')
        );
        if (!normalizedTitle || normalizedTitle === normalizedCategory) {
            return [];
        }

        const titleTokens = tokenizeComparisonText(title);
        if (titleTokens.length === 0) return [];

        return results
            .map((result) => {
                const resultTitle = sanitizeText(result.title);
                const dist = Number(result.dist);
                if (!resultTitle || !Number.isFinite(dist)) return null;

                const normalizedResultTitle = normalizeComparisonText(resultTitle);
                const resultTokens = tokenizeComparisonText(resultTitle);
                const overlap = computeTokenOverlap(titleTokens, resultTokens);
                const strongTitleMatch =
                    normalizedResultTitle === normalizedTitle ||
                    (normalizedTitle.length >= 4 && normalizedResultTitle.includes(normalizedTitle)) ||
                    (normalizedResultTitle.length >= 4 && normalizedTitle.includes(normalizedResultTitle));
                const distanceScore =
                    dist <= 50 ? 1 :
                    dist <= 100 ? 0.75 :
                    dist <= 200 ? 0.5 :
                    dist <= 350 ? 0.25 :
                    0;
                const confidence = (strongTitleMatch ? 1 : overlap) + distanceScore * 0.35;
                const accepted =
                    (strongTitleMatch && dist <= 500) ||
                    (overlap >= 0.6 && dist <= 400) ||
                    (overlap >= 0.34 && dist <= 150);

                if (!accepted) return null;

                return {
                    title: resultTitle,
                    dist,
                    confidence
                };
            })
            .filter((result): result is { title: string; dist: number; confidence: number } => Boolean(result))
            .sort((left, right) => {
                if (right.confidence !== left.confidence) return right.confidence - left.confidence;
                return left.dist - right.dist;
            })
            .slice(0, 3)
            .map(({ title: matchedTitle, dist }) => ({ title: matchedTitle, dist }));
    }

    private static selectNearbyCommonsMatches(
        feature: any,
        results: Array<{ title?: string; dist?: number }>
    ): string[] {
        const properties = (feature?.properties || {}) as Record<string, unknown>;
        const title = sanitizeText(properties.title) || sanitizeText(properties.name);
        if (!title) return [];

        const normalizedTitle = normalizeComparisonText(title);
        const normalizedCategory = normalizeComparisonText(
            [sanitizeText(properties.subcategory), sanitizeText(properties.category)].filter(Boolean).join(' ')
        );
        if (!normalizedTitle || normalizedTitle === normalizedCategory) {
            return [];
        }

        const titleTokens = tokenizeComparisonText(title);
        if (titleTokens.length === 0) return [];

        return results
            .map((result) => {
                const resultTitle = sanitizeText(result.title);
                const dist = Number(result.dist);
                if (!resultTitle || !Number.isFinite(dist)) return null;

                const comparisonTitle = resultTitle
                    .replace(/^(File|Image):/i, '')
                    .replace(/\.[a-z0-9]{2,5}$/i, '')
                    .replace(/[_()]+/g, ' ')
                    .trim();
                const looksOpaqueFilename = /^(dsc|img|image|mvimg|pxl|photo)[-_ ]?\d/i.test(comparisonTitle);
                const normalizedResultTitle = normalizeComparisonText(comparisonTitle);
                const resultTokens = tokenizeComparisonText(comparisonTitle);
                const overlap = computeTokenOverlap(titleTokens, resultTokens);
                const strongTitleMatch =
                    normalizedResultTitle === normalizedTitle ||
                    (normalizedTitle.length >= 4 && normalizedResultTitle.includes(normalizedTitle)) ||
                    (normalizedResultTitle.length >= 4 && normalizedTitle.includes(normalizedResultTitle));
                const distanceScore =
                    dist <= 25 ? 1 :
                    dist <= 75 ? 0.75 :
                    dist <= 150 ? 0.5 :
                    dist <= 250 ? 0.25 :
                    0;
                const confidence = (strongTitleMatch ? 1 : overlap) + distanceScore * 0.35;
                const accepted =
                    (strongTitleMatch && dist <= 750) ||
                    (overlap >= 0.6 && dist <= 500) ||
                    (overlap >= 0.34 && dist <= 200) ||
                    (!looksOpaqueFilename && dist <= 20);

                if (!accepted) return null;

                return {
                    title: resultTitle,
                    dist,
                    confidence
                };
            })
            .filter((result): result is { title: string; dist: number; confidence: number } => Boolean(result))
            .sort((left, right) => {
                if (right.confidence !== left.confidence) return right.confidence - left.confidence;
                return left.dist - right.dist;
            })
            .slice(0, 3)
            .map(({ title: matchedTitle }) => matchedTitle);
    }

    private static async fetchNearbyWikipediaPhotoCandidates(
        feature: any,
        details: PoiPopupDetails
    ): Promise<PoiPopupPhotoCandidate[]> {
        const coords = parseCoordinates(feature);
        if (!coords) return [];

        const languages = Array.from(new Set([
            extractWikipediaLanguage(details.wikipediaUrl),
            sanitizeText(typeof navigator !== 'undefined' ? navigator.language : undefined)?.split('-')[0],
            'en'
        ].filter((value): value is string => Boolean(value))));

        for (const language of languages) {
            const geoSearch = await PoiDetailsService.fetchJson<WikipediaGeoSearchResponse>(
                buildWikipediaGeoSearchUrl(language, coords)
            );
            const matches = PoiDetailsService.selectNearbyWikipediaMatches(feature, geoSearch.query?.geosearch || []);
            if (matches.length === 0) continue;

            const pageImagesUrl = buildWikipediaTitlesPageImagesUrl(language, matches.map((match) => match.title));
            if (!pageImagesUrl) continue;

            const pageImages = await PoiDetailsService.fetchJson<WikipediaPageImagesResponse>(pageImagesUrl);
            const pages = pageImages.query?.pages || [];
            const pageByTitle = new Map(
                pages
                    .map((page) => [sanitizeText(page.title), page] as const)
                    .filter((entry): entry is [string, NonNullable<typeof pages>[number]] => Boolean(entry[0]))
            );

            const candidates = matches.map((match) => {
                const page = pageByTitle.get(match.title);
                return createPhotoCandidate(
                    sanitizeDirectImageUrl(page?.thumbnail?.source || page?.original?.source),
                    'wikipedia-geosearch',
                    {
                        attributionText: 'Wikipedia',
                        attributionUrl: sanitizeUrl(page?.fullurl) || buildWikipediaTitleUrl(language, match.title)
                    }
                );
            });

            const uniqueCandidates = dedupePhotoCandidates(candidates);
            if (uniqueCandidates.length > 0) {
                return uniqueCandidates;
            }
        }

        return [];
    }

    private static async fetchNearbyCommonsPhotoCandidates(feature: any): Promise<PoiPopupPhotoCandidate[]> {
        const coords = parseCoordinates(feature);
        if (!coords) return [];

        const geoSearch = await PoiDetailsService.fetchJson<CommonsGeoSearchResponse>(
            buildCommonsGeoSearchUrl(coords)
        );
        const matches = PoiDetailsService.selectNearbyCommonsMatches(feature, geoSearch.query?.geosearch || []);
        if (matches.length === 0) return [];

        const resolvedCandidates = await Promise.all(
            matches.map((match) =>
                PoiDetailsService.resolveCommonsImageCandidate(match, 'commons-geosearch').catch((error) => {
                    logger.warn('Nearby Commons file resolution failed', error);
                    return undefined;
                })
            )
        );

        return dedupePhotoCandidates(resolvedCandidates);
    }

    private static async loadDetails(feature: any): Promise<PoiPopupDetails> {
        const initialDetails = PoiDetailsService.buildInitialDetails(feature);
        const properties = (feature?.properties || {}) as Record<string, unknown>;
        let details: PoiPopupDetails = {
            ...initialDetails,
            status: 'loaded'
        };
        let enriched = Boolean(
            details.address ||
            details.website ||
            details.phone ||
            details.summary ||
            (details.photoCandidates && details.photoCandidates.length > 0)
        );
        const directCandidates: PoiPopupPhotoCandidate[] = [];
        const commonsFileRefs = new Map<string, PoiPopupPhotoCandidate['source']>();
        const commonsPageRefs = new Set<string>();

        const queueCommonsReference = (
            value: unknown,
            source: PoiPopupPhotoCandidate['source']
        ) => {
            const pageTitle = extractCommonsPageTitle(value);
            if (!pageTitle) return;

            if (/^(File|Image):/i.test(pageTitle)) {
                if (!commonsFileRefs.has(pageTitle)) {
                    commonsFileRefs.set(pageTitle, source);
                }
                return;
            }

            commonsPageRefs.add(pageTitle);
        };

        const pushDirectCandidate = (
            value: unknown,
            source: PoiPopupPhotoCandidate['source'],
            options?: {
                attributionText?: string;
                attributionUrl?: string;
            }
        ) => {
            const candidate = createPhotoCandidate(
                sanitizeDirectImageUrl(value),
                source,
                options
            );
            if (candidate) {
                directCandidates.push(candidate);
            }
        };

        queueCommonsReference(properties.wikimediaCommons ?? properties.wikimedia_commons, 'wikimedia-commons');
        if (!sanitizeDirectImageUrl(properties.image)) {
            queueCommonsReference(properties.image, 'wikimedia-commons');
        }

        const nominatimRecord = await PoiDetailsService.fetchNominatimRecord(feature).catch((error) => {
            logger.warn('Nominatim details lookup failed', error);
            return null;
        });

        if (nominatimRecord) {
            const extratags = nominatimRecord.extratags || {};
            const nominatimAddress = buildAddressFromObject(nominatimRecord.address) || sanitizeText(nominatimRecord.display_name);
            const mergedAddress = mergePreferred(nominatimAddress, details.address);
            const mergedWikipedia = mergePreferred(
                buildWikipediaUrl(extratags.wikipedia),
                buildWikipediaUrl(properties.wikipedia),
                details.wikipediaUrl
            );

            pushDirectCandidate(extratags.image, 'osm-image');
            queueCommonsReference(extratags.wikimedia_commons, 'wikimedia-commons');
            if (!sanitizeDirectImageUrl(extratags.image)) {
                queueCommonsReference(extratags.image, 'wikimedia-commons');
            }

            details = {
                ...details,
                address: mergedAddress,
                website: mergePreferred(
                    sanitizeUrl(extratags.website),
                    sanitizeUrl(extratags['contact:website']),
                    details.website
                ),
                phone: mergePreferred(
                    sanitizePhone(extratags.phone),
                    sanitizePhone(extratags['contact:phone']),
                    details.phone
                ),
                openingHours: mergePreferred(
                    sanitizeText(extratags.opening_hours),
                    sanitizeText(extratags['contact:opening_hours']),
                    details.openingHours
                ),
                summary: mergePreferred(
                    sanitizeText(extratags.description),
                    sanitizeText(nominatimRecord.namedetails?.['name:en']),
                    details.summary
                ),
                cuisine: mergePreferred(sanitizeText(extratags.cuisine), details.cuisine),
                operator: mergePreferred(sanitizeText(extratags.operator), details.operator),
                brand: mergePreferred(sanitizeText(extratags.brand), details.brand),
                wikipediaUrl: mergedWikipedia,
                osmUrl: details.osmUrl || buildOpenStreetMapUrl({
                    ...feature,
                    properties: {
                        ...properties,
                        osm_id: nominatimRecord.osm_id,
                        osm_type: nominatimRecord.osm_type
                    }
                }),
                googleMapsUrl: buildGoogleMapsUrl(feature, {
                    addressOverride: mergedAddress,
                    addressObject: nominatimRecord.address
                })
            };
            enriched = true;
        }

        if (sanitizeText(properties.wikidata ?? nominatimRecord?.extratags?.wikidata)) {
            const wikidataId = sanitizeText(properties.wikidata ?? nominatimRecord?.extratags?.wikidata) as string;
            const wikidataEntity = await PoiDetailsService.fetchWikidataEntity(wikidataId).catch((error) => {
                logger.warn('Wikidata lookup failed', error);
                return null;
            });

            if (wikidataEntity) {
                const imageFiles = extractEntityImageFiles(wikidataEntity, wikidataId);
                const commonsPageTitle = extractEntityCommonsPageTitle(wikidataEntity, wikidataId);

                imageFiles.forEach((imageFile) => queueCommonsReference(imageFile, 'wikidata-image'));
                if (commonsPageTitle) {
                    queueCommonsReference(commonsPageTitle, 'commons-pageimage');
                }

                details = {
                    ...details,
                    wikipediaUrl: details.wikipediaUrl || extractEntityWikipediaUrl(wikidataEntity, wikidataId)
                };
                enriched = true;
            }
        }

        const [resolvedCommonsFileCandidates, resolvedCommonsPageCandidates] = await Promise.all([
            Promise.all(
                Array.from(commonsFileRefs.entries()).map(([reference, source]) =>
                    PoiDetailsService.resolveCommonsImageCandidate(reference, source).catch((error) => {
                        logger.warn('Commons file resolution failed', error);
                        return undefined;
                    })
                )
            ),
            Promise.all(
                Array.from(commonsPageRefs).map((reference) =>
                    PoiDetailsService.resolveCommonsPageCandidate(reference).catch((error) => {
                        logger.warn('Commons page-image resolution failed', error);
                        return undefined;
                    })
                )
            )
        ]);

        if (directCandidates.length > 0 || resolvedCommonsFileCandidates.length > 0 || resolvedCommonsPageCandidates.length > 0) {
            details = withPhotoCandidates(
                details,
                directCandidates,
                resolvedCommonsFileCandidates,
                resolvedCommonsPageCandidates
            );
            enriched = true;
        }

        if (details.wikipediaUrl) {
            const [wikipediaSummary, wikipediaPageImage] = await Promise.all([
                PoiDetailsService.fetchWikipediaSummary(details.wikipediaUrl).catch((error) => {
                    logger.warn('Wikipedia summary lookup failed', error);
                    return null;
                }),
                PoiDetailsService.fetchWikipediaPageImage(details.wikipediaUrl).catch((error) => {
                    logger.warn('Wikipedia page-image lookup failed', error);
                    return undefined;
                })
            ]);

            const wikipediaThumbnailCandidate = createPhotoCandidate(
                sanitizeDirectImageUrl(wikipediaSummary?.thumbnail?.source),
                'wikipedia-thumbnail',
                {
                    attributionText: 'Wikipedia',
                    attributionUrl: details.wikipediaUrl
                }
            );

            if (wikipediaSummary || wikipediaPageImage || wikipediaThumbnailCandidate) {
                details = {
                    ...details,
                    summary: mergePreferred(sanitizeText(wikipediaSummary?.extract), details.summary)
                };
                details = withPhotoCandidates(
                    details,
                    [wikipediaThumbnailCandidate, wikipediaPageImage]
                );
                enriched = true;
            }
        }

        if (!hasResolvedFallbackPhotoCandidate(details)) {
            const nearbyWikipediaCandidates = await PoiDetailsService.fetchNearbyWikipediaPhotoCandidates(feature, details).catch((error) => {
                logger.warn('Nearby Wikipedia photo discovery failed', error);
                return [];
            });

            if (nearbyWikipediaCandidates.length > 0) {
                details = withPhotoCandidates(details, nearbyWikipediaCandidates);
                enriched = true;
            }
        }

        if (!hasResolvedFallbackPhotoCandidate(details)) {
            const nearbyCommonsCandidates = await PoiDetailsService.fetchNearbyCommonsPhotoCandidates(feature).catch((error) => {
                logger.warn('Nearby Commons photo discovery failed', error);
                return [];
            });

            if (nearbyCommonsCandidates.length > 0) {
                details = withPhotoCandidates(details, nearbyCommonsCandidates);
                enriched = true;
            }
        }

        if (!enriched && !details.address && !details.website && !details.phone && !details.photoUrl && !details.summary) {
            return {
                ...details,
                status: 'error'
            };
        }

        return details;
    }

    private static async fetchNominatimRecord(feature: any): Promise<NominatimRecord | null> {
        const properties = (feature?.properties || {}) as Record<string, unknown>;
        const osmType = normalizeOsmTypeCode(properties.osmType ?? properties.osm_type);
        const osmId = sanitizeText(properties.osmId ?? properties.osm_id);
        const coords = parseCoordinates(feature);

        if (osmType && osmId) {
            const lookupUrl = `${NOMINATIM_BASE_URL}/lookup?format=jsonv2&addressdetails=1&extratags=1&namedetails=1&osm_ids=${encodeURIComponent(`${osmType}${osmId}`)}`;
            const records = await PoiDetailsService.scheduleNominatimRequest(() =>
                PoiDetailsService.fetchJson<NominatimRecord[]>(lookupUrl)
            );
            return Array.isArray(records) && records.length > 0 ? records[0] : null;
        }

        if (!coords) return null;

        const reverseUrl = `${NOMINATIM_BASE_URL}/reverse?format=jsonv2&zoom=18&addressdetails=1&extratags=1&namedetails=1&lat=${encodeURIComponent(String(coords.lat))}&lon=${encodeURIComponent(String(coords.lng))}`;
        return PoiDetailsService.scheduleNominatimRequest(() =>
            PoiDetailsService.fetchJson<NominatimRecord>(reverseUrl)
        );
    }

    private static async fetchWikipediaSummary(wikipediaUrl: string): Promise<WikipediaSummaryRecord | null> {
        const summaryUrl = buildWikipediaSummaryUrl(wikipediaUrl);
        if (!summaryUrl) return null;
        return PoiDetailsService.fetchJson<WikipediaSummaryRecord>(summaryUrl);
    }

    private static async fetchWikidataEntity(wikidataId: string): Promise<WikidataEntityResponse | null> {
        const safeId = sanitizeText(wikidataId);
        if (!safeId) return null;
        return PoiDetailsService.fetchJson<WikidataEntityResponse>(`${WIKIDATA_ENTITY_BASE_URL}/${encodeURIComponent(safeId)}.json`);
    }

    private static async scheduleNominatimRequest<T>(request: () => Promise<T>): Promise<T> {
        const run = async () => {
            const waitMs = Math.max(0, NOMINATIM_MIN_REQUEST_INTERVAL_MS - (Date.now() - PoiDetailsService.lastNominatimRequestAt));
            if (waitMs > 0) {
                await new Promise((resolve) => window.setTimeout(resolve, waitMs));
            }

            PoiDetailsService.lastNominatimRequestAt = Date.now();
            return request();
        };

        const chained = PoiDetailsService.nominatimQueue.then(run, run);
        PoiDetailsService.nominatimQueue = chained.then(() => undefined, () => undefined);
        return chained;
    }

    private static async fetchJson<T>(url: string): Promise<T> {
        const response = await fetch(url, {
            headers: {
                Accept: 'application/json'
            }
        });

        if (!response.ok) {
            throw new Error(`Request failed (${response.status}) for ${url}`);
        }

        return response.json() as Promise<T>;
    }

    static buildTelUrl(phone: string | undefined): string | undefined {
        return buildTelUrl(phone);
    }
}
