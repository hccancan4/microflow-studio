# Changelog — MicroFlow Studio

All notable changes are documented here, organised by development phase.

---

## Phase 1 — Project Skeleton

- Tauri v2 project initialised (Rust + React 18 + TypeScript + Vite)
- Application layout: Toolbar, left Sidebar, centre canvas area, right Properties panel, bottom Results panel
- Zustand 5 stores created: `useDesignStore`, `useProjectStore`, `useSimulationStore`
- TypeScript type definitions: `ChipComponent`, `Connection`, `CanvasState`, `SimulationParams`, `MFlowProject`
- Tailwind CSS with custom MicroFlow dark-theme tokens (`mf-bg`, `mf-blue`, etc.)
- Status bar with component count, zoom level, dirty indicator

---

## Phase 2 — Canvas Editor & Component Library

- Konva.js canvas with three-layer architecture (grid, components, overlays)
- Drag-and-drop component placement from Sidebar
- All 10 microfluidic component types with type-specific Konva shapes (`ComponentShapes.tsx`)
- Default parameters per type (`getDefaultParams`)
- Port circles rendered on components; port-to-port connection drawing (`PortOverlay`)
- Multi-select, move, rotate, delete via keyboard and context menu
- Grid snapping (25 / 50 / 100 μm); zoom (mouse wheel); pan (middle-drag)
- Ruler overlay with real μm scale (`Ruler.tsx`)
- Undo/redo with 50-step history stack in `useDesignStore`
- Right-click context menu (duplicate, delete, properties)
- `PropertiesPanel` for editing selected component parameters

---

## Phase 3 — Lua Scripting

- Embedded Lua 5.4 interpreter via `mlua` 0.10 (Rust crate)
- Sandboxed environment: `os`, `io`, `debug`, `package`, `require` removed; custom `print` routed to output log
- `Chip` Lua API: `Chip.new`, 10 `chip:add_*` methods, `chip:connect`, `chip:clear`
- `ComponentRef` and `PortRef` UserData types for port-level connection control
- `Sweep.run({param, values, callback})` for parametric iteration
- `DesignAction` enum (`AddComponent`, `Connect`, `ClearDesign`, `UpdateCanvas`) serialised to Tauri events
- `ScriptContext` (`Arc<Mutex<Vec<DesignAction>>>`) pattern for thread-safe action collection
- `execute_script` IPC command; emits `script-action` and `script-completed` events
- `useScriptDispatcher` hook batches actions and dispatches to `useDesignStore`
- Monaco editor with Lua syntax highlighting in `ScriptEditor` panel
- Live output log; error display

---

## Phase 4A — Analytical Simulation

- `run_analytic_network` IPC command and `simulation/analytic.rs` solver
- Hydraulic diameter, Hagen-Poiseuille resistance, flow rate, Reynolds number formulas
- Dean number for curved channels; serpentine mixing efficiency (Stroock model)
- `extract_channel` mapping all 10 component types to effective rectangular channels
- DFS-based all-simple-paths network solver with series/parallel resistance combination
- Fallback for disconnected designs (per-component independent solve)
- Parabolic velocity profile generation (21 points per channel)
- `ResultsPanel` with 4 tabs: Özet (summary table), Hız Profili (velocity chart), Basınç (pressure bar chart), CFD (placeholder)
- `run_analytic_simulation` command wired to Toolbar button

---

## Phase 4B — 2D CFD Solver

- `run_cfd_simulation` IPC command and `simulation/cfd.rs` solver
- 2D incompressible Navier-Stokes, Chorin projection method
- Parabolic inlet profile; no-slip walls; outflow boundary
- Gauss-Seidel SOR Poisson solver (ω = 1.7, 80 sub-iterations per step)
- Three grid resolutions: Coarse (60×16), Medium (100×24), Fine (160×36)
- `CfdField` output: velocityX, velocityY, pressure, magnitude, wallShear, residuals, iterations, converged
- `simulation-progress` Tauri events every 5 iterations; `ProgressOverlay` toast
- `CfdOverlay` heatmap rendered as ImageData over Konva canvas
- 4 colormaps: jet, viridis, plasma, coolwarm (toggle buttons in Results panel CFD tab)
- CFD target component selection: selected `straight_channel` or first available

---

## Phase 5A — PNG & SVG Export

- `ExportDialog` with format selector (PNG / SVG / GDS-II), DPI (72–600), background (White / Dark / Transparent), scale bar toggle
- `ExportRenderer` — offscreen Konva `<Stage>` renders design → `toDataURL()` → base64
- `export_png_data` IPC command: base64 decode → `image` crate → alpha composite → save
- `composite_over_background` per-pixel alpha blending in Rust
- `svgExporter.ts` — generates complete SVG string from components + connections; optional μm scale bar
- `export_svg` IPC command writes SVG as UTF-8 bytes

---

## Phase 5B — GDS-II Export

- `export/gds.rs` — full GDS-II Stream Format binary writer
- GDS-II floating-point encoding (`pack_gds_real`, taban-16 excess-64 format)
- Record types: HEADER, BGNLIB, LIBNAME, UNITS, BGNSTR, STRNAME, BOUNDARY, LAYER, DATATYPE, XY, ENDEL, ENDSTR, ENDLIB
- db-unit = 0.001 μm (1 nm resolution); user-unit = 1 μm
- `gdsGeometry.ts` generates `GdsPolygon[]` for all 10 component types (265 lines)
- `export_gds_file` IPC command: receives polygons + params from frontend, calls `save_gds`
- Structure name sanitised from project name (uppercase, max 31 chars)

---

## Phase 6A — Experiment Data Import & Comparison

- `ExperimentImportDialog` — CSV/JSON import wizard with column mapping
- `csvParser.ts` parses delimiter-separated files into `ExperimentDataSet`
- `useExperimentStore` manages datasets (add, remove, replaceAll, nextColor)
- Experiment datasets overlaid on simulation result charts in `ResultsPanel`
- `experimentMetrics.ts` — R², RMSE, per-point error map computation
- Error map visualisation in the CFD results tab
- `experiment_data` field persisted in `.mflow` file format
- "Import Experiment" Toolbar button and `Ctrl+I` shortcut

---

## Phase 6B — Parametric Sweep

- `SweepDialog` UI — parameter selection, value range, step count
- `useSweepStore` — sweep configuration, progress, and results state
- `sweepRunner.ts` — batch execution loop; calls analytic solver per step; collects results
- Lua `Sweep.run({param, values, callback})` for scripted sweeps
- Results displayed in SweepDialog results table

---

## Polish Phase

- Clippy warnings resolved across all Rust modules (`#[allow(...)]` only where justified)
- Edge-case guards: empty component list, disconnected network, zero-resistance paths, NaN/Inf clamping in CFD field
- `is_multiple_of(2)` for GDS ASCII record padding (replaces `% 2 == 0`)
- Unused variable prefixes (`_comp_by_id`) to silence Rust warnings
- TypeScript: 0 errors (`tsc --noEmit`)
- Bundle size optimised: 3 JS chunks, 1 CSS, total ≈ 1.1 MB

---

## Phase 7 — UI/UX Refresh ("Laminar" design system)

- "Laminar" visual language: CSS custom-property design tokens using the `rgb(var(--x-rgb) / <alpha-value>)` channel pattern (enables Tailwind opacity modifiers)
- Self-hosted IBM Plex Sans/Mono via `@fontsource` (replaces the Google Fonts CDN — no web-font network calls)
- `theme/tokens.ts` + `theme/componentColors.ts` as the canonical JS-side colour source (Konva/SVG cannot read CSS variables)
- CAD-style canvas ergonomics: adaptive major/minor grid with fade-out, origin cross marker, zoom-stable strokes, cursor states
- Status-bar zoom preset popover; refined toolbar/panel chrome
- Start-from-template UI removed for now (`templates/starters.ts` kept for future use)

---

## Phase 8 — Code Organization Refactor (zero behaviour change)

Pure structural/readability pass, locked by a Vitest safety net so behaviour is provably unchanged.

- **Safety net**: Vitest + 66 characterization tests (pure utils + store reducers); `vitest.config.ts`
- **Split god files** (move-only): `App.tsx` 846 → 190 (handlers extracted to `hooks/useXxx`), `ResultsPanel.tsx` 1197 → 190 (per-tab modules + `shared.tsx`), `types/index.ts` 351 → per-domain files (re-export hub kept), `CanvasEditor` grid → `canvasGrid.tsx`
- **Feature folders**: `features/experiment/` and `features/export/` (vertical slices); explicit import paths, no barrels
- **In-code readability**: magic numbers → documented `const` (frontend zoom limits unified store↔CanvasEditor, grid thresholds; Rust `SOR_OMEGA` / `POISSON_SUB_ITERATIONS` / `DT_DIFF_CFL` / `ASPECT_RATIO_CORRECTION` / `DEFAULT_CHANNEL_*_UM`); `//!` module docs on command files; removed unused `thiserror`
- **Mechanization**: ESLint 9 flat config + Prettier + `eslint-config-prettier`; husky + lint-staged pre-commit gate (eslint + prettier + typecheck + test)
- **Navigation docs**: `CONVENTIONS.md`, `docs/CODE_MAP.md`, README navigation section
- Guardrails held at every step: tsc 0, vitest 66/66 unchanged, cargo test 36/36, clippy clean, build OK

---

## Phase 9 — Stabilization (intentional fixes)

- **Undo/redo off-by-one fixed** (BUGS.md #1): replaced the single history array + index with an undo/redo **two-stack** model. The first action is now undoable; each undo/redo moves exactly one step; redo restores the latest state. Preserves the 50-step cap (`MAX_HISTORY`) and "compound action = single entry" (multi-move / paste / script batch). Characterization tests intentionally updated to the correct spec + 6 new tests → **72** frontend tests.
- **Monaco offline**: the Lua editor now loads from the local `monaco-editor` bundle (`loader.config({ monaco })`) with the editor web worker bundled via Vite `?worker`; a `strip-monaco-cdn` Vite plugin removes the jsDelivr default URL from `dist/`. Lazy boundary preserved (Monaco stays in its own chunk; initial app chunk unchanged ≈ 191 kB). Zero CDN references in the build output.

---

## Phase 10 — Repository Structure & Hygiene

Professional repo-layout pass; behavior-neutral except one flagged fix.

- **Lint debt**: fixed all 22 `no-unused-vars` warnings (dead constants, unused destructures, vestigial `rawText` state, an entire unused icon import block); eslint warnings 45 → 23 (remaining `any`/hooks/refresh debt documented as future work)
- **Grouping**: loose root components → `components/overlays/` (EditorLoading, KeyboardHelp, Notifications, ProgressOverlay); scattered sweep slice → `features/sweep/` (SweepDialog + useSweepStore + sweepRunner + sweepHelpers + test), matching the experiment/export pattern
- **Google Fonts CDN removed** (flagged fix): index.html loaded Inter + JetBrains Mono from jsDelivr-adjacent Google hosts and the CSP allowed it — contradicting the zero-network guarantee. Links removed, CSP tightened, Monaco/Ruler fonts switched to the self-hosted IBM Plex Mono (consistent online/offline)
- **Template assets dropped**: vite.svg/tauri.svg/react.svg deleted; favicon is now the real app icon (`public/icon.png` from `src-tauri/icons`)
- **Broken examples removed**: three root-level `.mflow` files used the pre-1.0 legacy schema (`mflow_version: 1`) and could never load; the valid examples live in `examples/projects/`
- **Rust deps pruned**: unused `uuid`, `ndarray`, `rayon` removed from Cargo.toml
- **CI added**: GitHub Actions workflow (frontend: lint/typecheck/vitest/build; rust: clippy + cargo test with webkit deps and cache)
- **Docs trued up**: ARCHITECTURE paths (utils → features), TESTING counts (29 → 36 Rust, phantom `test_clear` removed, 72-test frontend section added), README (CI badge, real examples tree, FORMULAS row, screenshots placeholder), stale CODE_QUALITY_REPORT deleted
- **Root decluttered**: `.prettierrc.json` and `postcss.config.js` merged into package.json keys, `vitest.config.ts` merged into vite.config.ts `test` block; `BUGS.md` + `CONVENTIONS.md` moved under `docs/`; single-file `.vscode/` and placeholder-only `docs/images/` removed (root: 18 → 13 files)
