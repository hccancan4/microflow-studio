import { describe, it, expect } from 'vitest';
import { buildRepairMessage, repairBadge, MAX_REPAIR_ROUNDS } from './selfRepair';
import { toLlmMessages } from './llmHistory';
import type { AssistantMsg } from './useAssistantStore';

describe('selfRepair', () => {
  it('onarım istemi hatayı, bozuk Lua bloğunu ve net talimatı içerir', () => {
    const msg = buildRepairMessage('mf.clear()\nmf.bozuk()', 'attempt to call a nil value');
    expect(msg).toContain('attempt to call a nil value');
    expect(msg).toContain('```lua\nmf.clear()\nmf.bozuk()\n```');
    expect(msg).toContain('DÜZELTİLMİŞ TAMAMINI');
    expect(msg).toContain('mf.*');
  });

  it('tur sayısı sınırlı ve rozet doğru', () => {
    expect(MAX_REPAIR_ROUNDS).toBe(2);
    expect(repairBadge(1)).toBe('🔧 düzeltiliyor (1/2)');
    expect(repairBadge(2)).toBe('🔧 düzeltiliyor (2/2)');
  });
});

describe('toLlmMessages', () => {
  const msgs: AssistantMsg[] = [
    { id: '1', role: 'user', text: '2:1 bölücü' },
    { id: '2', role: 'assistant', text: 'Tasarım hazır:', lua: 'mf.clear()' },
    { id: '3', role: 'note', text: 'Simülasyon: ÇIKIŞ 1 −%2 (uygun)' },
  ];

  it('asistan yanıtına lua geri eklenir', () => {
    const out = toLlmMessages(msgs);
    expect(out[1].role).toBe('assistant');
    expect(out[1].content).toContain('```lua\nmf.clear()\n```');
  });

  it("note → '[sistem]' önekli user mesajı (Messages API uyumu)", () => {
    const out = toLlmMessages(msgs);
    expect(out[2].role).toBe('user');
    expect(out[2].content).toBe('[sistem] Simülasyon: ÇIKIŞ 1 −%2 (uygun)');
  });

  it('lua olmayan mesajlar değişmeden geçer', () => {
    const out = toLlmMessages(msgs);
    expect(out[0]).toEqual({ role: 'user', content: '2:1 bölücü' });
  });
});
