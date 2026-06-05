import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { readFileSync } from 'node:fs';

// @monaco-editor/loader'ın varsayılan jsDelivr CDN string'ini son bundle'dan söker.
// Monaco yerel instance ile yüklendiği için (bkz. ScriptEditor/monacoSetup.ts) bu
// URL runtime'da zaten kullanılmaz; ama "offline/sıfır CDN" güvencesi için dist'te
// iz bırakmıyoruz (string literal → zararsız yerel placeholder).
function stripMonacoCdn(): Plugin {
  const CDN_RE = /https:\/\/cdn\.jsdelivr\.net\/npm\/monaco-editor@[\d.]+\/min\/vs/g;
  return {
    name: 'strip-monaco-cdn',
    generateBundle(_options, bundle) {
      for (const file of Object.values(bundle)) {
        if (file.type === 'chunk' && file.code.includes('cdn.jsdelivr.net/npm/monaco-editor')) {
          file.code = file.code.replace(CDN_RE, '/monaco-yerel-bundle');
        }
      }
    },
  };
}

// package.json'ı import-attribute olmadan oku (assert/with sözdizimi
// Node sürümleri arası uyumsuz; fs ile okumak her ortamda çalışır).
const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf-8')) as {
  version: string;
};

// @ts-expect-error process is a nodejs global
const host = process.env.TAURI_DEV_HOST;

// https://vite.dev/config/
export default defineConfig(async () => ({
  plugins: [react(), stripMonacoCdn()],

  // Uygulama versiyonu package.json'dan inject edilir (tek kaynak)
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
  },

  // Ağır bağımlılıkları ayrı vendor chunk'larına böl → paralel yükleme +
  // bağımsız tarayıcı cache'i (birinde değişiklik diğerlerini invalidate etmez).
  build: {
    chunkSizeWarningLimit: 700,
    rollupOptions: {
      output: {
        manualChunks: {
          'react-vendor': ['react', 'react-dom', 'zustand'],
          'konva-vendor': ['konva', 'react-konva'],
          'recharts-vendor': ['recharts'],
          'monaco-vendor': ['@monaco-editor/react', 'monaco-editor'],
        },
      },
    },
  },

  // Vite options tailored for Tauri development and only applied in `tauri dev` or `tauri build`
  //
  // 1. prevent Vite from obscuring rust errors
  clearScreen: false,
  // 2. tauri expects a fixed port, fail if that port is not available
  server: {
    port: 1420,
    strictPort: true,
    host: host || false,
    hmr: host
      ? {
          protocol: 'ws',
          host,
          port: 1421,
        }
      : undefined,
    watch: {
      // 3. tell Vite to ignore watching `src-tauri`
      ignored: ['**/src-tauri/**'],
    },
  },
}));
