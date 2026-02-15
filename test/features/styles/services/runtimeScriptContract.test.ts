import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const runtimePath = path.join(process.cwd(), 'public', 'runtime', 'map-alchemist-runtime.js');

describe('map-alchemist-runtime contract', () => {
  it('contains unified popup frame contour markup', () => {
    const runtimeScript = fs.readFileSync(runtimePath, 'utf-8');
    expect(runtimeScript).toContain('data-mapalchemist-popup-frame-svg="true"');
    expect(runtimeScript).toContain('data-mapalchemist-popup-frame-fill="true"');
    expect(runtimeScript).toContain('data-mapalchemist-popup-frame-stroke="true"');
    expect(runtimeScript).toContain('data-mapalchemist-popup-content="true"');
    expect(runtimeScript).toContain('function buildPopupFramePath(width, bodyHeight, radiusOverride)');
    expect(runtimeScript).toContain('function syncPopupFrameGeometry(scope)');
    expect(runtimeScript).toContain('POPUP_FRAME_ARROW_HEIGHT');
    expect(runtimeScript).toContain("anchor: 'bottom'");
  });

  it('closes active popup when zoom changes', () => {
    const runtimeScript = fs.readFileSync(runtimePath, 'utf-8');
    expect(runtimeScript).toContain("map.on('zoomstart', onZoomStart)");
    expect(runtimeScript).toContain('function closeActivePopup()');
  });

  it('renders larger popup icon blocks in runtime snippet', () => {
    const runtimeScript = fs.readFileSync(runtimePath, 'utf-8');
    expect(runtimeScript).toContain('width:72px;height:72px');
    expect(runtimeScript).toContain('max-width:62px;max-height:62px');
  });
});
