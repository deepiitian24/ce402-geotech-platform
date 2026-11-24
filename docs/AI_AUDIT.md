# AI Audit Report — CE 402 Geotechnical Engineering Platform

**Audit date**: 2026-11-19  
**Scope**: `js/spt.js`, `js/soilProfile.js`, `js/bearingCapacity.js`, `js/settlement.js`  
**Baseline**: 173 unit tests passing before and after the fixes (`npm test`, 2026-11-19)

## Summary

Five engineering errors introduced by AI-generated code were caught during development and corrected. Each error below lists the **AI Output**, how it was detected (**How We Detected It** — IS clause cross-check or hand calculation), and the **Correction** applied. All fixes are covered by regression tests; all 173 tests pass on 2026-11-19.

| # | Module | Error | Severity |
|---|--------|-------|----------|
| 1 | `js/spt.js` | Legacy CN formula under fabricated "IS 2131 Clause 5.2"; correction applied to clays; ≈ +21% N′ at BH-1 1.5 m | Critical |
| 2 | `js/spt.js` | `correctSPT_N_Batch` defaulted to design WT instead of measured (boring) WT | High |
| 3 | `js/soilProfile.js` | `computeTotalVerticalStress` integrated past target depth in WT-straddling layers, breaking σv0 − u = σ′v0 | High |
| 4 | `js/bearingCapacity.js` | Vesic (1973) factors cited as IS 6403 (+31% sq at φ′ = 30°, square footing); gross safe computed as (qnu + q)/FoS | Critical |
| 5 | `js/settlement.js` | ≤ 0.5 m clay sublayers reused one constant mid-layer σ′v0 and Δσz for every sublayer | Medium |

---

### Error 1 — `js/spt.js`: Wrong overburden correction CN (fabricated "IS 2131 Clause 5.2")

**AI Output** — `computeOverburdenCorrectionCN` used `CN = 1.7 / (0.7 + σ'v0_kgcm2)`, a legacy IS 6403-style relation, cited as "IS 2131 Clause 5.2". The overburden correction was also applied to cohesive (clay) soils. At BH-1, 1.5 m (σ′v0 ≈ 30 kPa ≈ 0.31 kg/cm²): legacy CN ≈ 1.69 vs IS 2131 CN ≈ 1.40 → N′ ≈ +21% too high.

**How We Detected It (IS clause / hand calculation)** — IS 2131:1981 has no Clause 5.2 CN formula. Clause 3.6.1 & Fig. 1 give `CN = 0.77 · log10(2000 / σ′v0_kPa)`, clamped to [0.40, 2.0]; Clause 3.6.2 covers dilatancy only for fine sand/silt below the water table with N′ > 15. Hand check at σ′v0 = 30 kPa: CN = 0.77 · log10(2000/30) = 0.77 · 1.824 ≈ 1.40, confirmed against the regression tests.

**Correction** — Replaced with IS 2131:1981 Clause 3.6.1 & Fig. 1 (`CN = 0.77·log10(2000/σ′v0_kPa)`, clamped [0.40, 2.0]) applied to cohesionless soils only via an `isCohesionless` flag; clay skips CN entirely; dilatancy per Clause 3.6.2 unchanged.

---

### Error 2 — `js/spt.js`: Wrong water-table default in batch SPT correction

**AI Output** — `correctSPT_N_Batch(tests, profile, wtSource = 'design')` defaulted to the design water table, so σ′v0 and CN used the design WT instead of the measured (boring) WT that IS 2131 ties to the actual test conditions.

**How We Detected It (IS clause / hand calculation)** — IS 2131 SPT corrections reference in-situ boring conditions; the measured WT is the correct source. Hand check at 3 m depth (measured WT 1 m, design WT 3 m): σ′v0 differs by γw · (3 − 1) ≈ 19.6 kPa, moving CN from ≈ 1.40 (at 30 kPa) to ≈ 1.27 (at 50 kPa) — roughly −9% on N′, enough to change bearing-capacity inputs.

**Correction** — Default changed to `wtSource = 'measured'` (boring water table); `'design'` remains available for explicit calls.

---

### Error 3 — `js/soilProfile.js`: Total stress integrated past the target depth

**AI Output** — `computeTotalVerticalStress` integrated each layer to `layer.bottomDepth_m` instead of `Math.min(layer.bottomDepth_m, depth_m)`. When the requested depth fell inside a layer straddling the water table, soil below the target depth was still added, breaking the identity σv0 − u = σ′v0.

**How We Detected It (IS clause / hand calculation)** — Terzaghi's effective-stress principle (σ′v0 = σv0 − u, basis of IS 2131 effective stress) must hold at every depth. Hand calculation of σv0 by segment-based integration down to `depth_m` matched `computeEffectiveVerticalStress`; the buggy full-layer version failed at depths inside WT-straddling layers, both above and below the WT. Regression tests now assert the identity at such depths.

**Correction** — Rewrote with segment-based integration: `segmentBottom = Math.min(layer.bottomDepth_m, depth_m)`, moist/sat split per segment, verified `σv0 − u = σ′v0` at all depths.

---

### Error 4 — `js/bearingCapacity.js`: Vesic factors cited as IS 6403; wrong gross-safe formula

**AI Output** — Vesic (1973) shape/depth/inclination factors were used while citing IS 6403:1981 Clause 5.1.2. For a square footing at φ′ = 30°, Vesic sq = 1 + tan φ′ ≈ 1.58 vs IS 6403 Table 1 sq = 1.2 → +31% on the q-term. Gross safe bearing capacity was computed as `(qnu + q) / FoS` instead of `qnu / FoS + q`, overestimating q_s whenever overburden q > 0.

**How We Detected It (IS clause / hand calculation)** — Factor-by-factor comparison with IS 6403:1981 Clause 5.1.2.1 Table 1: at φ′ = 30°, IS Nφ = tan²(60°) = 3.0, dc = 1 + 0.2(Df/B)√Nφ, sq = 1.2 for square, and Vesic's sq ≠ 1.2. Hand calc: q_s(IS) = qns + q vs buggy (qnu + q)/FoS diverge as soon as q ≠ 0.

**Correction** — Exact IS 6403:1981 Clause 5.1.2.1 factors: Nφ = tan²(45° + φ′/2), dc = 1 + 0.2(Df/B)√Nφ, dq = dγ = 1 (φ′ < 10°) else 1 + 0.1(Df/B)√Nφ; Table 1 shape factors; ic = iq = (1 − α/90)², iγ = (1 − α/φ′)²; gross safe `qs = qns + q` with `qns = qnu / FoS`.

---

### Error 5 — `js/settlement.js`: Constant mid-layer values reused for every sublayer

**AI Output** — Clay was subdivided into ≤ 0.5 m sublayers, but every sublayer reused the parent layer's single mid-layer σ′v0 and Δσz, so the settlement sum ignored within-layer stress variation.

**How We Detected It (IS clause / hand calculation)** — 1D consolidation settlement sums per sublayer: S_c = Σ [C / (1 + e0) · Δz_i · log10((σ′v0_i + Δσz_i) / σ′v0_i)]. Hand calculation over a 4 m clay layer under a footing shows Boussinesq Δσz at z_mid − Df varies 20–40% top to bottom; one mid-layer value misweights the integral versus sublayer-wise integration practice.

**Correction** — Each sublayer now computes its own `σ′v0(z_mid)` via `computeEffectiveVerticalStress` and its own `Δσz(z_mid − Df)` via the Boussinesq callback; Schmertmann C1/C2 clamps retained; S_c verified to converge as sublayer thickness approaches 0.5 m.

---

## Sign-off

| Role | Date |
|------|------|
| Lead developer | 2026-11-19 |
| Reviewer | 2026-11-19 |

*Report dated 2026-11-19. All five errors fixed; 173/173 tests pass.*
