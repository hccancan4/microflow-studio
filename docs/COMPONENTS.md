# MicroFlow Studio — Component Reference

All dimensions are in **μm (micrometres)**. Component types, parameters, and defaults are derived from `src/types/index.ts`, `src/components/Canvas/CanvasEditor.tsx` (`getDefaultParams`), and `src-tauri/src/simulation/analytic.rs` (`extract_channel`).

---

## 1. Straight Channel (`straight_channel`)

Rectangular cross-section, constant width, straight axis.

### Parameters

| Parameter | Default | Min | Max | Unit | Description |
|---|---|---|---|---|---|
| `width` | 200 | 10 | 5000 | μm | Channel width (cross-section) |
| `length` | 5000 | 100 | 50000 | μm | Channel length (flow direction) |
| `depth` | 50 | 5 | 500 | μm | Channel depth (etch depth) |

### Ports

| Index | Type | Position |
|---|---|---|
| 0 | input | left end |
| 1 | output | right end |

### Resistance Formula

```
R = 12·μ·L / (w·h³ · (1 − 0.63·h/w))
```

Ref: Bruus, *Theoretical Microfluidics*, eq. 2.26.

### GDS-II Geometry

Axis-aligned rectangle: `[(x, y−w/2), (x+L, y−w/2), (x+L, y+w/2), (x, y+w/2)]`.

---

## 2. Curved Channel (`curved_channel`)

Rectangular cross-section, arc-shaped axis.

### Parameters

| Parameter | Default | Min | Max | Unit | Description |
|---|---|---|---|---|---|
| `radius` | 2000 | 200 | 20000 | μm | Centreline bend radius |
| `angle` | 180 | 10 | 360 | deg | Arc sweep angle |
| `width` | 200 | 10 | 2000 | μm | Channel width |
| `depth` | 50 | 5 | 500 | μm | Channel depth |

### Ports

| Index | Type | Position |
|---|---|---|
| 0 | input | arc start |
| 1 | output | arc end |

### Effective Length (for resistance)

```
L_eff = radius · angle · π/180
```

### Additional Metric: Dean Number

```
De = Re · sqrt(Dh / (2·radius))
```

Ref: Dean, *Proc. Roy. Soc. London A*, 121 (1928) 402–420.

---

## 3. T-Junction (`t_junction`)

Three-port junction: one inlet, two outlets at a configurable angle.

### Parameters

| Parameter | Default | Unit | Description |
|---|---|---|---|
| `mainWidth` | 300 | μm | Width of main (through) channel |
| `branchWidth` | 200 | μm | Width of branch channel |
| `angle` | 90 | deg | Branch angle from main axis |
| `depth` | 50 | μm | Channel depth |

### Ports

| Index | Type | Description |
|---|---|---|
| 0 | input | Main inlet |
| 1 | output | Main outlet (straight) |
| 2 | output | Branch outlet |

### Effective Channel

Width = `main_width`, Length ≈ `2 × main_width`.

---

## 4. Y-Junction (`y_junction`)

Three-port junction: one inlet, two symmetric diverging outlets.

### Parameters

| Parameter | Default | Unit | Description |
|---|---|---|---|
| `mainWidth` | 300 | μm | Width of main channel |
| `branchWidth` | 200 | μm | Width of each branch |
| `branchAngle` | 45 | deg | Half-angle of branch divergence |
| `depth` | 50 | μm | Channel depth |

### Ports

| Index | Type | Description |
|---|---|---|
| 0 | input | Main inlet |
| 1 | output | Branch A |
| 2 | output | Branch B |

---

## 5. Serpentine Mixer (`serpentine_mixer`)

Multi-turn serpentine for passive mixing.

### Parameters

| Parameter | Default | Unit | Description |
|---|---|---|---|
| `channelWidth` | 200 | μm | Channel width |
| `turns` | 5 | — | Number of U-turns |
| `pitch` | 600 | μm | Centre-to-centre pitch of turns |
| `depth` | 50 | μm | Channel depth |

### Ports

| Index | Type |
|---|---|
| 0 | input |
| 1 | output |

### Effective Length

```
L_eff = turns × pitch × 2
```

### Mixing Efficiency

```
η = 1 − exp(−n·π² / Pe),   Pe = v·w / D_mol
```

Ref: Stroock et al., *Science* 295 (2002) 647–651.

---

## 6. Port (`port`)

External fluid connection (inlet or outlet).

### Parameters

| Parameter | Default | Unit | Description |
|---|---|---|---|
| `diameter` | 500 | μm | Port opening diameter |
| `portType` | `"inlet"` | — | `"inlet"` or `"outlet"` |

### Ports

| Index | Type |
|---|---|
| 0 | input (for outlet port) or output (for inlet port) |

### Role in Network Solver

Inlet ports are sources (apply `inlet_pressure_pa`). Outlet ports are sinks (pressure reference = 0). DFS path-finding starts from inlets and ends at outlets.

---

## 7. Droplet Generator (`droplet_generator`)

Flow-focusing geometry for droplet production.

### Parameters

| Parameter | Default | Unit | Description |
|---|---|---|---|
| `orificeWidth` | 50 | μm | Orifice (pinch-off) width |
| `mainChannelWidth` | 200 | μm | Continuous-phase channel width |
| `dispersedChannelWidth` | 100 | μm | Dispersed-phase channel width |
| `depth` | 50 | μm | Channel depth |

### Ports

| Index | Type | Description |
|---|---|---|
| 0 | input | Continuous phase inlet |
| 1 | input | Dispersed phase inlet |
| 2 | output | Droplet outlet |

### Effective Channel

Orifice width used as effective width; length ≈ `4 × orifice_width`.

---

## 8. Filter Array (`filter_array`)

Regular pillar array for particle/cell filtration.

### Parameters

| Parameter | Default | Unit | Description |
|---|---|---|---|
| `pillarDiameter` | 20 | μm | Cylindrical pillar diameter |
| `spacing` | 30 | μm | Gap between pillars |
| `rows` | 5 | — | Number of pillar rows |
| `columns` | 10 | — | Number of pillars per row |
| `depth` | 50 | μm | Channel depth |

### Ports

| Index | Type |
|---|---|
| 0 | input |
| 1 | output |

### Effective Channel

Width = `columns × (pillar_diameter + spacing)`, Length = `rows × spacing`.

---

## 9. Expansion / Contraction (`expansion`)

Linear width transition (diffuser or nozzle).

### Parameters

| Parameter | Default | Unit | Description |
|---|---|---|---|
| `inletWidth` | 200 | μm | Width at inlet |
| `outletWidth` | 500 | μm | Width at outlet |
| `length` | 1000 | μm | Length of transition |
| `depth` | 50 | μm | Channel depth |

### Ports

| Index | Type |
|---|---|
| 0 | input |
| 1 | output |

### GDS-II Geometry

Trapezoid: `[(0, −w_in/2), (L, −w_out/2), (L, w_out/2), (0, w_in/2)]`.

---

## 10. Reservoir (`reservoir`)

Large fluid storage or waste chamber.

### Parameters

| Parameter | Default | Unit | Description |
|---|---|---|---|
| `width` | 1000 | μm | Chamber width |
| `height` | 1000 | μm | Chamber height |
| `depth` | 200 | μm | Chamber depth |

### Ports

| Index | Type |
|---|---|
| 0 | input/output (single universal port) |

### Effective Length

```
L_eff = sqrt(width × height) / 2
```

---

## Sidebar Categories

Components are organised in `Sidebar.tsx` as:

| Category | Components |
|---|---|
| Kanallar (Channels) | straight_channel, curved_channel, serpentine_mixer, expansion |
| Bağlantılar (Junctions) | t_junction, y_junction, droplet_generator |
| Filtreler (Filters) | filter_array |
| Portlar & Rezervuarlar | port (inlet), port (outlet), reservoir |
