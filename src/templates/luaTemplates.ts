/**
 * luaTemplates — "Şablonlar" menüsünün mf.* Lua snippet'leri.
 *
 * Her şablon copilot/Oto-Tasarım ile AYNI yoldan çalışır: Lua → script
 * pipeline → canvas; içerik Script sekmesine de yazılır (düzenlenebilir).
 * .lua dosyaları tek kaynaktır: Vite `?raw` burada, Rust testi `include_str!`
 * ile aynı dosyaları gerçek yorumlayıcıda koşturur (çift doğrulama).
 */
import splitter21 from './lua/splitter_2_1.lua?raw';
import splitter4 from './lua/splitter_4_equal.lua?raw';
import serpentine from './lua/serpentine_resistor.lua?raw';
import droplet from './lua/droplet_tjunction.lua?raw';

export interface LuaTemplate {
  key: string;
  label: string;
  description: string;
  lua: string;
}

export const LUA_TEMPLATES: LuaTemplate[] = [
  {
    key: 'splitter-2-1',
    label: '2:1 Bölücü',
    description: 'T-bağlantıdan iki çıkışa 2:1 debi — hedefli serpantin dirençleri',
    lua: splitter21,
  },
  {
    key: 'splitter-4-equal',
    label: '4 Yol Eşit',
    description: 'Dört çıkışa eşit debi — eşit uzunluklu paralel serpantinler',
    lua: splitter4,
  },
  {
    key: 'serpentine-resistor',
    label: 'Serpantin Direnci',
    description: 'Referans tasarım: 10 mbar su, Q=2 µL/min → 63.5 mm (sapma ≈ %0)',
    lua: serpentine,
  },
  {
    key: 'droplet-tjunction',
    label: 'Damla Üreteci (T)',
    description: 'Sürekli + dispers faz girişli T-bağlantı topolojisi',
    lua: droplet,
  },
];
