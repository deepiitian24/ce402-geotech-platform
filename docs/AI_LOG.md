# AI Interaction Log — CE 402 Geotechnical Engineering Platform

**Project**: Group 6, CE 402 Geotechnical Engineering, IIT Mandi  
**Historical sessions**: 2026-11-19
**Tools used**: Pi Coding Agent / NVIDIA Nemotron, Gemini, Claude

Historical entries were labelled “verbatim summary” by their authors. Verify against original transcripts before certifying exact wording.

## Convention

- **Accepted**: output used essentially as-is.
- **Changed**: output adapted before merging.
- **Rejected**: output not used; reason given.

## Session log

### Wave 1 — P1–P2 engine (models, soil profile, SPT, direct shear)

| Date | Session | Tool | Purpose | Historical prompt record (exact wording unverified) | Accepted / Changed / Rejected + Reason |
|------|---------|------|---------|-------------------------------|----------------------------------------|
| 2026-11-19 | Wave 1 (P1–P2 engine) | Pi Coding Agent / NVIDIA Nemotron | Scaffold `models.js` (SoilLayer/SoilProfile/Footing validators), `soilProfile.js` (Terzaghi effective stress), `spt.js` (IS 2131 SPT corrections + direct shear OLS), and `tests/test_p1_p2.test.js` | "Build a pure ES-module geotechnical engine in strict SI units: SoilLayer/SoilProfile validators, effective stress σ′v0 = σv0 − u, IS 2131 CN = 0.77·log10(2000/σ′v0) and dilatancy N″ = 15 + 0.5(N′ − 15), OLS fit τ = c′ + σn·tan(φ′) with R² and SE" | Changed — merged after SI-unit audit; CN source clause and dilatancy applicability later corrected (AI Audit Errors 1–2) |

### Wave 1 — Audit & fixes

| Date | Session | Tool | Purpose | Historical prompt record (exact wording unverified) | Accepted / Changed / Rejected + Reason |
|------|---------|------|---------|-------------------------------|----------------------------------------|
| 2026-11-19 | Wave 1 audit & fixes | Claude | Audit P1–P2 against IS 2131:1981; fix CN clause, WT default, SE guard, total-stress segmentation, layer/footing validation | "Re-check spt.js against IS 2131:1981: is the CN formula really Clause 3.6.1 / Fig. 1? Should SPT batch corrections use the measured or design WT? Guard SE = sqrt(MSE) against negative floating-point noise; make computeTotalVerticalStress stop at depth_m inside WT-straddling layers; relax over-strict model validation" | Changed — all five Wave-1 fixes applied (AI Audit Errors 1–3, plus SE guard and validation relaxations); 15 regression tests added |

### Wave 2 — P3–P5 engine (bearing capacity, stress, settlement)

| Date | Session | Tool | Purpose | Historical prompt record (exact wording unverified) | Accepted / Changed / Rejected + Reason |
|------|---------|------|---------|-------------------------------|----------------------------------------|
| 2026-11-19 | Wave 2 (P3–P5 engine) | Pi Coding Agent / NVIDIA Nemotron | Implement `bearingCapacity.js`, `stress.js`, `settlement.js` per IS 6403:1981, and `tests/test_p3_p4_p5.test.js` | "Implement IS 6403:1981 bearing capacity with shape/depth/inclination factors, Boussinesq centre + corner and 2:1 stress increase, Schmertmann settlement and Terzaghi 1D consolidation with 0.5 m sublayers" | Changed — Vesic factors rejected and replaced with exact IS 6403 Table 1 factors (AI Audit Error 4); gross-safe fixed to q_s = q_ns + q; consolidation made per-sublayer (Error 5); 19 regression tests added |

### Wave 2 — Audit & fixes

| Date | Session | Tool | Purpose | Historical prompt record (exact wording unverified) | Accepted / Changed / Rejected + Reason |
|------|---------|------|---------|-------------------------------|----------------------------------------|
| 2026-11-19 | Wave 2 audit & fixes | Gemini | Verify P3–P5 factors against IS 6403:1981 Clause 5.1.2.1 Table 1; correct the q_s formula; add missing boussinesq_corner; per-sublayer consolidation stresses | "Compare every bearing-capacity factor against IS 6403:1981 Table 1 at φ′ = 30° square footing (Vesic sq ≈ 1.58 vs IS sq = 1.2); is gross safe q_s = q_ns + q or (q_nu + q)/FoS? Add boussinesq_corner to stress.js; make consolidation compute σ′v0(z_mid) and Δσz(z_mid − Df) at each sublayer midpoint" | Changed — exact IS 6403 Cl. 5.1.2.1 factors substituted, q_s fixed, corner method added, per-sublayer callbacks added (AI Audit Errors 4–5) |

### Wave 3 — UI rebuild & SVG fix

| Date | Session | Tool | Purpose | Historical prompt record (exact wording unverified) | Accepted / Changed / Rejected + Reason |
|------|---------|------|---------|-------------------------------|----------------------------------------|
| 2026-11-19 | Wave 3 UI rebuild & SVG fix | Pi Coding Agent / NVIDIA Nemotron | Build `index.html`, `styles.css`, `app.js`: 5-tab UI, header actions, SVG borehole, Chart.js plots | "Rebuild the UI as a 5-tab single-page app: layer and SPT tables, SVG borehole with soil hatches and water-table markers, header buttons Load Sample Profile / Import JSON / Export JSON, Chart.js canvases for every plot" | Changed — SVG borehole viewBox/hatch rendering fixed after review; a table-export button was rejected (not in the UI spec; header actions are Load Sample Profile, Import JSON, Export JSON only) |

### Final repo & docs cleanup

| Date | Session | Tool | Purpose | Historical prompt record (exact wording unverified) | Accepted / Changed / Rejected + Reason |
|------|---------|------|---------|-------------------------------|----------------------------------------|
| 2026-11-19 | Final repo & docs cleanup | Pi Coding Agent / NVIDIA Nemotron | Delete stray empty `-p` folder; rewrite `README.md`, `AI_LOG.md`, `AI_AUDIT.md`; add MIT `LICENSE` | "Clean up repository root and documentation: remove the empty -p folder, align README with the actual UI buttons and tech stack (system fonts, Chart.js CDN, zero backend), record the five audited errors with IS-clause citations, add a standard MIT LICENSE file" | Changed — LICENSE added, README/AI_LOG/AI_AUDIT rewritten; no source (`index.html`, `css/styles.css`, `js/*.js`) or test (`tests/*.js`) files modified; all 173 tests still pass |


### Review and correction · 26 November 2026

Tool: ChatGPT Codex. Purpose: compare the submitted platform against the professor’s assignment and implement the approved corrections.

User instruction (verbatim): “Okay, fix that issue and commit the changes with the name of mine as Prakash Deep”

Accepted: shared net-pressure convention, effective area, partial-result flags, corner limit, and a separate worked building study. Changed: the sample data remain generic; the hostel cases load only on request. Used an explicitly assumed C4 load scenario because the assignment omits its row. Retained the six contributor names pending roster confirmation. Independent checks include graphical SPT benchmarks, all adjacent grid pairs and the repository regression suite.
