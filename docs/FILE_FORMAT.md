# MicroFlow Studio — File Format Specification

## `.mflow` — Project File

`.mflow` files are UTF-8 encoded JSON documents. They capture the complete chip design, metadata, script, and experiment data needed to reproduce and share a microfluidic design.

### Top-level Schema

```json
{
  "version": "1.0",
  "metadata": { ... },
  "canvas": { ... },
  "components": [ ... ],
  "connections": [ ... ],
  "simulation_results": null,
  "experiment_data": [ ... ],
  "script": ""
}
```

| Field | Type | Description |
|---|---|---|
| `version` | `string` | Format version (currently `"1.0"`) |
| `metadata` | `ProjectMetadata` | Author, timestamps, tags |
| `canvas` | `CanvasState` | Viewport and grid settings |
| `components` | `ChipComponent[]` | All placed components |
| `connections` | `Connection[]` | All port-to-port connections |
| `simulation_results` | `SimulationResult \| null` | Last simulation result (not currently persisted — always `null` on save) |
| `experiment_data` | `ExperimentDataSet[]` | Imported experimental datasets |
| `script` | `string` | Lua script content |

---

### `ProjectMetadata`

```json
{
  "name": "My Chip",
  "author": "A. Researcher",
  "created": "2025-01-15T10:00:00.000Z",
  "modified": "2025-06-01T14:30:00.000Z",
  "description": "T-junction for droplet generation",
  "tags": ["droplet", "t-junction"]
}
```

| Field | Type | Description |
|---|---|---|
| `name` | `string` | Project name (used as default export filename) |
| `author` | `string` | Author name |
| `created` | `string` | ISO 8601 timestamp |
| `modified` | `string` | ISO 8601 timestamp (updated on every save) |
| `description` | `string` | Free-text description |
| `tags` | `string[]` | Searchable tags |

---

### `CanvasState`

```json
{
  "width": 20000,
  "height": 15000,
  "unit": "um",
  "gridSize": 50,
  "showGrid": true,
  "showRuler": true,
  "zoom": 1.0,
  "panX": 0,
  "panY": 0
}
```

| Field | Type | Valid values | Description |
|---|---|---|---|
| `width` | `number` | — | Canvas width (μm) |
| `height` | `number` | — | Canvas height (μm) |
| `unit` | `"um"` | `"um"` | Unit system (always μm) |
| `gridSize` | `25 \| 50 \| 100` | 25, 50, 100 | Snap grid pitch (μm) |
| `showGrid` | `boolean` | — | Grid visibility |
| `showRuler` | `boolean` | — | Ruler visibility |
| `zoom` | `number` | > 0 | Viewport zoom factor |
| `panX` | `number` | — | Viewport X offset (px) |
| `panY` | `number` | — | Viewport Y offset (px) |

---

### `ChipComponent`

```json
{
  "id": "comp_1720000000000_1",
  "type": "straight_channel",
  "position": { "x": 1000, "y": 2000 },
  "rotation": 0,
  "params": { "width": 200, "length": 5000, "depth": 50 },
  "ports": [
    {
      "id": "port_comp_1720000000000_1_0",
      "componentId": "comp_1720000000000_1",
      "portIndex": 0,
      "position": { "x": 0, "y": 0 },
      "type": "input",
      "diameter": 50,
      "connected": false
    }
  ],
  "label": "Main Channel"
}
```

| Field | Type | Description |
|---|---|---|
| `id` | `string` | Unique ID (`comp_{timestamp}_{counter}`) |
| `type` | `ComponentType` | One of the 10 component type strings |
| `position` | `{ x, y }` | Canvas position in μm |
| `rotation` | `number` | Rotation angle in degrees |
| `params` | `ComponentParams` | Type-specific parameter object (see below) |
| `ports` | `Port[]` | Port descriptors (auto-generated) |
| `label` | `string?` | Optional display label |

#### Parameter Objects by Type

**`straight_channel`:** `{ width, length, depth }` (μm)

**`curved_channel`:** `{ radius, angle, width, depth }` (μm, degrees)

**`t_junction`:** `{ mainWidth, branchWidth, angle, depth }` (μm, degrees)

**`y_junction`:** `{ mainWidth, branchWidth, branchAngle, depth }` (μm, degrees)

**`serpentine_mixer`:** `{ channelWidth, turns, pitch, depth }` (μm, count, μm, μm)

**`port`:** `{ diameter, portType }` (μm, `"inlet"` | `"outlet"`)

**`droplet_generator`:** `{ orificeWidth, mainChannelWidth, dispersedChannelWidth, depth }` (μm)

**`filter_array`:** `{ pillarDiameter, spacing, rows, columns, depth }` (μm, count)

**`expansion`:** `{ inletWidth, outletWidth, length, depth }` (μm)

**`reservoir`:** `{ width, height, depth }` (μm)

---

### `Connection`

```json
{
  "id": "conn_1720000000001_1",
  "fromComponentId": "comp_1720000000000_1",
  "fromPortIndex": 1,
  "toComponentId": "comp_1720000000000_2",
  "toPortIndex": 0
}
```

| Field | Type | Description |
|---|---|---|
| `id` | `string` | Unique connection ID |
| `fromComponentId` | `string` | Source component ID |
| `fromPortIndex` | `number` | Source port index (0 = input, 1 = output, 2+ = extra) |
| `toComponentId` | `string` | Target component ID |
| `toPortIndex` | `number` | Target port index |

---

### `ExperimentDataSet`

```json
{
  "id": "exp_1720000000000",
  "name": "Velocity profile — 200μm",
  "filename": "velocity_profile.csv",
  "xColumn": "position_um",
  "yColumn": "velocity_um_s",
  "valueColumn": "velocity_um_s",
  "dataType": "velocity",
  "points": [
    { "x": 0, "y": 0, "value": 0, "uncertainty": 5 }
  ],
  "color": "#60a5fa"
}
```

| Field | Type | Description |
|---|---|---|
| `id` | `string` | Unique dataset ID |
| `name` | `string` | Display name |
| `filename` | `string` | Original import filename |
| `xColumn` | `string` | CSV column used as X axis |
| `yColumn` | `string` | CSV column used as Y axis |
| `valueColumn` | `string` | CSV column used as primary value |
| `dataType` | `'velocity' \| 'pressure' \| 'concentration'` | Dataset category |
| `points` | `ExperimentDataPoint[]` | Parsed data points |
| `color` | `string` | Hex colour for chart overlay |

---

## GDS-II Export

GDS-II files are written by `src-tauri/src/export/gds.rs` using the GDS-II Stream Format (Cadence GDS-II Stream Format Manual, Rev. 6.0, 1987).

**Structure:** single library → single structure (`MICROFLOW_CHIP`) → one `BOUNDARY` polygon per chip component channel region.

**Layer strategy:**

| Layer | Contents |
|---|---|
| 1 | All microfluidic channel polygons (generated by `buildGdsPolygons` in `gdsGeometry.ts`) |

**Units:**
- Database unit: 0.001 μm (1 nm resolution)
- User unit: 1 μm
- All coordinates are stored as `i32` db-units (max addressable dimension: ~2.1 m)

**Structure name:** derived from project name (uppercase, alphanumeric+underscore, max 31 chars).

---

## PNG Export

1. Frontend renders design onto an offscreen Konva `<Stage>` via `ExportRenderer`.
2. `Stage.toDataURL({ pixelRatio: dpi/96, mimeType: 'image/png' })` returns a base64 data URL.
3. Backend (`export/mod.rs: save_png_from_base64`) decodes base64, loads with `image` crate, composites over chosen background (White / Dark `#0d1117` / Transparent), and saves.

**Supported DPI:** 72 – 600.

---

## SVG Export

`svgExporter.ts` generates an SVG string from `components` + `connections` directly (no canvas rendering). The SVG uses absolute μm coordinates with an optional μm scale bar. Backend writes it as UTF-8 bytes.
