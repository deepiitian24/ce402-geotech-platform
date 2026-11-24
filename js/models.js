/**
 * CE 402 Geotechnical Engineering Platform - Shared Data Models
 * Pure ES Module JavaScript, strict SI units (kN, kPa, m, mm)
 * All engineering equations must cite exact source above the equation
 */

// ============================================================================
// CONSTANTS
// ============================================================================

/** Unit weight of water (kN/m³) - standard value */
export const GAMMA_W = 9.81;

// ============================================================================
// SOIL LAYER MODEL
// ============================================================================

/**
 * Valid soil type identifiers
 * @readonly
 * @enum {string}
 */
export const SoilType = {
  CLAY: 'clay',
  SILT: 'silt',
  SAND: 'sand',
  GRAVEL: 'gravel',
  PEAT: 'peat',
  FILL: 'fill',
  ROCK: 'rock',
  ORGANIC: 'organic'
};

/**
 * SoilLayer data structure
 * @typedef {Object} SoilLayer
 * @property {number} topDepth_m - Top depth of layer (m, >= 0)
 * @property {number} bottomDepth_m - Bottom depth of layer (m, > topDepth_m)
 * @property {string} soilType - One of SoilType values
 * @property {number} gammaMoist_kNm3 - Moist unit weight (kN/m³, > 0)
 * @property {number} gammaSat_kNm3 - Saturated unit weight (kN/m³, > gammaMoist_kNm3)
 * @property {number} cPrime_kPa - Effective cohesion (kPa, >= 0)
 * @property {number} phiDeg - Effective friction angle (degrees, >= 0)
 * @property {number} [su_kPa] - Undrained shear strength (kPa, >= 0, for clays)
 * @property {number} [Es_kPa] - Young's modulus / secant modulus (kPa, > 0)
 * @property {number} [e0] - Initial void ratio (>= 0)
 * @property {number} [Cc] - Compression index (>= 0)
 * @property {number} [Cr] - Recompression index (>= 0, <= Cc)
 * @property {number} [sigmaP_kPa] - Preconsolidation pressure (kPa, > 0)
 * @property {number} [cv_m2s] - Coefficient of consolidation (m²/s, > 0)
 */

/**
 * Validates a SoilLayer object
 * @param {SoilLayer} layer - Layer to validate
 * @returns {{valid: boolean, errors: string[]}} Validation result
 */
export function validateSoilLayer(layer) {
  const errors = [];

  if (!layer || typeof layer !== 'object') {
    errors.push('Layer must be an object');
    return { valid: false, errors };
  }

  // Required fields
  const required = [
    'topDepth_m', 'bottomDepth_m', 'soilType',
    'gammaMoist_kNm3', 'gammaSat_kNm3', 'cPrime_kPa', 'phiDeg'
  ];

  for (const field of required) {
    if (layer[field] === undefined || layer[field] === null) {
      errors.push(`Missing required field: ${field}`);
    }
  }

  if (errors.length > 0) return { valid: false, errors };

  // Type and range checks
  if (typeof layer.topDepth_m !== 'number' || layer.topDepth_m < 0) {
    errors.push('topDepth_m must be a number >= 0');
  }

  if (typeof layer.bottomDepth_m !== 'number' || layer.bottomDepth_m <= layer.topDepth_m) {
    errors.push('bottomDepth_m must be a number > topDepth_m');
  }

  if (!Object.values(SoilType).includes(layer.soilType)) {
    errors.push(`soilType must be one of: ${Object.values(SoilType).join(', ')}`);
  }

  if (typeof layer.gammaMoist_kNm3 !== 'number' || layer.gammaMoist_kNm3 <= 0) {
    errors.push('gammaMoist_kNm3 must be a number > 0');
  }

  if (typeof layer.gammaSat_kNm3 !== 'number' || layer.gammaSat_kNm3 < layer.gammaMoist_kNm3) {
    errors.push('gammaSat_kNm3 must be a number >= gammaMoist_kNm3');
  }

  if (typeof layer.cPrime_kPa !== 'number' || layer.cPrime_kPa < 0) {
    errors.push('cPrime_kPa must be a number >= 0');
  }

  if (typeof layer.phiDeg !== 'number' || layer.phiDeg < 0 || layer.phiDeg > 90) {
    errors.push('phiDeg must be a number in [0, 90]');
  }

  // Optional fields validation
  if (layer.su_kPa !== undefined) {
    if (typeof layer.su_kPa !== 'number' || layer.su_kPa < 0) {
      errors.push('su_kPa must be a number >= 0');
    }
  }

  if (layer.Es_kPa !== undefined) {
    if (typeof layer.Es_kPa !== 'number' || layer.Es_kPa <= 0) {
      errors.push('Es_kPa must be a number > 0');
    }
  }

  if (layer.e0 !== undefined) {
    if (typeof layer.e0 !== 'number' || layer.e0 < 0) {
      errors.push('e0 must be a number >= 0');
    }
  }

  if (layer.Cc !== undefined) {
    if (typeof layer.Cc !== 'number' || layer.Cc < 0) {
      errors.push('Cc must be a number >= 0');
    }
  }

  if (layer.Cr !== undefined) {
    if (typeof layer.Cr !== 'number' || layer.Cr < 0) {
      errors.push('Cr must be a number >= 0');
    }
    if (layer.Cc !== undefined && layer.Cr > layer.Cc) {
      errors.push('Cr must be <= Cc');
    }
  }

  if (layer.sigmaP_kPa !== undefined) {
    if (typeof layer.sigmaP_kPa !== 'number' || layer.sigmaP_kPa <= 0) {
      errors.push('sigmaP_kPa must be a number > 0');
    }
  }

  if (layer.cv_m2s !== undefined) {
    if (typeof layer.cv_m2s !== 'number' || layer.cv_m2s <= 0) {
      errors.push('cv_m2s must be a number > 0');
    }
  }

  return { valid: errors.length === 0, errors };
}

/**
 * Creates a validated SoilLayer (throws on invalid)
 * @param {SoilLayer} layer - Layer data
 * @returns {SoilLayer} Validated layer
 */
export function createSoilLayer(layer) {
  const result = validateSoilLayer(layer);
  if (!result.valid) {
    throw new Error(`Invalid SoilLayer: ${result.errors.join('; ')}`);
  }
  return { ...layer };
}

// ============================================================================
// SOIL PROFILE MODEL
// ============================================================================

/**
 * SoilProfile data structure
 * @typedef {Object} SoilProfile
 * @property {SoilLayer[]} layers - Array of soil layers (must be contiguous, no gaps)
 * @property {number} measuredWT_m - Measured water table depth (m, >= 0)
 * @property {number} designWT_m - Design water table depth (m, >= 0)
 */

/**
 * Validates a SoilProfile object
 * @param {SoilProfile} profile - Profile to validate
 * @returns {{valid: boolean, errors: string[]}} Validation result
 */
export function validateSoilProfile(profile) {
  const errors = [];

  if (!profile || typeof profile !== 'object') {
    errors.push('Profile must be an object');
    return { valid: false, errors };
  }

  if (!Array.isArray(profile.layers) || profile.layers.length === 0) {
    errors.push('layers must be a non-empty array');
    return { valid: false, errors };
  }

  // Validate each layer
  for (let i = 0; i < profile.layers.length; i++) {
    const layerResult = validateSoilLayer(profile.layers[i]);
    if (!layerResult.valid) {
      errors.push(`Layer ${i}: ${layerResult.errors.join('; ')}`);
    }
  }

  // Check first layer starts at 0 m
  if (Math.abs(profile.layers[0].topDepth_m) > 1e-6) {
    errors.push('First layer must start at 0 m');
  }

  // Check layer continuity (no gaps, no overlaps)
  for (let i = 1; i < profile.layers.length; i++) {
    const prev = profile.layers[i - 1];
    const curr = profile.layers[i];
    if (Math.abs(curr.topDepth_m - prev.bottomDepth_m) > 1e-6) {
      errors.push(`Gap/overlap between layer ${i - 1} bottom (${prev.bottomDepth_m}m) and layer ${i} top (${curr.topDepth_m}m)`);
    }
  }

  // Water table validation
  if (typeof profile.measuredWT_m !== 'number' || profile.measuredWT_m < 0) {
    errors.push('measuredWT_m must be a number >= 0');
  }

  if (typeof profile.designWT_m !== 'number' || profile.designWT_m < 0) {
    errors.push('designWT_m must be a number >= 0');
  }

  return { valid: errors.length === 0, errors };
}

/**
 * Creates a validated SoilProfile (throws on invalid)
 * @param {SoilProfile} profile - Profile data
 * @returns {SoilProfile} Validated profile
 */
export function createSoilProfile(profile) {
  const result = validateSoilProfile(profile);
  if (!result.valid) {
    throw new Error(`Invalid SoilProfile: ${result.errors.join('; ')}`);
  }
  return { ...profile, layers: profile.layers.map(l => ({ ...l })) };
}

// ============================================================================
// FOOTING MODEL
// ============================================================================

/**
 * Valid footing shape identifiers
 * @readonly
 * @enum {string}
 */
export const FootingShape = {
  STRIP: 'strip',
  SQUARE: 'square',
  RECTANGULAR: 'rectangular',
  CIRCULAR: 'circular'
};

/**
 * Footing data structure
 * @typedef {Object} Footing
 * @property {string} shape - One of FootingShape values
 * @property {number} B_m - Width / diameter (m, > 0)
 * @property {number} L_m - Length (m, > 0; for strip/circular, L_m === B_m)
 * @property {number} Df_m - Embedment depth (m, >= 0)
 * @property {number} loadV_kN - Vertical load (kN, > 0)
 * @property {number} [loadH_kN] - Horizontal load (kN, >= 0, default 0)
 * @property {number} [Mx_kNm] - Moment about X-axis (kNm, default 0)
 * @property {number} [My_kNm] - Moment about Y-axis (kNm, default 0)
 * @property {number} [fos] - Factor of safety (>= 1, default 3.0)
 */

/**
 * Validates a Footing object
 * @param {Footing} footing - Footing to validate
 * @returns {{valid: boolean, errors: string[]}} Validation result
 */
export function validateFooting(footing) {
  const errors = [];

  if (!footing || typeof footing !== 'object') {
    errors.push('Footing must be an object');
    return { valid: false, errors };
  }

  // Required fields
  const required = ['shape', 'B_m', 'L_m', 'Df_m', 'loadV_kN'];
  for (const field of required) {
    if (footing[field] === undefined || footing[field] === null) {
      errors.push(`Missing required field: ${field}`);
    }
  }

  if (errors.length > 0) return { valid: false, errors };

  if (!Object.values(FootingShape).includes(footing.shape)) {
    errors.push(`shape must be one of: ${Object.values(FootingShape).join(', ')}`);
  }

  if (typeof footing.B_m !== 'number' || footing.B_m <= 0) {
    errors.push('B_m must be a number > 0');
  }

  if (typeof footing.L_m !== 'number' || footing.L_m <= 0) {
    errors.push('L_m must be a number > 0');
  }

  if (typeof footing.Df_m !== 'number' || footing.Df_m < 0) {
    errors.push('Df_m must be a number >= 0');
  }

  if (typeof footing.loadV_kN !== 'number' || footing.loadV_kN <= 0) {
    errors.push('loadV_kN must be a number > 0');
  }

  // Shape-specific checks
  // For square and circular footings, L_m must equal B_m
  // For strip footings, L_m is the length perpendicular to cross-section (can be different)
  // For rectangular footings, L_m and B_m are independent
  if (footing.shape === FootingShape.SQUARE || footing.shape === FootingShape.CIRCULAR) {
    if (Math.abs(footing.L_m - footing.B_m) > 1e-6) {
      errors.push(`For ${footing.shape} footing, L_m must equal B_m`);
    }
  }

  // Optional fields
  if (footing.loadH_kN !== undefined) {
    if (typeof footing.loadH_kN !== 'number' || footing.loadH_kN < 0) {
      errors.push('loadH_kN must be a number >= 0');
    }
  }

  if (footing.Mx_kNm !== undefined && typeof footing.Mx_kNm !== 'number') {
    errors.push('Mx_kNm must be a number');
  }

  if (footing.My_kNm !== undefined && typeof footing.My_kNm !== 'number') {
    errors.push('My_kNm must be a number');
  }

  if (footing.fos !== undefined) {
    if (typeof footing.fos !== 'number' || footing.fos < 1) {
      errors.push('fos must be a number >= 1');
    }
  }

  return { valid: errors.length === 0, errors };
}

/**
 * Creates a validated Footing with defaults (throws on invalid)
 * @param {Footing} footing - Footing data
 * @returns {Footing} Validated footing with defaults applied
 */
export function createFooting(footing) {
  const result = validateFooting(footing);
  if (!result.valid) {
    throw new Error(`Invalid Footing: ${result.errors.join('; ')}`);
  }
  return {
    ...footing,
    loadH_kN: footing.loadH_kN ?? 0,
    Mx_kNm: footing.Mx_kNm ?? 0,
    My_kNm: footing.My_kNm ?? 0,
    fos: footing.fos ?? 3.0
  };
}

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

/**
 * Deep clones an object (for immutability)
 * @template T
 * @param {T} obj - Object to clone
 * @returns {T} Cloned object
 */
export function clone(obj) {
  return JSON.parse(JSON.stringify(obj));
}

/**
 * Linear interpolation
 * @param {number} x - Input value
 * @param {number} x0 - Lower bound
 * @param {number} x1 - Upper bound
 * @param {number} y0 - Lower output
 * @param {number} y1 - Upper output
 * @returns {number} Interpolated value
 */
export function lerp(x, x0, x1, y0, y1) {
  if (x1 === x0) return y0;
  return y0 + (y1 - y0) * (x - x0) / (x1 - x0);
}