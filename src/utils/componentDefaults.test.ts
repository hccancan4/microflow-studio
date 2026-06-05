import { describe, it, expect } from 'vitest';
import { getDefaultParams, getComponentLabel } from './componentDefaults';

// Mevcut default'ları kilitler (RAY 2'de kompakt değerlere çekilmişti).
describe('getDefaultParams', () => {
  it('straight_channel', () => {
    expect(getDefaultParams('straight_channel')).toEqual({ width: 200, length: 3000, depth: 50 });
  });
  it('curved_channel (radius 800, angle 90)', () => {
    expect(getDefaultParams('curved_channel')).toEqual({
      radius: 800,
      angle: 90,
      width: 200,
      depth: 50,
    });
  });
  it('serpentine_mixer (turns 5, pitch 400)', () => {
    expect(getDefaultParams('serpentine_mixer')).toEqual({
      channelWidth: 150,
      turns: 5,
      pitch: 400,
      depth: 50,
    });
  });
  it('port inlet varsayılan', () => {
    expect(getDefaultParams('port')).toEqual({ diameter: 200, portType: 'inlet' });
  });
});

describe('getComponentLabel', () => {
  it('Türkçe etiketler', () => {
    expect(getComponentLabel('straight_channel')).toBe('Düz Kanal');
    expect(getComponentLabel('serpentine_mixer')).toBe('Serpantin Mikser');
  });
});
