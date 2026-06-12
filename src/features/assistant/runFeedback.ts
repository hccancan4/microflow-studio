/**
 * runFeedback — simülasyon sonucunu sohbete (ve LM bağlamına) taşınacak
 * kompakt Türkçe özete çevirir (saf). Agentik döngünün ikinci yarısı:
 * çalıştır → sonuca bak → "sapma yüksek, revize et" tek mesajla mümkün olur
 * (note, llmHistory.toLlmMessages ile "[sistem]" user mesajına dönüşür).
 */
import type { ValidationRow } from '../validation/validation';

export function formatRunFeedback(rows: ValidationRow[], totalFlow: number): string {
  const parts = rows.map((r) => {
    if (r.missing || r.errPct === null || r.qActual === null) {
      return `${r.label}: hedef ${r.qTarget.toFixed(2)} → sonuç yok (bağlantıyı kontrol edin)`;
    }
    const sign = r.errPct >= 0 ? '+' : '';
    const durum = r.status === 'ok' ? 'uygun' : r.status === 'warn' ? 'sınırda' : 'sapma yüksek';
    return (
      `${r.label}: hedef ${r.qTarget.toFixed(2)} → fiili ${r.qActual.toFixed(2)} µL/min ` +
      `(${sign}${r.errPct.toFixed(1)}%, ${durum})`
    );
  });
  return `Simülasyon sonucu — ${parts.join(' · ')} · Toplam ${totalFlow.toFixed(2)} µL/min`;
}
