import { describe, it, expect } from 'vitest';
import { getPortInfos, smartRoute } from './portUtils';
import type { ChipComponent } from '../types';

function comp(type: string, params: Record<string, number | string>): ChipComponent {
  return {
    id: 'c',
    type,
    position: { x: 0, y: 0 },
    rotation: 0,
    params,
    ports: [],
  } as unknown as ChipComponent;
}

describe('getPortInfos — straight_channel', () => {
  it('giriş (0,0), çıkış (length,0)', () => {
    const ports = getPortInfos(comp('straight_channel', { width: 200, length: 3000 }));
    expect(ports).toHaveLength(2);
    expect(ports[0].localPos).toEqual({ x: 0, y: 0 });
    expect(ports[1].localPos).toEqual({ x: 3000, y: 0 });
  });
});

describe('getPortInfos — serpentine_mixer çıkış hizalama', () => {
  // Düzeltme: çıkış = son yatay segmentin ucu (parity'ye bağlı), y = turns*pitch
  it('turns TEK → çıkış sol (x=0), y=turns*pitch', () => {
    const ports = getPortInfos(
      comp('serpentine_mixer', { turns: 5, pitch: 400, channelWidth: 150 }),
    );
    expect(ports[0].localPos).toEqual({ x: 0, y: 0 }); // giriş
    expect(ports[1].localPos).toEqual({ x: 0, y: 2000 }); // çıkış (5*400)
  });
  it('turns ÇİFT → çıkış sağ (x=pitch*4), y=turns*pitch', () => {
    const ports = getPortInfos(
      comp('serpentine_mixer', { turns: 4, pitch: 400, channelWidth: 150 }),
    );
    expect(ports[1].localPos).toEqual({ x: 1600, y: 1600 });
  });
});

describe('smartRoute', () => {
  it('çok yakın noktalar → düz çizgi (2 nokta)', () => {
    const pts = smartRoute({ x: 0, y: 0 }, { x: 50, y: 30 });
    expect(pts).toEqual([0, 0, 50, 30]);
  });
  it('yatay hizalı (≤80 fark) → düz çizgi', () => {
    const pts = smartRoute({ x: 0, y: 0 }, { x: 1000, y: 40 });
    expect(pts).toEqual([0, 0, 1000, 40]);
  });
  it('uzak + hizasız → manhattan (8 nokta)', () => {
    const pts = smartRoute({ x: 0, y: 0 }, { x: 1000, y: 1000 });
    expect(pts).toHaveLength(8);
    expect(pts.slice(0, 2)).toEqual([0, 0]);
    expect(pts.slice(-2)).toEqual([1000, 1000]);
  });
});
