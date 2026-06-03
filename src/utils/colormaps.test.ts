import { describe, it, expect } from 'vitest';
import { colormap, colormapSamples, fieldToImageData } from './colormaps';

describe('colormap', () => {
  it('viridis t=0 → ilk stop [68,1,84]', () => {
    expect(colormap(0, 'viridis')).toEqual([68, 1, 84]);
  });
  it('çıktı 3 bileşen, 0..255 aralığında', () => {
    for (const t of [0, 0.25, 0.5, 0.75, 1]) {
      const rgb = colormap(t, 'jet');
      expect(rgb).toHaveLength(3);
      for (const c of rgb) {
        expect(c).toBeGreaterThanOrEqual(0);
        expect(c).toBeLessThanOrEqual(255);
      }
    }
  });
  it('deterministik (aynı girdi → aynı çıktı)', () => {
    expect(colormap(0.37, 'plasma')).toEqual(colormap(0.37, 'plasma'));
  });
});

describe('colormapSamples', () => {
  it('n örnek döner', () => {
    expect(colormapSamples(5, 'viridis')).toHaveLength(5);
  });
});

describe('fieldToImageData (LUT)', () => {
  it('RGBA Uint8ClampedArray, width*height*4 boyut', () => {
    const out = fieldToImageData([0, 0.5, 1, 0.25], 2, 2, 0, 1, 'viridis');
    expect(out).toBeInstanceOf(Uint8ClampedArray);
    expect(out.length).toBe(2 * 2 * 4);
  });
  it('alpha opt uygulanır', () => {
    const out = fieldToImageData([0], 1, 1, 0, 1, 'jet', { alpha: 128, flipY: false });
    expect(out[3]).toBe(128);
  });
});
