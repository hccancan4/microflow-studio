import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
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
          background: '#0d1117', color: '#ff7043',
          display: 'flex', flexDirection: 'column',
          alignItems: 'center', justifyContent: 'center',
          padding: 32, fontFamily: 'monospace', gap: 16,
          zIndex: 99999,
        }}>
          <div style={{ fontSize: 18, fontWeight: 700 }}>Uygulama Render Hatası</div>
          <div style={{
            background: '#161b22', border: '1px solid #ff7043',
            borderRadius: 8, padding: 16, maxWidth: 800, width: '100%',
            overflowY: 'auto', maxHeight: '60vh',
          }}>
            <div style={{ color: '#ffd54f', marginBottom: 8, fontWeight: 600 }}>
              {String(this.state.error)}
            </div>
            <pre style={{ fontSize: 11, color: '#8b949e', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
              {this.state.info}
            </pre>
          </div>
          <button
            onClick={() => this.setState({ error: null, info: '' })}
            style={{
              background: '#ff7043', color: '#fff', border: 'none',
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

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </React.StrictMode>,
);
