/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        // ─── MicroFlow Studio: profesyonel CAD koyu tema ─────────────
        // Felsefe: gri %95, renk %5 (sinyal). Kontrast WCAG AA hedefi.
        // Ana çalışma yüzeyleri (canvas) en koyu, panel/toolbar daha
        // açık olarak katmanlanır — "yüzey yükseklik" hissi.

        // Ana yüzeyler (z-axis: koyu → açık ile yükselir)
        'mf-bg':        '#0b0d10', // Canvas / çalışma yüzeyi (en koyu, en arka)
        'mf-surface':   '#111418', // Panel gövdeleri
        'mf-panel':     '#161a1f', // Toolbar / başlık çubuğu
        'mf-elev':      '#1d2228', // Hover, seçili satır, dropdown

        // Kenarlıklar
        'mf-border':       '#252b32', // Standart border
        'mf-border-strong':'#363d46', // Vurgulu (tab seçili, focus)

        // Aksan: tek dominant — diğerleri yalnız sinyal için
        'mf-blue':      '#4fc3f7', // Birincil aksan (akış / ölçüm)
        'mf-blue-dim':  '#2563a6',
        'mf-cyan':      '#67e8f9', // İkincil — bağlantı çizgileri

        // Sinyal renkleri (yalnız durum bildirimi için)
        'mf-orange':    '#f59e0b', // Çalışıyor / dikkat
        'mf-orange-dim':'#b45309',
        'mf-green':     '#22c55e', // Başarı / inlet
        'mf-yellow':    '#eab308', // Uyarı
        'mf-red':       '#ef4444', // Hata / outlet / silme

        // Metin (kontrast hiyerarşisi)
        'mf-text':       '#e6e8ea', // Ana metin (15.4:1 üzerinde mf-bg)
        'mf-text-dim':   '#9aa3ad', // İkincil (5.7:1)
        'mf-text-dark':  '#5c6571', // Pasif / etiket (3.5:1, AA Large)
      },
      fontFamily: {
        // IBM Plex: teknik, mühendislik kökenli, ücretsiz, karakterli.
        // Plex Sans → arayüz; Plex Mono → sayısal değerler / kod.
        sans: ['"IBM Plex Sans"', 'system-ui', 'sans-serif'],
        mono: ['"IBM Plex Mono"', 'JetBrains Mono', 'Consolas', 'monospace'],
      },
      fontSize: {
        // CAD-friendly skala. base'den önce daha fazla küçük adım.
        '2xs': ['10px', { lineHeight: '14px' }],
        'xs':  ['11px', { lineHeight: '15px' }],
        'sm':  ['12px', { lineHeight: '16px' }],
        'base':['13px', { lineHeight: '18px' }],
      },
      letterSpacing: {
        'caps': '0.06em', // Uppercase başlıklar için
      },
      boxShadow: {
        // Yumuşak, gerçek bir CAD/IDE'de kullanılan tarzda
        'panel': '0 0 0 1px rgba(255,255,255,0.02), 0 1px 3px rgba(0,0,0,0.4)',
        'pop':   '0 4px 16px rgba(0,0,0,0.5), 0 0 0 1px rgba(255,255,255,0.04)',
        'inset-line': 'inset 0 -1px 0 rgba(255,255,255,0.04)',
      },
      transitionTimingFunction: {
        'snap': 'cubic-bezier(0.2, 0.8, 0.2, 1)',
      },
    },
  },
  plugins: [],
}
