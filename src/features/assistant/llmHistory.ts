/**
 * llmHistory — sohbet mesajlarını LM isteği formatına çevirir (saf).
 *
 * - user/assistant geçer; asistan yanıtlarına çıkarılmış Lua blokları geri
 *   eklenir (LM kendi önceki kodunu görsün — onarım/revizyon için şart).
 * - 'note' mesajları (simülasyon sonucu, onarım bildirimi gibi sistem
 *   kayıtları) "[sistem] " önekiyle user rolüne çevrilir — Messages API'leri
 *   yalnız user/assistant kabul eder, ama bu bağlam LM'in agentik döngüsü
 *   için kritiktir ("sapma yüksek, revize et" tek mesajla çalışır).
 */
import type { AssistantMsg } from './useAssistantStore';
import type { LlmMessage } from './providers';

export function toLlmMessages(messages: AssistantMsg[]): LlmMessage[] {
  return messages.map((m) => {
    if (m.role === 'note') {
      return { role: 'user' as const, content: `[sistem] ${m.text}` };
    }
    return {
      role: m.role,
      content: m.lua ? `${m.text}\n\`\`\`lua\n${m.lua}\n\`\`\`` : m.text,
    };
  });
}
