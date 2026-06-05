/**
 * monacoSetup — Monaco'yu CDN yerine YEREL bundle'dan yükler (offline çalışma).
 *
 * @monaco-editor/react varsayılan loader'ı monaco'yu jsDelivr CDN'inden çeker;
 * bu masaüstü/saha aracı internetsiz makinede de çalışmalı. Burada:
 *   1) Yerel `monaco-editor` npm paketini loader'a veriyoruz (loader.config) →
 *      sıfır network isteği.
 *   2) Web worker'ı Vite `?worker` ile yerel bundle'dan sağlıyoruz → worker da
 *      CDN'den değil, emit edilen yerel chunk'tan gelir.
 *
 * Bu modül yalnızca ScriptEditor (lazy) tarafından import edilir; dolayısıyla
 * tüm Monaco yükü ana/initial chunk'a sızmaz, yalnız script sekmesi açılınca
 * yüklenir. Lua highlighting monaco-editor'ın basic-languages'inden gelir
 * (yerel bundle'da mevcut); MicroFlow autocomplete zaten kendi kodumuz.
 */
import * as monaco from 'monaco-editor';
import { loader } from '@monaco-editor/react';
import EditorWorker from 'monaco-editor/esm/vs/editor/editor.worker?worker';

declare global {
  interface Window {
    MonacoEnvironment?: monaco.Environment;
  }
}

// Lua yalnızca temel editör worker'ını kullanır (dile özel worker yok).
self.MonacoEnvironment = {
  getWorker: () => new EditorWorker(),
};

// @monaco-editor/react'i yerel monaco instance'ına yönlendir (CDN devre dışı).
loader.config({ monaco });
