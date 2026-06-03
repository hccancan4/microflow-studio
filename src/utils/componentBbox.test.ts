import { describe, it, expect } from 'vitest';
import { localBbox, worldBbox, bboxesIntersect } from './componentBbox';
import type { ChipComponent } from '../types';

function comp(type: string, params: Record<string, number | string>, position = { x: 0, y: 0 }, rotation = 0): ChipComponent {
  return { id: 'c', type, position, rotation, params, ports: [] } as unknown as ChipComponent;
}

describe('localBbox', () => {
  it('straight_channel: 0..length × ±width/2', () => {
    expect(localBbox(comp('straight_channel', { width: 200, length: 3000 })))
      .toEqual({ minX: 0, minY: -100, maxX: 3000, maxY: 100 });
  });

  it('serpentine_mixer: turns*pitch yüksekliği + channelWidth/2 payı', () => {
    // turns=4, pitch=400 → totalW=1600, totalH=1600; half=75
    expect(localBbox(comp('serpentine_mixer', { turns: 4, pitch: 400, channelWidth: 150 })))
      .toEqual({ minX: -75, minY: -75, maxX: 1675, maxY: 1675 });
  });

  it('reservoir: 0..width × 0..height', () => {
    expect(localBbox(comp('reservoir', { width: 1500, height: 1500 })))
      .toEqual({ minX: 0, minY: 0, maxX: 1500, maxY: 1500 });
  });
});

describe('worldBbox', () => {
  it('rotation=0 → position offset', () => {
    const wb = worldBbox(comp('straight_channel', { width: 200, length: 3000 }, { x: 100, y: 50 }));
    expect(wb).toEqual({ minX: 100, minY: -50, maxX: 3100, maxY: 150 });
  });
  it('rotation=90 → eksen değişimi (yaklaşık)', () => {
    const wb = worldBbox(comp('straight_channel', { width: 200, length: 1000 }, { x: 0, y: 0 }, 90));
    // 1000 uzunluk dikeye döner → genişlik ~200, yükseklik ~1000
    expect(wb.maxX - wb.minX).toBeCloseTo(200, 0);
    expect(wb.maxY - wb.minY).toBeCloseTo(1000, 0);
  });
});

describe('bboxesIntersect', () => {
  it('örtüşen → true', () => {
    expect(bboxesIntersect({ minX: 0, minY: 0, maxX: 10, maxY: 10 }, { minX: 5, minY: 5, maxX: 15, maxY: 15 })).toBe(true);
  });
  it('ayrık → false', () => {
    expect(bboxesIntersect({ minX: 0, minY: 0, maxX: 10, maxY: 10 }, { minX: 20, minY: 20, maxX: 30, maxY: 30 })).toBe(false);
  });
});
