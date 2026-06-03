import { defineConfig } from 'vitest/config';

// Karakterizasyon testleri saf-mantık modüllerini hedefler (DOM gerekmez).
// Zustand store'lar React dışında, node ortamında doğrudan test edilir.
export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.{test,spec}.ts'],
    // Vite config'in `define`/build alanları test için gereksiz; izole kalsın.
  },
});
