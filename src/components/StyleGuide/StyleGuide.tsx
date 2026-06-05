/**
 * StyleGuide.tsx — "Laminar" tasarım sistemi vitrin görünümü (YALNIZ DEV).
 *
 * Erişim: geliştirme modunda `http://localhost:1420/#styleguide`.
 * Production build'de main.tsx'teki `import.meta.env.DEV` guard'ı ile elenir
 * (dinamik import → ayrı chunk → prod'da drop).
 *
 * Amaç: RAY 0 onay kapısı. Palet / tipografi / bileşen renkleri / token'lar
 * tek ekranda görülüp onaylanır, sonra RAY 1'de tüm uygulamaya yayılır.
 */
import React, { useEffect, useState } from 'react';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';
import { COMPONENT_PALETTE } from '../../theme/componentColors';

// ── Token referansları (CSS var → JS okuma, vitrin için) ──────────────────
const SURFACES = [
  { name: 'bg', var: '--mf-bg', note: 'canvas / çalışma yüzeyi' },
  { name: 'surface', var: '--mf-surface', note: 'panel gövdeleri' },
  { name: 'panel', var: '--mf-panel', note: 'toolbar / başlık' },
  { name: 'elev', var: '--mf-elev', note: 'hover / dropdown' },
];
const ACCENTS = [
  { name: 'dye', var: '--mf-dye', note: 'ana boya (teal)' },
  { name: 'dye-bright', var: '--mf-dye-bright', note: 'cyan vurgu' },
  { name: 'dye-dim', var: '--mf-dye-dim', note: 'sönük teal' },
];
const SIGNALS = [
  { name: 'active', var: '--mf-active', note: 'çalışıyor / sim' },
  { name: 'ok', var: '--mf-ok', note: 'başarı / inlet' },
  { name: 'warn', var: '--mf-warn', note: 'uyarı' },
  { name: 'error', var: '--mf-error', note: 'hata / outlet' },
];
const SPACING = [
  ['space-1', 4],
  ['space-2', 8],
  ['space-3', 12],
  ['space-4', 16],
  ['space-5', 20],
  ['space-6', 24],
  ['space-8', 32],
] as const;
const RADII = [
  ['sm', 2],
  ['md', 4],
  ['lg', 8],
] as const;

const SAMPLE_DATA = [
  { x: 50, flow: 0.42, pressure: 1200 },
  { x: 100, flow: 0.78, pressure: 980 },
  { x: 150, flow: 1.15, pressure: 760 },
  { x: 200, flow: 1.42, pressure: 610 },
  { x: 250, flow: 1.61, pressure: 520 },
  { x: 300, flow: 1.73, pressure: 470 },
];

const Section: React.FC<{ title: string; children: React.ReactNode }> = ({ title, children }) => (
  <section style={{ marginBottom: 'var(--space-8)' }}>
    <h2
      style={{
        fontSize: 11,
        fontWeight: 600,
        textTransform: 'uppercase',
        letterSpacing: '0.06em',
        color: 'var(--mf-text-dark)',
        marginBottom: 'var(--space-3)',
        borderBottom: '1px solid var(--mf-border)',
        paddingBottom: 'var(--space-2)',
      }}
    >
      {title}
    </h2>
    {children}
  </section>
);

const Swatch: React.FC<{ color: string; name: string; note?: string; hex?: string }> = ({
  color,
  name,
  note,
  hex,
}) => (
  <div style={{ display: 'flex', flexDirection: 'column', gap: 4, minWidth: 110 }}>
    <div
      style={{
        height: 56,
        borderRadius: 'var(--radius-md)',
        background: color,
        border: '1px solid var(--mf-border)',
        boxShadow: 'var(--elev-1)',
      }}
    />
    <div style={{ fontSize: 11, color: 'var(--mf-text)', fontWeight: 500 }}>{name}</div>
    {hex && (
      <div
        className="tabular"
        style={{ fontSize: 10, color: 'var(--mf-text-dim)', fontFamily: 'var(--font-mono)' }}
      >
        {hex}
      </div>
    )}
    {note && <div style={{ fontSize: 10, color: 'var(--mf-text-dark)' }}>{note}</div>}
  </div>
);

const StyleGuide: React.FC = () => {
  // tabular-nums canlı demosu — sayı değişirken zıplamamalı
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick((t) => (t + 137) % 100000), 120);
    return () => clearInterval(id);
  }, []);

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        overflow: 'auto',
        background: 'var(--mf-bg)',
        color: 'var(--mf-text)',
        fontFamily: 'var(--font-sans)',
        padding: 'var(--space-8)',
      }}
    >
      <div style={{ maxWidth: 1100, margin: '0 auto' }}>
        {/* Başlık */}
        <header
          style={{
            marginBottom: 'var(--space-8)',
            display: 'flex',
            alignItems: 'center',
            gap: 'var(--space-3)',
          }}
        >
          <div
            style={{
              width: 40,
              height: 40,
              borderRadius: 'var(--radius-md)',
              background: 'linear-gradient(135deg, var(--mf-dye), var(--mf-dye-dim))',
              color: 'var(--mf-bg)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontWeight: 700,
              fontSize: 22,
              letterSpacing: '-0.05em',
            }}
          >
            μ
          </div>
          <div>
            <div style={{ fontSize: 20, fontWeight: 700 }}>MicroFlow Studio — Laminar</div>
            <div style={{ fontSize: 12, color: 'var(--mf-text-dim)' }}>
              Tasarım Sistemi Vitrini · RAY 0 onay kapısı ·{' '}
              <span className="tabular" style={{ fontFamily: 'var(--font-mono)' }}>
                #{String(tick).padStart(5, '0')}
              </span>
            </div>
          </div>
        </header>

        {/* Yüzeyler */}
        <Section title="Yüzeyler (elevation)">
          <div style={{ display: 'flex', gap: 'var(--space-3)', flexWrap: 'wrap' }}>
            {SURFACES.map((s) => (
              <Swatch key={s.name} color={`var(${s.var})`} name={s.name} note={s.note} />
            ))}
          </div>
        </Section>

        {/* Aksan + Sinyal */}
        <Section title="Boya (aksan) + Sinyal renkleri">
          <div style={{ display: 'flex', gap: 'var(--space-3)', flexWrap: 'wrap' }}>
            {ACCENTS.map((s) => (
              <Swatch key={s.name} color={`var(${s.var})`} name={s.name} note={s.note} />
            ))}
            <div style={{ width: 1, background: 'var(--mf-border)', margin: '0 var(--space-2)' }} />
            {SIGNALS.map((s) => (
              <Swatch key={s.name} color={`var(${s.var})`} name={s.name} note={s.note} />
            ))}
          </div>
        </Section>

        {/* Bileşen paleti */}
        <Section title="Bileşen paleti (canvas ↔ tablo ↔ grafik tek kaynak)">
          <div style={{ display: 'flex', gap: 'var(--space-3)', flexWrap: 'wrap' }}>
            {COMPONENT_PALETTE.map((c) => (
              <Swatch key={c.key} color={c.hex} name={c.label} hex={c.hex} />
            ))}
          </div>
        </Section>

        {/* Tipografi */}
        <Section title="Tipografi (IBM Plex — self-hosted)">
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-6)' }}>
            <div>
              <div style={{ fontSize: 10, color: 'var(--mf-text-dark)', marginBottom: 8 }}>
                SANS (arayüz)
              </div>
              {[700, 600, 500, 400].map((w) => (
                <div
                  key={w}
                  style={{
                    fontFamily: 'var(--font-sans)',
                    fontWeight: w,
                    fontSize: 18,
                    marginBottom: 4,
                  }}
                >
                  Laminar akış · {w}
                </div>
              ))}
            </div>
            <div>
              <div style={{ fontSize: 10, color: 'var(--mf-text-dark)', marginBottom: 8 }}>
                MONO (sayılar) · tabular-nums demo
              </div>
              {[600, 500, 400].map((w) => (
                <div
                  key={w}
                  className="tabular"
                  style={{
                    fontFamily: 'var(--font-mono)',
                    fontWeight: w,
                    fontSize: 18,
                    marginBottom: 4,
                  }}
                >
                  {(1234.56 + tick).toFixed(2)} μm · {w}
                </div>
              ))}
              <div style={{ fontSize: 10, color: 'var(--mf-text-dark)', marginTop: 6 }}>
                ↑ sayılar değişirken hizalı kalır (zıplamaz)
              </div>
            </div>
          </div>
        </Section>

        {/* Butonlar + input */}
        <Section title="Bileşenler (buton / input / kart)">
          <div
            style={{
              display: 'flex',
              gap: 'var(--space-3)',
              flexWrap: 'wrap',
              alignItems: 'center',
              marginBottom: 'var(--space-4)',
            }}
          >
            <button className="btn-primary">Birincil</button>
            <button className="btn-secondary">İkincil</button>
            <button className="btn-danger">Tehlikeli</button>
            <span style={{ display: 'inline-flex', gap: 4 }}>
              <kbd className="kbd">Ctrl</kbd>
              <kbd className="kbd">S</kbd>
            </span>
          </div>
          <div style={{ display: 'flex', gap: 'var(--space-3)', flexWrap: 'wrap', maxWidth: 400 }}>
            <input
              className="mf-input"
              placeholder="Metin girişi"
              defaultValue="200"
              type="number"
            />
          </div>
          <div
            style={{
              marginTop: 'var(--space-4)',
              padding: 'var(--space-4)',
              maxWidth: 360,
              background: 'var(--mf-surface)',
              border: '1px solid var(--mf-border)',
              borderRadius: 'var(--radius-lg)',
              boxShadow: 'var(--elev-2)',
            }}
          >
            <div
              style={{
                fontSize: 11,
                textTransform: 'uppercase',
                letterSpacing: '0.06em',
                color: 'var(--mf-text-dim)',
                marginBottom: 8,
              }}
            >
              Örnek Kart
            </div>
            <div
              className="tabular"
              style={{
                fontSize: 24,
                fontWeight: 600,
                fontFamily: 'var(--font-mono)',
                color: 'var(--mf-dye)',
              }}
            >
              {(1.732 + tick / 100000).toFixed(3)}{' '}
              <span style={{ fontSize: 13, color: 'var(--mf-text-dim)' }}>μL/min</span>
            </div>
          </div>
        </Section>

        {/* Spacing + Radius */}
        <Section title="Spacing (4px tabanlı) + Radius">
          <div
            style={{
              display: 'flex',
              alignItems: 'flex-end',
              gap: 'var(--space-3)',
              marginBottom: 'var(--space-4)',
            }}
          >
            {SPACING.map(([name, px]) => (
              <div key={name} style={{ textAlign: 'center' }}>
                <div
                  style={{
                    width: px,
                    height: px,
                    background: 'var(--mf-dye)',
                    borderRadius: 2,
                    margin: '0 auto 4px',
                  }}
                />
                <div
                  className="tabular"
                  style={{
                    fontSize: 10,
                    color: 'var(--mf-text-dim)',
                    fontFamily: 'var(--font-mono)',
                  }}
                >
                  {px}
                </div>
              </div>
            ))}
          </div>
          <div style={{ display: 'flex', gap: 'var(--space-3)' }}>
            {RADII.map(([name, px]) => (
              <div key={name} style={{ textAlign: 'center' }}>
                <div
                  style={{
                    width: 48,
                    height: 48,
                    background: 'var(--mf-elev)',
                    border: '1px solid var(--mf-border-strong)',
                    borderRadius: px,
                  }}
                />
                <div style={{ fontSize: 10, color: 'var(--mf-text-dim)', marginTop: 4 }}>
                  {name} · {px}px
                </div>
              </div>
            ))}
          </div>
        </Section>

        {/* Grafik teması */}
        <Section title="Grafik teması (recharts — token'lı)">
          <div
            style={{
              height: 240,
              background: 'var(--mf-surface)',
              border: '1px solid var(--mf-border)',
              borderRadius: 'var(--radius-md)',
              padding: 'var(--space-3)',
            }}
          >
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={SAMPLE_DATA} margin={{ top: 8, right: 16, bottom: 20, left: 8 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--chart-grid)" />
                <XAxis
                  dataKey="x"
                  tick={{ fontSize: 10, fill: 'var(--chart-axis)' }}
                  label={{
                    value: 'genişlik (μm)',
                    position: 'insideBottom',
                    offset: -8,
                    fontSize: 10,
                    fill: 'var(--chart-axis)',
                  }}
                />
                <YAxis tick={{ fontSize: 10, fill: 'var(--chart-axis)' }} />
                <Tooltip
                  contentStyle={{
                    background: 'var(--chart-tooltip-bg)',
                    border: '1px solid var(--chart-tooltip-border)',
                    borderRadius: 4,
                    fontSize: 11,
                  }}
                />
                <Line
                  type="monotone"
                  dataKey="flow"
                  stroke="var(--comp-channel)"
                  strokeWidth={2}
                  dot={{ r: 2 }}
                />
                <Line
                  type="monotone"
                  dataKey="pressure"
                  stroke="var(--comp-junction)"
                  strokeWidth={2}
                  dot={{ r: 2 }}
                  yAxisId={0}
                  hide
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </Section>

        {/* Hareket */}
        <Section title="Hareket (prefers-reduced-motion saygısı)">
          <MotionDemo />
          <div style={{ fontSize: 11, color: 'var(--mf-text-dark)', marginTop: 'var(--space-2)' }}>
            İşletim sisteminde "hareketi azalt" açıksa animasyon anlık olur (design-system.css media
            query).
          </div>
        </Section>

        <footer
          style={{
            fontSize: 11,
            color: 'var(--mf-text-dark)',
            borderTop: '1px solid var(--mf-border)',
            paddingTop: 'var(--space-3)',
          }}
        >
          Bu görünüm yalnız geliştirme modunda erişilebilir · production build'de elenir.
        </footer>
      </div>
    </div>
  );
};

const MotionDemo: React.FC = () => {
  const [on, setOn] = useState(false);
  return (
    <button
      onClick={() => setOn((v) => !v)}
      style={{
        position: 'relative',
        width: 200,
        height: 40,
        borderRadius: 'var(--radius-full)',
        background: 'var(--mf-elev)',
        border: '1px solid var(--mf-border-strong)',
        cursor: 'pointer',
      }}
    >
      <span
        style={{
          position: 'absolute',
          top: 3,
          left: on ? 163 : 3,
          width: 32,
          height: 32,
          borderRadius: 'var(--radius-full)',
          background: 'var(--mf-dye)',
          transition: 'left var(--dur-base) var(--ease-fluid)',
        }}
      />
      <span
        style={{
          position: 'absolute',
          left: on ? 16 : 44,
          top: 11,
          fontSize: 12,
          color: 'var(--mf-text-dim)',
        }}
      >
        {on ? 'açık' : 'kapalı'}
      </span>
    </button>
  );
};

export default StyleGuide;
