# MicroFlow Studio — Lua Scripting API Reference

## Overview

MicroFlow Studio embeds a Lua 5.4 interpreter (via the [`mlua`](https://crates.io/crates/mlua) Rust crate, v0.10) that allows fully programmatic chip design. Scripts run in a sandboxed environment: the `os`, `io`, `debug`, `package`, and `require` globals are removed. A custom `print` function routes output to the Script Editor's output log.

Scripts are executed via the `execute_script` Tauri IPC command. The backend collects `DesignAction` events (AddComponent, Connect, ClearDesign + the v1.1 meta actions SetFluid/SetInletPressure/SetTargetFlow/RunSimulation) and dispatches them to the frontend stores via `useScriptDispatcher`. Design actions land as a **single undo entry**; meta actions go to the settings/queue stores and never touch undo history or the dirty flag.

Two API surfaces coexist:
- **`mf.*`** (v1.1) — the intent-level surface the AI copilot, Auto-Design and templates emit. Prefer this for new scripts.
- **`Chip`** — the original low-level builder; fully preserved.

---

## `mf.*` — copilot/template action surface (v1.1)

Units: coordinates & widths in **µm**, pressure in **Pa**, lengths in **mm**.
Every `mf.add_*` returns a **ComponentRef** usable in `mf.connect` / `mf.set_target_flow`.

| Function | Description |
|---|---|
| `mf.clear()` | Clear the design (also resets validation targets) |
| `mf.set_fluid(key)` | `"su"\|"pbs"\|"plazma"\|"etanol"\|"gliserol50"\|"pdms"\|"oil"` (Turkish aliases resolve to canonical keys; invalid key → script error) |
| `mf.set_inlet_pressure(pa)` | Set the simulation inlet pressure |
| `mf.add_inlet(x, y, {pressure=, name=, diameter=})` | Inlet port; `pressure` also sets the simulation inlet pressure |
| `mf.add_outlet(x, y, {name=, diameter=})` | Outlet port; `name` becomes the validation-table label |
| `mf.add_channel(x1,y1, x2,y2, {w=200, h=50, label=})` | Straight channel between two points |
| `mf.add_serpentine(x, y, {w, h, length_mm, pitch?})` | **Target-length** serpentine: `(turns, pitch)` are chosen so `turns·pitch·(2+π/2)` equals `length_mm` exactly — matching the analytic solver's length model, so resistance equals the inverse-design value. `length_mm` is required (min ≈ 0.72 mm); pitch is clamped to 200–1200 µm |
| `mf.add_tjunction(x, y, rot?, {main_width=, branch_width=, h=})` | T-junction (ports: 0 in, 1 & 2 out) |
| `mf.add_yjunction(x, y, rot?, {...})` | Y-junction |
| `mf.connect(a, b, {from=, to=}?)` | Smart default ports: source → port comp 0, junctions → first **unused** output (1 then 2), others → 1; target → 0. Override with `from`/`to` or pass `a:port(i)` |
| `mf.set_target_flow(outlet, q_ul_min)` | Declare a target flow for the Doğrulama (validation) tab |
| `mf.run_quick()` | Queue a quick (analytic) run after the script applies |
| `mf.run_cfd("kaba"\|"orta"\|"ince")` | Queue a CFD run at the given resolution |

There is **no `mf.add_cross`** (no cross component type exists) — compose two `mf.add_tjunction` calls instead.

```lua
-- 10 mbar, su, hedefli tek dal
mf.clear(); mf.set_fluid("su"); mf.set_inlet_pressure(1000)
local i = mf.add_inlet(0, 300, {pressure = 1000})
local s = mf.add_serpentine(800, 300, {w = 100, h = 80, length_mm = 63.5})
local o = mf.add_outlet(3400, 300, {name = "ÇIKIŞ 1"})
mf.connect(i, s); mf.connect(s, o)
mf.set_target_flow(o, 2.0)
mf.run_quick()
```

---

## `Chip` — chip builder object

### `Chip.new(name, opts?)`

Creates a new chip builder. Calling this does **not** immediately clear the canvas; use `chip:clear()` first if you want a clean slate.

| Parameter | Type | Default | Description |
|---|---|---|---|
| `name` | string | required | Human-readable chip name |
| `opts.width` | number | 5000 | Default channel width (μm); used as fallback when component params omit width |
| `opts.depth` | number | 50 | Default channel depth (μm) |

```lua
local chip = Chip.new("My Chip", { width = 200, depth = 30 })
```

### `chip:clear()`

Removes all components and connections from the current design (emits `ClearDesign` action).

---

## Component methods

All `chip:add_*` methods return a **ComponentRef** — a handle you can pass to `chip:connect`. Each method also accepts an optional `label` string.

### `chip:add_channel(params)`

Straight rectangular channel.

| Parameter | Type | Default | Unit |
|---|---|---|---|
| `width` | number | 200 | μm |
| `length` | number | 5000 | μm |
| `depth` | number | 50 | μm |
| `label` | string | `nil` | — |

```lua
local ch = chip:add_channel({ width = 200, length = 8000, depth = 50, label = "Main" })
```

### `chip:add_curved(params)`

Curved (arc) channel.

| Parameter | Type | Default | Unit |
|---|---|---|---|
| `radius` | number | 2000 | μm |
| `angle` | number | 180 | degrees |
| `width` | number | 200 | μm |
| `depth` | number | 50 | μm |
| `label` | string | `nil` | — |

### `chip:add_t_junction(params)`

T-shaped junction (one inlet, two outlets).

| Parameter | Type | Default | Unit |
|---|---|---|---|
| `main_width` | number | 300 | μm |
| `branch_width` | number | 200 | μm |
| `angle` | number | 90 | degrees |
| `depth` | number | 50 | μm |
| `label` | string | `nil` | — |

### `chip:add_y_junction(params)`

Y-shaped junction (one inlet, two outlets at a symmetric angle).

| Parameter | Type | Default | Unit |
|---|---|---|---|
| `main_width` | number | 300 | μm |
| `branch_width` | number | 200 | μm |
| `branch_angle` | number | 45 | degrees |
| `depth` | number | 50 | μm |
| `label` | string | `nil` | — |

### `chip:add_serpentine(params)`

Serpentine mixer.

| Parameter | Type | Default | Unit |
|---|---|---|---|
| `channel_width` | number | 200 | μm |
| `turns` | number | 5 | — |
| `pitch` | number | 600 | μm |
| `depth` | number | 50 | μm |
| `label` | string | `nil` | — |

### `chip:add_port(params)`

Inlet or outlet port (connection to external tubing).

| Parameter | Type | Default | Unit |
|---|---|---|---|
| `diameter` | number | 500 | μm |
| `port_type` | string | `"inlet"` | `"inlet"` or `"outlet"` |
| `label` | string | `nil` | — |

### `chip:add_droplet_gen(params)`

Flow-focusing droplet generator.

| Parameter | Type | Default | Unit |
|---|---|---|---|
| `orifice_width` | number | 50 | μm |
| `main_channel_width` | number | 200 | μm |
| `dispersed_channel_width` | number | 100 | μm |
| `depth` | number | 50 | μm |
| `label` | string | `nil` | — |

### `chip:add_filter(params)`

Pillar-array filter.

| Parameter | Type | Default | Unit |
|---|---|---|---|
| `pillar_diameter` | number | 20 | μm |
| `spacing` | number | 30 | μm |
| `rows` | number | 5 | — |
| `columns` | number | 10 | — |
| `depth` | number | 50 | μm |
| `label` | string | `nil` | — |

### `chip:add_expansion(params)`

Channel width expansion or contraction.

| Parameter | Type | Default | Unit |
|---|---|---|---|
| `inlet_width` | number | 200 | μm |
| `outlet_width` | number | 500 | μm |
| `length` | number | 1000 | μm |
| `depth` | number | 50 | μm |
| `label` | string | `nil` | — |

### `chip:add_reservoir(params)`

Large fluid reservoir.

| Parameter | Type | Default | Unit |
|---|---|---|---|
| `width` | number | 1000 | μm |
| `height` | number | 1000 | μm |
| `depth` | number | 200 | μm |
| `label` | string | `nil` | — |

---

## `chip:connect(from, to)`

Connects two component ports. Accepts any combination of:

- **ComponentRef** (returned by `chip:add_*`) — connects to `.output` (port 1) of `from` and `.input` (port 0) of `to`
- **PortRef** — accessed as `ref.input`, `ref.output`, or `ref:port(n)` for specific port index `n`
- **Table** — `{ component_id = "...", port_index = 0 }`

```lua
-- Simplest: ComponentRef to ComponentRef
chip:connect(inlet_port, channel)
chip:connect(channel, outlet_port)

-- Specific port indices
chip:connect(junction.output, branch_a.input)
chip:connect(junction:port(2), branch_b.input)
```

---

## `Sweep.run(config)`

Runs a parametric sweep, executing a callback for each value.

| Field | Type | Description |
|---|---|---|
| `param` | string | Parameter name (for display/logging) |
| `values` | table | Array of values to iterate over |
| `callback` | function | Called with `(value, index)` for each step |

```lua
Sweep.run({
  param = "channel_width",
  values = { 100, 150, 200, 250, 300 },
  callback = function(w, i)
    local c = Chip.new("sweep_" .. i)
    c:clear()
    local inlet = c:add_port({ port_type = "inlet" })
    local ch    = c:add_channel({ width = w, length = 5000, depth = 50 })
    local outlet = c:add_port({ port_type = "outlet" })
    c:connect(inlet, ch)
    c:connect(ch, outlet)
    print("Step " .. i .. ": width=" .. w .. " μm")
  end
})
```

---

## Example Scripts

### 1. Basic T-junction

```lua
-- Basic T-junction with one inlet and two outlets
local chip = Chip.new("T-Junction Demo")
chip:clear()

local inlet  = chip:add_port({ port_type = "inlet",  label = "Inlet" })
local main   = chip:add_channel({ width = 300, length = 3000, depth = 50, label = "Main" })
local tjunc  = chip:add_t_junction({ main_width = 300, branch_width = 200, depth = 50 })
local out_a  = chip:add_port({ port_type = "outlet", label = "Out A" })
local out_b  = chip:add_port({ port_type = "outlet", label = "Out B" })

chip:connect(inlet, main)
chip:connect(main, tjunc)
chip:connect(tjunc.output, out_a)
chip:connect(tjunc:port(2), out_b)

print("T-junction design created.")
```

### 2. Parametric channel width sweep

```lua
-- Sweep channel width, print design for each step
local widths = { 50, 100, 150, 200, 250, 300 }

Sweep.run({
  param = "channel_width_um",
  values = widths,
  callback = function(w, idx)
    local c = Chip.new("ch_w" .. w)
    c:clear()
    local i  = c:add_port({ port_type = "inlet" })
    local ch = c:add_channel({ width = w, length = 10000, depth = 50 })
    local o  = c:add_port({ port_type = "outlet" })
    c:connect(i, ch)
    c:connect(ch, o)
    print(string.format("Step %d: width=%d um", idx, w))
  end
})
```

### 3. Serpentine gradient generator

```lua
-- Two inlets merge into a serpentine mixer → two outlet branches
local chip = Chip.new("Gradient Generator")
chip:clear()

local in_a   = chip:add_port({ port_type = "inlet",  label = "Sample A" })
local in_b   = chip:add_port({ port_type = "inlet",  label = "Sample B" })
local yjunc  = chip:add_y_junction({ main_width = 300, branch_width = 200, branch_angle = 30 })
local mixer  = chip:add_serpentine({ channel_width = 200, turns = 8, pitch = 600, depth = 50 })
local out    = chip:add_port({ port_type = "outlet", label = "Mixed Output" })

chip:connect(in_a, yjunc)
chip:connect(in_b, yjunc:port(2))
chip:connect(yjunc, mixer)
chip:connect(mixer, out)

print("Gradient generator ready.")
```
