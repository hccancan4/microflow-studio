import { describe, it, expect } from 'vitest';
import { getSweepableParams, getParamOption, componentDisplayLabel, withOverriddenParam } from './sweepHelpers';
import { buildSweepValues } from '../stores/useSweepStore';
import type { ChipComponent } from '../types';

describe('buildSweepValues', () => {
  it('start ve end dahil, eşit aralıklı', () => {
    expect(buildSweepValues(0, 10, 6)).toEqual([0, 2, 4, 6, 8, 10]);
  });
  it('steps < 2 → minimum 2', () => {
    expect(buildSweepValues(0, 10, 1)).toEqual([0, 10]);
  });
  it('start === end → sabit dizi', () => {
    expect(buildSweepValues(5, 5, 3)).toEqual([5, 5, 5]);
  });
});

describe('getSweepableParams / getParamOption', () => {
  it('straight_channel parametreleri', () => {
    const ps = getSweepableParams('straight_channel');
    expect(ps.map((p) => p.key)).toContain('width');
    expect(ps.map((p) => p.key)).toContain('length');
  });
  it('bilinmeyen tip → boş', () => {
    // @ts-expect-error kasıtlı geçersiz tip
    expect(getSweepableParams('nope')).toEqual([]);
  });
  it('getParamOption birim döner', () => {
    expect(getParamOption('straight_channel', 'width')?.unit).toBe('μm');
    expect(getParamOption('straight_channel', 'yok')).toBeUndefined();
  });
});

describe('componentDisplayLabel', () => {
  const base = { id: 'c1', type: 'straight_channel', position: { x: 0, y: 0 }, rotation: 0, params: {}, ports: [] } as unknown as ChipComponent;
  it('label varsa onu + index', () => {
    expect(componentDisplayLabel({ ...base, label: 'Kanal A' }, 0)).toBe('Kanal A #1');
  });
  it('label yoksa Türkçe tip etiketi', () => {
    expect(componentDisplayLabel(base, 2)).toBe('Düz Kanal #3');
  });
});

describe('withOverriddenParam', () => {
  it('param üzerine yazar, orijinali bozmaz', () => {
    const c = { id: 'c1', type: 'straight_channel', position: { x: 0, y: 0 }, rotation: 0, params: { width: 200, length: 5000 }, ports: [] } as unknown as ChipComponent;
    const out = withOverriddenParam(c, 'width', 999);
    expect((out.params as { width: number }).width).toBe(999);
    expect((c.params as { width: number }).width).toBe(200); // immutable
  });
});
