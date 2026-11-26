# CE 402 engineering audit
Group 6 · 26 November 2026

## 1. Net and gross service loads

**AI output.** The interface compared the full vertical service resultant with net safe capacity times effective area. Its settlement tab treated the same input as a gross load and subtracted excavation relief.

**Detection.** For a gross service load of 800 kN on 4 m², pre-excavation total stress of 30 kPa, and net safe capacity of 180 kPa, the old comparison gives 200 > 180. The net service demand is 170 kPa and passes the bearing check. For a separate capacity example with net ultimate 300 kPa, surcharge 30 kPa and a safety factor of three, dividing the surcharge by three understates gross capacity by 20 kPa.

**Correction.** All three calculation tabs use the declared gross service resultant, effective area and total excavation relief when transferring the net applied pressure. P3 compares net demand with net capacity. Effective surcharge remains a separate bearing-equation input (IS 6403:1981, sections 2 and 5).

## 2. Eccentric contact warning

**AI output.** The interface described B/3 as the middle-third eccentricity threshold.

**Detection.** For a 3 m rectangular base with one-axis eccentricity of 0.6 m, elastic edge pressure divided by mean pressure is 1 minus 6 times 0.6/3, or -0.2. Full contact is already lost. The old warning stayed silent until 1 m.

**Correction.** The rectangular check includes the width and length eccentricity terms. A circular footing uses its circular kern. Effective dimensions and a full-contact warning are reported separately.

## 3. Corner stress at the loaded surface

**AI output.** The Boussinesq rectangle helper returned full uniform pressure at its corner at zero depth.

**Detection.** Under the centre of four identical loaded quadrants the limiting stress is the applied pressure. By symmetry each quadrant contributes one quarter. At 100 kPa, returning 100 kPa from each would sum to 400 kPa.

**Correction.** The corner function returns 25 kPa in this benchmark. The centre still returns 100 kPa. The regression checks the corner limit (Newmark rectangular superposition).

## 4. Missing granular stiffness

**AI output.** A granular layer with missing stiffness was silently omitted if another layer contributed to settlement.

**Detection.** Removing the SP modulus from the Group 6 BH-1 profile still produced a positive number labelled total. The omitted layer lies within the strain-influence depth.

**Correction.** The engine returns omitted layer indices and a completeness flag. The interface identifies the layer and labels the estimate partial. A dedicated regression exercises a mixed valid/missing profile (Schmertmann et al., 1978).

## 5. SPT correction traceability

**AI output.** The interface attributed an exact logarithmic equation and its clipping to IS 2131.

**Detection.** IS 2131:1981 clause 3.6.1 specifies Figure 1. Reading the curve near 1 kgf/cm² gives a correction factor of about 1.0.

**Correction.** The interface describes the logarithmic approximation. Regression points at 0.5, 1, 2 and 3 kgf/cm² check it against approximate chart readings within 0.05. Clause 3.6.2 separately governs dilatancy.
