import { describe, it, expect } from 'vitest';
import { extractLuaBlocks, stripLuaBlocks } from './luaExtract';

describe('extractLuaBlocks', () => {
  it('tek blok çıkarır', () => {
    const text = 'Gerekçe burada.\n```lua\nmf.clear()\nmf.run_quick()\n```\nSon not.';
    expect(extractLuaBlocks(text)).toEqual(['mf.clear()\nmf.run_quick()']);
  });

  it('çok blok ve fence yokluğunu doğru işler', () => {
    const multi = '```lua\na = 1\n```\nara\n```lua\nb = 2\n```';
    expect(extractLuaBlocks(multi)).toEqual(['a = 1', 'b = 2']);
    expect(extractLuaBlocks('düz metin, kod yok')).toEqual([]);
    expect(extractLuaBlocks('```python\nx=1\n```')).toEqual([]); // yalnız lua fence
  });

  it('stripLuaBlocks gerekçeyi bırakır', () => {
    const text = 'Önce gerekçe.\n```lua\nmf.clear()\n```\nSonra ek.';
    const stripped = stripLuaBlocks(text);
    expect(stripped).toContain('Önce gerekçe.');
    expect(stripped).toContain('Sonra ek.');
    expect(stripped).not.toContain('mf.clear');
  });
});
