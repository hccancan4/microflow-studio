# MicroFlow Studio — Mathematical Formulas Reference

All formulas use SI units in derivations. Input/output conversions for the UI are noted separately.

---

## 1. Hagen-Poiseuille Flow in Rectangular Channels

### 1.1 Circular Channel (baseline)

For a circular pipe of radius R and length L:

```
Q = (π R⁴ ΔP) / (8 μ L)

or equivalently:

ΔP = (8 μ L Q) / (π R⁴)
```

**Reference:** Poiseuille, J. L. M. (1840). Recherches expérimentales sur le mouvement des liquides dans les tubes de très-petits diamètres. *Comptes Rendus de l'Académie des Sciences*, 11, 961–967.

### 1.2 Rectangular Channel — Full Fourier Series Solution

For a rectangular channel of width w, depth h (h ≤ w), and length L, with fully developed laminar flow:

```
u(y,z) = (16 w² ΔP) / (π³ μ L) × Σ_{n=1,3,5,...}^∞  
          [(-1)^((n-1)/2) / n³] × [1 - cosh(nπz/w)/cosh(nπh/2w)] × cos(nπy/w)
```

Volumetric flow rate (exact):

```
Q = (w h³ ΔP) / (12 μ L) × [1 - (192 h)/(π⁵ w) × Σ_{n=1,3,5,...}^∞  tanh(nπw/(2h)) / n⁵]

Define φ(h/w) = 1 - (192 h)/(π⁵ w) × Σ_{n=1,3,5,...}^∞  tanh(nπw/(2h)) / n⁵

Then:  Q = (w h³ ΔP φ) / (12 μ L)
```

**Hydraulic resistance:**

```
R_hyd = ΔP / Q = (12 μ L) / (w h³ φ(h/w))
```

**Correction factor φ for common aspect ratios (h/w):**

| h/w | φ |
|---|---|
| 1.0 (square) | 0.4217 |
| 0.5 | 0.5765 |
| 0.2 | 0.8159 |
| 0.1 | 0.9012 |
| 0.05 | 0.9493 |
| 0.01 | 0.9899 |
| 0 (thin slit) | 1.0000 |

For aspect ratio h/w < 0.1, the approximation φ ≈ 1 − 0.63(h/w) is accurate to within 1%.

**Reference:** Bruus, H. (2008). *Theoretical Microfluidics*. Oxford University Press. Eq. (3.28)–(3.33).

**Reference:** White, F. M. (2011). *Fluid Mechanics*, 7th ed. McGraw-Hill. Table 6.4.

### 1.3 Practical Approximation (Aspect Ratio Correction)

A widely used engineering approximation (valid for any aspect ratio):

```
R_hyd ≈ 12 μ L / [w h³ (1 - 0.630 h/w)]     for h ≤ w
```

Error < 2% for all h/w ≤ 1.

**Reference:** Mortensen, N. A., Okkels, F., & Bruus, H. (2005). Reexamination of Hagen-Poiseuille flow: Shape dependence of the hydraulic resistance in microchannels. *Physical Review E*, 71(5), 057301.

---

## 2. Hydraulic Diameter

For non-circular cross-sections, the hydraulic diameter D_h allows circular-pipe correlations to be applied:

```
D_h = 4 A_c / P_wet

For rectangle (width w, depth h):
  D_h = 4 w h / (2(w + h)) = 2 w h / (w + h)

For circle (radius R):
  D_h = 2 R    (= diameter)

For parallel plates (h << w):
  D_h → 2 h
```

**Reference:** White, F. M. (2011). *Fluid Mechanics*, 7th ed. McGraw-Hill. Eq. (6.65).

---

## 3. Reynolds Number

```
Re = ρ U D_h / μ

where:
  ρ       fluid density [kg/m³]
  U       mean flow velocity [m/s] = Q / A_c
  D_h     hydraulic diameter [m]
  μ       dynamic viscosity [Pa·s]
  Q       volumetric flow rate [m³/s]
  A_c     cross-sectional area [m²]
```

Regime classification for rectangular microchannels:
- Re < 1: Creeping (Stokes) flow, inertia negligible
- 1 < Re < 100: Laminar, inertia present but small
- Re ≈ 100–2300: Laminar with entrance effects
- Re > 2300: Transition to turbulence (rarely reached in microfluidics)

**Unit conversion for UI:**
```
Q [μL/min] → Q_SI [m³/s] = Q × 1.667 × 10⁻¹¹
```

**Reference:** Squires, T. M., & Quake, S. R. (2005). Microfluidics: Fluid physics at the nanoliter scale. *Reviews of Modern Physics*, 77(3), 977–1026.

---

## 4. Dean Number and Secondary Flow in Curved Channels

### 4.1 Dean Number

```
De = Re × √(D_h / (2 R_c))

where:
  R_c     radius of curvature of channel centerline [m]
  D_h     hydraulic diameter [m]
  Re      Reynolds number based on D_h and mean velocity
```

### 4.2 Critical Dean Number

Secondary (Dean) vortices appear when:

```
De > De_c ≈ 11.6
```

Above De_c, two counter-rotating vortices form in the cross-section perpendicular to the main flow direction. These enhance mixing dramatically.

**Reference:** Dean, W. R. (1927). Note on the motion of fluid in a curved pipe. *Philosophical Magazine*, 4(20), 208–223.

**Reference:** Dean, W. R. (1928). The stream-line motion of fluid in a curved pipe. *Philosophical Magazine*, 5(30), 673–695.

### 4.3 Pressure Drop Correction for Curved Channels

For curved channels with De > 1, the pressure drop is higher than the straight-channel prediction:

```
ΔP_curved / ΔP_straight = 1 + 0.033 (log₁₀ De)⁴     for De < 370

(Ito correlation, 1959)
```

**Reference:** Ito, H. (1959). Friction factors for turbulent flow in curved pipes. *Journal of Basic Engineering*, 81(2), 123–134.

---

## 5. Capillary Number and Droplet Generation

### 5.1 Capillary Number

```
Ca = μ_c U_c / γ

where:
  μ_c     continuous phase dynamic viscosity [Pa·s]
  U_c     continuous phase mean velocity [m/s]
  γ       interfacial tension [N/m]
```

### 5.2 Weber Number

```
We = ρ_c U_c² D_h / γ
```

### 5.3 Droplet Generation Regimes in T-Junctions

| Regime | Ca range | Droplet size | Notes |
|---|---|---|---|
| Squeezing | Ca < 0.01 | d ≥ w_main | Dominated by interfacial tension |
| Dripping | 0.01 < Ca < 0.3 | d < w_main | Droplet pinch-off at junction |
| Jetting | Ca > 0.3 | Polydisperse | Unstable jet, large droplets |

**Reference:** Garstecki, P., Fuerstman, M. J., Stone, H. A., & Whitesides, G. M. (2006). Formation of droplets and bubbles in a microfluidic T-junction — scaling and mechanism of break-up. *Lab on a Chip*, 6(3), 437–446.

### 5.4 Droplet Size Scaling Law (Squeezing Regime)

```
L_droplet / w_main ≈ 1 + α × (Q_d / Q_c)

where:
  L_droplet   droplet length [m]
  w_main      main channel width [m]
  Q_d         dispersed phase flow rate [m³/s]
  Q_c         continuous phase flow rate [m³/s]
  α ≈ 1       geometry-dependent constant (≈ 1 for T-junction)
```

**Reference:** Garstecki et al. (2006), cited above. Eq. (2).

### 5.5 Flow-Focusing Droplet Size (Dripping Regime)

```
d_droplet / w_orifice ≈ α (Q_d / Q_c)^β

where α ≈ 1.5, β ≈ 0.33 (empirical fits, geometry-dependent)
```

**Reference:** van Steijn, V., Kleijn, C. R., & Kreutzer, M. T. (2010). Predictive model for the size of bubbles and droplets created in microfluidic T-junctions. *Lab on a Chip*, 10(19), 2513–2518.

---

## 6. Mixing in Serpentine Channels

### 6.1 Péclet Number

```
Pe = U D_h / D_mol = U L_mix / D_mol

where:
  D_mol   molecular diffusivity of solute [m²/s]
  L_mix   mixing length scale [m]
```

Typical D_mol values:
- Small molecules (dye, glucose): 10⁻¹⁰ – 10⁻⁹ m²/s
- Proteins (BSA, IgG): 10⁻¹¹ – 10⁻¹⁰ m²/s
- DNA (10 kbp): ~10⁻¹² m²/s
- Nanoparticles (100 nm): ~5 × 10⁻¹² m²/s

### 6.2 Diffusive Mixing Length

For purely diffusive mixing in a straight channel (no advection):

```
L_mix,diff = Pe × D_h / 4
```

Below this length, mixing is >95% complete.

### 6.3 Taylor-Aris Dispersion (Combined Diffusion + Advection)

Effective axial diffusivity in a pressure-driven flow:

```
D_eff = D_mol × (1 + Pe² / 48)
```

At high Pe (Pe >> 7), dispersion dominates over diffusion.

**Reference:** Taylor, G. I. (1953). Dispersion of soluble matter in solvent flowing slowly through a tube. *Proceedings of the Royal Society A*, 219(1137), 186–203.

**Reference:** Aris, R. (1956). On the dispersion of a solute in a fluid flowing through a tube. *Proceedings of the Royal Society A*, 235(1200), 67–77.

### 6.4 Mixing Efficiency (Serpentine)

The mixing index (MI) ranges from 0 (fully unmixed) to 1 (fully mixed):

```
MI = 1 - σ(c) / σ_0

where:
  σ(c) = standard deviation of concentration field at cross-section
  σ_0  = standard deviation at inlet (completely unmixed)
```

For laminar chaotic advection in a serpentine mixer:

```
MI ≈ 1 - exp(-n / n_mix)

where:
  n       number of completed turns
  n_mix   characteristic mixing turns ≈ Pe / (π² × geometry_factor)
```

**Reference:** Stroock, A. D., et al. (2002). Chaotic mixer for microchannels. *Science*, 295(5555), 647–651.

---

## 7. Pressure Drop in Networks

### 7.1 Series Connection

```
R_total = R_1 + R_2 + ... + R_n
ΔP_total = Q × R_total
```

### 7.2 Parallel Connection

```
1/R_total = 1/R_1 + 1/R_2 + ... + 1/R_n
ΔP_total = Q_total / R_total  (same ΔP across all parallel branches)
```

### 7.3 Kirchhoff's Laws for Microfluidic Networks

Analogous to electrical circuits:
- **KVL (pressure):** Sum of pressure drops around any closed loop = 0
- **KCL (flow rate):** Sum of flow rates into any node = 0

**Reference:** Bruus, H. (2008). *Theoretical Microfluidics*. Oxford University Press. Chapter 4.

---

## 8. Entrance Length

The entrance length L_e is where the velocity profile transitions from flat (plug) to fully developed (parabolic):

```
L_e ≈ 0.06 Re D_h    (laminar, circular)
L_e ≈ 0.08 Re D_h    (laminar, rectangular approximation)
```

If L < L_e, the Hagen-Poiseuille resistance is underestimated. The analytical solver issues a warning when L/D_h < 0.08 Re.

**Reference:** Shah, R. K., & London, A. L. (1978). *Laminar Flow Forced Convection in Ducts*. Academic Press. Chapter 3.

---

## 9. Key Physical Constants and Typical Values

| Quantity | Symbol | Value | Notes |
|---|---|---|---|
| Water viscosity (25°C) | μ | 0.890 × 10⁻³ Pa·s | |
| Water density (25°C) | ρ | 997 kg/m³ | |
| Mineral oil viscosity | μ | 0.025 Pa·s | Light grade |
| Water-oil interfacial tension | γ | 0.035 N/m | Without surfactant |
| Water-oil + 0.5% SDS | γ | 0.005 N/m | With surfactant |
| PDMS Young's modulus | E | 1.7 MPa | 10:1 crosslinker |
| 1 μL/min in SI | Q | 1.667 × 10⁻¹¹ m³/s | |
| 1 μm in SI | | 10⁻⁶ m | |
| 1 μm² in SI | | 10⁻¹² m² | |

---

## 10. Inverse Design Core (v1.1 — `simulation/hydraulic.rs`)

**Display resistance unit.** Bench work uses mbar and µL/min; the solver uses SI:

```
R_disp [mbar/(µL·min⁻¹)] = R_SI [Pa·s/m³] × R_SI_TO_DISP,   R_SI_TO_DISP = 1/(6×10¹²) ≈ 1.667×10⁻¹³
```

**Inverse length.** Resistance is linear in length, so the inverse is structural (no root-finding):

```
l_for_r:  L = R / R(w, h, L=1 µm)
```

**Parallel-branch targeting** (single inlet, N outlets; optional shared feed channel):

```
P_branch = P_in − Q_tot·R_feed        (exact feed deduction)
R_i      = P_branch / Q_i,target  →  L_i = l_for_r(R_i)
```

**Rounding policy.** **L is rounded DOWN** (to 0.01 mm, floor-guarded at 0.01): the *design*
resistance lands slightly **below** target, and fabrication tolerance (narrower, rougher channels
⇒ higher R) carries it up *toward* the target. This is the actual µFG printability rule —
confirmed in the official companion code (`dxbiotech/Microfluidics-Resistance-ML`,
`generative_model.py`), whose Tabu Search fitness penalizes **over**-resistance 1.05× more
heavily than under-resistance. "Approach the target from below" refers to **resistance**, not
flow. (v1.1 initially rounded UP under a flow-side reading; corrected after studying the
source — see `docs/RELATED_WORK.md`.)

**Serpentine length model** (shared with the analytic solver and `mf.add_serpentine`):

```
L = turns · pitch · (2 + π/2)
```
`mf.add_serpentine{length_mm}` picks `(turns, pitch)` so this holds exactly (pitch ∈ 200–1200 µm).

**Fabrication envelope.** `W_FAB_MIN_UM = 40 µm`, cell length `10–180 mm`; branches outside flag
`fits_envelope=false` / `w_flag=true` (red/orange in the Doğrulama tab and Auto-Design preview).

**Fluid presets** (canonical in Rust `fluid_by_key`, mirrored in `FLUID_PRESETS`):

| key | µ (Pa·s) | ρ (kg/m³) | label |
|---|---|---|---|
| water (alias: su) | 1.00×10⁻³ | 1000 | Su (DI) |
| pbs | 1.02×10⁻³ | 1005 | PBS tamponu |
| plasma (alias: plazma) | 1.50×10⁻³ | 1025 | Kan plazması |
| etanol | 1.10×10⁻³ | 789 | Etanol |
| gliserol50 | 6.0×10⁻³ | 1126 | Gliserol %50 |
| pdms | 9.7×10⁻² | 970 | PDMS (silikon yağı) |
| oil | 3.0×10⁻² | 860 | Mineral yağ |

Note: water density is kept at 1000 (spec lists 998) — resistance is density-independent and the
Re difference is ~0.2%, well inside validation thresholds.

**Reference check** (water, 100×80 µm, 10 mbar): Q=2 µL/min → R_disp=5 → **L=63.5 mm**, Re≈0.37
(in envelope); Q=0.5 µL/min → L≈254 mm → **out of envelope** (>180 mm). Locked by Rust tests.

---

## References (Master List)

1. Bruus, H. (2008). *Theoretical Microfluidics*. Oxford University Press.
2. Squires, T. M., & Quake, S. R. (2005). Microfluidics: Fluid physics at the nanoliter scale. *Reviews of Modern Physics*, 77(3), 977–1026.
3. Whitesides, G. M. (2006). The origins and the future of microfluidics. *Nature*, 442(7101), 368–373.
4. Garstecki, P., et al. (2006). Formation of droplets and bubbles in a microfluidic T-junction. *Lab on a Chip*, 6(3), 437–446.
5. van Steijn, V., Kleijn, C. R., & Kreutzer, M. T. (2010). Predictive model for the size of bubbles and droplets created in microfluidic T-junctions. *Lab on a Chip*, 10(19), 2513–2518.
6. Stroock, A. D., et al. (2002). Chaotic mixer for microchannels. *Science*, 295(5555), 647–651.
7. Dean, W. R. (1927). Note on the motion of fluid in a curved pipe. *Philosophical Magazine*, 4(20), 208–223.
8. Taylor, G. I. (1953). Dispersion of soluble matter in solvent flowing slowly through a tube. *Proceedings of the Royal Society A*, 219(1137), 186–203.
9. Aris, R. (1956). On the dispersion of a solute in a fluid flowing through a tube. *Proceedings of the Royal Society A*, 235(1200), 67–77.
10. Mortensen, N. A., Okkels, F., & Bruus, H. (2005). Reexamination of Hagen-Poiseuille flow. *Physical Review E*, 71(5), 057301.
11. Patankar, S. V. (1980). *Numerical Heat Transfer and Fluid Flow*. Hemisphere Publishing.
12. Harlow, F. H., & Welch, J. E. (1965). Numerical calculation of time-dependent viscous incompressible flow. *Physics of Fluids*, 8(12), 2182–2189.
13. Shah, R. K., & London, A. L. (1978). *Laminar Flow Forced Convection in Ducts*. Academic Press.
14. Ito, H. (1959). Friction factors for turbulent flow in curved pipes. *Journal of Basic Engineering*, 81(2), 123–134.
15. Taşoğlu, S., et al. (2026). ML-automated microfluidic circuit design (µFluidicGenius). *Science Advances*, 12(5). doi:10.1126/sciadv.aea7598 — inverse-design recipe, printability policy and fabrication envelope adopted here (see `RELATED_WORK.md`); companion code: github.com/dxbiotech/Microfluidics-Resistance-ML.
