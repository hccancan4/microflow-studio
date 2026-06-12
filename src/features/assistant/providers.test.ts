import { describe, it, expect } from 'vitest';
import { parseIntent } from './providers';

// LocalRuleProvider'ın çekirdeği parseIntent'tir; solve_targets/Lua üretimi
// kendi testlerinde (autoDesignLua.test, Rust hydraulic) doğrulanır.
describe('parseIntent — Türkçe komut ayrıştırma', () => {
  it('"10 mbar 2:1:1 bölücü su" → hedefler + Pa + akışkan', () => {
    const i = parseIntent('10 mbar 2:1:1 bölücü su')!;
    expect(i.targets).toEqual([2, 1, 1]);
    expect(i.pressurePa).toBe(1000); // mbar → Pa
    expect(i.fluidKey).toBe('water');
  });

  it('"4 çıkış eşit, 20 mbar, pbs" → 4×1.0 + 2000 Pa + pbs', () => {
    const i = parseIntent('4 çıkış eşit, 20 mbar, pbs')!;
    expect(i.targets).toEqual([1, 1, 1, 1]);
    expect(i.pressurePa).toBe(2000);
    expect(i.fluidKey).toBe('pbs');
  });

  it('"2:1 bölücü gliserol" → 2 dal, basınç yok, gliserol50', () => {
    const i = parseIntent('2:1 bölücü gliserol')!;
    expect(i.targets).toEqual([2, 1]);
    expect(i.pressurePa).toBeNull();
    expect(i.fluidKey).toBe('gliserol50');
  });

  it('Pa birimi ve ondalık değerler', () => {
    const i = parseIntent('1500 pa 1.5:0,5 bölücü plazma')!;
    expect(i.pressurePa).toBe(1500);
    expect(i.targets).toEqual([1.5, 0.5]);
    expect(i.fluidKey).toBe('plasma');
  });

  it('tasarım niyeti yoksa null (soru/serbest metin)', () => {
    expect(parseIntent('Reynolds sayısı nedir?')).toBeNull();
    expect(parseIntent('merhaba')).toBeNull();
    expect(parseIntent('tek çıkış eşit')).toBeNull(); // <2 dal anlamsız
  });
});
