import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";

// ── Self-hosted fontlar (CDN YOK — offline çalışır) ──────────────────────
import "@fontsource/ibm-plex-sans/400.css";
import "@fontsource/ibm-plex-sans/500.css";
import "@fontsource/ibm-plex-sans/600.css";
import "@fontsource/ibm-plex-sans/700.css";
import "@fontsource/ibm-plex-mono/400.css";
import "@fontsource/ibm-plex-mono/500.css";
import "@fontsource/ibm-plex-mono/600.css";

// ── Tasarım token'ları (önce yüklensin ki :root var'lar hazır olsun) ─────
import "./styles/design-system.css";
import "./index.css";

/** Render hatalarını yakalayan Error Boundary — yoksa React tüm ağacı unmount eder (beyaz ekran). */
class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { error: Error | null; info: string }
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { error: null, info: '' };
  }

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('[ErrorBoundary] Render hatası:', error, info.componentStack);
    this.setState({ info: info.componentStack ?? '' });
  }

  render() {
    if (this.state.error) {
      return (
        <div style={{
          position: 'fixed', inset: 0,
          background: 'var(--mf-bg, #0b0d10)', color: 'var(--mf-error, #ef4444)',
          display: 'flex', flexDirection: 'column',
          alignItems: 'center', justifyContent: 'center',
          padding: 32, fontFamily: 'var(--font-mono, monospace)', gap: 16,
          zIndex: 99999,
        }}>
          <div style={{ fontSize: 18, fontWeight: 700 }}>Uygulama Render Hatası</div>
          <div style={{
            background: 'var(--mf-surface, #111418)', border: '1px solid var(--mf-error, #ef4444)',
            borderRadius: 8, padding: 16, maxWidth: 800, width: '100%',
            overflowY: 'auto', maxHeight: '60vh',
          }}>
            <div style={{ color: 'var(--mf-warn, #eab308)', marginBottom: 8, fontWeight: 600 }}>
              {String(this.state.error)}
            </div>
            <pre style={{ fontSize: 11, color: 'var(--mf-text-dim, #9aa3ad)', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
              {this.state.info}
            </pre>
          </div>
          <button
            onClick={() => this.setState({ error: null, info: '' })}
            style={{
              background: 'var(--mf-error, #ef4444)', color: '#fff', border: 'none',
              borderRadius: 6, padding: '8px 20px', cursor: 'pointer', fontSize: 14,
            }}
          >
            Yeniden Dene
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

const root = ReactDOM.createRoot(document.getElementById("root") as HTMLElement);

// StyleGuide görünümü — YALNIZ geliştirme modunda ve #styleguide hash'inde.
// Dinamik import + import.meta.env.DEV guard → production build'de tamamen
// elenir (Rollup ölü-dal eliminasyonu, ayrı chunk drop edilir).
if (import.meta.env.DEV && window.location.hash === "#styleguide") {
  import("./components/StyleGuide/StyleGuide").then(({ default: StyleGuide }) => {
    root.render(
      <React.StrictMode>
        <StyleGuide />
      </React.StrictMode>,
    );
  });
} else {
  root.render(
    <React.StrictMode>
      <ErrorBoundary>
        <App />
      </ErrorBoundary>
    </React.StrictMode>,
  );
}
