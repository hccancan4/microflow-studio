# MicroFlow Studio — Architecture Reference

> Based on the completed 6-phase codebase. All module descriptions reflect actual source files.

---

## Process Model (Tauri v2)

```
┌─────────────────────────────────┐     IPC (invoke/listen)     ┌────────────────────────────────────┐
│   WebView (React frontend)      │ ◄──────────────────────────► │   Rust backend (Tauri process)     │
│   src/                          │                              │   src-tauri/src/                   │
│   • React 18 + TypeScript       │                              │   • Tauri v2 command handlers      │
│   • Zustand 5 state stores      │                              │   • Simulation engines             │
│   • Konva.js canvas             │                              │   • GDS-II / PNG / SVG export      │
│   • Monaco Lua editor           │                              │   • mlua Lua 5.4 sandbox           │
│   • recharts result plots       │                              │   • Project file I/O               │
└─────────────────────────────────┘                              └────────────────────────────────────┘
```

---

## Frontend Layer (`src/`)

### Entry point

- **`main.tsx`** — mounts `<App />` into `#root`
- **`App.tsx`** — top-level layout (Toolbar + left panel + centre + right panel + status bar); keyboard shortcut handler; file open/save/saveAs; simulation run triggers; script execution; `buildProjectPayload()`

### Layout

```
App
├── Toolbar               — New / Open / Save / Export / Run Analytic / Run CFD / Import Experiment / Sweep
├── Sidebar               — 4 categories: Kanallar (4), Bağlantılar (3), Filtreler (1), Portlar & Rezervuarlar (3)
├── [centre]
│   ├── CanvasEditor      — Konva Stage with grid, ruler, component shapes, port overlay, CFD overlay
│   │   ├── CfdOverlay    — velocity/pressure heatmap rendered as ImageData over Konva Image
│   │   ├── PortOverlay   — connection drawing UI
│   │   ├── Ruler         — μm-scaled horizontal/vertical rulers
│   │   └── ContextMenu   — right-click: duplicate, delete, properties
│   └── ScriptEditor      — Monaco editor (Lua) + run button + output log
├── ResultsPanel          — 4 tabs: Özet / Hız Profili / Basınç / CFD
├── PropertiesPanel       — selected component parameter editor
├── ProgressOverlay       — simulation progress (bottom-right toast)
├── ExportDialog          — format / DPI / background / scale-bar options
├── ExperimentImportDialog — CSV/JSON import wizard
└── SweepDialog           — parametric sweep configuration
```

### Zustand Stores

All stores use Zustand 5. State is kept in memory; persistence is via `.mflow` file save/load.

**`useDesignStore`** — canonical chip design state

| Key | Type | Description |
|---|---|---|
| `components` | `ChipComponent[]` | All placed components |
| `connections` | `Connection[]` | All port-to-port connections |
| `canvas` | `CanvasState` | Grid, zoom, pan, ruler |
| `selectedIds` | `string[]` | Currently selected component IDs |
| `history` | `HistoryEntry[]` | Undo/redo stack (max 50 entries) |

Methods: `addComponent`, `updateComponent`, `removeComponents`, `addConnection`, `removeConnection`, `loadDesign`, `clearDesign`, `undo`, `redo`, `pushHistory`, `setSelected`, `updateCanvas`.

**`useProjectStore`** — project metadata and UI panel state

| Key | Type | Description |
|---|---|---|
| `metadata` | `ProjectMetadata` | name, author, created, modified, description, tags |
| `filePath` | `string \| null` | Current save path |
| `isDirty` | `boolean` | Unsaved changes indicator |
| `recentFiles` | `string[]` | Recent file list |
| `activeTab` | `'canvas' \| 'script'` | Centre panel mode |
| `leftPanelOpen` | `boolean` | Sidebar visibility |
| `rightPanelOpen` | `boolean` | Properties panel visibility |
| `bottomPanelOpen` | `boolean` | Results panel visibility |
| `leftPanelWidth` | `number` | px width |
| `rightPanelWidth` | `number` | px width |
| `bottomPanelHeight` | `number` | px height |
| `scriptContent` | `string` | Current Lua script text |

**`useSimulationStore`** — simulation state

| Key | Type | Description |
|---|---|---|
| `params` | `SimulationParams` | fluid, pressure, grid resolution, max iterations |
| `status` | `SimulationStatus` | idle / running / completed / error |
| `progress` | `{ pct, message }` | Live progress from Tauri events |
| `result` | `SimulationResult \| null` | Last completed result (analytic or CFD) |
| `cfdTargetComponentId` | `string \| null` | Component the CFD overlay is shown for |
| `colormap` | `ColormapType` | jet / viridis / plasma / coolwarm |
| `showVelocityField` | `boolean` | Toggle velocity heatmap |
| `showPressureField` | `boolean` | Toggle pressure heatmap |

**`useExperimentStore`** — imported experiment datasets

| Key | Type | Description |
|---|---|---|
| `datasets` | `ExperimentDataSet[]` | All imported datasets |

Methods: `addDataset`, `removeDataset`, `replaceAll`, `clear`, `nextColor`.

**`useSweepStore`** — parametric sweep state

| Key | Type | Description |
|---|---|---|
| `isRunning` | `boolean` | Sweep in progress |
| `results` | `SweepResult[]` | Results per sweep step |
| `config` | `SweepConfig` | Parameter name, values, target component |

### Konva Canvas Architecture

`CanvasEditor` creates a single `<Stage>` with three layers:

1. **Grid layer** — 25/50/100 μm grid lines, rendered from `CanvasState.gridSize`
2. **Component layer** — one Konva `Group` per `ChipComponent`, containing `ComponentShapes` (type-specific shapes from `shapes/ComponentShapes.tsx`) plus port circles
3. **Overlay layer** — `CfdOverlay` (CFD heatmap image), `PortOverlay` (connection line), `Ruler` shapes

Stage coordinate system: 1 Konva unit = 1 μm, scaled by `canvas.zoom` with offset `(canvas.panX, canvas.panY)`.

### Hooks

- **`useScriptDispatcher`** — listens for `script-action` and `script-completed` Tauri events; batches `DesignAction` payloads and dispatches them to `useDesignStore` methods; returns `ScriptRunStatus`.

### Feature modules & utilities

Vertical feature slices live under `src/features/<name>/` (UI + store + utils
co-located); shared, framework-free helpers stay in `src/utils/`.

| File | Purpose |
|---|---|
| `features/export/gdsGeometry.ts` | Generate `GdsPolygon[]` from `ChipComponent[]` |
| `features/export/svgExporter.ts` | Build SVG string from design; optional scale bar |
| `features/export/exportRenderer.tsx` | Off-screen Konva `<Stage>` → base64 PNG for export |
| `features/experiment/experimentMetrics.ts` | R², RMSE, per-point error map computation |
| `features/experiment/csvParser.ts` | CSV/JSON text → `ExperimentDataSet` |
| `features/sweep/sweepRunner.ts` | Batch sweep execution loop |
| `features/sweep/sweepHelpers.ts` | Sweepable parameter catalog per component type |
| `utils/colormaps.ts` | viridis / jet / plasma / coolwarm lookup tables |
| `utils/componentDefaults.ts` | Default parameter values per component type |
| `utils/portUtils.ts` | Port position calculation in component-local coordinates |
| `utils/componentBbox.ts` | Rotation-aware bounding boxes (selection, fit-all) |

---

## AI Copilot Data Flow (v1.1 · çoklu-sağlayıcı + agentik döngü v1.1.5)

```
AssistantPanel (webview)                       Rust backend
  │ kullanıcı komutu                             │
  ├── invoke('llm_complete',                     │
  │     {provider, model?, system, msgs}) ───────┼──► commands/llm_commands.rs
  │                                              │      llm.json: active_provider +
  │                                              │        anthropic{key,model} (env ANTHROPIC_API_KEY öncelikli)
  │                                              │        openai{base_url,key?,model,timeout} (env OPENAI_API_KEY)
  │                                              │      anthropic → api.anthropic.com (14s ×2)
  │                                              │      openai   → {base_url}/chat/completions
  │                                              │                 (Ollama/LM Studio/vLLM/fine-tune;
  │                                              │                  anahtarsız lokal OK; timeout yapılandırılır)
  │ ◄── yalnız üretilen METİN ──────────────────┤      (anahtarlar asla yanıtta/logda değil)
  │ hata/timeout?                                │
  ├── LocalRuleProvider (TR regex) ──► invoke('solve_targets') ──► simulation/hydraulic.rs
  │                                                                R_i=(P−Q·R_feed)/Q_i, l_for_r
  │ ```lua bloğu → setScriptContent + runScript(lua)
  └──► execute_script → DesignAction'lar → useScriptDispatcher PARTITION:
         tasarım eylemleri → tek undo girdisi + tek setState + dirty
         meta eylemler (set_fluid/pressure/target) → ayar store'ları (history YOK)
         run_simulation → useSimulationStore.runQueue → useSimulationRun effect
           (status müsaitken dequeue → handleRunAnalytic/handleRunCfd)

AGENTİK DÖNGÜ (v1.1.5):
  runScript → ScriptResult{success,error}
    ├─ HATA → buildRepairMessage(lua, hata) sohbet geçmişine eklenir →
    │         aynı sağlayıcıdan düzeltilmiş Lua (maks 2 tur; onay akışına saygılı;
    │         yerel kural motoru kendini onarmaz)
    └─ BAŞARI → analitik koşu tamamlanınca formatRunFeedback (hedef-vs-fiili özet)
                sohbete 'note' düşer → llmHistory bunu "[sistem]" user mesajı olarak
                LM'e taşır → "sapmayı düzelt" tek mesajla revizyon döngüsü kurar
```

Güvenlik sınırı: webview'ın CSP'si dış host'a izin vermez; tek dış çağrı backend'dedir
ve yalnız kullanıcı bir sağlayıcı yapılandırıp Asistan'ı kullanırsa gerçekleşir
(lokal Ollama'da trafik makineden çıkmaz).

---

## Backend Layer (`src-tauri/src/`)

### Module Map

```
lib.rs                      — Tauri app builder, command registration
commands/
  simulation_commands.rs    — run_analytic_network, run_cfd_simulation
  export_commands.rs        — export_png_data, export_svg, export_gds_file
  script_commands.rs        — execute_script
  project_commands.rs       — save_project_file, load_project_file, new_project
simulation/
  analytic.rs               — Hagen-Poiseuille network solver (734 lines)
  cfd.rs                    — Chorin projection CFD solver (422 lines)
export/
  mod.rs                    — PNG (base64→image→composite) + SVG write (230 lines)
  gds.rs                    — GDS-II binary Stream Format writer (354 lines)
scripting/
  mod.rs                    — mlua sandbox creation, script execution (291 lines)
  api.rs                    — Chip/ComponentRef/PortRef Lua UserData (434 lines)
  events.rs                 — DesignAction enum (AddComponent, Connect, ClearDesign, UpdateCanvas)
geometry/
  mod.rs                    — Point, Rect, bounding_box, arc_points helpers
project/
  mod.rs                    — MFlowProject struct, save_project, load_project
```

### Tauri IPC Commands

| Command name | File | Description |
|---|---|---|
| `save_project_file` | `project_commands.rs` | Serialize `MFlowProject` → `.mflow` JSON |
| `load_project_file` | `project_commands.rs` | Deserialize `.mflow` → `MFlowProject` |
| `new_project` | `project_commands.rs` | Return a default empty `MFlowProject` |
| `run_analytic_network` | `simulation_commands.rs` | Hagen-Poiseuille network analysis |
| `run_cfd_simulation` | `simulation_commands.rs` | 2D Stokes CFD; emits `simulation-progress` events |
| `execute_script` | `script_commands.rs` | Run Lua in sandbox; emit `script-action` / `script-completed` events |
| `export_png_data` | `export_commands.rs` | Base64 PNG data URL → file with alpha-composite |
| `export_svg` | `export_commands.rs` | SVG string → file |
| `export_gds_file` | `export_commands.rs` | `GdsPolygon[]` + params → GDS-II binary file |

### Tauri Events (backend → frontend)

| Event name | Payload | Emitted by |
|---|---|---|
| `simulation-progress` | `{ progress: u32, message: String }` | `run_cfd_simulation` every 5 iters |
| `script-action` | `DesignAction` (JSON) | `execute_script` for each Lua design action |
| `script-completed` | `ScriptResult` | `execute_script` on completion |

---

## Data Flow Diagram

```
─── User drops component on canvas ──────────────────────────────────────────────
  CanvasEditor (drag-drop)
    → useDesignStore.addComponent(component)
    → CanvasEditor re-renders via Zustand subscription

─── User saves project (Ctrl+S) ────────────────────────────────────────────────
  App.tsx: handleSave()
    → buildProjectPayload()  [reads useDesignStore + useProjectStore + useExperimentStore]
    → invoke('save_project_file', { project, path })
    → project/mod.rs: save_project(path, project)
    → writes JSON to .mflow

─── User runs Analytical simulation ────────────────────────────────────────────
  App.tsx: handleRunAnalytic()
    → invoke('run_analytic_network', { req: { components, connections, ... } })
    → simulation_commands.rs: run_analytic_network(req)
    → simulation/analytic.rs: analyze_design(...)
    → returns AnalyticDesignResult
    → useSimulationStore.setResult(result)
    → ResultsPanel renders tabs

─── User runs CFD simulation ────────────────────────────────────────────────────
  App.tsx: handleRunCfd()
    → computes u_avg (Hagen-Poiseuille analytical pre-solve)
    → invoke('run_cfd_simulation', { req })
    → simulation-progress events → useSimulationStore.setProgress()
    → simulation/cfd.rs: solve_stokes_2d(...)
    → returns CfdField
    → useSimulationStore.setResult(result)
    → CfdOverlay renders heatmap on canvas

─── User executes Lua script ────────────────────────────────────────────────────
  ScriptEditor → App.tsx: handleRunScript()
    → invoke('execute_script', { script })
    → scripting/mod.rs: run_script_collect(script)
    → scripting/api.rs: Chip methods emit DesignActions via ScriptContext
    → Tauri emits script-action events per action
    → useScriptDispatcher batches actions
    → useDesignStore methods (addComponent, addConnection, clearDesign)
    → Canvas updates

─── User exports PNG ────────────────────────────────────────────────────────────
  ExportDialog → App.tsx: handleExportConfirm({ format:'png', ... })
    → ExportRenderer (offscreen Konva Stage) → toDataURL() → base64
    → invoke('export_png_data', { outputPath, data: base64, options })
    → export/mod.rs: save_png_from_base64(data, path, options)
    → base64 decode → RgbaImage → composite_over_background → save

─── User exports GDS-II ────────────────────────────────────────────────────────
  ExportDialog → App.tsx: handleExportConfirm({ format:'gds', ... })
    → utils/gdsGeometry.ts: buildGdsPolygons(components)
    → invoke('export_gds_file', { outputPath, polygons, params })
    → export/gds.rs: save_gds(path, polygons, params)
    → writes GDS-II binary stream
```
