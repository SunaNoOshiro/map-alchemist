import { PopupStyle, IconDefinition } from '@/types';

export class PopupGenerator {
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

        return `
        <div data-testid="poi-popup" style="position:relative; font-family: ${popupStyle.fontFamily}; min-width: 260px;">
            <button id="popup-close-btn" aria-label="Close" style="position:absolute; top:-14px; right:-14px; background: ${bg}; border: 2px solid ${border}; color:${text}; width:28px; height:28px; border-radius: 999px; display:flex; align-items:center; justify-content:center; cursor:pointer; font-size:16px; line-height:1; box-shadow: 0 6px 12px rgba(0,0,0,0.2);">
                ×
            </button>
            <div style="color: ${text}; background: ${bg}; border: 2px solid ${border}; border-radius: ${popupStyle.borderRadius}; padding: 14px 14px 12px; box-shadow: 0 4px 12px rgba(0,0,0,0.3);">
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
            <div data-mapalchemist-popup-arrow="true" aria-hidden="true" style="position:absolute; left:50%; bottom:-11px; width:18px; height:18px; transform:translateX(-50%) rotate(45deg); background:${bg}; border-right:3px solid ${border}; border-bottom:3px solid ${border}; box-shadow:2px 2px 6px rgba(0,0,0,0.18);"></div>
        </div>
      `;
    }
}
