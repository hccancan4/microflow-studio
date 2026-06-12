/**
 * selfRepair — LM'in ürettiği Lua hata verdiğinde hatayı LM'e geri besleyen
 * onarım turunun saf parçaları. Agentik döngünün ilk yarısı: üret → çalıştır
 * → hata → düzelt (maks MAX_REPAIR_ROUNDS tur; sonsuz döngü yok).
 *
 * Not: LocalRuleProvider deterministik olduğundan kendini onaramaz — onarım
 * yalnız uzak sağlayıcı yanıtları için tetiklenir (AssistantPanel kontrol eder).
 */

/** En fazla kaç onarım turu denenir (kullanıcıya her tur görünür). */
export const MAX_REPAIR_ROUNDS = 2;

/** LM'e gönderilecek onarım istemi — başarısız Lua + hata, net talimatla. */
export function buildRepairMessage(lua: string, error: string): string {
  return (
    `Ürettiğin Lua script'i çalıştırıldı ve şu hatayla BAŞARISIZ oldu:\n` +
    `${error}\n\n` +
    `Başarısız script:\n\`\`\`lua\n${lua}\n\`\`\`\n` +
    `Hatayı düzelt ve script'in DÜZELTİLMİŞ TAMAMINI tek bir \`\`\`lua bloğu ` +
    `olarak ver (yalnız mf.* API'si; açıklama bir cümleyi geçmesin).`
  );
}

/** Onarım turu rozet metni ("🔧 düzeltiliyor (1/2)"). */
export function repairBadge(round: number): string {
  return `🔧 düzeltiliyor (${round}/${MAX_REPAIR_ROUNDS})`;
}
