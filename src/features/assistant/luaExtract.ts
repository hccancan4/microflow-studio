/** luaExtract — LM yanıtındaki ```lua ... ``` bloklarını çıkarır (saf). */

const LUA_FENCE = /```lua\s*\n([\s\S]*?)```/g;

export function extractLuaBlocks(text: string): string[] {
  const blocks: string[] = [];
  for (const m of text.matchAll(LUA_FENCE)) {
    const code = m[1].trim();
    if (code.length > 0) blocks.push(code);
  }
  return blocks;
}

/** Yanıtın Lua blokları çıkarılmış düz-metin kısmı (gerekçe). */
export function stripLuaBlocks(text: string): string {
  return text.replace(LUA_FENCE, '').trim();
}
