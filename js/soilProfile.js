/**
 * CE 402 Geotechnical Engineering Platform - Soil Profile Utilities (P1)
 * Pure ES Module JavaScript, strict SI units (kN, kPa, m)
 * All engineering equations cite exact source
 */

import { GAMMA_W, validateSoilProfile, createSoilProfile, validateSoilLayer, clone, lerp } from './models.js';

/**
 * Computes effective vertical stress σ'v0 at a given depth
 * using either measured or design water table.
 *
 * Source: Basic soil mechanics - Terzaghi's effective stress principle
 * σ'v0(z) = Σ(γ_i * Δz_i) - γw * (z - WT) for z > WT
 * where γ_i = γ_moist above WT, γ_sat below WT
 *
 * @param {Object} params
 * @param {import('./models.js').SoilProfile} params.profile - Validated soil profile
 * @param {number} params.depth_m - Depth at which to compute σ'v0 (m, >= 0)
 * @param {string} [params.wtSource='design'] - 'measured' or 'design' water table
 * @returns {number} Effective vertical stress σ'v0 (kPa)
 */
export function computeEffectiveVerticalStress({ profile, depth_m, wtSource = 'design' }) {
  if (depth_m < 0) throw new Error('depth_m must be >= 0');
  const wt_m = wtSource === 'measured' ? profile.measuredWT_m : profile.designWT_m;

  let sigma_v0 = 0; // Total vertical stress (kPa)

  for (let i = 0; i < profile.layers.length; i++) {
    const layer = profile.layers[i];
    const layerTop = layer.topDepth_m;
    const layerBottom = layer.bottomDepth_m;
    const isLastLayer = (i === profile.layers.length - 1);
    const effectiveBottom = isLastLayer ? Infinity : layer.bottomDepth_m;

    // Skip layers entirely below the depth of interest
    if (layerTop >= depth_m) break;

    // Thickness of layer contributing to stress at depth_m
    const segmentTop = layerTop;
    const segmentBottom = Math.min(effectiveBottom, depth_m);
    const dz = segmentBottom - segmentTop;
    if (dz <= 0) continue;

    // Determine unit weight for THIS SEGMENT based on water table position
    if (segmentBottom <= wt_m) {
      // Entire segment above WT
      sigma_v0 += layer.gammaMoist_kNm3 * dz;
    } else if (segmentTop >= wt_m) {
      // Entire segment below WT
      sigma_v0 += layer.gammaSat_kNm3 * dz;
    } else {
      // Segment straddles WT - split into moist and saturated portions
      const dzMoist = wt_m - segmentTop;
      const dzSat = segmentBottom - wt_m;
      sigma_v0 += layer.gammaMoist_kNm3 * dzMoist;
      sigma_v0 += layer.gammaSat_kNm3 * dzSat;
    }
  }

  // Pore water pressure
  const u_kPa = depth_m > wt_m ? GAMMA_W * (depth_m - wt_m) : 0;

  // Effective stress (Terzaghi's principle)
  return sigma_v0 - u_kPa;
}

/**
 * Computes σ'v0 at mid-depth of each layer (for SPT corrections, etc.)
 * @param {import('./models.js').SoilProfile} profile - Validated soil profile
 * @param {string} [wtSource='design'] - 'measured' or 'design'
 * @returns {Array<{layerIndex: number, midDepth_m: number, sigmaV0Prime_kPa: number}>}
 */
export function computeLayerMidDepthStresses(profile, wtSource = 'design') {
  return profile.layers.map((layer, i) => {
    const midDepth = (layer.topDepth_m + layer.bottomDepth_m) / 2;
    return {
      layerIndex: i,
      midDepth_m: midDepth,
      sigmaV0Prime_kPa: computeEffectiveVerticalStress({ profile, depth_m: midDepth, wtSource })
    };
  });
}

/**
 * Generates plot-ready geometry for layered soil profile visualization
 * Returns arrays of x (depth) and y (property) coordinates for step plots
 *
 * @param {import('./models.js').SoilProfile} profile - Validated soil profile
 * @param {string} property - Property to plot: 'gammaMoist_kNm3', 'gammaSat_kNm3', 'cPrime_kPa', 'phiDeg', 'su_kPa', 'Es_kPa', 'e0', 'Cc', 'Cr', 'cv_m2s'
 * @returns {{x: number[], y: number[]}} Step-plot coordinates (x = depth, y = property)
 */
export function getLayerPropertyProfile(profile, property) {
  const validProperties = [
    'gammaMoist_kNm3', 'gammaSat_kNm3', 'cPrime_kPa', 'phiDeg',
    'su_kPa', 'Es_kPa', 'e0', 'Cc', 'Cr', 'cv_m2s'
  ];
  if (!validProperties.includes(property)) {
    throw new Error(`Unknown property: ${property}. Valid: ${validProperties.join(', ')}`);
  }

  const x = [];
  const y = [];

  for (const layer of profile.layers) {
    const value = layer[property];
    if (value === undefined) {
      // Property not defined for this layer - use NaN to create gap
      x.push(layer.topDepth_m, layer.bottomDepth_m);
      y.push(NaN, NaN);
    } else {
      // Step plot: horizontal line across layer
      x.push(layer.topDepth_m, layer.bottomDepth_m);
      y.push(value, value);
    }
  }

  return { x, y };
}

/**
 * Gets the layer at a specific depth
 * @param {import('./models.js').SoilProfile} profile - Validated soil profile
 * @param {number} depth_m - Depth (m)
 * @returns {import('./models.js').SoilLayer | null} Layer at depth or null if beyond profile
 */
export function getLayerAtDepth(profile, depth_m) {
  for (const layer of profile.layers) {
    if (depth_m >= layer.topDepth_m && depth_m < layer.bottomDepth_m) {
      return layer;
    }
  }
  // Check if exactly at bottom of last layer
  const lastLayer = profile.layers[profile.layers.length - 1];
  if (Math.abs(depth_m - lastLayer.bottomDepth_m) < 1e-6) {
    return lastLayer;
  }
  return null;
}

/**
 * Computes total vertical stress σv0 at depth (without pore pressure subtraction)
 * Uses segment-based WT handling identical to computeEffectiveVerticalStress
 * @param {import('./models.js').SoilProfile} profile - Validated soil profile
 * @param {number} depth_m - Depth (m)
 * @param {string} [wtSource='design'] - 'measured' or 'design'
 * @returns {number} Total vertical stress (kPa)
 */
export function computeTotalVerticalStress(profile, depth_m, wtSource = 'design') {
  if (depth_m < 0) throw new Error('depth_m must be >= 0');
  const wt_m = wtSource === 'measured' ? profile.measuredWT_m : profile.designWT_m;
  let sigma_v0 = 0;

  for (let i = 0; i < profile.layers.length; i++) {
    const layer = profile.layers[i];
    const layerTop = layer.topDepth_m;
    const layerBottom = layer.bottomDepth_m;
    const isLastLayer = (i === profile.layers.length - 1);
    const effectiveBottom = isLastLayer ? Infinity : layer.bottomDepth_m;

    // Skip layers entirely below the depth of interest
    if (layerTop >= depth_m) break;

    // Thickness of layer contributing to stress at depth_m
    const segmentTop = layerTop;
    const segmentBottom = Math.min(effectiveBottom, depth_m);
    const dz = segmentBottom - segmentTop;
    if (dz <= 0) continue;

    // Determine unit weight for THIS SEGMENT based on water table position
    if (segmentBottom <= wt_m) {
      // Entire segment above WT
      sigma_v0 += layer.gammaMoist_kNm3 * dz;
    } else if (segmentTop >= wt_m) {
      // Entire segment below WT
      sigma_v0 += layer.gammaSat_kNm3 * dz;
    } else {
      // Segment straddles WT - split into moist and saturated portions
      const dzMoist = wt_m - segmentTop;
      const dzSat = segmentBottom - wt_m;
      sigma_v0 += layer.gammaMoist_kNm3 * dzMoist;
      sigma_v0 += layer.gammaSat_kNm3 * dzSat;
    }
  }

  return sigma_v0;
}

/**
 * Computes pore water pressure at depth
 * @param {import('./models.js').SoilProfile} profile - Validated soil profile
 * @param {number} depth_m - Depth (m)
 * @param {string} [wtSource='design'] - 'measured' or 'design'
 * @returns {number} Pore water pressure (kPa)
 */
export function computePoreWaterPressure(profile, depth_m, wtSource = 'design') {
  const wt_m = wtSource === 'measured' ? profile.measuredWT_m : profile.designWT_m;
  return depth_m > wt_m ? GAMMA_W * (depth_m - wt_m) : 0;
}

/**
 * Validates and creates a SoilProfile from raw input
 * @param {Object} rawProfile - Raw profile data
 * @returns {import('./models.js').SoilProfile} Validated profile
 */
export function prepareSoilProfile(rawProfile) {
  return createSoilProfile(rawProfile);
}

export { GAMMA_W, validateSoilProfile, validateSoilLayer, clone, lerp };