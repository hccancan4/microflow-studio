/** @type {import('tailwindcss').Config} */
// ─── MicroFlow Studio "Laminar" — Tailwind ↔ Design Token köprüsü ───────────
// Tüm değerler src/styles/design-system.css içindeki CSS custom property'lerden
// okunur (var(--...)). Hardcoded hex YOK — token tek kaynak. Böylece `bg-mf-bg`
// gibi utility'ler runtime'da token-güdümlü olur.
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        // rgb(var(--x-rgb) / <alpha-value>) deseni → `/opacity` modifier'ları
        // (bg-mf-red/60, border-mf-blue/40 vb.) çalışmaya devam eder.
        // Yüzeyler
        'mf-bg': 'rgb(var(--mf-bg-rgb) / <alpha-value>)',
        'mf-surface': 'rgb(var(--mf-surface-rgb) / <alpha-value>)',
        'mf-panel': 'rgb(var(--mf-panel-rgb) / <alpha-value>)',
        'mf-elev': 'rgb(var(--mf-elev-rgb) / <alpha-value>)',

        // Kenarlıklar
        'mf-border': 'rgb(var(--mf-border-rgb) / <alpha-value>)',
        'mf-border-strong': 'rgb(var(--mf-border-strong-rgb) / <alpha-value>)',

        // Boya (ana aksan) — mf-blue/cyan eski adlar, token'a bağlandı
        'mf-blue': 'rgb(var(--mf-dye-rgb) / <alpha-value>)',
        'mf-blue-dim': 'rgb(var(--mf-dye-dim-rgb) / <alpha-value>)',
        'mf-cyan': 'rgb(var(--mf-dye-bright-rgb) / <alpha-value>)',
        'mf-dye': 'rgb(var(--mf-dye-rgb) / <alpha-value>)',
        'mf-dye-bright': 'rgb(var(--mf-dye-bright-rgb) / <alpha-value>)',
        'mf-dye-dim': 'rgb(var(--mf-dye-dim-rgb) / <alpha-value>)',

        // Sinyal renkleri (semantik)
        'mf-orange': 'rgb(var(--mf-active-rgb) / <alpha-value>)',
        'mf-orange-dim': 'rgb(var(--mf-active-dim-rgb) / <alpha-value>)',
        'mf-active': 'rgb(var(--mf-active-rgb) / <alpha-value>)',
        'mf-green': 'rgb(var(--mf-ok-rgb) / <alpha-value>)',
        'mf-yellow': 'rgb(var(--mf-warn-rgb) / <alpha-value>)',
        'mf-red': 'rgb(var(--mf-error-rgb) / <alpha-value>)',

        // Metin
        'mf-text': 'rgb(var(--mf-text-rgb) / <alpha-value>)',
        'mf-text-dim': 'rgb(var(--mf-text-dim-rgb) / <alpha-value>)',
        'mf-text-dark': 'rgb(var(--mf-text-dark-rgb) / <alpha-value>)',

        // Bileşen paleti (DOM rozet/legend için — canvas componentColors.ts kullanır)
        'comp-channel': 'rgb(var(--comp-channel-rgb) / <alpha-value>)',
        'comp-expansion': 'rgb(var(--comp-expansion-rgb) / <alpha-value>)',
        'comp-mixer': 'rgb(var(--comp-mixer-rgb) / <alpha-value>)',
        'comp-junction': 'rgb(var(--comp-junction-rgb) / <alpha-value>)',
        'comp-filter': 'rgb(var(--comp-filter-rgb) / <alpha-value>)',
        'comp-droplet': 'rgb(var(--comp-droplet-rgb) / <alpha-value>)',
        'comp-reservoir': 'rgb(var(--comp-reservoir-rgb) / <alpha-value>)',
        'comp-port-inlet': 'rgb(var(--comp-port-inlet-rgb) / <alpha-value>)',
        'comp-port-outlet': 'rgb(var(--comp-port-outlet-rgb) / <alpha-value>)',
      },
      fontFamily: {
        sans: ['"IBM Plex Sans"', 'system-ui', 'sans-serif'],
        mono: ['"IBM Plex Mono"', 'JetBrains Mono', 'Consolas', 'monospace'],
      },
      fontSize: {
        // CAD-friendly skala. base'den önce daha fazla küçük adım.
        '2xs': ['10px', { lineHeight: '14px' }],
        xs: ['11px', { lineHeight: '15px' }],
        sm: ['12px', { lineHeight: '16px' }],
        base: ['13px', { lineHeight: '18px' }],
      },
      spacing: {
        // 4px tabanlı (design-system.css --space-* ile hizalı)
        'ds-1': 'var(--space-1)',
        'ds-2': 'var(--space-2)',
        'ds-3': 'var(--space-3)',
        'ds-4': 'var(--space-4)',
        'ds-5': 'var(--space-5)',
        'ds-6': 'var(--space-6)',
        'ds-8': 'var(--space-8)',
      },
      borderRadius: {
        'ds-sm': 'var(--radius-sm)',
        'ds-md': 'var(--radius-md)',
        'ds-lg': 'var(--radius-lg)',
      },
      letterSpacing: {
        caps: '0.06em', // Uppercase başlıklar için
      },
      boxShadow: {
        panel: 'var(--elev-1)',
        pop: 'var(--elev-2)',
        'elev-3': 'var(--elev-3)',
        'inset-line': 'var(--elev-inset-line)',
      },
      transitionTimingFunction: {
        snap: 'cubic-bezier(0.2, 0.8, 0.2, 1)',
        fluid: 'var(--ease-fluid)',
        flow: 'var(--ease-out)',
      },
      transitionDuration: {
        fast: '150ms',
        base: '200ms',
        slow: '250ms',
      },
    },
  },
  plugins: [],
};
