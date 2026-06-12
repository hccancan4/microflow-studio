import { describe, it, expect } from 'vitest';
import { LUA_TEMPLATES } from './luaTemplates';

// İçerik doğrulaması Rust tarafında (mf.rs testleri şablonları gerçek
// yorumlayıcıda koşturur); burada yalnız meta yapı sabitlenir.
describe('LUA_TEMPLATES meta yapısı', () => {
  it('4 şablon, benzersiz anahtarlar', () => {
    expect(LUA_TEMPLATES).toHaveLength(4);
    const keys = LUA_TEMPLATES.map((t) => t.key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('her şablon dolu lua + etiket + açıklama taşır', () => {
    for (const t of LUA_TEMPLATES) {
      expect(t.label.length).toBeGreaterThan(0);
      expect(t.description.length).toBeGreaterThan(0);
      expect(t.lua).toContain('mf.clear()');
      expect(t.lua).toContain('mf.run_quick()');
    }
  });
});
