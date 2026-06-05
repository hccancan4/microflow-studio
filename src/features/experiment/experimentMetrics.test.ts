import { describe, it, expect } from 'vitest';
import { linearInterp, sortAndDedup, computeMetrics } from './experimentMetrics';

describe('linearInterp', () => {
  it('aralık dışı → kenara clamp', () => {
    expect(linearInterp([0, 10], [0, 100], -5)).toBe(0);
    expect(linearInterp([0, 10], [0, 100], 15)).toBe(100);
  });
  it('orta nokta lineer', () => {
    expect(linearInterp([0, 10], [0, 100], 5)).toBe(50);
    expect(linearInterp([0, 2, 4], [0, 20, 40], 3)).toBe(30);
  });
  it('boş → NaN, tek → o değer', () => {
    expect(Number.isNaN(linearInterp([], [], 1))).toBe(true);
    expect(linearInterp([5], [9], 1)).toBe(9);
  });
});

describe('sortAndDedup', () => {
  it('x sıralar', () => {
    const { xs, ys } = sortAndDedup([
      [2, 20],
      [0, 0],
      [1, 10],
    ]);
    expect(xs).toEqual([0, 1, 2]);
    expect(ys).toEqual([0, 10, 20]);
  });
  it('aynı x → ortalama', () => {
    const { xs, ys } = sortAndDedup([
      [1, 10],
      [1, 20],
    ]);
    expect(xs).toEqual([1]);
    expect(ys).toEqual([15]);
  });
});

describe('computeMetrics', () => {
  it('mükemmel uyum → R²=1, RMSE=0', () => {
    const m = computeMetrics([0, 10], [0, 100], [0, 5, 10], [0, 50, 100]);
    expect(m.n).toBe(3);
    expect(m.rmse).toBeCloseTo(0);
    expect(m.rSquared).toBeCloseTo(1);
    expect(m.maxAbsError).toBeCloseTo(0);
  });
  it('bilinen sabit hata → RMSE', () => {
    // sim sabit 0; exp 0,10,20 → interp sim hep 0 → hatalar 0,10,20
    const m = computeMetrics([0, 100], [0, 0], [0, 50, 100], [0, 10, 20]);
    expect(m.maxAbsError).toBeCloseTo(20);
    expect(m.rmse).toBeCloseTo(Math.sqrt((0 + 100 + 400) / 3));
  });
  it('yetersiz veri → NaN, n=0', () => {
    const m = computeMetrics([0], [0], [], []);
    expect(m.n).toBe(0);
    expect(Number.isNaN(m.rSquared)).toBe(true);
  });
});
