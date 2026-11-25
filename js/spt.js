/**
 * CE 402 Geotechnical Engineering Platform - SPT & Direct Shear Utilities (P2)
 * Pure ES Module JavaScript, strict SI units (kN, kPa, m)
 * All engineering equations cite exact source
 */

import { GAMMA_W, clone } from './models.js';
import { computeEffectiveVerticalStress } from './soilProfile.js';

// ============================================================================
// IS 2131:1981 SPT N-VALUE CORRECTIONS
// ============================================================================

/**
 * Overburden correction factor CN per IS 2131:1981 Clause 3.6.1 & Fig. 1 (Peck-Hanson-Thornburn)
 * CN = 0.77 * log10(2000 / σ'v0) where σ'v0 in kPa
 * Clamped to 0.40 <= CN <= 2.0
 *
 * Source: IS 2131:1981, Clause 3.6.1 & Fig. 1
 *
 * @param {number} sigmaV0Prime_kPa - Effective vertical stress at test depth (kPa, > 0)
 * @returns {{CN: number, limited: boolean, CN_raw: number}} Correction factor and whether it was limited
 */
export function computeOverburdenCorrectionCN(sigmaV0Prime_kPa) {
  if (sigmaV0Prime_kPa <= 0) {
    // At zero or negative effective stress, use maximum correction
    return { CN: 2.0, limited: true, CN_raw: 2.0 };
  }

  // Source: IS 2131:1981, Clause 3.6.1 & Fig. 1 (Peck-Hanson-Thornburn)
  const CN_raw = 0.77 * Math.log10(2000 / sigmaV0Prime_kPa);

  // Clamp to [0.40, 2.0] per IS 2131:1981
  let limited = false;
  let CN = CN_raw;
  if (CN_raw > 2.0) {
    CN = 2.0;
    limited = true;
  } else if (CN_raw < 0.40) {
    CN = 0.40;
    limited = true;
  }

  return { CN, limited, CN_raw };
}

/**
 * Dilatancy correction per IS 2131:1981 Clause 3.6.2
 * Applicable only for:
 * - Fine sand / silt (cohesionless soils with fine content)
 * - Below water table
 * - N' > 15
 *
 * N'' = 15 + 0.5 * (N' - 15)
 *
 * Source: IS 2131:1981, Clause 3.6.2
 *
 * @param {Object} params
 * @param {number} params.N_prime - Overburden-corrected N value (N')
 * @param {boolean} params.isFineSandOrSilt - True for fine sand or silt
 * @param {boolean} params.belowWaterTable - True if test depth > water table depth
 * @returns {{N_doublePrime: number, applied: boolean, reason: string}} Corrected N and whether correction applied
 */
export function computeDilatancyCorrection({ N_prime, isFineSandOrSilt, belowWaterTable }) {
  // Check applicability per IS 2131:1981 Clause 3.6.2
  const applicable = isFineSandOrSilt && belowWaterTable && N_prime > 15;

  let N_doublePrime = N_prime;
  let reason = '';

  if (!applicable) {
    if (!isFineSandOrSilt) reason = 'Not fine sand/silt';
    else if (!belowWaterTable) reason = 'Above water table';
    else reason = `N' = ${N_prime.toFixed(2)} ≤ 15`;
    return { N_doublePrime, applied: false, reason };
  }

  // Source: IS 2131:1981, Clause 3.6.2
  N_doublePrime = 15 + 0.5 * (N_prime - 15);
  reason = `Fine sand/silt below WT with N' = ${N_prime.toFixed(2)} > 15`;

  return { N_doublePrime, applied: true, reason };
}

/**
 * Full SPT correction pipeline per IS 2131:1981 showing all intermediate steps
 *
 * @param {Object} params
 * @param {number} params.N_field - Raw field N-value (blows/30cm)
 * @param {number} params.sigmaV0Prime_kPa - Effective vertical stress at test depth (kPa)
 * @param {boolean} params.isFineSandOrSilt - True for fine sand or silt
 * @param {boolean} params.belowWaterTable - True if test depth > water table depth
 * @param {boolean} [params.isCohesionless=true] - False for cohesive soils (clay); skips overburden & dilatancy corrections
 * @returns {Object} Complete correction results with all intermediate values
 */
export function correctSPT_N_IS2131({ N_field, sigmaV0Prime_kPa, isFineSandOrSilt, belowWaterTable, isCohesionless = true }) {
  let CN = 1.0;
  let CN_raw = 1.0;
  let CN_limited = false;
  let N_prime = N_field;

  if (isCohesionless) {
    // Step 1: Overburden correction (only for cohesionless soils)
    // Source: IS 2131:1981, Clause 3.6.1 & Fig. 1
    const cnResult = computeOverburdenCorrectionCN(sigmaV0Prime_kPa);
    CN = cnResult.CN;
    CN_raw = cnResult.CN_raw;
    CN_limited = cnResult.limited;

    // Step 2: Overburden-corrected N'
    // Source: IS 2131:1981, Clause 3.6.1: N' = CN * N
    N_prime = CN * N_field;
  } else {
    // Cohesive soil: no overburden correction per IS 2131
    CN = 1.0;
    CN_raw = 1.0;
    CN_limited = false;
    N_prime = N_field;
  }

  // Step 3: Dilatancy correction (only for cohesionless fine sand/silt below WT)
  // Source: IS 2131:1981, Clause 3.6.2
  const { N_doublePrime, applied: dilatancyApplied, reason: dilatancyReason } = computeDilatancyCorrection({
    N_prime,
    isFineSandOrSilt: isCohesionless && isFineSandOrSilt, // Only applies if cohesionless
    belowWaterTable
  });

  return {
    // Inputs
    N_field,
    sigmaV0Prime_kPa,
    isFineSandOrSilt,
    belowWaterTable,
    isCohesionless,

    // Step 1: Overburden correction
    CN_raw,
    CN,
    CN_limited,

    // Step 2: N'
    N_prime,

    // Step 3: Dilatancy correction
    N_doublePrime,
    dilatancyApplied,
    dilatancyReason,

    // Final corrected value
    N_corrected: N_doublePrime
  };
}

/**
 * Batch correct multiple SPT tests at different depths
 * @param {Array<Object>} tests - Array of {depth_m, N_field, isFineSandOrSilt, isCohesionless?}
 * @param {import('./models.js').SoilProfile} profile - Soil profile for σ'v0 and WT
 * @param {string} [wtSource='measured'] - Water table source (SPT corrections use boring WT)
 * @returns {Array<Object>} Correction results for each test
 */
export function correctSPT_N_Batch(tests, profile, wtSource = 'measured') {
  return tests.map(test => {
    const sigmaV0Prime_kPa = computeEffectiveVerticalStress({ profile, depth_m: test.depth_m, wtSource });
    const wt_m = wtSource === 'measured' ? profile.measuredWT_m : profile.designWT_m;
    const belowWaterTable = test.depth_m > wt_m;

    return {
      depth_m: test.depth_m,
      ...correctSPT_N_IS2131({
        N_field: test.N_field,
        sigmaV0Prime_kPa,
        isFineSandOrSilt: test.isFineSandOrSilt,
        belowWaterTable,
        isCohesionless: test.isCohesionless ?? true
      })
    };
  });
}

// ============================================================================
// DIRECT SHEAR TEST - OLS LINEAR REGRESSION
// ============================================================================

/**
 * Ordinary Least Squares (OLS) linear regression on direct shear data
 * Fits τ = c' + σn * tan(φ')
 *
 * Source: Standard statistical method for direct shear interpretation
 * Lambe & Whitman (1969) Soil Mechanics, Chapter on Shear Strength
 * Also: IS 2720 (Part 13):1986 for direct shear test procedure
 *
 * @param {Array<{sigma_n_kPa: number, tau_f_kPa: number}>} dataPoints - Direct shear test pairs
 * @returns {Object} Regression results: c'_kPa, phiDeg, R2, fitted line points
 */
export function directShearOLS(dataPoints) {
  if (!Array.isArray(dataPoints) || dataPoints.length < 2) {
    throw new Error('At least 2 data points required for OLS regression');
  }

  // Validate data
  for (let i = 0; i < dataPoints.length; i++) {
    const p = dataPoints[i];
    if (typeof p.sigma_n_kPa !== 'number' || typeof p.tau_f_kPa !== 'number') {
      throw new Error(`Data point ${i}: sigma_n_kPa and tau_f_kPa must be numbers`);
    }
    if (p.sigma_n_kPa < 0 || p.tau_f_kPa < 0) {
      throw new Error(`Data point ${i}: values must be non-negative`);
    }
  }

  const n = dataPoints.length;

  // Compute sums for OLS: y = a + b*x where y = τ, x = σn
  let sumX = 0, sumY = 0, sumXY = 0, sumX2 = 0, sumY2 = 0;

  for (const p of dataPoints) {
    sumX += p.sigma_n_kPa;
    sumY += p.tau_f_kPa;
    sumXY += p.sigma_n_kPa * p.tau_f_kPa;
    sumX2 += p.sigma_n_kPa * p.sigma_n_kPa;
    sumY2 += p.tau_f_kPa * p.tau_f_kPa;
  }

  // OLS formulas
  const xMean = sumX / n;
  const yMean = sumY / n;

  const Sxx = sumX2 - n * xMean * xMean;
  const Sxy = sumXY - n * xMean * yMean;

  if (Sxx === 0) {
    throw new Error('All sigma_n_kPa values are identical - cannot compute regression');
  }

  // Slope b = tan(φ')
  const slope = Sxy / Sxx;
  // Intercept a = c'
  const intercept = yMean - slope * xMean;

  // Friction angle φ' = arctan(slope)
  const phiRad = Math.atan(slope);
  const phiDeg = phiRad * 180 / Math.PI;

  // Cohesion c'
  const cPrime_kPa = intercept;

  // R² calculation
  const Syy = sumY2 - n * yMean * yMean;
  const R2 = Sxx > 0 && Syy > 0 ? (Sxy * Sxy) / (Sxx * Syy) : 0;

  // Standard error of estimate
  const SSE = Syy - slope * Sxy;
  const MSE = n > 2 ? SSE / (n - 2) : 0;
  // Guard against floating-point negative MSE (e.g., -1e-15)
  const SE = Math.sqrt(Math.max(0, MSE));

  // Generate fitted line points for plotting
  const sigmaMin = Math.min(...dataPoints.map(p => p.sigma_n_kPa));
  const sigmaMax = Math.max(...dataPoints.map(p => p.sigma_n_kPa));
  const fittedLine = [
    { sigma_n_kPa: sigmaMin, tau_f_kPa: intercept + slope * sigmaMin },
    { sigma_n_kPa: sigmaMax, tau_f_kPa: intercept + slope * sigmaMax }
  ];

  // Residuals for diagnostics
  const residuals = dataPoints.map(p => ({
    sigma_n_kPa: p.sigma_n_kPa,
    tau_observed_kPa: p.tau_f_kPa,
    tau_fitted_kPa: intercept + slope * p.sigma_n_kPa,
    residual_kPa: p.tau_f_kPa - (intercept + slope * p.sigma_n_kPa)
  }));

  return {
    // Primary results
    cPrime_kPa: Math.max(0, cPrime_kPa), // Cohesion cannot be negative
    phiDeg: Math.max(0, phiDeg),
    R2,

    // Regression coefficients
    intercept_kPa: intercept,
    slope: slope,

    // Statistics
    n,
    xMean_kPa: xMean,
    yMean_kPa: yMean,
    Sxx,
    Sxy,
    Syy,
    SSE,
    MSE,
    SE_kPa: SE,

    // Fitted line for plotting
    fittedLine,

    // Residuals
    residuals,

    // Input data (cloned)
    dataPoints: clone(dataPoints)
  };
}

/**
 * Estimates φ' from SPT N-value correlations (supplementary)
 * Source: Various correlations - used as check only
 * @param {number} N_corrected - Corrected SPT N-value
 * @param {string} soilType - 'sand' or 'silt' or 'clay'
 * @returns {number} Estimated φ' (degrees)
 */
export function estimatePhiFromSPT(N_corrected, soilType) {
  // Source: Meyerhof (1956), Peck et al. (1974), approximate correlations
  if (soilType === 'sand') {
    if (N_corrected < 4) return 28;
    if (N_corrected < 10) return 30;
    if (N_corrected < 30) return 34;
    if (N_corrected < 50) return 38;
    return 42;
  }
  if (soilType === 'silt') {
    if (N_corrected < 4) return 26;
    if (N_corrected < 10) return 28;
    if (N_corrected < 30) return 30;
    if (N_corrected < 50) return 32;
    return 34;
  }
  // Clay - not reliable from SPT
  return 0;
}

// computeEffectiveVerticalStress re-exported from soilProfile.js
// All other functions exported above via individual export statements