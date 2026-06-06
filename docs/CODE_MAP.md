# MicroFlow Studio — Kod Haritası

"X nerede?" ve "bir kullanıcı aksiyonu uçtan uca nereden geçer?" sorularının
yanıtı. Klasör kuralları için bkz. [`../CONVENTIONS.md`](../CONVENTIONS.md).

---

## Mimari katmanlar

```
React UI (components/, features/)
   │  kullanıcı aksiyonu
   ▼
Hook (hooks/useXxx)  ──►  Zustand store (stores/)
   │  invoke('komut', req)
   ▼
Tauri IPC (src-tauri/src/commands/*_commands.rs)   ← ince adapter
   │
   ▼
Rust domain (simulation/ · export/ · project/ · scripting/)
   │  Result<T, String>  (+ CFD/script: window.emit event'leri)
   ▼
Store güncellenir  ──►  ilgili panel render olur
```

---

## "X nerede?" hızlı tablo

| Aradığın | Yer |
|---|---|
| Canvas state, zoom/pan, undo/redo (iki-yığın: `undoStack`/`redoStack`) | `stores/useDesignStore.ts` |
| Zoom alt/üst limiti (`ZOOM_MIN`/`ZOOM_MAX`) | `stores/useDesignStore.ts` (export edilir; CanvasEditor de kullanır) |
| Grid çizimi (adaptif major/minor) | `components/Canvas/canvasGrid.tsx` |
| Bileşen şekilleri (Konva) | `components/Canvas/shapes/ComponentShapes.tsx` |
| Port konumları / snap-route | `utils/portUtils.ts` |
| Renkler / tasarım token'ları | `theme/tokens.ts`, `theme/componentColors.ts` |
| Bileşen varsayılan parametreleri | `utils/componentDefaults.ts` |
| Solver ayar sabitleri (CFD) | `src-tauri/src/simulation/cfd.rs` (`SOR_OMEGA`, `POISSON_SUB_ITERATIONS`, `DT_DIFF_CFL`) |
| Direnç modeli + kanal default geometrileri | `src-tauri/src/simulation/analytic.rs` (`ASPECT_RATIO_CORRECTION`, `DEFAULT_CHANNEL_*_UM`) |
| `.mflow` dosya şeması | `types/project.ts` + `src-tauri/src/project/mod.rs` |
| Tipler (domain'e bölünmüş) | `types/<domain>.ts` (`component`, `canvas`, `simulation`, `project`, `experiment`, `ui`) |
| Monaco editör offline kurulumu (yerel bundle + worker, CDN yok) | `components/ScriptEditor/monacoSetup.ts` + `vite.config.ts` (`strip-monaco-cdn`) |
| Bilinen latent bug'lar | [`../BUGS.md`](../BUGS.md) |

---

## Uçtan uca akışlar

### Hızlı Analiz (analitik ağ)
`Toolbar` → `hooks/useSimulationRun.handleRunAnalytic`
→ `invoke('run_analytic_network', req)`
→ `commands/simulation_commands.rs::run_analytic_network`
→ `simulation/analytic.rs::analyze_design` (graf → seri/paralel direnç → debi/basınç dağılımı)
→ `useSimulationStore` (result) → `components/ResultsPanel/tabs/AnalyticView.tsx`

### CFD Simülasyonu (2D Stokes)
`Toolbar` → `hooks/useSimulationRun.handleRunCfd`
→ `invoke('run_cfd_simulation', req)`
→ `commands/simulation_commands.rs::run_cfd_simulation` (`spawn_blocking` worker thread)
→ `simulation/cfd.rs::solve_stokes_2d` (Chorin projeksiyon; her kontrol noktasında `simulation-progress` event)
→ event'ler `useSimulationRun` listener'ında ilerleme çubuğunu günceller
→ `CfdField` → `useSimulationStore` → `components/ResultsPanel/tabs/CfdView.tsx`

### Parametre Taraması (sweep)
`SweepDialog` → `stores/useSweepStore` + `utils/sweepRunner.ts` (her adımda analitik koşu)
→ `components/ResultsPanel/tabs/SweepTab.tsx` (canlı grafik + CSV dışa aktar)

### Dışa Aktarma (PNG / SVG / GDS-II)
`features/export/ExportDialog.tsx` → `hooks/useExportFlow.handleExportConfirm`
→ format'a göre:
  - **PNG**: `features/export/exportRenderer.tsx` (offscreen Konva → base64) → `invoke('export_png_data')`
  - **SVG**: `features/export/svgExporter.ts` → `invoke('export_svg')`
  - **GDS**: `features/export/gdsGeometry.ts` (poligon tessellation) → `invoke('export_gds_file')`
→ `commands/export_commands.rs` → `export/` domain (`save_png_from_base64` / `save_svg` / `save_gds`)

### Deney Verisi Karşılaştırma
`features/experiment/ExperimentImportDialog.tsx` → `features/experiment/csvParser.ts` (CSV/JSON parse + sütun heuristik)
→ `features/experiment/useExperimentStore.ts` (dataset'ler)
→ overlay: `AnalyticView` (profil karşılaştırma) + `CfdView` (hata haritası), metrikler `features/experiment/experimentMetrics.ts` (R²/RMSE/MAPE)

### Proje Kaydet / Aç
`hooks/useProjectIO` (`handleSave`/`handleOpen`/`handleNewProject`)
→ `invoke('save_project_file' | 'load_project_file' | 'new_project')`
→ `commands/project_commands.rs` → `project/mod.rs`
→ yükleme: `RawMFlowProject` (snake_case) → store'lara dağıtılır (design + simulation + experiment + script)

### Lua Script
`components/ScriptEditor/ScriptEditor.tsx` (Monaco offline: `monacoSetup.ts` `loader.config({ monaco })` + yerel worker) → `hooks/useScriptRun.handleRunScript`
→ `invoke('execute_script')`
→ `commands/script_commands.rs::execute_script`
→ `scripting/` (`run_script_collect`) → her `DesignAction` `script-action` event'i olarak yayılır
→ `hooks/useScriptDispatcher` event'leri dinleyip store action'larına çevirir (undo/redo stack'ine düzgün düşer)

---

## Canvas katman mimarisi (`components/Canvas/CanvasEditor.tsx`)

Performans için 4 Konva layer:
- **Layer 0 — Grid**: `canvasGrid.buildGridLines`, `listening=false`
- **Layer 1 — Static**: bağlantılar + statik bileşenler
- **Layer 2 — Active/Drag**: sürüklenen bileşen(ler), ayrı layer
- **Layer 3 — Port Overlay**: `PortOverlay.tsx`, portlar + pending bağlantı
