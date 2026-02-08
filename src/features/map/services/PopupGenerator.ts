import { PopupStyle, IconDefinition } from '@/types';

export class PopupGenerator {
    private static readonly FRAME_ARROW_HEIGHT = 12;
    private static readonly FRAME_ARROW_HALF_WIDTH = 10;
    private static readonly FRAME_STROKE_WIDTH = 2;
    private static readonly FRAME_RADIUS = 12;

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
        isDefaultTheme: boolean
    ): string {
        const props = feature.properties;
        const cat = props.category;
        const sub = props.subcategory;
        const title = props.title;
        const desc = props.description || sub;
        const iconDef = activeIcons[sub] || activeIcons[cat];
        const headerImg = iconDef?.imageUrl || '';

        const wandIcon = `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 4V2"/><path d="M15 16v-2"/><path d="M8 9h2"/><path d="M20 9h2"/><path d="M17.8 11.8 19 13"/><path d="M10.6 17.4 12 16"/><path d="M12.5 2.5 8 7"/><path d="M17.5 7.5 13 3"/><path d="M7 21l9-9"/><path d="M3 21l9-9"/></svg>`;

        const bg = popupStyle.backgroundColor || palette.land || '#ffffff';
        const text = popupStyle.textColor || palette.text || '#202124';
        const border = popupStyle.borderColor || palette.road || '#dadce0';
        const frameRadius = PopupGenerator.normalizeFrameRadius(popupStyle.borderRadius);
        const initialFramePath = PopupGenerator.buildFramePath(260, 120, frameRadius);

        return `
        <div data-testid="poi-popup" data-mapalchemist-popup-radius="${frameRadius}" style="position:relative; font-family: ${popupStyle.fontFamily}; min-width:260px; padding-bottom:${PopupGenerator.FRAME_ARROW_HEIGHT}px;">
            <svg data-mapalchemist-popup-frame-svg="true" aria-hidden="true" viewBox="0 0 260 132" width="260" height="132" style="position:absolute; left:0; top:0; display:block; pointer-events:none; z-index:0; overflow:visible;">
                <path data-mapalchemist-popup-frame-fill="true" d="${initialFramePath}" fill="${bg}"></path>
                <path data-mapalchemist-popup-frame-stroke="true" d="${initialFramePath}" fill="none" stroke="${border}" stroke-width="${PopupGenerator.FRAME_STROKE_WIDTH}" stroke-linejoin="round"></path>
            </svg>
            <button id="popup-close-btn" aria-label="Close" style="position:absolute; top:-14px; right:-14px; background: ${bg}; border: 2px solid ${border}; color:${text}; width:28px; height:28px; border-radius: 999px; display:flex; align-items:center; justify-content:center; cursor:pointer; font-size:16px; line-height:1; box-shadow: 0 6px 12px rgba(0,0,0,0.2); z-index:2;">
                ×
            </button>
            <div data-mapalchemist-popup-content="true" style="position:relative; z-index:1; color:${text}; padding:14px 14px 12px;">
                <div style="display: flex; gap: 12px; align-items:center;">
                    ${headerImg ? `<div style=\"width: 72px; height: 72px; background: rgba(0,0,0,0.05); border-radius: 12px; padding: 5px; display:flex; align-items:center; justify-content:center; box-shadow: inset 0 0 0 2px ${border}40;\"><img src=\"${headerImg}\" style=\"max-width:62px; max-height:62px; object-fit:contain;\" /></div>` : ''}
                    <div style="flex:1; padding-right: 12px;">
                        <h3 style="margin:0 0 4px; font-size:16px; font-weight:bold; line-height:1.2;">${title}</h3>
                        <div data-testid="poi-popup-category" style="font-size:11px; text-transform:uppercase; font-weight:bold; opacity:0.7;">${sub || cat || ''}</div>
                    </div>
                </div>
                <div style="margin-top:10px; font-size:13px; opacity:0.92; border-top:1px solid ${border}40; padding-top:8px;">
                    ${desc}
                </div>
                <button id="popup-edit-btn" data-testid="poi-popup-remix" style="margin-top:10px; width:100%; padding:6px 8px; background:${border}20; border:1px solid ${border}; border-radius:6px; cursor:pointer; font-size:11px; display:flex; align-items:center; justify-content:center; gap:6px; color:${text};">${wandIcon} Remix Icon</button>
            </div>
        </div>
      `;
    }
}
