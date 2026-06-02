# MicroFlow Studio — Simulation Engine

## Overview

The simulation engine has two levels:

1. **Analytical solver** — instant network analysis using Hagen-Poiseuille resistance theory. Suitable for design exploration and rough flow-rate estimates.
2. **CFD solver** — 2D incompressible Navier-Stokes solved with the Chorin projection method. Provides velocity and pressure fields for a single straight-channel cross-section.

Both solvers are implemented in Rust (`src-tauri/src/simulation/`) and called via Tauri IPC commands.

---

## 1. Analytical Solver (`analytic.rs`)

### 1.1 Fluid Properties

```rust
pub struct FluidProperties {
    pub viscosity: f64,  // Pa·s
    pub density: f64,    // kg/m³
}
```

Built-in presets: `FluidProperties::water()` (μ = 1.002×10⁻³ Pa·s, ρ = 998 kg/m³).

### 1.2 Hydraulic Diameter

For a rectangular cross-section (width *w*, depth *h*, both in μm converted to m):

```
Dh = 2·w·h / (w + h)
```

Reference: Shah & London, *Laminar Flow Forced Convection in Ducts*, 1978.

### 1.3 Channel Resistance

Rectangular channel resistance (Poiseuille, first-order correction for aspect ratio):

```
R = 12·μ·L / (w·h³ · (1 − 0.63·h/w))
```

where L, w, h are in metres. Units: Pa·s/m³.

Reference: Bruus, *Theoretical Microfluidics*, 2008, eq. 2.26.

### 1.4 Flow Rate from Pressure

```
Q [m³/s] = ΔP / R
Q [μL/min] = Q [m³/s] × 10⁹ × 60
```

### 1.5 Reynolds Number

```
Re = ρ·v·Dh / μ = ρ·(Q/A)·Dh / μ
```

Microfluidic channels operate at Re < 100 (typically Re < 1).

### 1.6 Dean Number (curved channels)

```
De = Re · sqrt(Dh / (2·R_curve))
```

Reference: Dean, *Proc. Roy. Soc. London A*, 121 (1928) 402–420.

### 1.7 Mixing Efficiency (serpentine mixer)

Based on Péclet number and exponential decay model:

```
Pe = v·w / D_mol
η = 1 − exp(−n·π² / Pe)
```

where *n* = number of turns, *D_mol* = molecular diffusion coefficient (m²/s, default 10⁻⁹).

Reference: Stroock et al., *Science* 295 (2002) 647–651.

### 1.8 Effective Channel Extraction (`extract_channel`)

Each component type is mapped to an `EffectiveChannel { width, depth, length, kind }`:

| Component | Length calculation |
|---|---|
| `straight_channel` | `length` param |
| `curved_channel` | arc length = `radius × angle × π/180` |
| `t_junction` | 2 × `main_width` |
| `y_junction` | 2 × `main_width` |
| `serpentine_mixer` | `turns × pitch × 2` |
| `port` | `diameter / 4` (stub) |
| `droplet_generator` | `orifice_width × 4` |
| `filter_array` | `rows × spacing` |
| `expansion` | `length` param |
| `reservoir` | `sqrt(width × height) / 2` |

### 1.9 Network Solver (`analyze_design`)

The solver operates in 7 steps:

**Step 1** — Build per-component resistance and base `AnalyticResult` entries.

**Step 2** — Build an undirected adjacency graph from the `connections` list.

**Step 3** — Identify inlet and outlet ports (components of type `port` with `portType == "inlet"` / `"outlet"`).

**Step 4** — Find all simple inlet→outlet paths via depth-limited DFS (`max_depth = 32`).

**Step 5 (fallback)** — If no paths found (disconnected design), treat each channel independently under `inlet_pressure_pa`.

**Step 6** — Compute path-level resistances (sum of component resistances along each path) and debits:

```
R_parallel = 1 / Σ(1/R_path_i)
Q_total = ΔP / R_parallel
Q_path_i = ΔP / R_path_i   (parallel branch)
```

**Step 7** — Accumulate per-component flow rate and pressure drop; compute Dean number and mixing efficiency for curved/serpentine components; generate 21-point parabolic velocity profiles:

```
v(y) = v_max · (1 − (2y/w)²),   v_max = 1.5 · v_mean
```

### 1.10 IPC Command

```typescript
invoke('run_analytic_network', {
  req: {
    components,
    connections,
    inlet_pressure: 1000,      // Pa
    fluid_viscosity: 1.002e-3, // Pa·s
    fluid_density: 998,        // kg/m³
  }
})
```

Returns `AnalyticDesignResult` (see `types/index.ts`).

---

## 2. CFD Solver (`cfd.rs`)

### 2.1 Governing Equations

2D incompressible Navier-Stokes:

```
∂u/∂t + (u·∇)u = −(1/ρ)∇p + ν·∇²u
∇·u = 0
```

At microfluidic Reynolds numbers (Re ≪ 1) the convective term is negligible — the solver effectively solves the Stokes equations.

### 2.2 Chorin Projection Method

Each time step consists of three stages:

**Stage 1 — Momentum predictor (u\*)**

Advance velocity without pressure gradient using explicit Euler + central differences:

```
u*_ij = u_ij + dt · (ν·∇²u − (u·∇)u)_ij
```

Viscous term uses a 5-point Laplacian stencil. After computing u*, boundary conditions are re-applied.

**Stage 2 — Pressure correction (φ)**

Solve the Poisson equation for the pressure correction φ:

```
∇²φ = (ρ/dt)·∇·u*
```

Solved with **Gauss-Seidel SOR**:
- Relaxation factor ω = 1.7
- 80 sub-iterations per main iteration
- Boundary conditions: `∂φ/∂n = 0` on all walls; `φ = 0` on outlet

**Stage 3 — Velocity correction**

```
p    ← p + φ
u_ij ← u*_ij − (dt/ρ)·∂φ/∂x
v_ij ← v*_ij − (dt/ρ)·∂φ/∂y
```

### 2.3 Boundary Conditions

| Boundary | u | v | p / φ |
|---|---|---|---|
| Left (inlet) | parabolic profile | 0 | ∂p/∂x = 0 |
| Right (outlet) | ∂u/∂x = 0 (copy) | 0 | p = 0 (Dirichlet) |
| Top/Bottom (walls) | 0 (no-slip) | 0 | ∂p/∂y = 0 |

**Inlet parabolic profile:**

```
u(y) = 6 · u_avg · ξ · (1 − ξ),   ξ = j / (ny − 1)
```

where `u_avg` is computed from the analytical Hagen-Poiseuille result before the CFD run is launched.

### 2.4 Solver Parameters

| Parameter | Coarse | Medium | Fine |
|---|---|---|---|
| Grid nx (x-cells) | 60 | 100 | 160 |
| Grid ny (y-cells) | 16 | 24 | 36 |
| Max iterations | 400 | 800 | 1 400 |
| SOR ω | 1.7 | 1.7 | 1.7 |
| SOR sub-iters | 80 | 80 | 80 |
| Convergence tolerance | 10⁻⁵ | 10⁻⁵ | 10⁻⁵ |

### 2.5 Convergence Criterion

The maximum velocity divergence is evaluated every 5 iterations:

```
residual = max_{i,j} |∂u/∂x + ∂v/∂y|_ij
```

Convergence is declared when `residual < tolerance`. Progress is reported via Tauri `simulation-progress` events (percentage + message string).

### 2.6 Output Fields

`CfdField` struct / TypeScript interface:

| Field | Description | Units |
|---|---|---|
| `velocity_x` | u component (flattened, row-major) | m/s |
| `velocity_y` | v component | m/s |
| `pressure` | pressure | Pa |
| `magnitude` | `sqrt(u² + v²)` | m/s |
| `wall_shear` | `μ·|∂u/∂y|` at top/bottom cells | Pa |
| `residuals` | divergence history (every 5 iters) | 1/s |
| `iterations` | total iterations completed | — |
| `converged` | whether tolerance was met | bool |

### 2.7 IPC Command

```typescript
invoke('run_cfd_simulation', {
  req: {
    channel_width_um: 5000,
    channel_height_um: 200,
    inlet_velocity: 0.005,    // m/s (from analytic pre-solve)
    nx: 100, ny: 24,
    max_iterations: 800,
    fluid_viscosity: 1.002e-3,
    fluid_density: 998,
  }
})
```

The frontend selects the channel to analyse: first the selected `straight_channel`, falling back to the first `straight_channel` in the design.

### 2.8 Analytical Reference (`solve_poiseuille`)

A fast analytical Poiseuille field is also available as a fallback / comparison reference. It fills `velocity_x` with the exact parabolic profile and sets pressure to a linear gradient.

---

## Data Flow

```
User clicks "Analytic Run"
  → App.tsx: handleRunAnalytic()
  → invoke('run_analytic_network', { components, connections, ... })
  → commands/simulation_commands.rs: run_analytic_network()
  → simulation/analytic.rs: analyze_design()
  → returns AnalyticDesignResult
  → useSimulationStore.setResult()
  → ResultsPanel renders charts

User clicks "CFD Run"
  → App.tsx: handleRunCfd()
  → Computes u_avg from Hagen-Poiseuille
  → invoke('run_cfd_simulation', { ... })
  → Tauri emits simulation-progress events during iteration
  → commands/simulation_commands.rs: run_cfd_simulation()
  → simulation/cfd.rs: solve_stokes_2d()
  → returns CfdField
  → useSimulationStore.setResult()
  → CfdOverlay renders heatmap on canvas
```
