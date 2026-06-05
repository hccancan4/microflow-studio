import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { readFileSync } from 'node:fs';

// package.json'ı import-attribute olmadan oku (assert/with sözdizimi
// Node sürümleri arası uyumsuz; fs ile okumak her ortamda çalışır).
const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf-8')) as {
  version: string;
};

// @ts-expect-error process is a nodejs global
const host = process.env.TAURI_DEV_HOST;

// https://vite.dev/config/
export default defineConfig(async () => ({
  plugins: [react()],

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
          'monaco-vendor': ['@monaco-editor/react'],
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
