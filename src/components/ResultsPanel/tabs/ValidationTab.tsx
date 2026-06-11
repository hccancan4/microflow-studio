/**
 * ValidationTab — "Doğrulama": çıkış başına hedef-vs-fiili debi tablosu.
 *
 * Hedefler mf.set_target_flow (script/copilot) veya Oto-Tasarım'dan gelir;
 * fiili değerler analitik sonucun outletFlows'undan. Renk eşikleri
 * features/validation/validation.ts'te (≤%5 yeşil, ≤%15 sarı, üstü kırmızı).
 */
import React from 'react';
import clsx from 'clsx';
import { FiCheckCircle, FiAlertTriangle, FiXCircle, FiTarget } from 'react-icons/fi';
import { useValidationStore } from '../../../features/validation/useValidationStore';
import { computeValidationRows } from '../../../features/validation/validation';
import type { OutletFlow } from '../../../types';
import { MetricCard } from '../shared';

const STATUS_META = {
  ok: { icon: <FiCheckCircle size={11} />, cls: 'text-mf-green' },
  warn: { icon: <FiAlertTriangle size={11} />, cls: 'text-mf-orange' },
  fail: { icon: <FiXCircle size={11} />, cls: 'text-mf-red' },
} as const;

export const ValidationTab: React.FC<{ outletFlows: OutletFlow[]; totalFlow: number }> = ({
  outletFlows,
  totalFlow,
}) => {
  const targets = useValidationStore((s) => s.targets);
  const rows = computeValidationRows(targets, outletFlows);

  if (rows.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-1.5 text-center p-3">
        <FiTarget size={22} className="text-mf-text-dark opacity-40" />
        <div className="text-sm text-mf-text-dim">Hedef debi tanımlı değil</div>
        <div className="text-xs text-mf-text-dark max-w-md leading-relaxed">
          Script'te <span className="font-mono text-mf-blue">mf.set_target_flow(çıkış, q)</span>{' '}
          kullanın veya <span className="text-mf-orange">✦ Oto-Tasarım</span> ile hedefli devre
          üretin — bu tablo hedef ve fiili debileri karşılaştırır.
        </div>
      </div>
    );
  }

  const okCount = rows.filter((r) => r.status === 'ok').length;
  const worst = rows.reduce<number>(
    (m, r) => (r.errPct !== null ? Math.max(m, Math.abs(r.errPct)) : m),
    0,
  );

  return (
    <div className="p-3 space-y-3">
      {/* Üst metrikler */}
      <div className="grid grid-cols-3 gap-2">
        <MetricCard label="Toplam Debi" value={`${totalFlow.toFixed(3)} μL/min`} color="blue" />
        <MetricCard
          label="Hedefi Tutan"
          value={`${okCount}/${rows.length} çıkış`}
          color={okCount === rows.length ? 'green' : 'orange'}
        />
        <MetricCard
          label="En Kötü Sapma"
          value={Number.isFinite(worst) ? `%${worst.toFixed(1)}` : '—'}
          color={worst <= 5 ? 'green' : 'orange'}
        />
      </div>

      {/* Hedef-fiili tablosu */}
      <div className="bg-mf-bg border border-mf-border rounded overflow-hidden">
        <table className="w-full text-xs font-mono">
          <thead>
            <tr className="text-mf-text-dim border-b border-mf-border text-2xs uppercase tracking-caps">
              <th className="px-2 py-1.5 text-left">Çıkış</th>
              <th className="px-2 py-1.5 text-right">Hedef Q (μL/min)</th>
              <th className="px-2 py-1.5 text-right">Fiili Q (μL/min)</th>
              <th className="px-2 py-1.5 text-right">Sapma</th>
              <th className="px-2 py-1.5 text-center">Durum</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const meta = STATUS_META[r.status];
              return (
                <tr key={r.outletId} className="border-b border-mf-border/50">
                  <td className="px-2 py-1.5 text-mf-text">{r.label}</td>
                  <td className="px-2 py-1.5 text-right text-mf-text-dim">
                    {r.qTarget.toFixed(3)}
                  </td>
                  <td className="px-2 py-1.5 text-right text-mf-text">
                    {r.qActual !== null ? r.qActual.toFixed(3) : '—'}
                  </td>
                  <td className={clsx('px-2 py-1.5 text-right', meta.cls)}>
                    {r.errPct !== null
                      ? `${r.errPct >= 0 ? '+' : ''}${r.errPct.toFixed(1)}%`
                      : 'sonuç yok'}
                  </td>
                  <td className={clsx('px-2 py-1.5', meta.cls)}>
                    <span className="flex items-center justify-center gap-1">
                      {meta.icon}
                      {r.missing
                        ? 'bağlantısız'
                        : r.status === 'ok'
                          ? 'uygun'
                          : r.status === 'warn'
                            ? 'sınırda'
                            : 'sapma yüksek'}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="text-2xs text-mf-text-dark leading-relaxed">
        Sapma = (fiili − hedef) / hedef. Eşikler: ≤%5 uygun · ≤%15 sınırda · üstü yüksek. Hedefler
        tasarım temizlenince sıfırlanır.
      </div>
    </div>
  );
};
