/**
 * CE 402 Geotechnical Engineering Platform - Stress Distribution (P4)
 * Pure ES Module JavaScript, strict SI units (kN, kPa, m)
 * All engineering equations cite exact source
 */

// ============================================================================
// BOUSSINESQ VERTICAL STRESS - CORNER OF RECTANGLE (Newmark 1935)
// ============================================================================

/**
 * Boussinesq vertical stress increase Δσz below corner of uniformly loaded rectangle
 * Closed-form solution (Newmark 1935)
 *
 * Source: Newmark (1935) "Influence Charts for Computation of Stresses in Elastic Foundations"
 * Also: Das (2010) Principles of Foundation Engineering, Eq. 10.15
 * Also: Poulos & Davis (1974) Elastic Solutions for Soil and Rock Mechanics
 *
 * Δσz = (q / 2π) * [ (m*n / sqrt(m²+n²+1)) * (1/(m²+n²+1) + 1/(m²+n²+2)) + arctan( (m*n) / (sqrt(m²+n²+1) * (m²+n²+1 - m*n)) ) ]
 * where m = B/z, n = L/z
 *
 * Alternative form (more numerically stable):
 * I = (1/4π) * [ 2mn√(m²+n²+1)/(m²+n²+1+m²n²) * (m²+n²+2)/(m²+n²+1) + arctan(2mn√(m²+n²+1)/(m²+n²+1-m²n²)) ]
 * Δσz = q * I
 *
 * @param {Object} params
 * @param {number} params.q_kPa - Uniform pressure (kPa)
 * @param {number} params.B_m - Width of rectangle (m)
 * @param {number} params.L_m - Length of rectangle (m)
 * @param {number} params.z_m - Depth below corner (m)
 * @returns {number} Δσz (kPa)
 */
export function boussinesqCorner({ q_kPa, B_m, L_m, z_m }) {
  if (z_m <= 0) {
    // At or above surface - return full pressure
    return q_kPa;
  }
  if (q_kPa <= 0 || B_m <= 0 || L_m <= 0) {
    return 0;
  }

  const m = B_m / z_m;
  const n = L_m / z_m;

  const m2 = m * m;
  const n2 = n * n;
  const mn = m * n;
  const mn2 = mn * mn;

  const denom1 = m2 + n2 + 1;
  const denom2 = m2 + n2 + 2;
  const sqrtDenom1 = Math.sqrt(denom1);

  // First term: (2mn/√(m²+n²+1)) * (m²+n²+2)/(m²+n²+1+m²n²)
  const term1_num = 2 * mn * sqrtDenom1;
  const term1_den = denom1 + mn2;
  const term1 = term1_num / term1_den * (denom2 / denom1);

  // Second term: arctan(2mn√(m²+n²+1)/(m²+n²+1-m²n²))
  const term2_num = 2 * mn * sqrtDenom1;
  const term2_den = denom1 - mn2;
  let term2;
  if (term2_den === 0) {
    term2 = Math.PI / 2;
  } else if (term2_den < 0) {
    term2 = Math.PI + Math.atan(term2_num / term2_den);
  } else {
    term2 = Math.atan(term2_num / term2_den);
  }

  // Influence factor I
  const I = (1 / (4 * Math.PI)) * (term1 + term2);

  return q_kPa * I;
}

/**
 * Boussinesq vertical stress increase Δσz below CENTRE of uniformly loaded rectangle
 * By superposition of 4 sub-rectangles (each B/2 × L/2)
 *
 * Δσz_centre = 4 * Δσz_corner(q, B/2, L/2, z)
 *
 * Source: Newmark (1935), superposition principle
 * Also: Das (2010) Principles of Foundation Engineering
 *
 * @param {Object} params
 * @param {number} params.q_kPa - Uniform pressure (kPa)
 * @param {number} params.B_m - Width of rectangle (m)
 * @param {number} params.L_m - Length of rectangle (m)
 * @param {number} params.z_m - Depth below centre (m)
 * @returns {number} Δσz (kPa)
 */
export function boussinesqCentre({ q_kPa, B_m, L_m, z_m }) {
  if (z_m <= 0) return q_kPa;
  if (q_kPa <= 0 || B_m <= 0 || L_m <= 0) return 0;

  return 4 * boussinesqCorner({
    q_kPa,
    B_m: B_m / 2,
    L_m: L_m / 2,
    z_m
  });
}

/**
 * Boussinesq vertical stress increase Δσz below centre of uniformly loaded CIRCULAR area
 * Closed-form: Δσz = q * [1 - 1/(1 + (R/z)²)^(3/2)]
 *
 * Source: Boussinesq (1885), also Das (2010) Eq. 10.19
 *
 * @param {Object} params
 * @param {number} params.q_kPa - Uniform pressure (kPa)
 * @param {number} params.R_m - Radius of circle (m)
 * @param {number} params.z_m - Depth below centre (m)
 * @returns {number} Δσz (kPa)
 */
export function boussinesqCircle({ q_kPa, R_m, z_m }) {
  if (z_m <= 0) return q_kPa;
  if (q_kPa <= 0 || R_m <= 0) return 0;

  const ratio = R_m / z_m;
  const I = 1 - 1 / Math.pow(1 + ratio * ratio, 1.5);
  return q_kPa * I;
}

/**
 * Boussinesq vertical stress increase Δσz below centre of uniformly loaded STRIP footing
 * Closed-form: Δσz = (2q/π) * [α + sin(α)cos(α+2δ)] where geometry dependent
 * Or use: I = (2/π) * (α + sin α cos(α + 2δ))
 * For strip of width B, at depth z, below centre:
 * α = arctan(B/2z), δ = 0 (under centre)
 * Δσz = (2q/π) * [α + sin(α)cos(α)] = (2q/π) * [α + 0.5*sin(2α)]
 *
 * Source: Boussinesq (1885), also Poulos & Davis (1974)
 *
 * @param {Object} params
 * @param {number} params.q_kPa - Uniform pressure (kPa)
 * @param {number} params.B_m - Width of strip (m)
 * @param {number} params.z_m - Depth below centre (m)
 * @returns {number} Δσz (kPa)
 */
export function boussinesqStrip({ q_kPa, B_m, z_m }) {
  if (z_m <= 0) return q_kPa;
  if (q_kPa <= 0 || B_m <= 0) return 0;

  const alpha = Math.atan(B_m / (2 * z_m));
  const I = (2 / Math.PI) * (alpha + Math.sin(alpha) * Math.cos(alpha));
  return q_kPa * I;
}

/**
 * Generic Boussinesq for any shape using corner superposition
 * For strip: use B/2, L (very large), take centre
 * For rectangle/square/circle: use boussinesqCentre or boussinesqCircle
 *
 * @param {Object} params
 * @param {number} params.q_kPa - Uniform pressure (kPa)
 * @param {number} params.B_m - Width (m)
 * @param {number} params.L_m - Length (m) (for strip, use large number)
 * @param {number} params.z_m - Depth (m)
 * @param {string} params.shape - 'strip' | 'square' | 'rectangular' | 'circular'
 * @returns {number} Δσz (kPa)
 */
export function boussinesq({ q_kPa, B_m, L_m, z_m, shape }) {
  switch (shape) {
    case 'strip':
      return boussinesqStrip({ q_kPa, B_m, z_m });
    case 'circular':
      return boussinesqCircle({ q_kPa, R_m: B_m / 2, z_m });
    case 'square':
    case 'rectangular':
    default:
      return boussinesqCentre({ q_kPa, B_m, L_m, z_m });
  }
}

// ============================================================================
// 2:1 STRESS DISTRIBUTION METHOD
// ============================================================================

/**
 * 2:1 (vertical:horizontal) stress distribution method
 * Δσz = q * B * L / ((B + z) * (L + z))
 * For strip: Δσz = q * B / (B + z)
 * For circle: Δσz = q * D² / (D + z)²
 *
 * Source: Approximate method, commonly used in practice
 * Also: Terzaghi & Peck (1967), Bowles (1996)
 *
 * @param {Object} params
 * @param {number} params.q_kPa - Uniform pressure (kPa)
 * @param {number} params.B_m - Width (m)
 * @param {number} params.L_m - Length (m) (for strip, ignored)
 * @param {number} params.z_m - Depth (m)
 * @param {string} params.shape - 'strip' | 'square' | 'rectangular' | 'circular'
 * @returns {number} Δσz (kPa)
 */
export function stress2to1({ q_kPa, B_m, L_m, z_m, shape }) {
  if (z_m <= 0) return q_kPa;
  if (q_kPa <= 0 || B_m <= 0) return 0;

  switch (shape) {
    case 'strip':
      return q_kPa * B_m / (B_m + z_m);
    case 'circular':
      return q_kPa * B_m * B_m / Math.pow(B_m + z_m, 2); // B = D
    case 'square':
    case 'rectangular':
    default:
      return q_kPa * B_m * L_m / ((B_m + z_m) * (L_m + z_m));
  }
}

// ============================================================================
// STRESS PROFILE GENERATOR (for plotting)
// ============================================================================

/**
 * Generates stress vs depth profile for plotting
 *
 * @param {Object} params
 * @param {number} params.q_kPa - Uniform pressure (kPa)
 * @param {number} params.B_m - Width (m)
 * @param {number} params.L_m - Length (m)
 * @param {number} params.z_max_m - Maximum depth (m)
 * @param {number} [params.z_step_m=0.5] - Depth step (m)
 * @param {string} params.shape - 'strip' | 'square' | 'rectangular' | 'circular'
 * @param {string} [params.method='boussinesq'] - 'boussinesq' | '2to1'
 * @returns {{depths_m: number[], deltaSigma_kPa: number[]}}
 */
export function generateStressProfile({
  q_kPa,
  B_m,
  L_m,
  z_max_m,
  z_step_m = 0.5,
  shape,
  method = 'boussinesq'
}) {
  const depths_m = [];
  const deltaSigma_kPa = [];

  for (let z = z_step_m; z <= z_max_m; z += z_step_m) {
    let deltaSigma;
    if (method === '2to1') {
      deltaSigma = stress2to1({ q_kPa, B_m, L_m, z_m: z, shape });
    } else if (method === 'boussinesq_corner') {
      deltaSigma = boussinesqCorner({ q_kPa, B_m, L_m, z_m: z });
    } else {
      deltaSigma = boussinesq({ q_kPa, B_m, L_m, z_m: z, shape });
    }
    depths_m.push(z);
    deltaSigma_kPa.push(deltaSigma);
  }

  return { depths_m, deltaSigma_kPa };
}

/**
 * Computes stress at multiple specific depths
 *
 * @param {Object} params
 * @param {number} params.q_kPa - Uniform pressure (kPa)
 * @param {number} params.B_m - Width (m)
 * @param {number} params.L_m - Length (m)
 * @param {number[]} params.depths_m - Array of depths (m)
 * @param {string} params.shape - 'strip' | 'square' | 'rectangular' | 'circular'
 * @param {string} [params.method='boussinesq'] - 'boussinesq' | '2to1'
 * @returns {number[]} Array of Δσz values (kPa)
 */
export function computeStressAtDepths({
  q_kPa,
  B_m,
  L_m,
  depths_m,
  shape,
  method = 'boussinesq'
}) {
  return depths_m.map(z => {
    if (method === '2to1') {
      return stress2to1({ q_kPa, B_m, L_m, z_m: z, shape });
    }
    if (method === 'boussinesq_corner') {
      return boussinesqCorner({ q_kPa, B_m, L_m, z_m: z });
    }
    return boussinesq({ q_kPa, B_m, L_m, z_m: z, shape });
  });
}