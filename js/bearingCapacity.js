/**
 * CE 402 Geotechnical Engineering Platform - Bearing Capacity (P3)
 * Pure ES Module JavaScript, strict SI units (kN, kPa, m)
 * All engineering equations cite exact source: IS 6403:1981
 */

import { GAMMA_W, FootingShape } from './models.js';
import { computeEffectiveVerticalStress } from './soilProfile.js';

// ============================================================================
// BEARING CAPACITY FACTORS (IS 6403:1981)
// ============================================================================

/**
 * Bearing capacity factors Nc, Nq, Nγ per IS 6403:1981
 * Nq = e^(π tan φ') * tan²(45 + φ'/2)
 * Nc = (Nq - 1) * cot φ'  (for φ' > 0), Nc = 5.14 for φ' = 0
 * Nγ = 2 * (Nq + 1) * tan φ'  (IS 6403:1981 Clause 5.1.2)
 *
 * Source: IS 6403:1981, Clause 5.1.2
 *
 * @param {number} phiDeg - Effective friction angle (degrees)
 * @returns {{Nc: number, Nq: number, Ngamma: number}}
 */
function computeBearingCapacityFactors(phiDeg) {
  if (phiDeg <= 0) {
    return { Nc: 5.14, Nq: 1.0, Ngamma: 0.0 };
  }

  const phiRad = phiDeg * Math.PI / 180;
  const tanPhi = Math.tan(phiRad);

  // Nq = e^(π tan φ') * tan²(45 + φ'/2)
  const Nq = Math.exp(Math.PI * tanPhi) * Math.pow(Math.tan(Math.PI / 4 + phiRad / 2), 2);

  // Nc = (Nq - 1) * cot φ'
  const Nc = (Nq - 1) / tanPhi;

  // Nγ = 2 * (Nq + 1) * tan φ'  (IS 6403:1981)
  const Ngamma = 2 * (Nq + 1) * tanPhi;

  return { Nc, Nq, Ngamma };
}

/**
 * Reduced shear parameters for local shear (IS 6403:1981 Clause 5.1.2)
 * c_m = (2/3) * c'
 * tan φ_m = (2/3) * tan φ'
 *
 * Source: IS 6403:1981, Clause 5.1.2
 *
 * @param {number} cPrime_kPa - Effective cohesion (kPa)
 * @param {number} phiDeg - Effective friction angle (degrees)
 * @returns {{c_m_kPa: number, phi_m_deg: number}}
 */
function getLocalShearParameters(cPrime_kPa, phiDeg) {
  const c_m_kPa = (2 / 3) * cPrime_kPa;
  const phiRad = phiDeg * Math.PI / 180;
  const tanPhi_m = (2 / 3) * Math.tan(phiRad);
  const phi_m_deg = Math.atan(tanPhi_m) * 180 / Math.PI;
  return { c_m_kPa, phi_m_deg };
}

/**
 * Determines shear mode and computes effective shear parameters
 *
 * In 'auto' mode:
 * - φ ≥ 36° → general shear
 * - φ ≤ 29° AND cohesionless (φ > 0, c' = 0) → local shear
 * - 29 < φ < 36 → intermediate (linear interpolation)
 * - φ = 0 (pure clay) OR c' > 0 (cohesive c-φ soil) → general shear unless explicitly 'local'
 *
 * Source: IS 6403:1981, Clause 5.1.2
 *
 * @param {number} phiDeg - Effective friction angle (degrees)
 * @param {number} cPrime_kPa - Effective cohesion (kPa)
 * @param {string} [shearMode='auto'] - 'auto' | 'general' | 'local'
 * @returns {{phi_eff_deg: number, c_eff_kPa: number, shearModeUsed: 'general' | 'local' | 'intermediate', isIntermediate: boolean}}
 */
function getEffectiveShearParameters(phiDeg, cPrime_kPa, shearMode = 'auto') {
  let shearModeUsed = 'general';
  let phi_eff_deg = phiDeg;
  let c_eff_kPa = cPrime_kPa;
  let isIntermediate = false;

  if (shearMode === 'general') {
    shearModeUsed = 'general';
  } else if (shearMode === 'local') {
    shearModeUsed = 'local';
    const { c_m_kPa, phi_m_deg } = getLocalShearParameters(cPrime_kPa, phiDeg);
    c_eff_kPa = c_m_kPa;
    phi_eff_deg = phi_m_deg;
  } else {
    // 'auto' mode
    const isCohesionless = (phiDeg > 0 && cPrime_kPa === 0);
    const isPureClay = (phiDeg === 0);
    const isCohesiveCPhi = (cPrime_kPa > 0 && phiDeg > 0);

    if (phiDeg >= 36) {
      shearModeUsed = 'general';
    } else if (phiDeg <= 29 && isCohesionless) {
      // Local shear only for cohesionless/low-φ sands
      shearModeUsed = 'local';
      const { c_m_kPa, phi_m_deg } = getLocalShearParameters(cPrime_kPa, phiDeg);
      c_eff_kPa = c_m_kPa;
      phi_eff_deg = phi_m_deg;
    } else if (phiDeg > 29 && phiDeg < 36 && isCohesionless) {
      // Intermediate shear: linear interpolation between general and local
      // per IS 6403:1981 Clause 5.1.2
      shearModeUsed = 'intermediate';
      isIntermediate = true;
      const { c_m_kPa, phi_m_deg } = getLocalShearParameters(cPrime_kPa, phiDeg);
      // Interpolation factor: (φ - 29) / (36 - 29) = (φ - 29) / 7
      const t = (phiDeg - 29) / 7;
      phi_eff_deg = phi_m_deg + t * (phiDeg - phi_m_deg);
      c_eff_kPa = c_m_kPa + t * (cPrime_kPa - c_m_kPa);
    } else {
      // Pure clay (φ=0), cohesive c-φ soil (c'>0), or non-cohesionless: use general shear
      shearModeUsed = 'general';
    }
  }

  return { phi_eff_deg, c_eff_kPa, shearModeUsed, isIntermediate };
}

// ============================================================================
// SHAPE FACTORS (IS 6403:1981 Clause 5.1.2.1, Table 1)
// ============================================================================

/**
 * Shape factors sc, sq, sγ per IS 6403:1981 Clause 5.1.2.1 Table 1
 *
 * Strip:    sc = 1.0, sq = 1.0, sγ = 1.0
 * Square:   sc = 1.3, sq = 1.2, sγ = 0.8
 * Circular: sc = 1.3, sq = 1.2, sγ = 0.6
 * Rectangular:
 *   sc = 1 + 0.2 * (B/L)
 *   sq = 1 + 0.2 * (B/L)
 *   sγ = 1 - 0.4 * (B/L)
 *
 * Source: IS 6403:1981, Clause 5.1.2.1, Table 1
 *
 * @param {Object} params
 * @param {number} params.B_m - Width (m)
 * @param {number} params.L_m - Length (m)
 * @param {string} params.shape - Footing shape
 * @returns {{sc: number, sq: number, sgamma: number}}
 */
function computeShapeFactors({ B_m, L_m, shape }) {
  if (shape === FootingShape.STRIP) {
    return { sc: 1.0, sq: 1.0, sgamma: 1.0 };
  }

  if (shape === FootingShape.SQUARE) {
    return { sc: 1.3, sq: 1.2, sgamma: 0.8 };
  }

  if (shape === FootingShape.CIRCULAR) {
    return { sc: 1.3, sq: 1.2, sgamma: 0.6 };
  }

  // Rectangular: ensure B/L <= 1.0
  const B_over_L = Math.min(B_m / L_m, 1.0);
  // Source: IS 6403:1981, Clause 5.1.2.1, Table 1
  const sc = 1 + 0.2 * B_over_L;
  const sq = 1 + 0.2 * B_over_L;
  const sgamma = 1 - 0.4 * B_over_L;

  return { sc, sq, sgamma };
}

// ============================================================================
// DEPTH FACTORS (IS 6403:1981 Clause 5.1.2.1)
// ============================================================================

/**
 * Depth factors dc, dq, dγ per IS 6403:1981 Clause 5.1.2.1
 *
 * N_φ = tan²(45° + φ/2)
 * dc = 1 + 0.2 * (Df/B) * √N_φ
 * dq = dγ = 1.0 for φ < 10°
 * dq = dγ = 1 + 0.1 * (Df/B) * √N_φ for φ ≥ 10°
 *
 * Source: IS 6403:1981, Clause 5.1.2.1
 *
 * @param {Object} params
 * @param {number} params.Df_m - Embedment depth (m)
 * @param {number} params.B_m - Width (m)
 * @param {number} params.phi_eff_deg - Effective friction angle (degrees)
 * @returns {{dc: number, dq: number, dgamma: number}}
 */
function computeDepthFactors({ Df_m, B_m, phi_eff_deg }) {
  if (Df_m <= 0) {
    return { dc: 1.0, dq: 1.0, dgamma: 1.0 };
  }

  // N_φ = tan²(45° + φ/2)
  const phiRad = phi_eff_deg * Math.PI / 180;
  const N_phi = Math.pow(Math.tan(Math.PI / 4 + phiRad / 2), 2);
  const sqrt_N_phi = Math.sqrt(N_phi);
  const Df_over_B = Df_m / B_m;

  // dc = 1 + 0.2 * (Df/B) * √N_φ
  const dc = 1 + 0.2 * Df_over_B * sqrt_N_phi;

  // dq = dγ
  let dq, dgamma;
  if (phi_eff_deg < 10) {
    dq = 1.0;
    dgamma = 1.0;
  } else {
    dq = 1 + 0.1 * Df_over_B * sqrt_N_phi;
    dgamma = dq;
  }

  return { dc, dq, dgamma };
}

// ============================================================================
// INCLINATION FACTORS (IS 6403:1981 Clause 5.1.2.1)
// ============================================================================

/**
 * Inclination factors ic, iq, iγ per IS 6403:1981 Clause 5.1.2.1
 *
 * α = arctan(H/V) in degrees
 * ic = iq = (1 - α/90)²
 * iγ = (1 - α/φ)² for φ > 0, else 1.0
 *
 * Source: IS 6403:1981, Clause 5.1.2.1
 *
 * @param {Object} params
 * @param {number} params.loadV_kN - Vertical load (kN)
 * @param {number} params.loadH_kN - Horizontal load (kN)
 * @param {number} params.phi_eff_deg - Effective friction angle (degrees)
 * @returns {{ic: number, iq: number, igamma: number}}
 */
function computeInclinationFactors({ loadV_kN, loadH_kN, phi_eff_deg }) {
  if (loadH_kN <= 0) {
    return { ic: 1.0, iq: 1.0, igamma: 1.0 };
  }

  // α = arctan(H/V) in degrees
  const alpha_deg = Math.atan(loadH_kN / loadV_kN) * 180 / Math.PI;

  // ic = iq = (1 - α/90)²
  const iq = Math.pow(Math.max(0, 1 - alpha_deg / 90), 2);
  const ic = iq;

  // iγ = (1 - α/φ)² for φ > 0, else 1.0
  let igamma;
  if (phi_eff_deg > 0) {
    igamma = Math.pow(Math.max(0, 1 - alpha_deg / phi_eff_deg), 2);
  } else {
    igamma = 1.0;
  }

  return { ic, iq, igamma };
}

// ============================================================================
// WATER TABLE FACTOR W' (IS 6403:1981 Clause 5.1.2)
// ============================================================================

/**
 * Water table correction factor W' per IS 6403:1981 Clause 5.1.2
 *
 * W' = 0.5 + 0.5 * (Dw / B)  for 0 <= Dw <= B
 * W' = 1.0                    for Dw >= B
 * W' = 0.5                    for Dw <= 0 (water at or above base)
 *
 * Where Dw = depth of water table below footing base
 *
 * Source: IS 6403:1981, Clause 5.1.2
 *
 * @param {number} Dw_m - Depth of water table below footing base (m)
 * @param {number} B_m - Footing width (m)
 * @returns {number} W' factor (clamped to [0.5, 1.0])
 */
function computeWaterTableFactor(Dw_m, B_m) {
  if (Dw_m <= 0) return 0.5;
  if (Dw_m >= B_m) return 1.0;
  return 0.5 + 0.5 * (Dw_m / B_m);
}

// ============================================================================
// ECCENTRICITY - EFFECTIVE DIMENSIONS (IS 6403:1981 / Meyerhof)
// ============================================================================

/**
 * Effective footing dimensions for eccentric loading
 * B' = B - 2*|eB|, L' = L - 2*|eL| (where eB = My/V, eL = Mx/V)
 * For strip: L' = L, B' = B - 2*|eB|
 * For circular: B' = L' = D - 2*|e|, A' = π/4 * B'²
 * Uses absolute moments so negative moments never increase B' or L'
 * Throws if eccentricity exceeds B/2 or L/2 (no effective area)
 * Ensures B' <= L' for non-strip footings so B'/L' <= 1.0 in shape factors
 *
 * Source: IS 6403:1981 (referencing Meyerhof's effective area method)
 *
 * @param {Object} params
 * @param {string} params.shape - Footing shape
 * @param {number} params.B_m - Width (m)
 * @param {number} params.L_m - Length (m)
 * @param {number} params.Mx_kNm - Moment about X-axis (kNm)
 * @param {number} params.My_kNm - Moment about Y-axis (kNm)
 * @param {number} params.loadV_kN - Vertical load (kN)
 * @returns {{B_prime_m: number, L_prime_m: number, A_prime_m2: number, eB_m: number, eL_m: number}}
 */
function computeEffectiveDimensions({ shape, B_m, L_m, Mx_kNm, My_kNm, loadV_kN }) {
  // Eccentricities (use absolute values)
  const eL_m = loadV_kN > 0 ? Math.abs(Mx_kNm) / loadV_kN : 0;
  const eB_m = loadV_kN > 0 ? Math.abs(My_kNm) / loadV_kN : 0;

  let B_prime_m, L_prime_m, A_prime_m2;

  if (shape === FootingShape.STRIP) {
    // Strip: L is length (perpendicular to section), B is width
    B_prime_m = B_m - 2 * eB_m;
    L_prime_m = L_m;
    A_prime_m2 = B_prime_m * L_prime_m;
  } else if (shape === FootingShape.CIRCULAR) {
    // Circular: resultant eccentricity
    const e_m = Math.sqrt(eB_m * eB_m + eL_m * eL_m);
    B_prime_m = B_m - 2 * e_m;
    L_prime_m = B_prime_m;
    // For circular, effective area = π/4 * D'²
    A_prime_m2 = (Math.PI / 4) * B_prime_m * B_prime_m;
  } else {
    // Square and Rectangular
    B_prime_m = B_m - 2 * eB_m;
    L_prime_m = L_m - 2 * eL_m;
    A_prime_m2 = B_prime_m * L_prime_m;
  }

  // Check if eccentricity exceeds B/2 or L/2 (no effective area)
  if (B_prime_m <= 0 || L_prime_m <= 0) {
    throw new RangeError('Eccentricity exceeds B/2 or L/2: no effective footing area');
  }

  // For non-strip footings, ensure B' <= L' so B'/L' <= 1.0 in shape factors
  if (shape !== FootingShape.STRIP && B_prime_m > L_prime_m) {
    [B_prime_m, L_prime_m] = [L_prime_m, B_prime_m];
  }

  // Recompute area after potential swap
  if (shape === FootingShape.CIRCULAR) {
    A_prime_m2 = (Math.PI / 4) * B_prime_m * B_prime_m;
  } else if (shape !== FootingShape.STRIP) {
    A_prime_m2 = B_prime_m * L_prime_m;
  }

  return { B_prime_m, L_prime_m, A_prime_m2, eB_m, eL_m };
}

// ============================================================================
// EFFECTIVE OVERBURDEN AT FOOTING BASE (q)
// ============================================================================

/**
 * Computes effective overburden pressure q at footing base (Df)
 *
 * @param {Object} params
 * @param {import('./models.js').SoilProfile} params.profile - Soil profile
 * @param {number} params.Df_m - Embedment depth (m)
 * @param {string} [params.wtSource='design'] - Water table source
 * @returns {number} q_kPa - Effective overburden at Df (kPa)
 */
function computeOverburdenAtBase({ profile, Df_m, wtSource = 'design' }) {
  if (Df_m <= 0) return 0;
  return computeEffectiveVerticalStress({ profile, depth_m: Df_m, wtSource });
}

// ============================================================================
// NET ULTIMATE BEARING CAPACITY qnu (IS 6403:1981)
// ============================================================================

/**
 * Computes net ultimate bearing capacity qnu_kPa per IS 6403:1981 Clause 5.1.2
 *
 * qnu = c*Nc*sc*dc*ic + q*(Nq - 1)*sq*dq*iq + 0.5*γ*B'*Nγ*sγ*dγ*iγ*W'
 *
 * Net safe bearing capacity qns = qnu / FoS
 * Gross safe bearing capacity qs = qns + q  (NOT qu/FoS)
 *
 * Source: IS 6403:1981, Clause 5.1.2
 *
 * @param {Object} params
 * @param {import('./models.js').Footing} params.footing - Footing object
 * @param {import('./models.js').SoilProfile} params.profile - Soil profile
 * @param {number} params.gamma_kNm3 - Unit weight of soil below footing (kN/m³)
 * @param {number} params.cPrime_kPa - Effective cohesion (kPa)
 * @param {number} params.phiDeg - Effective friction angle (degrees)
 * @param {string} [params.shearMode='auto'] - 'auto' | 'general' | 'local'
 * @param {string} [params.wtSource='design'] - Water table source for q and W'
 * @returns {Object} Complete bearing capacity results
 */
function computeBearingCapacityIS6403({
  footing,
  profile,
  gamma_kNm3,
  cPrime_kPa,
  phiDeg,
  shearMode = 'auto',
  wtSource = 'design'
}) {
  // Safely default optional footing fields and validate FoS
  const { loadH_kN = 0, Mx_kNm = 0, My_kNm = 0, fos } = footing;
  if (fos === undefined || fos < 1) {
    throw new RangeError('Factor of safety (fos) must be >= 1');
  }

  // 1. Get effective shear parameters
  const { phi_eff_deg, c_eff_kPa, shearModeUsed, isIntermediate } = getEffectiveShearParameters(phiDeg, cPrime_kPa, shearMode);

  // 2. Bearing capacity factors
  const { Nc, Nq, Ngamma } = computeBearingCapacityFactors(phi_eff_deg);

  // 3. Effective dimensions for eccentricity
  const { B_prime_m, L_prime_m, A_prime_m2, eB_m, eL_m } = computeEffectiveDimensions({
    shape: footing.shape,
    B_m: footing.B_m,
    L_m: footing.L_m,
    Mx_kNm,
    My_kNm,
    loadV_kN: footing.loadV_kN
  });

  // 4. Shape factors (IS 6403:1981 Clause 5.1.2.1 Table 1)
  const { sc, sq, sgamma } = computeShapeFactors({
    B_m: B_prime_m,
    L_m: L_prime_m,
    shape: footing.shape
  });

  // 5. Depth factors (IS 6403:1981 Clause 5.1.2.1)
  const { dc, dq, dgamma } = computeDepthFactors({
    Df_m: footing.Df_m,
    B_m: B_prime_m,
    phi_eff_deg
  });

  // 6. Inclination factors (IS 6403:1981 Clause 5.1.2.1)
  const { ic, iq, igamma } = computeInclinationFactors({
    loadV_kN: footing.loadV_kN,
    loadH_kN,
    phi_eff_deg
  });

  // 7. Water table factor W'
  const wt_m = wtSource === 'measured' ? profile.measuredWT_m : profile.designWT_m;
  const Dw_m = wt_m - footing.Df_m;
  const W_prime = computeWaterTableFactor(Dw_m, B_prime_m);

  // 8. Effective overburden at base (q)
  const q_kPa = computeOverburdenAtBase({ profile, Df_m: footing.Df_m, wtSource });

  // 9. Net ultimate bearing capacity
  // Source: IS 6403:1981, Clause 5.1.2
  const term1 = c_eff_kPa * Nc * sc * dc * ic;
  const term2 = q_kPa * (Nq - 1) * sq * dq * iq;
  const term3 = 0.5 * gamma_kNm3 * B_prime_m * Ngamma * sgamma * dgamma * igamma * W_prime;

  const qnu_kPa = term1 + term2 + term3;

  // 10. Net safe bearing capacity
  const qns_kPa = qnu_kPa / fos;

  // 11. Gross ultimate and safe
  const qu_kPa = qnu_kPa + q_kPa;
  // Gross safe = net safe + overburden (NOT qu/FoS)
  const qs_kPa = qns_kPa + q_kPa;

  return {
    // Input parameters
    footing: { ...footing },
    gamma_kNm3,
    cPrime_kPa,
    phiDeg,
    shearMode,
    wtSource,

    // Shear mode determination
    shearModeUsed,
    isIntermediate,
    phi_eff_deg,
    c_eff_kPa,

    // Bearing capacity factors
    Nc,
    Nq,
    Ngamma,

    // Shape factors
    sc,
    sq,
    sgamma,

    // Depth factors
    dc,
    dq,
    dgamma,

    // Inclination factors
    ic,
    iq,
    igamma,

    // Water table factor
    W_prime,
    Dw_m,

    // Effective dimensions
    B_prime_m,
    L_prime_m,
    A_prime_m2,
    eB_m,
    eL_m,

    // Overburden
    q_kPa,

    // Ultimate terms
    term1_c_kPa: term1,
    term2_q_kPa: term2,
    term3_gamma_kPa: term3,

    // Results
    qnu_kPa,      // Net ultimate
    qns_kPa,      // Net safe
    qu_kPa,       // Gross ultimate
    qs_kPa        // Gross safe (qns + q)
  };
}

/**
 * Computes allowable load for a given settlement or FoS
 * @param {Object} result - Result from computeBearingCapacityIS6403
 * @returns {number} Allowable vertical load (kN)
 */
function computeAllowableLoad({ qns_kPa, A_prime_m2 }) {
  return qns_kPa * A_prime_m2;
}

export {
  computeBearingCapacityFactors,
  getLocalShearParameters,
  getEffectiveShearParameters,
  computeShapeFactors,
  computeDepthFactors,
  computeInclinationFactors,
  computeWaterTableFactor,
  computeEffectiveDimensions,
  computeOverburdenAtBase,
  computeBearingCapacityIS6403,
  computeAllowableLoad
};