import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const runtimePath = path.join(process.cwd(), 'public', 'runtime', 'map-alchemist-runtime.js');

describe('map-alchemist-runtime contract', () => {
  it('contains custom popup arrow markup', () => {
    const runtimeScript = fs.readFileSync(runtimePath, 'utf-8');
    expect(runtimeScript).toContain('data-mapalchemist-popup-arrow="true"');
    expect(runtimeScript).toContain("anchor: 'bottom'");
    expect(runtimeScript).toContain('width:18px;height:18px');
    expect(runtimeScript).toContain('border-right:3px solid');
    expect(runtimeScript).toContain('border-bottom:3px solid');
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
