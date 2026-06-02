# MicroFlow Studio — Test Coverage

All tests are Rust unit tests (`#[test]`). Run with:

```bash
cargo test --manifest-path src-tauri/Cargo.toml
```

Total: **29 tests** across 6 files.

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

## `scripting/mod.rs` — 10 tests

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
| `test_clear` | `chip:clear()` emits `ClearDesign` action |

## `export/mod.rs` — 4 tests

| Test name | What it verifies |
|---|---|
| `test_strip_data_url_prefix` | Correctly strips `data:image/png;base64,` prefix; passes through raw base64 unchanged |
| `test_save_png_roundtrip_transparent` | Transparent background mode preserves alpha channel (α = 128 at test pixel) |
| `test_save_png_composite_white` | White background composite: semi-transparent red over white → opaque mixed pixel |
| `test_save_svg_writes_file` | SVG string written to disk contains `<svg` and `rect` |

## `export/gds.rs` — 5 tests

| Test name | What it verifies |
|---|---|
| `real_encode_zero` | `pack_gds_real(0.0)` returns 8 zero bytes |
| `real_encode_one` | `pack_gds_real(1.0)` — correct exponent byte (0x41) and mantissa MSB (0x10) |
| `real_encode_negative` | Sign bit set for negative values; exponent unchanged |
| `real_encode_roundtrip_approx` | Encode then decode 0.001 gives error < 10⁻¹⁵ |
| `write_gds_basic_structure` | Output starts with correct HEADER record; ends with ENDLIB; contains a BOUNDARY record |
| `save_gds_writes_file` | `save_gds()` creates a non-empty file with correct GDS-II header signature |
| `cursor_smoke` | Import smoke test for `std::io::Cursor` |

## `geometry/mod.rs` — 2 tests

| Test name | What it verifies |
|---|---|
| `test_bounding_box` | Bounding box of a point set matches expected min/max |
| `test_arc_points` | `arc_points(...)` returns the expected number of interpolation points |

## `project/mod.rs` — 1 test

| Test name | What it verifies |
|---|---|
| `test_project_roundtrip` | `save_project` then `load_project` returns equal `MFlowProject` (JSON serialisation roundtrip) |

---

## Untested Critical Areas

The following areas currently have no automated test coverage:

- **TypeScript / React components** — no Jest or Vitest tests exist; all frontend logic (store reducers, canvas interactions, export dialog) is tested manually
- **`gdsGeometry.ts`** — polygon generation for all 10 component types; visual correctness only
- **`svgExporter.ts`** — SVG output correctness; no snapshot tests
- **`experimentMetrics.ts`** — R², RMSE calculations; no unit tests
- **`sweepRunner.ts`** — batch sweep execution; no unit tests
- **Tauri command wiring** — `lib.rs` command registration not covered by integration tests
- **CFD convergence at production grid sizes** — tests use small grids (20×12, 30×20) for speed; full 160×36 not covered
- **Network solver with complex topologies** — only simple series and 2-branch parallel tested; multi-inlet or loop topologies not covered
