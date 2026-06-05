// Flat ESLint config (ESLint 10) — TypeScript + React (Vite).
//
// Amaç: gerçek hataları (kural ihlali hook'lar, kullanılmayan değişken/import,
// şüpheli tipler) yakalamak. Salt-stil kuralları Prettier'a bırakılır;
// `eslint-config-prettier` EN SONDA durup ESLint'in Prettier ile çakışan
// biçim kurallarını kapatır (yoksa ikisi birbiriyle kavga eder).
import js from '@eslint/js';
import globals from 'globals';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import tseslint from 'typescript-eslint';
import prettier from 'eslint-config-prettier';

export default tseslint.config(
  // Lint dışı bırakılanlar: build çıktısı, bağımlılıklar, Rust tarafı (cargo fmt/clippy).
  { ignores: ['dist', 'node_modules', 'src-tauri', 'coverage'] },

  js.configs.recommended,
  ...tseslint.configs.recommended,

  {
    files: ['**/*.{ts,tsx}'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: {
        ...globals.browser,
        ...globals.node,
        __APP_VERSION__: 'readonly', // vite define ile enjekte edilir
      },
    },
    plugins: {
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
    },
    rules: {
      // React Hooks doğruluğu — kural-ihlali hook'lar gerçek bug'dır.
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn',
      // Vite HMR sınırları (bilgilendirici).
      'react-refresh/only-export-components': ['warn', { allowConstantExport: true }],
      // Kullanılmayan değişken/import yasağı; `_` önekli kasıtlılar hariç.
      '@typescript-eslint/no-unused-vars': [
        'warn',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_' },
      ],
      // Pre-existing `any` (Konva olay tipleri, Lua köprüsü, JSON ayrıştırma) —
      // bu refactor turunun borcu değil; görünür ama bloklamaz. Gelecekteki bir
      // tip-güvenliği pass'i bunları daraltabilir.
      '@typescript-eslint/no-explicit-any': 'warn',
      // Pedantik + yanlış-pozitife açık (switch + tek çıkış-değişkeni deseni).
      'no-useless-assignment': 'off',
    },
  },

  prettier, // EN SON: stil çakışmalarını kapat
);
