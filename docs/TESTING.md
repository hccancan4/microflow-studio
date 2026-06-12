# MicroFlow Studio — Test Coverage

Two suites:

```bash
# Rust unit tests (57)
cargo test --manifest-path src-tauri/Cargo.toml --lib

# Frontend Vitest tests (104)
npm test
```

## Rust — **57 tests** across 9 files

v1.1 additions (detayları kaynak dosyalarda):
- `simulation/hydraulic.rs` — 7 tests: l_for_r roundtrip (1e-12), spec references (63.5 mm in-envelope / 254 mm flagged), mass conservation through feed network, w_flag, feed-overload error, fluid aliases
- `scripting/mf.rs` — 9 tests: mf.* emission counts, serpentine length exactness, junction fan-out port selection, error paths, **the 4 Lua templates executed in the real interpreter** (include_str! single-source)
- `commands/llm_commands.rs` — 6 tests: key resolution priority, request body shape, response/error parsing (no network)
- `simulation/analytic.rs` — +1: two-outlet `outlet_flows` sums to total

---

## `simulation/analytic.rs` — 9 tests

| Test name | What it verifies |
|---|---|
| `test_hydraulic_diameter` | `hydraulic_diameter(200, 50)` matches formula `2wh/(w+h)` |
| `test_channel_resistance_positive` | Resistance is > 0 for a 200×50×10000 μm water channel |
| `test_flow_rate_from_pressure` | Flow rate is > 0 given 1000 Pa across the same channel |
| `test_reynolds_laminar` | Re < 10 for 1 μL/min in a 200×50 μm channel (confirms laminar regime) |
| `test_network_single_channel` | End-to-end: inlet→channel→outlet, positive flow, Re < 100, velocity profile generated |
| `test_network_parallel_channels` | Two identical parallel channels yield equal flow rates; total > single branch |
| `test_network_curved_dean` | Dean number is `Some(...)` for a curved channel in the network |
| `test_network_serpentine_mixing` | Mixing efficiency is `Some(...)` and in range [0, 1] for a serpentine mixer |
| `test_network_unconnected_fallback` | Disconnected design (no ports) uses per-component fallback; total flow > 0 |

## `simulation/cfd.rs` — 4 tests

| Test name | What it verifies |
|---|---|
| `test_poiseuille_symmetry` | Analytical Poiseuille field: centre velocity > wall velocity |
| `test_field_size` | `CfdField.velocity_x.len() == nx * ny` |
| `test_stokes_profile_shape` | Chorin solver produces parabolic shape (centre > near-wall), zero at wall, residual history recorded |
| `test_stokes_residual_decreases` | Solver reduces max-divergence residual by ≥ 70% over 500 iterations |

## `scripting/mod.rs` — 9 tests

| Test name | What it verifies |
|---|---|
| `test_empty_script` | Empty string runs without error |
| `test_print_output` | `print("hello")` captured in `ScriptResult.output` |
| `test_syntax_error` | Malformed Lua returns `ScriptResult.success == false` |
| `test_sandbox_blocks_os` | `os.execute` raises error (sandbox removes `os`) |
| `test_add_channel` | `chip:add_channel({})` emits one `AddComponent` action |
| `test_multiple_components` | Multiple `add_*` calls produce multiple actions |
| `test_parametric_loop` | Lua `for` loop adding 5 channels emits 5 actions |
| `test_connect` | `chip:connect(a, b)` emits one `Connect` action |
| `test_sweep_run` | `Sweep.run({values={1,2,3}, callback=...})` executes 3 times |

## `export/mod.rs` — 4 tests

| Test name | What it verifies |
|---|---|
| `test_strip_data_url_prefix` | Correctly strips `data:image/png;base64,` prefix; passes through raw base64 unchanged |
| `test_save_png_roundtrip_transparent` | Transparent background mode preserves alpha channel (α = 128 at test pixel) |
| `test_save_png_composite_white` | White background composite: semi-transparent red over white → opaque mixed pixel |
| `test_save_svg_writes_file` | SVG string written to disk contains `<svg` and `rect` |

## `export/gds.rs` — 7 tests

| Test name | What it verifies |
|---|---|
| `real_encode_zero` | `pack_gds_real(0.0)` returns 8 zero bytes |
| `real_encode_one` | `pack_gds_real(1.0)` — correct exponent byte (0x41) and mantissa MSB (0x10) |
| `real_encode_negative` | Sign bit set for negative values; exponent unchanged |
| `real_encode_roundtrip_approx` | Encode then decode 0.001 gives error < 10⁻¹⁵ |
| `write_gds_basic_structure` | Output starts with correct HEADER record; ends with ENDLIB; contains a BOUNDARY record |
| `save_gds_writes_file` | `save_gds()` creates a non-empty file with correct GDS-II header signature |
| `cursor_smoke` | Import smoke test for `std::io::Cursor` |

## `project/mod.rs` — 1 test

| Test name | What it verifies |
|---|---|
| `test_project_roundtrip` | `save_project` then `load_project` returns equal `MFlowProject` (JSON serialisation roundtrip) |

---

## Frontend — **104 Vitest tests** across 14 files

v1.1 additions: `useScriptDispatcher.test.ts` (7 — partition: meta actions
produce no history/dirty, run queue, targets), `utils/fab.test.ts` (6),
`features/validation/validation.test.ts` (5), `templates/luaTemplates.test.ts`
(2), `features/assistant/luaExtract.test.ts` (3) + `providers.test.ts`
(5 — Turkish intent parsing), `features/autodesign/autoDesignLua.test.ts` (4).

### v1.0 çekirdeği — 72 test, 8 dosya

Discovered by `vitest.config.ts` glob `src/**/*.{test,spec}.ts` (node env);
tests are co-located next to their source files.

| Test file | Tests | What it covers |
|---|---|---|
| `features/experiment/csvParser.test.ts` | 16 | Delimiter auto-detect, quoting/escape, JSON row/column forms |
| `features/experiment/experimentMetrics.test.ts` | 8 | Linear interpolation, R²/RMSE/MAPE |
| `features/sweep/sweepHelpers.test.ts` | 9 | `buildSweepValues`, sweepable-param catalog, param override |
| `stores/useDesignStore.test.ts` | 15 | add/connect invariants, move, rotate, **undo/redo two-stack spec** (single-step, N-step, redo-clear, boundaries, 50-cap, compound = one entry) |
| `utils/colormaps.test.ts` | 6 | Deterministic colormap/LUT output |
| `utils/componentBbox.test.ts` | 7 | Rotation-aware AABBs incl. serpentine |
| `utils/portUtils.test.ts` | 6 | Port positions (serpentine!), smart routing |
| `utils/componentDefaults.test.ts` | 5 | Default parameter sets |

Most are **characterization tests** (lock current behavior); the undo/redo
suite is a **correctness spec** (intentionally updated when the off-by-one
bug was fixed — see BUGS.md #1).

## Untested Critical Areas

- **React component rendering / canvas interactions** — Konva interaction logic (drag, rubber-band, pan/zoom) is manual-smoke only
- **`gdsGeometry.ts` / `svgExporter.ts` output** — polygon/SVG generation has no snapshot tests; visual correctness only
- **Tauri command wiring** — `lib.rs` command registration not covered by integration tests
- **CFD convergence at production grid sizes** — tests use small grids for speed; full 160×36 not covered
- **Network solver with complex topologies** — only simple series and 2-branch parallel tested; multi-inlet or loop topologies not covered
