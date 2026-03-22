import { PopupStyle, IconDefinition, PoiPopupDetails, PopupPhotoPresentation } from '@/types';

const FALLBACK_POPUP_ICON =
    'data:image/svg+xml;utf8,' +
    encodeURIComponent(
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 72 72">' +
        '<circle cx="36" cy="36" r="30" fill="#1f2937"/>' +
        '<path d="M36 16c-9.941 0-18 8.059-18 18 0 12.6 18 27 18 27s18-14.4 18-27c0-9.941-8.059-18-18-18z" fill="#60a5fa"/>' +
        '<circle cx="36" cy="34" r="7.5" fill="#f8fafc"/>' +
        '</svg>'
    );

export type PopupSections = {
    title: string;
    categoryTagLabel: string;
    subcategoryLabel: string;
    description: string;
    address: string;
    openingHours: string;
    cuisine: string;
    brand: string;
    operator: string;
    phone: string;
    phoneHref: string;
    website: string;
    websiteLabel: string;
    googleMapsUrl: string;
    googleExactLocationUrl: string;
    wikipediaUrl: string;
    osmUrl: string;
    photoUrl: string;
    photoAttributionText: string;
    photoAttributionUrl: string;
    showLoading: boolean;
    showError: boolean;
};

export class PopupGenerator {
    private static readonly FRAME_ARROW_HEIGHT = 12;
    private static readonly FRAME_ARROW_HALF_WIDTH = 10;
    private static readonly FRAME_STROKE_WIDTH = 2;
    private static readonly FRAME_RADIUS = 12;
    private static readonly INITIAL_FRAME_BODY_HEIGHT = 248;
    private static readonly SCENIC_CATEGORY_TOKENS = new Set([
        'monument',
        'memorial',
        'landmark',
        'viewpoint',
        'park',
        'garden',
        'playground',
        'square',
        'plaza',
        'beach',
        'waterfall',
        'peak',
        'tower',
        'castle',
        'museum',
        'gallery',
        'church',
        'mosque',
        'synagogue',
        'temple',
        'theatre',
        'cinema',
        'arts centre',
        'tourist attraction',
        'zoo',
        'aquarium',
        'fort',
        'ruins',
        'archaeological site',
        'lighthouse',
        'fountain',
        'library',
        'school',
        'university'
    ]);
    private static readonly BUSINESS_CATEGORY_TOKENS = new Set([
        'cafe',
        'restaurant',
        'bar',
        'bakery',
        'fast food',
        'ice cream',
        'brewery',
        'night club',
        'deli',
        'butcher',
        'greengrocer',
        'confectionery',
        'supermarket',
        'grocery',
        'store',
        'shop',
        'market',
        'hotel',
        'hostel',
        'motel',
        'guest house',
        'pharmacy',
        'clinic',
        'dentist',
        'bank',
        'atm',
        'hairdresser',
        'laundry',
        'office',
        'parking',
        'gas station',
        'charging station',
        'car wash',
        'car repair'
    ]);

    private static normalizeFrameRadius(value: unknown): number {
        const parsed = Number.parseFloat(String(value ?? PopupGenerator.FRAME_RADIUS));
        if (!Number.isFinite(parsed)) return PopupGenerator.FRAME_RADIUS;
        return Math.max(6, Math.min(24, parsed));
    }

    private static buildFramePath(width: number, bodyHeight: number, radiusOverride?: number): string {
        const strokeInset = PopupGenerator.FRAME_STROKE_WIDTH / 2;
        const left = strokeInset;
        const top = strokeInset;
        const right = Math.max(left + 40, width - strokeInset);
        const bottom = Math.max(top + 40, bodyHeight - strokeInset);
        const tipX = Math.round(width / 2);
        const tipY = bodyHeight + PopupGenerator.FRAME_ARROW_HEIGHT;
        const requestedRadius = PopupGenerator.normalizeFrameRadius(radiusOverride);
        const maxRadius = Math.min(requestedRadius, (right - left) / 2 - 1, (bottom - top) / 2 - 1);
        const radius = Math.max(6, maxRadius);

        const safeHalfArrow = Math.min(
            PopupGenerator.FRAME_ARROW_HALF_WIDTH,
            Math.max(6, tipX - (left + radius + 8)),
            Math.max(6, (right - radius - 8) - tipX)
        );
        const arrowLeftX = tipX - safeHalfArrow;
        const arrowRightX = tipX + safeHalfArrow;

        return [
            `M ${left + radius} ${top}`,
            `H ${right - radius}`,
            `Q ${right} ${top} ${right} ${top + radius}`,
            `V ${bottom - radius}`,
            `Q ${right} ${bottom} ${right - radius} ${bottom}`,
            `H ${arrowRightX}`,
            `L ${tipX} ${tipY}`,
            `L ${arrowLeftX} ${bottom}`,
            `H ${left + radius}`,
            `Q ${left} ${bottom} ${left} ${bottom - radius}`,
            `V ${top + radius}`,
            `Q ${left} ${top} ${left + radius} ${top}`,
            'Z'
        ].join(' ');
    }

    private static escapeHtml(value: unknown): string {
        const raw = typeof value === 'string' ? value : String(value ?? '');
        return raw
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    private static normalizeComparisonText(value: unknown): string {
        return String(value || '')
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, ' ')
            .trim();
    }

    private static withAlpha(color: string, alphaHex: string): string {
        const normalized = String(color || '').trim();
        if (/^#[0-9a-f]{6}$/i.test(normalized)) {
            return `${normalized}${alphaHex}`;
        }
        if (/^#[0-9a-f]{3}$/i.test(normalized)) {
            const expanded = `#${normalized[1]}${normalized[1]}${normalized[2]}${normalized[2]}${normalized[3]}${normalized[3]}`;
            return `${expanded}${alphaHex}`;
        }
        return normalized || '#000000';
    }

    private static hexToRgb(color: string): { r: number; g: number; b: number } | null {
        const normalized = String(color || '').trim();
        if (/^#[0-9a-f]{3}$/i.test(normalized)) {
            return {
                r: Number.parseInt(`${normalized[1]}${normalized[1]}`, 16),
                g: Number.parseInt(`${normalized[2]}${normalized[2]}`, 16),
                b: Number.parseInt(`${normalized[3]}${normalized[3]}`, 16)
            };
        }
        if (/^#[0-9a-f]{6}$/i.test(normalized)) {
            return {
                r: Number.parseInt(normalized.slice(1, 3), 16),
                g: Number.parseInt(normalized.slice(3, 5), 16),
                b: Number.parseInt(normalized.slice(5, 7), 16)
            };
        }
        return null;
    }

    private static rgbToHex(rgb: { r: number; g: number; b: number }): string {
        const clamp = (value: number) => Math.max(0, Math.min(255, Math.round(value)));
        return `#${[rgb.r, rgb.g, rgb.b]
            .map((channel) => clamp(channel).toString(16).padStart(2, '0'))
            .join('')}`;
    }

    private static relativeLuminance(color: string): number | null {
        const rgb = PopupGenerator.hexToRgb(color);
        if (!rgb) return null;

        const transform = (channel: number) => {
            const normalized = channel / 255;
            return normalized <= 0.03928
                ? normalized / 12.92
                : ((normalized + 0.055) / 1.055) ** 2.4;
        };

        const r = transform(rgb.r);
        const g = transform(rgb.g);
        const b = transform(rgb.b);

        return 0.2126 * r + 0.7152 * g + 0.0722 * b;
    }

    private static contrastRatio(colorA: string, colorB: string): number | null {
        const luminanceA = PopupGenerator.relativeLuminance(colorA);
        const luminanceB = PopupGenerator.relativeLuminance(colorB);
        if (luminanceA === null || luminanceB === null) return null;

        const lighter = Math.max(luminanceA, luminanceB);
        const darker = Math.min(luminanceA, luminanceB);
        return (lighter + 0.05) / (darker + 0.05);
    }

    private static mixHexColors(baseColor: string, mixColor: string, mixRatio: number): string | null {
        const base = PopupGenerator.hexToRgb(baseColor);
        const mix = PopupGenerator.hexToRgb(mixColor);
        if (!base || !mix) return null;

        const ratio = Math.max(0, Math.min(1, mixRatio));
        return PopupGenerator.rgbToHex({
            r: base.r + (mix.r - base.r) * ratio,
            g: base.g + (mix.g - base.g) * ratio,
            b: base.b + (mix.b - base.b) * ratio
        });
    }

    private static deriveReadableCategoryAccent(accentColor: string, backgroundColor: string, fallbackTextColor: string): string {
        const rawAccent = String(accentColor || '').trim();
        const rawBackground = String(backgroundColor || '').trim();
        const fallback = String(fallbackTextColor || '#202124').trim() || '#202124';
        const initialContrast = PopupGenerator.contrastRatio(rawAccent, rawBackground);

        if (initialContrast !== null && initialContrast >= 3.2) {
            return rawAccent;
        }

        for (const ratio of [0.12, 0.22, 0.34, 0.48, 0.62, 0.76]) {
            const candidate = PopupGenerator.mixHexColors(rawAccent, fallback, ratio);
            if (!candidate) break;
            const contrast = PopupGenerator.contrastRatio(candidate, rawBackground);
            if (contrast !== null && contrast >= 3.2) {
                return candidate;
            }
        }

        return fallback;
    }

    private static formatWebsiteLabel(value?: string): string {
        if (!value) return 'Website';
        try {
            const url = new URL(value);
            return url.host.replace(/^www\./, '');
        } catch (_error) {
            return value.replace(/^https?:\/\//i, '');
        }
    }

    private static isDuplicateHeaderSummary(
        description: string,
        title: string,
        subcategoryLabel: string,
        categoryTagLabel: string
    ): boolean {
        const normalizedDescription = PopupGenerator.normalizeComparisonText(description);
        if (!normalizedDescription) return true;

        const candidates = [title, subcategoryLabel, categoryTagLabel]
            .map((value) => PopupGenerator.normalizeComparisonText(value))
            .filter(Boolean);

        return candidates.includes(normalizedDescription);
    }

    static derivePopupSections(feature: any, details?: PoiPopupDetails | null): PopupSections {
        const props = feature?.properties || {};
        const category = props.category || '';
        const subcategory = props.subcategory || '';
        const detailState = details || {
            status: 'idle' as const,
            googleMapsUrl: '#'
        };
        const phone = String(detailState.phone || props.phone || '');

        return {
            title: String(props.title || 'Selected place'),
            categoryTagLabel: String(category || subcategory || ''),
            subcategoryLabel: category && subcategory && category !== subcategory
                ? String(subcategory)
                : '',
            description: String(detailState.summary || props.description || ''),
            address: String(detailState.address || props.address || ''),
            openingHours: String(detailState.openingHours || props.opening_hours || ''),
            cuisine: String(detailState.cuisine || props.cuisine || ''),
            brand: String(detailState.brand || props.brand || ''),
            operator: String(detailState.operator || props.operator || ''),
            phone,
            phoneHref: phone ? `tel:${phone.replace(/[^+\d]/g, '')}` : '',
            website: String(detailState.website || props.website || ''),
            websiteLabel: PopupGenerator.formatWebsiteLabel(String(detailState.website || props.website || '')),
            googleMapsUrl: String(detailState.googleMapsUrl || '#'),
            googleExactLocationUrl: String(detailState.googleExactLocationUrl || ''),
            wikipediaUrl: String(detailState.wikipediaUrl || ''),
            osmUrl: String(detailState.osmUrl || ''),
            photoUrl: String(detailState.photoUrl || ''),
            photoAttributionText: String(detailState.photoAttributionText || ''),
            photoAttributionUrl: String(detailState.photoAttributionUrl || ''),
            showLoading: detailState.status === 'loading',
            showError: detailState.status === 'error'
        };
    }

    private static deriveCategoryProfile(feature: any): PopupPhotoPresentation['categoryProfile'] {
        const props = feature?.properties || {};
        const normalized = PopupGenerator.normalizeComparisonText([
            props.category,
            props.subcategory
        ].filter(Boolean).join(' '));

        if (!normalized) return 'compact';
        if (Array.from(PopupGenerator.SCENIC_CATEGORY_TOKENS).some((token) => normalized.includes(token))) {
            return 'scenic';
        }
        if (Array.from(PopupGenerator.BUSINESS_CATEGORY_TOKENS).some((token) => normalized.includes(token))) {
            return 'business';
        }
        return 'compact';
    }

    static derivePhotoPresentation(
        feature: any,
        details?: PoiPopupDetails | null,
        options?: {
            naturalWidth?: number;
            naturalHeight?: number;
            popupWidth?: number;
        }
    ): PopupPhotoPresentation {
        const profile = PopupGenerator.deriveCategoryProfile(feature);
        const width = Number(options?.naturalWidth);
        const height = Number(options?.naturalHeight);
        const hasDimensions = Number.isFinite(width) && width > 0 && Number.isFinite(height) && height > 0;
        const area = hasDimensions ? width * height : 0;
        const longEdge = hasDimensions ? Math.max(width, height) : 0;
        const aspectRatio = hasDimensions ? width / height : 1.6;
        const popupWidth = Number.isFinite(options?.popupWidth) && (options?.popupWidth || 0) > 0
            ? Number(options?.popupWidth)
            : 400;
        const primarySource = details?.photoCandidates?.find((candidate) => candidate.url === details.photoUrl)?.source;

        let resolutionBand: PopupPhotoPresentation['resolutionBand'] = 'unknown';
        if (hasDimensions) {
            if (longEdge < 640 || area < 220_000) {
                resolutionBand = 'low';
            } else if (longEdge < 1400 || area < 900_000) {
                resolutionBand = 'medium';
            } else {
                resolutionBand = 'high';
            }
        }

        const baseHeights: Record<PopupPhotoPresentation['categoryProfile'], number> = {
            scenic: 128,
            business: 96,
            compact: 88
        };
        const lowResHeights: Record<PopupPhotoPresentation['categoryProfile'], number> = {
            scenic: 94,
            business: 76,
            compact: 72
        };
        const mediumResHeights: Record<PopupPhotoPresentation['categoryProfile'], number> = {
            scenic: 114,
            business: 88,
            compact: 82
        };

        let frameHeight =
            resolutionBand === 'low' ? lowResHeights[profile] :
            resolutionBand === 'medium' ? mediumResHeights[profile] :
            baseHeights[profile];

        if (popupWidth < 340) frameHeight -= 8;
        if (primarySource === 'commons-geosearch' || primarySource === 'wikipedia-geosearch') {
            frameHeight -= 6;
        }
        if (hasDimensions && aspectRatio < 0.8) {
            frameHeight -= profile === 'scenic' ? 10 : 6;
        }
        if (hasDimensions && aspectRatio > 2.1 && profile === 'scenic' && resolutionBand !== 'low') {
            frameHeight += 6;
        }

        const objectFit: PopupPhotoPresentation['objectFit'] =
            hasDimensions && (resolutionBand === 'low' || aspectRatio < 0.72) ? 'contain' : 'cover';

        return {
            categoryProfile: profile,
            resolutionBand,
            frameHeight: Math.max(68, frameHeight),
            objectFit,
            objectPosition: aspectRatio > 2 ? 'center 45%' : 'center center',
            surfaceColor:
                profile === 'scenic' ? '#f3efe2' :
                profile === 'business' ? '#f7f3e8' :
                '#f6f0da'
        };
    }

    private static renderInfoRow(label: string, value: string, border: string, testId: string): string {
        return `
            <div data-testid="${testId}" style="display:flex; gap:8px; align-items:flex-start; font-size:11px; line-height:1.35; padding-top:5px;">
                <div style="min-width:54px; font-weight:700; color:inherit; opacity:0.75;">${PopupGenerator.escapeHtml(label)}</div>
                <div style="flex:1; border-bottom:1px solid ${border}24; padding-bottom:5px; overflow-wrap:anywhere; word-break:break-word;">${PopupGenerator.escapeHtml(value)}</div>
            </div>
        `;
    }

    private static renderLinkRow(label: string, value: string, href: string, border: string, testId: string): string {
        return `
            <div data-testid="${testId}" style="display:flex; gap:8px; align-items:flex-start; font-size:11px; line-height:1.35; padding-top:5px;">
                <div style="min-width:54px; font-weight:700; color:inherit; opacity:0.75;">${PopupGenerator.escapeHtml(label)}</div>
                <div style="flex:1; border-bottom:1px solid ${border}24; padding-bottom:5px; overflow-wrap:anywhere; word-break:break-word;">
                    <a href="${PopupGenerator.escapeHtml(href)}" target="_blank" rel="noreferrer noopener" style="color:inherit; text-decoration:underline; overflow-wrap:anywhere; word-break:break-word;">${PopupGenerator.escapeHtml(value)}</a>
                </div>
            </div>
        `;
    }

    private static renderActionLink(
        id: string,
        label: string,
        href: string,
        border: string,
        text: string,
        isPrimary = false
    ): string {
        const background = isPrimary ? `${border}24` : `${border}12`;
        return `
            <a id="${id}" data-testid="${id}" href="${PopupGenerator.escapeHtml(href)}" target="_blank" rel="noreferrer noopener" style="min-width:0; min-height:40px; text-align:center; text-decoration:none; padding:7px 10px; background:${background}; border:1px solid ${border}; border-radius:10px; color:${text}; font-size:11px; font-weight:700; line-height:1.2; display:flex; align-items:center; justify-content:center; box-sizing:border-box;">
                ${PopupGenerator.escapeHtml(label)}
            </a>
        `;
    }

    static syncFrameGeometry(scope?: ParentNode): void {
        if (typeof document === 'undefined') return;

        const rootNodes: HTMLElement[] = [];
        const currentScope = scope ?? document;

        if (currentScope instanceof HTMLElement && currentScope.matches('[data-testid="poi-popup"]')) {
            rootNodes.push(currentScope);
        }

        rootNodes.push(
            ...(Array.from(currentScope.querySelectorAll('[data-testid="poi-popup"]')) as HTMLElement[])
        );

        rootNodes.forEach((root) => {
            const content = root.querySelector<HTMLElement>('[data-mapalchemist-popup-content="true"]');
            const frameSvg = root.querySelector<SVGSVGElement>('[data-mapalchemist-popup-frame-svg="true"]');
            const fillPath = root.querySelector<SVGPathElement>('[data-mapalchemist-popup-frame-fill="true"]');
            const strokePath = root.querySelector<SVGPathElement>('[data-mapalchemist-popup-frame-stroke="true"]');
            if (!content || !frameSvg || !fillPath || !strokePath) return;

            const bodyWidth = Math.max(260, Math.ceil(content.getBoundingClientRect().width));
            const bodyHeight = Math.max(120, Math.ceil(content.getBoundingClientRect().height));
            const totalHeight = bodyHeight + PopupGenerator.FRAME_ARROW_HEIGHT;
            const frameRadius = PopupGenerator.normalizeFrameRadius(root.dataset.mapalchemistPopupRadius);
            const framePath = PopupGenerator.buildFramePath(bodyWidth, bodyHeight, frameRadius);

            frameSvg.setAttribute('viewBox', `0 0 ${bodyWidth} ${totalHeight}`);
            frameSvg.setAttribute('width', `${bodyWidth}`);
            frameSvg.setAttribute('height', `${totalHeight}`);
            fillPath.setAttribute('d', framePath);
            strokePath.setAttribute('d', framePath);
        });
    }

    static generateHtml(
        feature: any,
        popupStyle: PopupStyle,
        palette: Record<string, string>,
        activeIcons: Record<string, IconDefinition>,
        isDefaultTheme: boolean,
        details?: PoiPopupDetails | null
    ): string {
        const props = feature.properties;
        const iconKey = props.iconKey;
        const sections = PopupGenerator.derivePopupSections(feature, details);
        const iconDef = activeIcons[iconKey] || activeIcons[props.subcategory] || activeIcons[props.category];
        const headerImg = iconDef?.imageUrl || FALLBACK_POPUP_ICON;

        const wandIcon = `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 4V2"/><path d="M15 16v-2"/><path d="M8 9h2"/><path d="M20 9h2"/><path d="M17.8 11.8 19 13"/><path d="M10.6 17.4 12 16"/><path d="M12.5 2.5 8 7"/><path d="M17.5 7.5 13 3"/><path d="M7 21l9-9"/><path d="M3 21l9-9"/></svg>`;

        const bg = popupStyle.backgroundColor || palette.land || '#ffffff';
        const text = popupStyle.textColor || palette.text || '#202124';
        const border = popupStyle.borderColor || palette.road || '#dadce0';
        const categoryAccent = PopupGenerator.deriveReadableCategoryAccent(
            String(props.textColor || text || '#202124'),
            bg,
            text
        );
        const categoryAccentSoft = PopupGenerator.mixHexColors(bg, categoryAccent, 0.14)
            || PopupGenerator.withAlpha(categoryAccent, '18');
        const frameRadius = PopupGenerator.normalizeFrameRadius(popupStyle.borderRadius);
        const initialFramePath = PopupGenerator.buildFramePath(260, PopupGenerator.INITIAL_FRAME_BODY_HEIGHT, frameRadius);
        const photoPresentation = PopupGenerator.derivePhotoPresentation(feature, details);
        const loadingShellBg = PopupGenerator.withAlpha(border, '12');
        const loadingAccent = PopupGenerator.withAlpha(border, '5e');
        const loadingLine = PopupGenerator.withAlpha(text, '14');
        const loadingLineStrong = PopupGenerator.withAlpha(text, '22');
        const loadingHalo = PopupGenerator.withAlpha('#ffffff', '50');
        const infoRows = [
            sections.address ? PopupGenerator.renderInfoRow('Address', sections.address, border, 'poi-popup-address') : '',
            sections.openingHours ? PopupGenerator.renderInfoRow('Hours', sections.openingHours, border, 'poi-popup-hours') : '',
            sections.cuisine ? PopupGenerator.renderInfoRow('Cuisine', sections.cuisine, border, 'poi-popup-cuisine') : '',
            sections.brand ? PopupGenerator.renderInfoRow('Brand', sections.brand, border, 'poi-popup-brand') : '',
            sections.operator ? PopupGenerator.renderInfoRow('Operator', sections.operator, border, 'poi-popup-operator') : '',
            sections.phone && sections.phoneHref ? PopupGenerator.renderLinkRow('Phone', sections.phone, sections.phoneHref, border, 'poi-popup-phone') : '',
            sections.website ? PopupGenerator.renderLinkRow('Website', sections.websiteLabel, sections.website, border, 'poi-popup-website') : ''
        ].filter(Boolean).join('');

        const actionLinks = [
            sections.googleMapsUrl ? PopupGenerator.renderActionLink('popup-google-maps-link', 'Search in Google Maps', sections.googleMapsUrl, border, text, true) : '',
            sections.googleExactLocationUrl ? PopupGenerator.renderActionLink('popup-google-maps-exact-link', 'Open Exact Location', sections.googleExactLocationUrl, border, text) : '',
            sections.wikipediaUrl ? PopupGenerator.renderActionLink('popup-wikipedia-link', 'Wikipedia', sections.wikipediaUrl, border, text) : '',
            sections.osmUrl ? PopupGenerator.renderActionLink('popup-osm-link', 'OpenStreetMap', sections.osmUrl, border, text) : ''
        ].filter(Boolean).join('');

        const loadingBlock = sections.showLoading
            ? `
                <div data-testid="poi-popup-loading" style="margin-top:8px; min-height:72px; padding:9px 10px; font-size:11px; border:1px solid ${PopupGenerator.withAlpha(border, '55')}; border-radius:10px; background:${loadingShellBg}; color:${text}; overflow:hidden; box-sizing:border-box;">
                    <style>
                        @keyframes mapAlchemistPopupSkeletonPulse {
                            0%, 100% { opacity: 0.58; }
                            50% { opacity: 1; }
                        }
                    </style>
                    <div style="display:flex; align-items:center; gap:8px;">
                        <span data-testid="poi-popup-loading-accent" aria-hidden="true" style="width:8px; height:8px; border-radius:999px; background:${loadingAccent}; box-shadow:0 0 0 3px ${loadingHalo}; flex:0 0 auto; animation:mapAlchemistPopupSkeletonPulse 1.6s ease-in-out infinite;"></span>
                        <div data-testid="poi-popup-loading-status" style="font-weight:700; letter-spacing:0.01em;">Fetching open details and photos...</div>
                    </div>
                    <div style="display:grid; gap:5px; margin-top:7px;">
                        <div data-testid="poi-popup-loading-line-primary" style="height:6px; width:68%; border-radius:999px; background:${loadingLineStrong}; animation:mapAlchemistPopupSkeletonPulse 1.6s ease-in-out infinite;"></div>
                        <div data-testid="poi-popup-loading-line-secondary" style="height:5px; width:48%; border-radius:999px; background:${loadingLine}; animation:mapAlchemistPopupSkeletonPulse 1.6s ease-in-out infinite 0.12s;"></div>
                    </div>
                </div>
            `
            : '';
        const errorBlock = sections.showError
            ? `<div data-testid="poi-popup-error" style="margin-top:8px; padding:8px 10px; font-size:11px; border:1px dashed ${border}; border-radius:8px; opacity:0.8;">Live details are unavailable right now. Google Maps may still have photos, ratings, and reviews.</div>`
            : '';
        const photoBlock = sections.photoUrl
            ? `
                <div id="poi-popup-photo-block" data-testid="poi-popup-photo" data-photo-category-profile="${photoPresentation.categoryProfile}" data-photo-resolution-band="${photoPresentation.resolutionBand}" style="margin-top:8px;">
                    <img id="poi-popup-photo-img" src="${PopupGenerator.escapeHtml(sections.photoUrl)}" alt="${PopupGenerator.escapeHtml(sections.title)} photo" style="width:100%; height:${photoPresentation.frameHeight}px; object-fit:${photoPresentation.objectFit}; object-position:${photoPresentation.objectPosition}; background:${photoPresentation.surfaceColor}; border-radius:10px; border:1px solid ${border}; display:block;" />
                    <div id="poi-popup-photo-attribution" style="margin-top:4px; font-size:10px; opacity:0.72;${sections.photoAttributionText && sections.photoAttributionUrl ? '' : ' display:none;'}">
                        Photo: <a id="poi-popup-photo-attribution-link" href="${PopupGenerator.escapeHtml(sections.photoAttributionUrl)}" target="_blank" rel="noreferrer noopener" style="color:inherit; text-decoration:underline;">${PopupGenerator.escapeHtml(sections.photoAttributionText)}</a>
                    </div>
                </div>
            `
            : '';
        const showSummary = !PopupGenerator.isDuplicateHeaderSummary(
            sections.description,
            sections.title,
            sections.subcategoryLabel,
            sections.categoryTagLabel
        );
        const summaryBlock = showSummary
            ? `
                <div data-testid="poi-popup-summary" style="margin-top:8px; font-size:12px; line-height:1.45; opacity:0.92; border-top:1px solid ${border}40; padding-top:7px; overflow:hidden; display:-webkit-box; -webkit-line-clamp:3; -webkit-box-orient:vertical; overflow-wrap:anywhere; word-break:break-word;">
                    ${PopupGenerator.escapeHtml(sections.description)}
                </div>
            `
            : '';
        const categoryMeta = sections.categoryTagLabel || sections.subcategoryLabel
            ? `
                <div data-testid="poi-popup-taxonomy" style="display:grid; gap:4px; justify-items:start;">
                    ${sections.subcategoryLabel
                        ? `<span data-testid="poi-popup-category" style="font-size:11px; font-weight:700; color:${PopupGenerator.withAlpha(text, 'c8')}; overflow-wrap:anywhere;">${PopupGenerator.escapeHtml(sections.subcategoryLabel)}</span>`
                        : ''}
                    ${sections.categoryTagLabel
                        ? `<span data-testid="poi-popup-category-chip" style="display:inline-flex; align-items:center; min-height:22px; padding:0 9px; border-radius:999px; border:1px solid ${categoryAccent}; background:${categoryAccentSoft}; color:${categoryAccent}; font-size:10px; font-weight:700; line-height:1; letter-spacing:0.01em;">${PopupGenerator.escapeHtml(sections.categoryTagLabel)}</span>`
                        : ''}
                </div>
            `
            : '';

        return `
        <div data-testid="poi-popup" data-mapalchemist-popup-radius="${frameRadius}" style="position:relative; font-family:${popupStyle.fontFamily}; min-width:240px; width:min(400px, calc(100vw - 24px)); max-width:400px; box-sizing:border-box; padding-bottom:${PopupGenerator.FRAME_ARROW_HEIGHT}px;">
            <style>
                @media (max-width: 639px) {
                    [data-testid="poi-popup"] {
                        min-width: 0 !important;
                        width: min(344px, calc(100vw - 20px)) !important;
                    }
                    [data-mapalchemist-popup-content="true"] {
                        padding: 10px 10px 8px !important;
                        max-height: min(46vh, 296px) !important;
                    }
                    #poi-popup-actions {
                        grid-template-columns: 1fr !important;
                    }
                    #poi-popup-actions a,
                    #popup-edit-btn {
                        min-height: 34px !important;
                        font-size: 10px !important;
                    }
                    #popup-close-btn {
                        top: 0 !important;
                        right: 8px !important;
                        transform: translateY(-28%) !important;
                        width: 30px !important;
                        height: 30px !important;
                        box-shadow: 0 3px 8px rgba(0, 0, 0, 0.22) !important;
                    }
                }
            </style>
            <svg data-mapalchemist-popup-frame-svg="true" aria-hidden="true" viewBox="0 0 260 260" width="260" height="260" style="position:absolute; left:0; top:0; display:block; pointer-events:none; z-index:0; overflow:visible;">
                <path data-mapalchemist-popup-frame-fill="true" d="${initialFramePath}" fill="${bg}"></path>
                <path data-mapalchemist-popup-frame-stroke="true" d="${initialFramePath}" fill="none" stroke="${border}" stroke-width="${PopupGenerator.FRAME_STROKE_WIDTH}" stroke-linejoin="round"></path>
            </svg>
            <button id="popup-close-btn" aria-label="Close" style="position:absolute; top:0; right:8px; transform:translateY(-32%); background:${bg}; border:2px solid ${border}; color:${text}; width:28px; height:28px; border-radius:999px; display:flex; align-items:center; justify-content:center; cursor:pointer; font-size:16px; line-height:1; box-shadow:0 4px 10px rgba(0,0,0,0.18); z-index:2;">
                ×
            </button>
            <div data-mapalchemist-popup-content="true" style="position:relative; z-index:1; color:${text}; padding:12px 12px 10px; width:100%; box-sizing:border-box; max-height:min(56vh, 388px); overflow-y:auto; overflow-x:hidden;">
                <div style="display:flex; gap:10px; align-items:center;">
                    <div style="width:60px; height:60px; flex:0 0 60px; background:${categoryAccentSoft}; border-radius:12px; padding:4px; display:flex; align-items:center; justify-content:center; box-shadow:inset 0 0 0 2px ${PopupGenerator.withAlpha(categoryAccent, '55')};">
                        <img src="${headerImg}" alt="${PopupGenerator.escapeHtml(sections.title)} icon" style="max-width:52px; max-height:52px; object-fit:contain;" />
                    </div>
                    <div style="flex:1; min-width:0; padding-right:36px;">
                        <h3 style="margin:0 0 3px; font-size:15px; font-weight:bold; line-height:1.2; overflow-wrap:anywhere; word-break:break-word;">${PopupGenerator.escapeHtml(sections.title)}</h3>
                        ${categoryMeta}
                    </div>
                </div>
                ${summaryBlock}
                ${photoBlock}
                ${loadingBlock}
                ${errorBlock}
                ${infoRows ? `<div style="margin-top:8px;">${infoRows}</div>` : ''}
                ${actionLinks ? `<div id="poi-popup-actions" data-testid="poi-popup-actions" style="display:grid; grid-template-columns:repeat(auto-fit, minmax(136px, 1fr)); gap:7px; margin-top:10px;">${actionLinks}</div>` : ''}
                <button id="popup-edit-btn" data-testid="poi-popup-remix" style="margin-top:8px; width:100%; min-height:40px; padding:8px 10px; background:${border}20; border:1px solid ${border}; border-radius:10px; cursor:pointer; font-size:11px; font-weight:700; display:flex; align-items:center; justify-content:center; gap:6px; color:${text}; line-height:1.2; box-sizing:border-box;">${wandIcon} Remix Icon</button>
            </div>
        </div>
      `;
    }
}
