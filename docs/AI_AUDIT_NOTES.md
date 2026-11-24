# AI Audit Notes — CE 402 Geotechnical Engineering Platform

**Audit Date:** 2025-01-19
**Auditor:** External Engineering Review
**Wave:** 1 (Models, Soil Profile, SPT, Direct Shear)

---

## Summary of 5 Critical Bugs Found & Fixed

| # | Module | Bug Description | Fix Applied |
|---|--------|----------------|-------------|
| 1 | `js/spt.js` | **Wrong overburden correction formula** — Used legacy `1.7/(0.7+σ'v0_kgcm²)` from IS 6403 instead of IS 2131:1981 Clause 3.6.1 & Fig. 1 (Peck-Hanson-Thornburn) in SI units: `CN = 0.77·log₁₀(2000/σ'v0_kPa)` clamped to [0.40, 2.0]. Dilatancy clause reference was also wrong (Clause 5.3 → 3.6.2). | Replaced formula, updated source comments to IS 2131:1981 Clause 3.6.1 & Fig. 1 (overburden) and Clause 3.6.2 (dilatancy). Added `isCohesionless` flag to skip corrections for clay. |
| 2 | `js/spt.js` | **Wrong default water table for SPT corrections** — `correctSPT_N_Batch` defaulted to `'design'` WT, but SPT N-value corrections per IS 2131 use the **boring/measured** water table. | Changed default `wtSource` from `'design'` to `'measured'` in `correctSPT_N_Batch`. |
| 3 | `js/spt.js` | **SE (standard error) not guarded against FP noise** — `SE = Math.sqrt(MSE)` could receive tiny negative MSE (e.g., -1e-15) from perfect/near-perfect fits, producing `NaN`. | Changed to `SE = Math.sqrt(Math.max(0, MSE))`. |
| 4 | `js/soilProfile.js` | **`computeTotalVerticalStress` used full layer bounds for WT split** — When depth fell inside a layer straddling the WT, it incorrectly integrated the full layer thickness instead of only down to `depth_m`, breaking `σv0 - u = σ'v0` identity. | Rewrote to use identical segment-based logic as `computeEffectiveVerticalStress`: `segmentBottom = Math.min(layerBottom, depth_m)`. Added regression tests verifying identity at depths inside straddling layers (above & below WT). |
| 5 | `js/models.js` | **Over-strict validation** — (a) Required `gammaSat > gammaMoist`, but permanently submerged layers can have `gammaSat = gammaMoist`. (b) Enforced `L_m === B_m` for `strip` footings, but strip footings have independent length. | (a) Changed to `gammaSat >= gammaMoist`. (b) Restrict `L_m === B_m` check to `square` and `circular` only. |

---

## Verification

All 5 bugs have corresponding regression tests in `tests/test_p1_p2.test.js`:

- Bug 1: Tests for new CN formula, clamping, `isCohesionless=false` path
- Bug 2: Test verifying `correctSPT_N_Batch` default uses measured WT
- Bug 3: Tests for `SE` finiteness with perfect/near-perfect fits
- Bug 4: Tests verifying `σv0 - u = σ'v0` inside straddling layer (above & below WT)
- Bug 5: Tests for `gammaSat === gammaMoist` acceptance and strip footing `L_m !== B_m` acceptance

Run `npm test` → **71 tests pass, 0 fail**.

---

## Impact Assessment

| Bug | Severity | Affected Calculations |
|-----|----------|----------------------|
| 1 | **Critical** | All SPT N-value corrections (bearing capacity, settlement, liquefaction) |
| 2 | **High** | SPT corrections in batch mode (wrong WT → wrong σ'v0 → wrong CN) |
| 3 | **Medium** | Direct shear OLS diagnostics (SE = NaN breaks plotting/confidence intervals) |
| 4 | **High** | Total stress calculations at any depth inside a WT-straddling layer |
| 5 | **Medium** | Input validation rejecting valid submerged layers and strip footings |

---

## Source References Corrected

| Feature | Old Reference | Correct Reference |
|---------|---------------|-------------------|
| Overburden CN | IS 2131:1981 Clause 5.2 / IS 6403:1981 | **IS 2131:1981 Clause 3.6.1 & Fig. 1** |
| Dilatancy | IS 2131:1981 Clause 5.3 | **IS 2131:1981 Clause 3.6.2** |
| Effective Stress | Terzaghi (general) | Terzaghi's principle (unchanged) |

---

## Files Modified

- `js/spt.js` — Complete rewrite of CN formula, dilatancy references, `isCohesionless` flag, batch default WT, SE guard
- `js/soilProfile.js` — `computeTotalVerticalStress` segment-based rewrite
- `js/models.js` — Validation relaxations for `gammaSat` and strip footing `L_m`
- `tests/test_p1_p2.test.js` — 15+ new regression tests + updated existing tests for new formulas
- `docs/AI_AUDIT_NOTES.md` — This document

---

# Wave 2 External Engineering Audit (2025-11-19)

## Summary of 3 Critical Bugs Found & Fixed

| # | Module | Bug Description | Fix Applied |
|---|--------|----------------|-------------|
| 1 | `js/bearingCapacity.js` | **Wrong IS 6403:1981 factors** — Shape factors used Vesic/Meyerhof formulas (sc=1+(B/L)(Nq/Nc), sq=1+(B/L)tanφ, sγ=1-0.4(B/L)) instead of **exact IS 6403:1981 Clause 5.1.2.1 Table 1** values (strip: 1/1/1; square: 1.3/1.2/0.8; circular: 1.3/1.2/0.6; rectangular: 1+0.2B/L, 1+0.2B/L, 1-0.4B/L). Depth factors used wrong formula (dq=1+2tanφ(1-sinφ)²Df/B) instead of **IS 6403 Clause 5.1.2.1** (N_φ=tan²(45+φ/2), dc=1+0.2(Df/B)√N_φ, dq=dγ=1 for φ<10° else 1+0.1(Df/B)√N_φ). Inclination factors used Meyerhof (ic=iq-(1-iq)/(Nc tanφ)) instead of **IS 6403 Clause 5.1.2.1** (α=atan(H/V), ic=iq=(1-α/90)², iγ=(1-α/φ)² for φ>0). Gross safe `qs` incorrectly computed as `qu/FoS` instead of `qns + q`. Negative moments increased effective dimensions. | Replaced all factors with exact IS 6403:1981 Clause 5.1.2.1 expressions. Fixed `qs = qns + q`. Used `Math.abs()` for moments. Circular `A' = π/4 × B'²`. |
| 2 | `js/settlement.js` | **Consolidation used constant σ'v0/Δσ per layer** — Each ≤0.5m sublayer must compute its OWN σ'v0 and Δσ at its mid-depth using profile and Boussinesq callback. **Schmertmann C1/C2 not clamped** — C1 can go negative (clamp to ≥0.5), C2 can go below 1.0 (clamp to ≥1.0). | Added optional `profile`, `wtSource`, `deltaSigmaFn` to `computeConsolidationSettlement`. Each sublayer calls `computeEffectiveVerticalStress(profile, z_mid)` and `deltaSigmaFn(z_mid)`. Updated `computeTotalConsolidationSettlement` to pass footing and q_net for Boussinesq callback. Added `Math.max(0.5, ...)` for C1 and `Math.max(1.0, ...)` for C2. |
| 3 | `js/stress.js` | **Missing `boussinesq_corner` method** — `generateStressProfile` and `computeStressAtDepths` lacked support for corner stress method. | Added `'boussinesq_corner'` as supported method in both functions. |

## Verification

All 3 bugs have corresponding regression tests in `tests/test_p3_p4_p5.test.js`:

- Bug 1: Tests for exact IS 6403 Table 1 shape factors, depth factors with N_φ, inclination factors with α, gross safe `qs = qns + q`, absolute moments, circular `A'`
- Bug 2: Tests for consolidation with profile/deltaSigmaFn callbacks, Schmertmann C1≥0.5 and C2≥1.0 clamping
- Bug 3: Tests for `generateStressProfile` and `computeStressAtDepths` with `method='boussinesq_corner'`

Run `npm test` → **165 tests pass, 0 fail**.

## Impact Assessment

| Bug | Severity | Affected Calculations |
|-----|----------|----------------------|
| 1 | **Critical** | All bearing capacity results (qnu, qns, qu, qs) for all 4 footing shapes |
| 2 | **High** | Consolidation settlement accuracy (wrong σ'v0/Δσ per sublayer); Schmertmann settlement (unbounded C1/C2) |
| 3 | **Medium** | Stress profile plotting for corner method |

## Source References Corrected

| Feature | Old Reference | Correct Reference |
|---------|---------------|-------------------|
| Shape Factors | Vesic/Meyerhof (sc=1+(B/L)(Nq/Nc)...) | **IS 6403:1981 Clause 5.1.2.1 Table 1** |
| Depth Factors | Meyerhof (dq=1+2tanφ(1-sinφ)²Df/B) | **IS 6403:1981 Clause 5.1.2.1** (N_φ=tan²(45+φ/2)...) |
| Inclination Factors | Meyerhof (ic=iq-(1-iq)/(Nc tanφ)) | **IS 6403:1981 Clause 5.1.2.1** (α=atan(H/V), ic=iq=(1-α/90)²...) |
| Gross Safe qs | qu/FoS | **IS 6403:1981** (qs = qns + q) |
| Consolidation σ'v0/Δσ | Constant per layer | **Terzaghi & Peck (1967)** — compute at each sublayer mid-depth |
| Schmertmann C1/C2 | Unbounded | **Schmertmann et al. (1978)** — C1≥0.5, C2≥1.0 |

## Files Modified

- `js/bearingCapacity.js` — Complete rewrite of shape/depth/inclination factors per IS 6403 Table 1, fixed qs, absolute moments, circular A'
- `js/settlement.js` — Consolidation with per-sublayer callbacks, Schmertmann C1/C2 clamping
- `js/stress.js` — Added `boussinesq_corner` method support
- `tests/test_p3_p4_p5.test.js` — New regression tests for all fixes
- `docs/AI_AUDIT_NOTES.md` — This document