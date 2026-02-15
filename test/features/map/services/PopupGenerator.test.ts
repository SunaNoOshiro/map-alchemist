import { describe, expect, it } from 'vitest';
import { PopupGenerator } from '@/features/map/services/PopupGenerator';
import { PopupStyle } from '@/types';

const popupStyle: PopupStyle = {
  backgroundColor: '#ffcc00',
  textColor: '#101010',
  borderColor: '#303030',
  borderRadius: '10px',
  fontFamily: 'Noto Sans'
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

    expect(html).toContain('width: 72px; height: 72px;');
    expect(html).toContain('max-width:62px; max-height:62px;');
  });

  it('renders a unified popup frame and arrow contour', () => {
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
    expect(html).toContain('padding-bottom:12px;');
    expect(html).toContain('stroke-linejoin="round"');
    expect(html).not.toContain('data-mapalchemist-popup-arrow-junction="true"');
  });
});
