/**
 * CE 402 Geotechnical Engineering Platform - Settlement Analysis (P5)
 * Pure ES Module JavaScript, strict SI units (kN, kPa, m, mm)
 * All engineering equations cite exact source
 */

import { computeEffectiveVerticalStress } from './soilProfile.js';
import { boussinesq } from './stress.js';

// ============================================================================
// TERZAGHI 1D CONSOLIDATION - DEGREE OF CONSOLIDATION U(Tv)
// ============================================================================

/**
 * Degree of consolidation U for given time factor Tv
 * Terzaghi 1D consolidation theory
 *
 * For U <= 60%: Tv = (π/4) * U²
 * For U > 60%: Tv = 1.781 - 0.933 * log10(100 - U%)
 *
 * Source: Terzaghi (1943) "Theoretical Soil Mechanics", Chapter 12
 * Also: Das (2010) Principles of Foundation Engineering, Eqs. 11.20-11.21
 * Also: IS 8009 (Part 1):1976
 *
 * @param {number} Tv - Time factor (dimensionless)
 * @returns {number} U - Degree of consolidation (0 to 1)
 */
function getDegreeOfConsolidation(Tv) {
  if (Tv <= 0) return 0;
  if (Tv >= 2.0) return 1.0; // Practically 100%

  // For U <= 60%, Tv = (π/4) * U²
  const Tv_at_60 = Math.PI / 4 * 0.6 * 0.6; // ≈ 0.2827

  if (Tv <= Tv_at_60) {
    return Math.sqrt(4 * Tv / Math.PI);
  }

  // For U > 60%, Tv = 1.781 - 0.933 * log10(100 - U%)
  // Solve for U: 100 - U% = 10^((1.781 - Tv)/0.933)
  const U_percent = 100 - Math.pow(10, (1.781 - Tv) / 0.933);
  return Math.max(0, Math.min(1, U_percent / 100));
}

/**
 * Time factor Tv for given degree of consolidation U
 * @param {number} U - Degree of consolidation (0 to 1)
 * @returns {number} Tv - Time factor
 */
function getTimeFactor(U) {
  if (U <= 0) return 0;
  if (U >= 1) return 2.0;

  if (U <= 0.6) {
    return Math.PI / 4 * U * U;
  }
  return 1.781 - 0.933 * Math.log10(100 - U * 100);
}

// ============================================================================
// CONSOLIDATION SETTLEMENT (1D)
// ============================================================================

/**
 * Computes 1D consolidation settlement for a clay layer
 * Automatically subdivides into sublayers ≤ 0.5 m thick
 * Each sublayer computes its OWN σ'v0 and Δσ at z_mid using callbacks
 *
 * S = Σ [ (Cc/(1+e0)) * H * log10(σ'v0 + Δσ/σ'v0) ] for NC (σ'v0 >= σ'p)
 * S = Σ [ (Cr/(1+e0)) * H * log10(σ'v0 + Δσ/σ'v0) ] for OC below σ'p
 * S = Σ [ (Cr/(1+e0)) * H * log10(σ'p/σ'v0) + (Cc/(1+e0)) * H * log10((σ'v0+Δσ)/σ'p) ] for OC crossing σ'p
 *
 * Source: Terzaghi & Peck (1967) "Soil Mechanics in Engineering Practice", Chapter 4
 * Also: Das (2010) Principles of Foundation Engineering, Chapter 11
 * Also: IS 8009 (Part 1):1976
 *
 * @param {Object} params
 * @param {import('./models.js').SoilLayer} params.layer - Clay layer (must have e0, Cc, Cr, sigmaP_kPa)
 * @param {number} params.sigma_v0_prime_kPa - Initial effective stress at layer mid-depth (kPa) - used if no profile/deltaSigmaFn
 * @param {number} params.delta_sigma_kPa - Stress increase at layer mid-depth (kPa) - used if no deltaSigmaFn
 * @param {import('./models.js').SoilProfile} [params.profile] - Soil profile for computing σ'v0 at each z_mid
 * @param {string} [params.wtSource='design'] - Water table source for σ'v0 computation
 * @param {Function} [params.deltaSigmaFn] - Callback (z_mid_m) => Δσ at that depth (kPa)
 * @param {number} [params.max_sublayer_thickness_m=0.5] - Max sublayer thickness (m)
 * @returns {Object} Settlement result with sublayer breakdown
 */
function computeConsolidationSettlement({
  layer,
  sigma_v0_prime_kPa,
  delta_sigma_kPa,
  profile,
  wtSource = 'design',
  deltaSigmaFn,
  max_sublayer_thickness_m = 0.5
}) {
  const layerThickness = layer.bottomDepth_m - layer.topDepth_m;
  if (layerThickness <= 0) {
    return { S_m: 0, S_mm: 0, sublayers: [] };
  }

  // Validate required parameters
  if (layer.e0 === undefined || layer.Cc === undefined || layer.Cr === undefined || layer.sigmaP_kPa === undefined) {
    throw new Error('Clay layer must have e0, Cc, Cr, sigmaP_kPa for consolidation settlement');
  }

  // Subdivide layer into sublayers ≤ max_sublayer_thickness_m
  const n_sublayers = Math.ceil(layerThickness / max_sublayer_thickness_m);
  const dz = layerThickness / n_sublayers;

  let total_S_m = 0;
  const sublayers = [];

  for (let i = 0; i < n_sublayers; i++) {
    const z_top = layer.topDepth_m + i * dz;
    const z_mid = z_top + dz / 2;

    // Compute σ'v0 at this sublayer's mid-depth
    let sigma_v0_prime_i = sigma_v0_prime_kPa;
    if (profile) {
      sigma_v0_prime_i = computeEffectiveVerticalStress({ profile, depth_m: z_mid, wtSource });
    }

    // Compute Δσ at this sublayer's mid-depth
    let delta_sigma_i = delta_sigma_kPa;
    if (deltaSigmaFn) {
      delta_sigma_i = deltaSigmaFn(z_mid);
    }

    const sigma_v0_final = sigma_v0_prime_i + delta_sigma_i;
    const sigma_p = layer.sigmaP_kPa;

    let S_m = 0;
    let case_type = '';

    if (sigma_v0_prime_i >= sigma_p) {
      // Normally Consolidated (NC)
      // Source: Terzaghi & Peck (1967), Das (2010) Eq. 11.30
      S_m = (layer.Cc / (1 + layer.e0)) * dz * Math.log10(sigma_v0_final / sigma_v0_prime_i);
      case_type = 'NC';
    } else if (sigma_v0_final <= sigma_p) {
      // Overconsolidated (OC), stays below preconsolidation
      // Source: Terzaghi & Peck (1967), Das (2010) Eq. 11.31
      S_m = (layer.Cr / (1 + layer.e0)) * dz * Math.log10(sigma_v0_final / sigma_v0_prime_i);
      case_type = 'OC_below';
    } else {
      // Overconsolidated (OC), crosses preconsolidation
      // Source: Terzaghi & Peck (1967), Das (2010) Eq. 11.32
      S_m = (layer.Cr / (1 + layer.e0)) * dz * Math.log10(sigma_p / sigma_v0_prime_i)
            + (layer.Cc / (1 + layer.e0)) * dz * Math.log10(sigma_v0_final / sigma_p);
      case_type = 'OC_crossing';
    }

    total_S_m += S_m;
    sublayers.push({
      index: i,
      z_top_m: z_top,
      z_mid_m: z_mid,
      dz_m: dz,
      sigma_v0_prime_kPa: sigma_v0_prime_i,
      delta_sigma_kPa: delta_sigma_i,
      sigma_v0_final_kPa: sigma_v0_final,
      sigma_p_kPa: sigma_p,
      case_type,
      S_m,
      S_mm: S_m * 1000
    });
  }

  return {
    S_m: total_S_m,
    S_mm: total_S_m * 1000,
    n_sublayers,
    max_sublayer_thickness_m,
    sublayers
  };
}

/**
 * Computes total consolidation settlement for entire profile (consolidating layers)
 * Uses boussinesq stress distribution at each sublayer mid-depth
 * Includes clay, silt, peat, and organic layers
 *
 * @param {Object} params
 * @param {import('./models.js').SoilProfile} params.profile - Soil profile
 * @param {import('./models.js').Footing} params.footing - Footing for geometry
 * @param {number} params.q_net_kPa - Net applied pressure (kPa)
 * @param {string} [params.wtSource='design'] - Water table source
 * @param {number} [params.max_sublayer_thickness_m=0.5] - Max sublayer thickness (m)
 * @returns {Object} Total settlement with per-layer breakdown
 */
function computeTotalConsolidationSettlement({
  profile,
  footing,
  q_net_kPa,
  wtSource = 'design',
  max_sublayer_thickness_m = 0.5
}) {
  let total_S_m = 0;
  const layerResults = [];

  profile.layers.forEach((layer, i) => {
    // Include clay, silt, peat, and organic as consolidating layers
    const isConsolidatingLayer = ['clay', 'silt', 'peat', 'organic'].includes(layer.soilType);
    
    if (isConsolidatingLayer) {
      if (layer.e0 !== undefined && layer.Cc !== undefined && layer.Cr !== undefined && layer.sigmaP_kPa !== undefined) {
        // Delta sigma function using Boussinesq at each z_mid
        const deltaSigmaFn = (z_mid_m) => {
          const z_from_base = z_mid_m - footing.Df_m;
          if (z_from_base <= 0) return 0;
          return boussinesq({
            q_kPa: q_net_kPa,
            B_m: footing.B_m,
            L_m: footing.L_m,
            z_m: z_from_base,
            shape: footing.shape
          });
        };

        const result = computeConsolidationSettlement({
          layer,
          sigma_v0_prime_kPa: 0, // Will be overridden by profile
          delta_sigma_kPa: 0,    // Will be overridden by deltaSigmaFn
          profile,
          wtSource,
          deltaSigmaFn,
          max_sublayer_thickness_m
        });

        total_S_m += result.S_m;
        layerResults.push({
          layerIndex: i,
          ...result
        });
      } else {
        layerResults.push({
          layerIndex: i,
          S_m: 0,
          S_mm: 0,
          note: 'Missing consolidation parameters'
        });
      }
    } else {
      layerResults.push({
        layerIndex: i,
        S_m: 0,
        S_mm: 0,
        note: 'Non-consolidating layer'
      });
    }
  });

  return {
    S_m: total_S_m,
    S_mm: total_S_m * 1000,
    layerResults
  };
}

// ============================================================================
// TIME-SETTLEMENT CURVE
// ============================================================================

/**
 * Generates time-settlement curve S(t) for a clay layer
 *
 * S(t) = U(Tv) * S_final
 * Tv = cv * t / Hdr²
 * Hdr = H (single drainage) or H/2 (double drainage)
 *
 * Source: Terzaghi (1943) "Theoretical Soil Mechanics", Chapter 12
 * Also: IS 8009 (Part 1):1976
 *
 * @param {Object} params
 * @param {number} params.S_final_m - Final consolidation settlement (m)
 * @param {number} params.cv_m2s - Coefficient of consolidation (m²/s)
 * @param {number} params.H_m - Layer thickness (m)
 * @param {string} [params.drainage='double'] - 'single' | 'double'
 * @param {number[]} [params.times_s] - Time array in seconds (optional)
 * @returns {Object} Time-settlement data
 */
function generateTimeSettlementCurve({
  S_final_m,
  cv_m2s,
  H_m,
  drainage = 'double',
  times_s = []
}) {
  if (S_final_m <= 0 || cv_m2s <= 0 || H_m <= 0) {
    return { times_s: [], S_m: [], S_mm: [], U: [] };
  }

  // Default time array if not provided: log-spaced from 1 day to 100 years
  if (times_s.length === 0) {
    const t_min = 24 * 3600; // 1 day
    const t_max = 100 * 365.25 * 24 * 3600; // 100 years
    const n_points = 50;
    for (let i = 0; i < n_points; i++) {
      const log_t = Math.log10(t_min) + i * (Math.log10(t_max) - Math.log10(t_min)) / (n_points - 1);
      times_s.push(Math.pow(10, log_t));
    }
  }

  const Hdr = drainage === 'single' ? H_m : H_m / 2;

  const results = times_s.map(t => {
    const Tv = cv_m2s * t / (Hdr * Hdr);
    const U = getDegreeOfConsolidation(Tv);
    return {
      t_s: t,
      t_days: t / 86400,
      t_years: t / (365.25 * 86400),
      Tv,
      U,
      S_m: U * S_final_m,
      S_mm: U * S_final_m * 1000
    };
  });

  return {
    Hdr_m: Hdr,
    drainage,
    cv_m2s,
    S_final_m,
    S_final_mm: S_final_m * 1000,
    data: results
  };
}

// ============================================================================
// SCHMERTMANN (1978) GRANULAR SETTLEMENT
// ============================================================================

/**
 * Schmertmann et al. (1978) strain influence factor Iz
 * Exact geometry interpolation between square/axisymmetric (L/B=1) and strip (L/B>=10)
 *
 * For strip (L/B >= 10):  Iz0 = 0.2,  z_peak = B,  z_influence = 4B
 * For square/circle (L/B = 1): Iz0 = 0.1,  z_peak = B/2, z_influence = 2B
 * For rectangular (1 < L/B < 10): linear interpolation on w = (min(L/B,10)-1)/9
 *
 * Iz_peak = 0.5 + 0.1 * sqrt(q_net / sigma'_vp)
 * Where sigma'_vp = effective vertical stress at z = z_peak
 *
 * Source: Schmertmann, J.H., Hartman, J.P., Brown, P.R. (1978) "Improved Strain Influence Factor Diagrams"
 * ASCE Journal of Geotechnical Engineering, Vol. 104, No. GT8
 * Also: Das (2010) Principles of Foundation Engineering, Eqs. 11.58-11.60
 *
 * @param {Object} params
 * @param {number} params.z_m - Depth from footing base (m)
 * @param {number} params.B_m - Footing width (m)
 * @param {number} params.L_m - Footing length (m) - optional, default B_m
 * @param {number} params.q_net_kPa - Net applied pressure (kPa)
 * @param {number} params.sigma_vp_prime_kPa - Effective stress at peak Iz depth (kPa)
 * @param {string} params.shape - 'strip' | 'square' | 'rectangular' | 'circular'
 * @returns {number} Iz value (0 to Iz_peak)
 */
function schmertmannIz({ z_m, B_m, L_m = B_m, q_net_kPa, sigma_vp_prime_kPa, shape }) {
  // Guard against invalid inputs
  if (z_m <= 0) return 0.1;
  if (q_net_kPa <= 0 || B_m <= 0) return 0;
  if (!Number.isFinite(sigma_vp_prime_kPa) || sigma_vp_prime_kPa <= 0) return 0;

  // Geometry factor w: 0 for square/circle (L/B=1), 1 for strip (L/B>=10)
  let w = 0;
  if (shape === 'strip') {
    w = 1;
  } else if (shape === 'rectangular') {
    const L_over_B = Math.min(Math.max(L_m / B_m, 1), 10);
    w = (L_over_B - 1) / 9; // 0 <= w <= 1
  }
  // square and circular: w = 0

  // Initial Iz value at z = 0
  const Iz0 = 0.1 + 0.1 * w; // 0.1 for square/circle, 0.2 for strip

  // Peak depth and influence depth
  const z_peak = (B_m / 2) * (1 + w);        // B/2 for square/circle, B for strip
  const z_influence = 2 * B_m * (1 + w);      // 2B for square/circle, 4B for strip

  if (z_m >= z_influence) return 0;

  // Peak Iz
  // Source: Schmertmann et al. (1978)
  const Iz_peak = 0.5 + 0.1 * Math.sqrt(q_net_kPa / sigma_vp_prime_kPa);

  // Linear interpolation
  if (z_m <= z_peak) {
    // Rising branch: Iz0 to Iz_peak
    return Iz0 + (Iz_peak - Iz0) * (z_m / z_peak);
  } else {
    // Falling branch: Iz_peak to 0
    return Iz_peak * (1 - (z_m - z_peak) / (z_influence - z_peak));
  }
}

/**
 * Computes granular settlement by Schmertmann (1978) method
 * Exact geometry interpolation between square/axisymmetric and strip
 *
 * S = C1 * C2 * Δq * Σ (Iz * dz / Es)
 *
 * C1 = max(0.5, 1 - 0.5 * (σ'v0 / Δq))  (embedment correction, clamped to ≥0.5)
 * C2 = max(1.0, 1 + 0.2 * log10(max(0.1, t)/0.1))  (creep correction, clamped to ≥1.0)
 *
 * Source: Schmertmann et al. (1978)
 * Also: Das (2010) Principles of Foundation Engineering, Eqs. 11.61-11.63
 *
 * @param {Object} params
 * @param {import('./models.js').SoilProfile} params.profile - Soil profile (sand layers only)
 * @param {number} params.B_m - Footing width (m)
 * @param {number} params.L_m - Footing length (m) - optional, default B_m
 * @param {number} params.q_net_kPa - Net applied pressure (kPa)
 * @param {number} params.Df_m - Embedment depth (m)
 * @param {number} params.gamma_kNm3 - Unit weight for overburden (kN/m³)
 * @param {string} params.shape - 'strip' | 'square' | 'rectangular' | 'circular'
 * @param {number} [params.time_years=0.1] - Time for creep correction (years)
 * @param {number} [params.max_sublayer_thickness_m=0.5] - Max sublayer thickness (m)
 * @param {string} [params.wtSource='design'] - Water table source
 * @returns {Object} Settlement result with sublayer breakdown
 */
function computeSchmertmannSettlement({
  profile,
  B_m,
  L_m = B_m,
  q_net_kPa,
  Df_m,
  gamma_kNm3,
  shape,
  time_years = 0.1,
  max_sublayer_thickness_m = 0.5,
  wtSource = 'design'
}) {
  if (q_net_kPa <= 0 || B_m <= 0) {
    return { S_m: 0, S_mm: 0, sublayers: [] };
  }

  // Geometry factor w for shape
  let w = 0;
  if (shape === 'strip') {
    w = 1;
  } else if (shape === 'rectangular') {
    const L_over_B = Math.min(Math.max(L_m / B_m, 1), 10);
    w = (L_over_B - 1) / 9;
  }

  // Peak depth and influence depth
  const z_peak = (B_m / 2) * (1 + w);
  const z_influence = 2 * B_m * (1 + w);

  // Effective stress at peak depth
  const sigma_vp_prime_kPa = computeEffectiveVerticalStress({
    profile,
    depth_m: Df_m + z_peak,
    wtSource
  });

  // C1 - embedment correction, clamped to ≥ 0.5
  // Source: Schmertmann et al. (1978)
  const sigma_v0_prime_Df = computeEffectiveVerticalStress({ profile, depth_m: Df_m, wtSource });
  const C1 = Math.max(0.5, 1 - 0.5 * (sigma_v0_prime_Df / q_net_kPa));

  // C2 - creep correction, clamped to ≥ 1.0
  // Source: Schmertmann et al. (1978)
  const C2 = Math.max(1.0, 1 + 0.2 * Math.log10(Math.max(0.1, time_years) / 0.1));

  const missingStiffness = [];
  // Process sand layers within influence depth
  let total_S_m = 0;
  const sublayers = [];

  profile.layers.forEach((layer, layerIndex) => {
    if (layer.soilType !== 'sand' && layer.soilType !== 'gravel') return;

    const layerTop = Math.max(layer.topDepth_m, Df_m);
    const layerBottom = Math.min(layer.bottomDepth_m, Df_m + z_influence);

    if (layerTop >= layerBottom) return;
    if (!(layer.Es_kPa > 0)) {
      missingStiffness.push(layerIndex);
      return;
    }

    const layerThickness = layerBottom - layerTop;
    const n_sublayers = Math.ceil(layerThickness / max_sublayer_thickness_m);
    const dz = layerThickness / n_sublayers;

    for (let i = 0; i < n_sublayers; i++) {
      const z_top = layerTop + i * dz;
      const z_mid = z_top + dz / 2;
      const z_from_base = z_mid - Df_m;

      const Iz = schmertmannIz({
        z_m: z_from_base,
        B_m,
        L_m,
        q_net_kPa,
        sigma_vp_prime_kPa,
        shape
      });

      if (Iz <= 0) continue;

      const S_m = C1 * C2 * q_net_kPa * Iz * dz / layer.Es_kPa;
      total_S_m += S_m;

      sublayers.push({
        layerIndex,
        z_top_m: z_top,
        z_mid_m: z_mid,
        z_from_base_m: z_from_base,
        dz_m: dz,
        Iz,
        Es_kPa: layer.Es_kPa,
        S_m,
        S_mm: S_m * 1000
      });
    }
  });

  return {
    S_m: total_S_m,
    S_mm: total_S_m * 1000,
    C1,
    C2,
    sigma_vp_prime_kPa,
    missingStiffness,
    z_peak_m: z_peak,
    z_influence_m: z_influence,
    sublayers
  };
}

// ============================================================================
// COMBINED SETTLEMENT (Granular + Consolidation)
// ============================================================================

/**
 * Computes total settlement (immediate + consolidation)
 *
 * @param {Object} params
 * @param {import('./models.js').SoilProfile} params.profile - Soil profile
 * @param {import('./models.js').Footing} params.footing - Footing
 * @param {number} params.q_net_kPa - Net applied pressure (kPa)
 * @param {number} params.gamma_kNm3 - Unit weight for Schmertmann (kN/m³)
 * @param {number[]} params.delta_sigma_at_layer_mid_kPa - Δσ at each layer mid-depth (kPa) - kept for backward compatibility
 * @param {number} [params.time_years=0.1] - Time for Schmertmann creep
 * @param {string} [params.wtSource='design'] - Water table source
 * @param {number} [params.max_sublayer_thickness_m=0.5] - Max sublayer thickness
 * @param {string} [params.drainage='double'] - 'single' | 'double' drainage for time-settlement
 * @returns {Object} Combined settlement result
 */
function computeTotalSettlement({
  profile,
  footing,
  q_net_kPa,
  gamma_kNm3,
  delta_sigma_at_layer_mid_kPa,
  time_years = 0.1,
  wtSource = 'design',
  max_sublayer_thickness_m = 0.5,
  drainage = 'double'
}) {
  // Granular settlement (Schmertmann) - pass L_m
  const granular = computeSchmertmannSettlement({
    profile,
    B_m: footing.B_m,
    L_m: footing.L_m,
    q_net_kPa,
    Df_m: footing.Df_m,
    gamma_kNm3,
    shape: footing.shape,
    time_years,
    max_sublayer_thickness_m,
    wtSource
  });

  // Consolidation settlement (uses boussinesq at each sublayer mid-depth)
  const consolidation = computeTotalConsolidationSettlement({
    profile,
    footing,
    q_net_kPa,
    wtSource,
    max_sublayer_thickness_m
  });

  // Time-settlement for consolidation - pass drainage parameter
  const consolidationCurves = [];
  consolidation.layerResults.forEach(lr => {
    if (lr.S_m > 0 && lr.sublayers && lr.sublayers.length > 0) {
      // Use average cv from layer
      const layer = profile.layers[lr.layerIndex];
      if (layer.cv_m2s && layer.cv_m2s > 0) {
        const H_m = layer.bottomDepth_m - layer.topDepth_m;
        const curve = generateTimeSettlementCurve({
          S_final_m: lr.S_m,
          cv_m2s: layer.cv_m2s,
          H_m,
          drainage // Pass drainage parameter
        });
        consolidationCurves.push({
          layerIndex: lr.layerIndex,
          ...curve
        });
      }
    }
  });

  const complete = !(granular.missingStiffness?.length) && !consolidation.layerResults.some(
    row => row.note === 'Missing consolidation parameters' && profile.layers[row.layerIndex].bottomDepth_m > footing.Df_m
  );
  return {
    complete,
    S_immediate_m: granular.S_m,
    S_immediate_mm: granular.S_mm,
    S_consolidation_m: consolidation.S_m,
    S_consolidation_mm: consolidation.S_mm,
    S_total_m: granular.S_m + consolidation.S_m,
    S_total_mm: (granular.S_m + consolidation.S_m) * 1000,
    granular,
    consolidation,
    consolidationCurves
  };
}

export {
  getDegreeOfConsolidation,
  getTimeFactor,
  computeConsolidationSettlement,
  computeTotalConsolidationSettlement,
  generateTimeSettlementCurve,
  schmertmannIz,
  computeSchmertmannSettlement,
  computeTotalSettlement
};