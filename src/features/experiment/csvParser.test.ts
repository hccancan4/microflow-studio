import { describe, it, expect } from 'vitest';
import { parseCsv, parseJsonTable, parseTable, numericScore, columnAsNumbers } from './csvParser';

// Karakterizasyon: csvParser'ın MEVCUT davranışını kilitler (doğru olanı değil).

describe('parseCsv', () => {
  it('virgül-ayraçlı başlık + satırları ayrıştırır', () => {
    const t = parseCsv('x,y\n1,2\n3,4');
    expect(t.headers).toEqual(['x', 'y']);
    expect(t.rowCount).toBe(2);
    expect(t.rows).toEqual([{ x: '1', y: '2' }, { x: '3', y: '4' }]);
  });

  it('delimiter auto-detect: noktalı virgül', () => {
    const t = parseCsv('a;b;c\n1;2;3');
    expect(t.headers).toEqual(['a', 'b', 'c']);
    expect(t.rows[0]).toEqual({ a: '1', b: '2', c: '3' });
  });

  it('delimiter auto-detect: tab', () => {
    const t = parseCsv('a\tb\n1\t2');
    expect(t.headers).toEqual(['a', 'b']);
  });

  it('tırnaklı alan + escape edilmiş çift tırnak', () => {
    const t = parseCsv('name,note\n"a,b","he said ""hi"""');
    expect(t.rows[0]).toEqual({ name: 'a,b', note: 'he said "hi"' });
  });

  it('BOM ve CRLF temizler', () => {
    const t = parseCsv('﻿x,y\r\n1,2\r\n');
    expect(t.headers).toEqual(['x', 'y']);
    expect(t.rowCount).toBe(1);
  });

  it('boş başlığı col_N ile doldurur', () => {
    const t = parseCsv('x,,z\n1,2,3');
    expect(t.headers).toEqual(['x', 'col_2', 'z']);
  });

  it('boş metin → boş tablo', () => {
    expect(parseCsv('')).toEqual({ headers: [], rows: [], rowCount: 0, preview: [] });
  });

  it('preview ilk 5 satır', () => {
    const rows = Array.from({ length: 8 }, (_, i) => `${i}`).join('\n');
    const t = parseCsv('n\n' + rows);
    expect(t.preview).toHaveLength(5);
    expect(t.rowCount).toBe(8);
  });
});

describe('parseJsonTable', () => {
  it('biçim A: obje dizisi', () => {
    const t = parseJsonTable('[{"x":0,"v":1.2},{"x":1,"v":0.9}]');
    expect(t.headers).toEqual(['x', 'v']);
    expect(t.rows).toEqual([{ x: '0', v: '1.2' }, { x: '1', v: '0.9' }]);
  });

  it('biçim B: kolon-obje', () => {
    const t = parseJsonTable('{"x":[0,1,2],"v":[1,2,3]}');
    expect(t.headers).toEqual(['x', 'v']);
    expect(t.rowCount).toBe(3);
    expect(t.rows[2]).toEqual({ x: '2', v: '3' });
  });

  it('boş dizi → boş tablo', () => {
    expect(parseJsonTable('[]').rowCount).toBe(0);
  });
});

describe('parseTable uzantı yönlendirmesi', () => {
  it('.json → JSON parser', () => {
    expect(parseTable('[{"a":1}]', 'data.json').headers).toEqual(['a']);
  });
  it('.csv → CSV parser', () => {
    expect(parseTable('a,b\n1,2', 'data.csv').headers).toEqual(['a', 'b']);
  });
});

describe('numericScore', () => {
  it('sayısal oranı döner', () => {
    const rows = [{ x: '1' }, { x: '2' }, { x: 'abc' }, { x: '' }];
    // boş atlanır → 3 değerlendirilir, 2 sayısal → 2/4 (rows.length bölen)
    expect(numericScore(rows, 'x')).toBeCloseTo(2 / 4);
  });
  it('Avrupa ondalık (virgül) hoşgörüsü', () => {
    expect(numericScore([{ x: '1,5' }], 'x')).toBe(1);
  });
});

describe('columnAsNumbers', () => {
  it('virgül ondalık → nokta, boş → NaN', () => {
    const r = columnAsNumbers([{ x: '1,5' }, { x: '' }, { x: '3' }], 'x');
    expect(r[0]).toBeCloseTo(1.5);
    expect(Number.isNaN(r[1])).toBe(true);
    expect(r[2]).toBe(3);
  });
});
