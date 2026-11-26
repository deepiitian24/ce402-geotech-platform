/**
 * CE 402 Geotechnical Engineering Platform - Unit Tests for P3, P4, P5
 * Run with: npm test (node --test)
 */

import { describe, it, test } from 'node:test';
import assert from 'node:assert/strict';

// Import models
import {
  GAMMA_W,
  SoilType,
  FootingShape,
  createSoilLayer,
  createSoilProfile,
  createFooting
} from '../js/models.js';

// Import soilProfile
import { computeEffectiveVerticalStress } from '../js/soilProfile.js';

// Import P3 - Bearing Capacity
import {
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
} from '../js/bearingCapacity.js';

// Import P4 - Stress
import {
  boussinesqCorner,
  boussinesqCentre,
  boussinesqCircle,
  boussinesqStrip,
  boussinesq,
  stress2to1,
  generateStressProfile,
  computeStressAtDepths
} from '../js/stress.js';

// Import P5 - Settlement
import {
  getDegreeOfConsolidation,
  getTimeFactor,
  computeConsolidationSettlement,
  computeTotalConsolidationSettlement,
  generateTimeSettlementCurve,
  schmertmannIz,
  computeSchmertmannSettlement,
  computeTotalSettlement
} from '../js/settlement.js';

// ============================================================================
// TEST HELPERS
// ============================================================================

function createTestProfile() {
  return createSoilProfile({
    layers: [
      {
        topDepth_m: 0,
        bottomDepth_m: 3,
        soilType: SoilType.SAND,
        gammaMoist_kNm3: 17.5,
        gammaSat_kNm3: 19.5,
        cPrime_kPa: 0,
        phiDeg: 32,
        Es_kPa: 25000,
        e0: 0.65,
        Cc: 0.15,
        Cr: 0.03,
        sigmaP_kPa: 150,
        cv_m2s: 1e-7
      },
      {
        topDepth_m: 3,
        bottomDepth_m: 5,
        soilType: SoilType.CLAY,
        gammaMoist_kNm3: 18.0,
        gammaSat_kNm3: 20.0,
        cPrime_kPa: 0,
        phiDeg: 22,
        su_kPa: 80,
        Es_kPa: 15000,
        e0: 0.85,
        Cc: 0.35,
        Cr: 0.07,
        sigmaP_kPa: 200,
        cv_m2s: 5e-8
      },
      {
        topDepth_m: 5,
        bottomDepth_m: 15,
        soilType: SoilType.SAND,
        gammaMoist_kNm3: 18.5,
        gammaSat_kNm3: 20.5,
        cPrime_kPa: 0,
        phiDeg: 36,
        Es_kPa: 40000,
        e0: 0.55,
        Cc: 0.10,
        Cr: 0.02,
        sigmaP_kPa: 300,
        cv_m2s: 2e-7
      }
    ],
    measuredWT_m: 2.0,
    designWT_m: 1.0
  });
}

function createTestFooting(overrides = {}) {
  return createFooting({
    shape: FootingShape.SQUARE,
    B_m: 2,
    L_m: 2,
    Df_m: 1.5,
    loadV_kN: 500,
    loadH_kN: 0,
    Mx_kNm: 0,
    My_kNm: 0,
    fos: 3.0,
    ...overrides
  });
}

const profile = createTestProfile();
const footing = createTestFooting();

// ============================================================================
// P3 - BEARING CAPACITY TESTS
// ============================================================================

describe('P3 - Bearing Capacity Factors (IS 6403:1981)', () => {
  test('φ = 0: Nc=5.14, Nq=1, Nγ=0', () => {
    const { Nc, Nq, Ngamma } = computeBearingCapacityFactors(0);
    assert.equal(Nc, 5.14);
    assert.equal(Nq, 1.0);
    assert.equal(Ngamma, 0.0);
  });

  test('φ = 20°: known values', () => {
    const { Nc, Nq, Ngamma } = computeBearingCapacityFactors(20);
    // Reference: Nq ≈ 6.4, Nc ≈ 14.8, Nγ ≈ 5.4
    assert.ok(Math.abs(Nq - 6.4) < 0.2);
    assert.ok(Math.abs(Nc - 14.8) < 0.3);
    assert.ok(Math.abs(Ngamma - 5.4) < 0.5);
  });

  test('φ = 30°: known values', () => {
    const { Nc, Nq, Ngamma } = computeBearingCapacityFactors(30);
    // Reference: Nq ≈ 18.4, Nc ≈ 30.1, Nγ ≈ 22.4
    assert.ok(Math.abs(Nq - 18.4) < 0.3);
    assert.ok(Math.abs(Nc - 30.1) < 0.5);
    assert.ok(Math.abs(Ngamma - 22.4) < 0.5);
  });

  test('φ = 36°: general shear threshold', () => {
    const { Nc, Nq, Ngamma } = computeBearingCapacityFactors(36);
    assert.ok(Nq > 30);
    assert.ok(Nc > 50);
    assert.ok(Ngamma > 40);
  });

  test('φ = 40°: higher values', () => {
    const { Nc, Nq, Ngamma } = computeBearingCapacityFactors(40);
    assert.ok(Nq > 50);
  });
});

describe('P3 - Local Shear Parameters', () => {
  test('c_m = 2/3 c, tan φ_m = 2/3 tan φ', () => {
    const { c_m_kPa, phi_m_deg } = getLocalShearParameters(30, 30);
    assert.ok(Math.abs(c_m_kPa - 20) < 0.001);
    // tan(30°) = 0.577, 2/3 * 0.577 = 0.385, atan = 21.05°
    assert.ok(Math.abs(phi_m_deg - 21.05) < 0.1);
  });
});

describe('P3 - Shear Mode Selection', () => {
  test('φ ≥ 36: general shear', () => {
    const { shearModeUsed, phi_eff_deg, c_eff_kPa } = getEffectiveShearParameters(40, 30, 'auto');
    assert.equal(shearModeUsed, 'general');
    assert.equal(phi_eff_deg, 40);
    assert.equal(c_eff_kPa, 30);
  });

  test('φ ≤ 29: local shear (cohesionless soil, c-prime=0)', () => {
    const { shearModeUsed, phi_eff_deg, c_eff_kPa } = getEffectiveShearParameters(25, 0, 'auto');
    assert.equal(shearModeUsed, 'local');
    assert.ok(phi_eff_deg < 25);
    assert.ok(c_eff_kPa < 30);
  });

  test('29 < φ < 36: intermediate (cohesionless soil, c-prime=0)', () => {
    const { shearModeUsed, isIntermediate, phi_eff_deg, c_eff_kPa } = getEffectiveShearParameters(32, 0, 'auto');
    assert.equal(shearModeUsed, 'intermediate');
    assert.ok(isIntermediate);
    // Should be between local (21°) and general (32°)
    assert.ok(phi_eff_deg > 21 && phi_eff_deg < 32);
    // With c'=0, local shear c_m = 0, so c_eff = 0
    assert.ok(c_eff_kPa === 0);
  });

  test('explicit general override', () => {
    const { shearModeUsed } = getEffectiveShearParameters(25, 30, 'general');
    assert.equal(shearModeUsed, 'general');
  });

  test('explicit local override', () => {
    const { shearModeUsed } = getEffectiveShearParameters(40, 30, 'local');
    assert.equal(shearModeUsed, 'local');
  });
});

describe('P3 - Shape Factors (IS 6403:1981 Clause 5.1.2.1 Table 1)', () => {
  test('strip: sc=1, sq=1, sgamma=1', () => {
    const { sc, sq, sgamma } = computeShapeFactors({
      B_m: 2, L_m: 10, shape: FootingShape.STRIP
    });
    assert.equal(sc, 1.0);
    assert.equal(sq, 1.0);
    assert.equal(sgamma, 1.0);
  });

  test('square: sc=1.3, sq=1.2, sgamma=0.8', () => {
    const { sc, sq, sgamma } = computeShapeFactors({
      B_m: 2, L_m: 2, shape: FootingShape.SQUARE
    });
    assert.equal(sc, 1.3);
    assert.equal(sq, 1.2);
    assert.equal(sgamma, 0.8);
  });

  test('circular: sc=1.3, sq=1.2, sgamma=0.6', () => {
    const { sc, sq, sgamma } = computeShapeFactors({
      B_m: 2, L_m: 2, shape: FootingShape.CIRCULAR
    });
    assert.equal(sc, 1.3);
    assert.equal(sq, 1.2);
    assert.equal(sgamma, 0.6);
  });

  test('rectangular: sc=1+0.2*(B/L), sq=1+0.2*(B/L), sgamma=1-0.4*(B/L)', () => {
    const { sc, sq, sgamma } = computeShapeFactors({
      B_m: 2, L_m: 4, shape: FootingShape.RECTANGULAR
    });
    // B/L = 0.5
    assert.equal(sc, 1 + 0.2 * 0.5); // 1.1
    assert.equal(sq, 1 + 0.2 * 0.5); // 1.1
    assert.equal(sgamma, 1 - 0.4 * 0.5); // 0.8
  });
});

describe('P3 - Depth Factors (IS 6403:1981 Clause 5.1.2.1)', () => {
  test('Df = 0: all 1.0', () => {
    const { dc, dq, dgamma } = computeDepthFactors({ Df_m: 0, B_m: 2, phi_eff_deg: 30 });
    assert.equal(dc, 1.0);
    assert.equal(dq, 1.0);
    assert.equal(dgamma, 1.0);
  });

  test('φ = 0: N_phi=1, dc=1+0.2*Df/B, dq=dgamma=1', () => {
    const { dc, dq, dgamma } = computeDepthFactors({ Df_m: 1.5, B_m: 2, phi_eff_deg: 0 });
    // N_phi = tan²(45°) = 1
    // dc = 1 + 0.2 * (1.5/2) * 1 = 1.15
    assert.ok(Math.abs(dc - 1.15) < 0.01);
    assert.equal(dq, 1.0);
    assert.equal(dgamma, 1.0);
  });

  test('φ = 30°, Df=1.5, B=2', () => {
    const { dc, dq, dgamma } = computeDepthFactors({ Df_m: 1.5, B_m: 2, phi_eff_deg: 30 });
    // N_phi = tan²(45+15) = tan²(60) = 3
    // sqrt(N_phi) = sqrt(3) ≈ 1.732
    // dc = 1 + 0.2 * (1.5/2) * 1.732 = 1 + 0.26 = 1.26
    // dq = dgamma = 1 + 0.1 * (1.5/2) * 1.732 = 1 + 0.13 = 1.13
    assert.ok(Math.abs(dc - 1.26) < 0.02);
    assert.ok(Math.abs(dq - 1.13) < 0.02);
    assert.ok(Math.abs(dgamma - 1.13) < 0.02);
  });

  test('φ < 10°: dq=dgamma=1', () => {
    const { dq, dgamma } = computeDepthFactors({ Df_m: 1.5, B_m: 2, phi_eff_deg: 5 });
    assert.equal(dq, 1.0);
    assert.equal(dgamma, 1.0);
  });
});

describe('P3 - Inclination Factors (IS 6403:1981 Clause 5.1.2.1)', () => {
  test('H = 0: all 1.0', () => {
    const { ic, iq, igamma } = computeInclinationFactors({
      loadV_kN: 500, loadH_kN: 0, phi_eff_deg: 30
    });
    assert.equal(ic, 1.0);
    assert.equal(iq, 1.0);
    assert.equal(igamma, 1.0);
  });

  test('φ = 30°, H = 100, V = 500: α = atan(0.2) ≈ 11.31°', () => {
    const { ic, iq, igamma } = computeInclinationFactors({
      loadV_kN: 500, loadH_kN: 100, phi_eff_deg: 30
    });
    // α = atan(100/500) = atan(0.2) ≈ 11.31°
    // ic = iq = (1 - 11.31/90)² = (0.874)² = 0.764
    // igamma = (1 - 11.31/30)² = (0.623)² = 0.388
    assert.ok(Math.abs(iq - 0.764) < 0.01);
    assert.ok(Math.abs(ic - 0.764) < 0.01);
    assert.ok(Math.abs(igamma - 0.388) < 0.01);
  });

  test('φ = 0: igamma = 1', () => {
    const { igamma } = computeInclinationFactors({
      loadV_kN: 500, loadH_kN: 100, phi_eff_deg: 0
    });
    assert.equal(igamma, 1.0);
  });

  test('inclination factors clamped at 0', () => {
    const { ic, iq, igamma } = computeInclinationFactors({
      loadV_kN: 100, loadH_kN: 1000, phi_eff_deg: 30
    });
    assert.ok(ic >= 0);
    assert.ok(iq >= 0);
    assert.ok(igamma >= 0);
  });
});

describe('P3 - Water Table Factor W\'', () => {
  test('Dw ≤ 0: W\' = 0.5', () => {
    assert.equal(computeWaterTableFactor(0, 2), 0.5);
    assert.equal(computeWaterTableFactor(-1, 2), 0.5);
  });

  test('Dw ≥ B: W\' = 1.0', () => {
    assert.equal(computeWaterTableFactor(2, 2), 1.0);
    assert.equal(computeWaterTableFactor(5, 2), 1.0);
  });

  test('0 < Dw < B: linear interpolation', () => {
    // Dw = 1, B = 2 => W' = 0.5 + 0.5*0.5 = 0.75
    assert.equal(computeWaterTableFactor(1, 2), 0.75);
  });
});

describe('P3 - Effective Dimensions', () => {
  test('strip footing: L\' = L, B\' = B - 2|eB|', () => {
    const { B_prime_m, L_prime_m, eB_m, eL_m } = computeEffectiveDimensions({
      shape: FootingShape.STRIP, B_m: 2, L_m: 10, Mx_kNm: 0, My_kNm: 100, loadV_kN: 500
    });
    // eB = 100/500 = 0.2, B' = 2 - 2*0.2 = 1.6
    assert.ok(Math.abs(eB_m - 0.2) < 0.001);
    assert.ok(Math.abs(B_prime_m - 1.6) < 0.001);
    assert.equal(L_prime_m, 10);
  });

  test('square footing: both reduced', () => {
    const { B_prime_m, L_prime_m, eB_m, eL_m } = computeEffectiveDimensions({
      shape: FootingShape.SQUARE, B_m: 2, L_m: 2, Mx_kNm: 50, My_kNm: 50, loadV_kN: 500
    });
    // eB = eL = 0.1, B' = L' = 2 - 0.2 = 1.8
    assert.ok(Math.abs(eB_m - 0.1) < 0.001);
    assert.ok(Math.abs(eL_m - 0.1) < 0.001);
    assert.ok(Math.abs(B_prime_m - 1.8) < 0.001);
    assert.ok(Math.abs(L_prime_m - 1.8) < 0.001);
  });

  test('circular: resultant eccentricity, A\' = π/4 * B\'²', () => {
    const { B_prime_m, L_prime_m, A_prime_m2 } = computeEffectiveDimensions({
      shape: FootingShape.CIRCULAR, B_m: 2, L_m: 2, Mx_kNm: 50, My_kNm: 50, loadV_kN: 500
    });
    // e = sqrt(0.1² + 0.1²) = 0.1414, B' = 2 - 2*0.1414 = 1.717
    assert.ok(Math.abs(B_prime_m - 1.717) < 0.01);
    assert.equal(L_prime_m, B_prime_m);
    // A' = π/4 * B'²
    const expectedA = (Math.PI / 4) * B_prime_m * B_prime_m;
    assert.ok(Math.abs(A_prime_m2 - expectedA) < 0.001);
  });

  test('negative moments use absolute values', () => {
    const { B_prime_m } = computeEffectiveDimensions({
      shape: FootingShape.SQUARE, B_m: 2, L_m: 2, Mx_kNm: -100, My_kNm: -100, loadV_kN: 500
    });
    // Should be same as positive moments
    assert.ok(Math.abs(B_prime_m - 1.6) < 0.001);
  });

  test("eccentricity exceeding B/2 throws RangeError", () => {
    assert.throws(() => computeEffectiveDimensions({ shape: FootingShape.SQUARE, B_m: 2, L_m: 2, Mx_kNm: 1000, My_kNm: 1000, loadV_kN: 100 }), RangeError, "Eccentricity exceeds B/2 or L/2: no effective footing area");
  });
});

describe('P3 - Overburden at Base', () => {
  test('Df = 0: q = 0', () => {
    const q = computeOverburdenAtBase({ profile, Df_m: 0, wtSource: 'design' });
    assert.equal(q, 0);
  });

  test('Df = 1.5: q = σ\'v0 at 1.5m', () => {
    const q = computeOverburdenAtBase({ profile, Df_m: 1.5, wtSource: 'design' });
    // design WT = 1m, 0-1m moist (17.5), 1-1.5m sat (19.5), u = 9.81*0.5
    // q = 17.5 + 19.5*0.5 - 9.81*0.5 = 22.345
    assert.ok(Math.abs(q - 22.345) < 0.01);
  });
});

describe('P3 - Full Bearing Capacity (IS 6403:1981)', () => {
  test('square footing, general shear', () => {
    const result = computeBearingCapacityIS6403({
      footing,
      profile,
      gamma_kNm3: 19.5,
      cPrime_kPa: 0,
      phiDeg: 36,
      shearMode: 'general',
      wtSource: 'design'
    });

    assert.equal(result.shearModeUsed, 'general');
    assert.ok(result.qnu_kPa > 0);
    assert.ok(result.qns_kPa > 0);
    assert.equal(result.qns_kPa, result.qnu_kPa / 3.0);
    // All factors returned
    assert.ok('Nc' in result);
    assert.ok('Nq' in result);
    assert.ok('Ngamma' in result);
    assert.ok('sc' in result);
    assert.ok('sq' in result);
    assert.ok('sgamma' in result);
    assert.ok('dc' in result);
    assert.ok('dq' in result);
    assert.ok('dgamma' in result);
    assert.ok('ic' in result);
    assert.ok('iq' in result);
    assert.ok('igamma' in result);
    assert.ok('W_prime' in result);
    assert.ok('B_prime_m' in result);
    assert.ok('L_prime_m' in result);
    assert.ok('q_kPa' in result);
  });

  test('square footing, local shear (φ=25)', () => {
    const result = computeBearingCapacityIS6403({
      footing,
      profile,
      gamma_kNm3: 19.5,
      cPrime_kPa: 0,
      phiDeg: 25,
      shearMode: 'auto', // will be local
      wtSource: 'design'
    });

    assert.equal(result.shearModeUsed, 'local');
    assert.ok(result.phi_eff_deg < 25);
    assert.ok(result.c_eff_kPa < 15);
  });

  test('intermediate shear (φ=32)', () => {
    const result = computeBearingCapacityIS6403({
      footing,
      profile,
      gamma_kNm3: 19.5,
      cPrime_kPa: 0,
      phiDeg: 32,
      shearMode: 'auto',
      wtSource: 'design'
    });

    assert.equal(result.shearModeUsed, 'intermediate');
    assert.ok(result.isIntermediate);
  });

  test('all 4 shapes: strip, square, rectangular, circular', () => {
    const shapes = [FootingShape.STRIP, FootingShape.SQUARE, FootingShape.RECTANGULAR, FootingShape.CIRCULAR];
    shapes.forEach(shape => {
      const f = createFooting({ ...footing, shape, B_m: 2, L_m: shape === FootingShape.STRIP ? 10 : 2 });
      const result = computeBearingCapacityIS6403({
        footing: f,
        profile,
        gamma_kNm3: 19.5,
        cPrime_kPa: 0,
        phiDeg: 30,
        shearMode: 'general',
        wtSource: 'design'
      });
      assert.ok(result.qnu_kPa > 0, `Shape ${shape} failed`);
    });
  });

  test('W\' bounds [0.5, 1.0]', () => {
    // Water at base: Dw = 0
    let result = computeBearingCapacityIS6403({
      footing,
      profile,
      gamma_kNm3: 19.5,
      cPrime_kPa: 0,
      phiDeg: 30,
      wtSource: 'design' // design WT = 1m, Df = 1.5m => Dw = -0.5
    });
    assert.equal(result.W_prime, 0.5);

    // Water well below: Dw > B
    const deepWTProfile = createSoilProfile({
      layers: profile.layers,
      measuredWT_m: 10,
      designWT_m: 10
    });
    result = computeBearingCapacityIS6403({
      footing,
      profile: deepWTProfile,
      gamma_kNm3: 19.5,
      cPrime_kPa: 0,
      phiDeg: 30,
      wtSource: 'design'
    });
    assert.equal(result.W_prime, 1.0);
  });

  test('eccentricity reduces effective area', () => {
    const f_ecc = createFooting({ ...footing, Mx_kNm: 100, My_kNm: 100 });
    const result = computeBearingCapacityIS6403({
      footing: f_ecc,
      profile,
      gamma_kNm3: 19.5,
      cPrime_kPa: 0,
      phiDeg: 30,
      wtSource: 'design'
    });
    assert.ok(result.B_prime_m < 2);
    assert.ok(result.L_prime_m < 2);
    assert.ok(result.A_prime_m2 < 4);
  });

  test('inclination reduces capacity', () => {
    const f_incl = createFooting({ ...footing, loadH_kN: 100 });
    const result_noH = computeBearingCapacityIS6403({
      footing,
      profile,
      gamma_kNm3: 19.5,
      cPrime_kPa: 0,
      phiDeg: 30,
      wtSource: 'design'
    });
    const result_H = computeBearingCapacityIS6403({
      footing: f_incl,
      profile,
      gamma_kNm3: 19.5,
      cPrime_kPa: 0,
      phiDeg: 30,
      wtSource: 'design'
    });
    assert.ok(result_H.qnu_kPa < result_noH.qnu_kPa);
  });

  test('gross safe qs = qns + q (NOT qu/FoS)', () => {
    const result = computeBearingCapacityIS6403({
      footing,
      profile,
      gamma_kNm3: 19.5,
      cPrime_kPa: 0,
      phiDeg: 30,
      wtSource: 'design'
    });
    // qs should equal qns + q
    assert.ok(Math.abs(result.qs_kPa - (result.qns_kPa + result.q_kPa)) < 0.01);
    // qs should NOT equal qu/FoS (unless q=0)
    assert.ok(Math.abs(result.qs_kPa - result.qu_kPa / 3.0) > 0.01);
  });
});

describe('P3 - Allowable Load', () => {
  test('Q_allow = qns * A\'', () => {
    const result = computeBearingCapacityIS6403({
      footing,
      profile,
      gamma_kNm3: 19.5,
      cPrime_kPa: 0,
      phiDeg: 30,
      wtSource: 'design'
    });
    const Q = computeAllowableLoad({ qns_kPa: result.qns_kPa, A_prime_m2: result.A_prime_m2 });
    assert.ok(Math.abs(Q - result.qns_kPa * result.A_prime_m2) < 0.001);
  });
});

// ============================================================================
// P4 - STRESS DISTRIBUTION TESTS
// ============================================================================

describe('P4 - Boussinesq Corner', () => {
  test('corner limit at z = 0 is one quarter of q', () => {
    assert.equal(boussinesqCorner({ q_kPa: 100, B_m: 2, L_m: 3, z_m: 0 }), 25);
  });

  test('q = 0: Δσz = 0', () => {
    assert.equal(boussinesqCorner({ q_kPa: 0, B_m: 2, L_m: 3, z_m: 2 }), 0);
  });

  test('known values for square (B=L=2, z=2)', () => {
    // m = n = 1, Newmark (1935) exact formula gives I ≈ 0.175
    // Source: Newmark 1935, Eq. 14; verified by analytical integration
    const ds = boussinesqCorner({ q_kPa: 100, B_m: 2, L_m: 2, z_m: 2 });
    assert.ok(Math.abs(ds - 17.5) < 1.0);
  });

  test('deep depth: Δσz → 0', () => {
    const ds = boussinesqCorner({ q_kPa: 100, B_m: 2, L_m: 2, z_m: 100 });
    assert.ok(ds < 0.1);
  });
});

describe('P4 - Boussinesq Centre = 4 × Corner(B/2, L/2)', () => {
  test('square footing B=L=2', () => {
    const z = 2;
    const centre = boussinesqCentre({ q_kPa: 100, B_m: 2, L_m: 2, z_m: z });
    const corner4x = 4 * boussinesqCorner({ q_kPa: 100, B_m: 1, L_m: 1, z_m: z });
    assert.ok(Math.abs(centre - corner4x) < 0.001);
  });

  test('rectangular footing B=2, L=4', () => {
    const z = 3;
    const centre = boussinesqCentre({ q_kPa: 100, B_m: 2, L_m: 4, z_m: z });
    const corner4x = 4 * boussinesqCorner({ q_kPa: 100, B_m: 1, L_m: 2, z_m: z });
    assert.ok(Math.abs(centre - corner4x) < 0.001);
  });
});

describe('P4 - Boussinesq Circle', () => {
  test('z = 0: Δσz = q', () => {
    assert.equal(boussinesqCircle({ q_kPa: 100, R_m: 1, z_m: 0 }), 100);
  });

  test('known values', () => {
    // R/z = 1, I = 1 - 1/(2^1.5) = 1 - 0.3536 = 0.6464
    const ds = boussinesqCircle({ q_kPa: 100, R_m: 2, z_m: 2 });
    assert.ok(Math.abs(ds - 64.64) < 1.0);
  });
});

describe('P4 - Boussinesq Strip', () => {
  test('z = 0: Δσz = q', () => {
    assert.equal(boussinesqStrip({ q_kPa: 100, B_m: 2, z_m: 0 }), 100);
  });
});

describe('P4 - Generic Boussinesq by Shape', () => {
  test('strip uses strip formula', () => {
    const ds1 = boussinesq({ q_kPa: 100, B_m: 2, L_m: 100, z_m: 2, shape: 'strip' });
    const ds2 = boussinesqStrip({ q_kPa: 100, B_m: 2, z_m: 2 });
    assert.ok(Math.abs(ds1 - ds2) < 0.001);
  });

  test('circular uses circle formula', () => {
    const ds1 = boussinesq({ q_kPa: 100, B_m: 2, L_m: 2, z_m: 2, shape: 'circular' });
    const ds2 = boussinesqCircle({ q_kPa: 100, R_m: 1, z_m: 2 });
    assert.ok(Math.abs(ds1 - ds2) < 0.001);
  });

  test('square uses centre formula', () => {
    const ds1 = boussinesq({ q_kPa: 100, B_m: 2, L_m: 2, z_m: 2, shape: 'square' });
    const ds2 = boussinesqCentre({ q_kPa: 100, B_m: 2, L_m: 2, z_m: 2 });
    assert.ok(Math.abs(ds1 - ds2) < 0.001);
  });
});

describe('P4 - 2:1 Method', () => {
  test('z = 0: Δσz = q', () => {
    assert.equal(stress2to1({ q_kPa: 100, B_m: 2, L_m: 3, z_m: 0, shape: 'rectangular' }), 100);
  });

  test('strip: q*B/(B+z)', () => {
    const ds = stress2to1({ q_kPa: 100, B_m: 2, L_m: 100, z_m: 2, shape: 'strip' });
    assert.equal(ds, 100 * 2 / 4); // 50
  });

  test('rectangular: q*B*L/((B+z)*(L+z))', () => {
    const ds = stress2to1({ q_kPa: 100, B_m: 2, L_m: 4, z_m: 2, shape: 'rectangular' });
    assert.equal(ds, 100 * 2 * 4 / (4 * 6)); // 33.33
  });

  test('circle: q*D²/(D+z)²', () => {
    const ds = stress2to1({ q_kPa: 100, B_m: 2, L_m: 2, z_m: 2, shape: 'circular' });
    assert.equal(ds, 100 * 4 / 16); // 25
  });
});

describe('P4 - Stress Profile Generator', () => {
  test('returns arrays of equal length (boussinesq)', () => {
    const { depths_m, deltaSigma_kPa } = generateStressProfile({
      q_kPa: 100, B_m: 2, L_m: 2, z_max_m: 10, z_step_m: 1, shape: 'square', method: 'boussinesq'
    });
    assert.equal(depths_m.length, deltaSigma_kPa.length);
    assert.equal(depths_m.length, 10);
  });

  test('2:1 method profile', () => {
    const { depths_m, deltaSigma_kPa } = generateStressProfile({
      q_kPa: 100, B_m: 2, L_m: 2, z_max_m: 10, z_step_m: 2, shape: 'square', method: '2to1'
    });
    assert.equal(depths_m.length, 5);
    assert.ok(deltaSigma_kPa.every(v => v >= 0));
  });

  test('boussinesq_corner method profile', () => {
    const { depths_m, deltaSigma_kPa } = generateStressProfile({
      q_kPa: 100, B_m: 2, L_m: 2, z_max_m: 10, z_step_m: 2, shape: 'square', method: 'boussinesq_corner'
    });
    assert.equal(depths_m.length, 5);
    assert.ok(deltaSigma_kPa.every(v => v >= 0));
  });
});

describe('P4 - Compute Stress At Depths', () => {
  test('boussinesq_corner method', () => {
    const depths = [1, 2, 3];
    const results = computeStressAtDepths({
      q_kPa: 100, B_m: 2, L_m: 2, depths_m: depths, shape: 'square', method: 'boussinesq_corner'
    });
    assert.equal(results.length, 3);
    assert.ok(results.every(v => v >= 0));
  });
});

// ============================================================================
// P5 - SETTLEMENT TESTS
// ============================================================================

describe('P5 - Terzaghi Consolidation U(Tv)', () => {
  test('Tv = 0: U = 0', () => {
    assert.equal(getDegreeOfConsolidation(0), 0);
  });

  test('Tv = 0.2827 (U=60%): U ≈ 0.6', () => {
    const Tv = Math.PI / 4 * 0.6 * 0.6;
    const U = getDegreeOfConsolidation(Tv);
    assert.ok(Math.abs(U - 0.6) < 0.01);
  });

  test('Tv = 1.0: U ≈ 0.93', () => {
    const U = getDegreeOfConsolidation(1.0);
    assert.ok(U > 0.9 && U < 0.95);
  });

  test('Tv large: U → 1', () => {
    assert.equal(getDegreeOfConsolidation(2.0), 1.0);
  });

  test('getTimeFactor inverse', () => {
    const U = 0.6;
    const Tv = getTimeFactor(U);
    const U_back = getDegreeOfConsolidation(Tv);
    assert.ok(Math.abs(U_back - U) < 0.001);
  });
});

describe('P5 - Consolidation Settlement', () => {
  const clayLayer = createSoilLayer({
    topDepth_m: 0,
    bottomDepth_m: 5,
    soilType: SoilType.CLAY,
    gammaMoist_kNm3: 18.0,
    gammaSat_kNm3: 20.0,
    cPrime_kPa: 15,
    phiDeg: 22,
    e0: 0.85,
    Cc: 0.35,
    Cr: 0.07,
    sigmaP_kPa: 200,
    cv_m2s: 5e-8
  });

  test('NC case (σ\'v0 ≥ σ\'p): uses Cc', () => {
    const result = computeConsolidationSettlement({
      layer: clayLayer,
      sigma_v0_prime_kPa: 250, // > σ'p = 200
      delta_sigma_kPa: 50,
      max_sublayer_thickness_m: 0.5
    });
    assert.ok(result.S_m > 0);
    assert.equal(result.sublayers[0].case_type, 'NC');
    // All sublayers should be NC
    result.sublayers.forEach(sl => assert.equal(sl.case_type, 'NC'));
  });

  test('OC below σ\'p: uses Cr', () => {
    const result = computeConsolidationSettlement({
      layer: clayLayer,
      sigma_v0_prime_kPa: 100,
      delta_sigma_kPa: 50, // 150 < 200
      max_sublayer_thickness_m: 0.5
    });
    assert.ok(result.S_m > 0);
    assert.equal(result.sublayers[0].case_type, 'OC_below');
  });

  test('OC crossing σ\'p: uses Cr then Cc', () => {
    const result = computeConsolidationSettlement({
      layer: clayLayer,
      sigma_v0_prime_kPa: 100,
      delta_sigma_kPa: 150, // 250 > 200
      max_sublayer_thickness_m: 0.5
    });
    assert.ok(result.S_m > 0);
    assert.equal(result.sublayers[0].case_type, 'OC_crossing');
  });

  test('sublayer thickness ≤ 0.5m enforced', () => {
    const result = computeConsolidationSettlement({
      layer: clayLayer,
      sigma_v0_prime_kPa: 100,
      delta_sigma_kPa: 50,
      max_sublayer_thickness_m: 0.5
    });
    // Layer is 5m thick, should have 10 sublayers of 0.5m each
    assert.equal(result.n_sublayers, 10);
    result.sublayers.forEach(sl => assert.ok(sl.dz_m <= 0.5 + 1e-10));
  });

  test('custom sublayer thickness', () => {
    const result = computeConsolidationSettlement({
      layer: clayLayer,
      sigma_v0_prime_kPa: 100,
      delta_sigma_kPa: 50,
      max_sublayer_thickness_m: 1.0
    });
    // 5m / 1m = 5 sublayers
    assert.equal(result.n_sublayers, 5);
    result.sublayers.forEach(sl => assert.ok(sl.dz_m <= 1.0 + 1e-10));
  });

  test('missing consolidation parameters throws', () => {
    const badLayer = createSoilLayer({
      topDepth_m: 3,
      bottomDepth_m: 5,
      soilType: SoilType.CLAY,
      gammaMoist_kNm3: 18.0,
      gammaSat_kNm3: 20.0,
      cPrime_kPa: 0,
      phiDeg: 22
      // Missing e0, Cc, Cr, sigmaP_kPa
    });
    assert.throws(() => computeConsolidationSettlement({
      layer: badLayer,
      sigma_v0_prime_kPa: 100,
      delta_sigma_kPa: 50
    }));
  });

  test('uses profile and deltaSigmaFn callbacks when provided', () => {
    // Create a simple profile with one clay layer
    const testProfile = createSoilProfile({
      layers: [clayLayer],
      measuredWT_m: 5,
      designWT_m: 5
    });
    const result = computeConsolidationSettlement({
      layer: clayLayer,
      sigma_v0_prime_kPa: 0, // ignored when profile provided
      delta_sigma_kPa: 0,    // ignored when deltaSigmaFn provided
      profile: testProfile,
      wtSource: 'design',
      deltaSigmaFn: (z) => 50, // constant 50 kPa
      max_sublayer_thickness_m: 0.5
    });
    assert.ok(result.S_m > 0);
    // Each sublayer should have its own σ'v0 computed from profile
    result.sublayers.forEach(sl => {
      assert.ok(sl.sigma_v0_prime_kPa > 0);
      assert.equal(sl.delta_sigma_kPa, 50);
    });
  });
});

describe('P5 - Total Consolidation Settlement', () => {
  test('only clay/silt layers contribute', () => {
    const result = computeTotalConsolidationSettlement({
      profile,
      footing,
      q_net_kPa: 200,
      wtSource: 'design',
      max_sublayer_thickness_m: 0.5
    });
    assert.ok(result.S_m > 0);
    // Only layer 1 (clay) should have settlement
    assert.equal(result.layerResults[0].S_m, 0);
    assert.ok(result.layerResults[1].S_m > 0);
    assert.equal(result.layerResults[2].S_m, 0);
  });
});

describe('P5 - Time-Settlement Curve', () => {
  test('generates curve with correct structure', () => {
    const curve = generateTimeSettlementCurve({
      S_final_m: 0.05,
      cv_m2s: 5e-8,
      H_m: 5,
      drainage: 'double'
    });
    assert.ok(curve.data.length > 0);
    assert.ok(curve.Hdr_m === 2.5); // H/2 for double
    curve.data.forEach(d => {
      assert.ok(d.U >= 0 && d.U <= 1);
      assert.ok(d.S_m >= 0 && d.S_m <= 0.05);
    });
  });

  test('single drainage: Hdr = H', () => {
    const curve = generateTimeSettlementCurve({
      S_final_m: 0.05,
      cv_m2s: 5e-8,
      H_m: 5,
      drainage: 'single'
    });
    assert.equal(curve.Hdr_m, 5);
  });

  test('custom time array', () => {
    const times = [86400, 86400*30, 86400*365];
    const curve = generateTimeSettlementCurve({
      S_final_m: 0.05,
      cv_m2s: 5e-8,
      H_m: 5,
      drainage: 'double',
      times_s: times
    });
    assert.equal(curve.data.length, 3);
    assert.equal(curve.data[0].t_s, 86400);
  });
});

describe('P5 - Schmertmann (1978) Iz', () => {
  test('z = 0: Iz = 0.1', () => {
    const Iz = schmertmannIz({ z_m: 0, B_m: 2, q_net_kPa: 200, sigma_vp_prime_kPa: 100, shape: 'square' });
    assert.equal(Iz, 0.1);
  });

  test('peak at z = B/2 for square', () => {
    const B = 2;
    const Iz_peak = schmertmannIz({ z_m: B/2, B_m: B, q_net_kPa: 200, sigma_vp_prime_kPa: 100, shape: 'square' });
    const Iz_before = schmertmannIz({ z_m: B/4, B_m: B, q_net_kPa: 200, sigma_vp_prime_kPa: 100, shape: 'square' });
    const Iz_after = schmertmannIz({ z_m: 3*B/4, B_m: B, q_net_kPa: 200, sigma_vp_prime_kPa: 100, shape: 'square' });
    assert.ok(Iz_peak > Iz_before);
    assert.ok(Iz_peak > Iz_after);
  });

  test('peak at z = B for strip', () => {
    const B = 2;
    const Iz_peak = schmertmannIz({ z_m: B, B_m: B, q_net_kPa: 200, sigma_vp_prime_kPa: 100, shape: 'strip' });
    const Iz_before = schmertmannIz({ z_m: B/2, B_m: B, q_net_kPa: 200, sigma_vp_prime_kPa: 100, shape: 'strip' });
    const Iz_after = schmertmannIz({ z_m: 1.5*B, B_m: B, q_net_kPa: 200, sigma_vp_prime_kPa: 100, shape: 'strip' });
    assert.ok(Iz_peak > Iz_before);
    assert.ok(Iz_peak > Iz_after);
  });

  test('Iz = 0 at z = 2B (square) and z = 4B (strip)', () => {
    assert.equal(schmertmannIz({ z_m: 4, B_m: 2, q_net_kPa: 200, sigma_vp_prime_kPa: 100, shape: 'square' }), 0);
    assert.equal(schmertmannIz({ z_m: 8, B_m: 2, q_net_kPa: 200, sigma_vp_prime_kPa: 100, shape: 'strip' }), 0);
  });
});

describe('P5 - Schmertmann Settlement', () => {
  test('square footing on sand', () => {
    const result = computeSchmertmannSettlement({
      profile,
      B_m: 2,
      q_net_kPa: 200,
      Df_m: 1.5,
      gamma_kNm3: 19.5,
      shape: 'square',
      time_years: 0.1,
      max_sublayer_thickness_m: 0.5,
      wtSource: 'design'
    });
    assert.ok(result.S_m > 0);
    // C1 clamped to ≥ 0.5
    assert.ok(result.C1 >= 0.5);
    // C2 clamped to ≥ 1.0
    assert.ok(result.C2 >= 1.0);
    assert.ok(result.sublayers.length > 0);
  });

  test('C1 clamped at 0.5 when σ\'v0_Df / q_net > 1', () => {
    // Very deep footing with small q_net
    const result = computeSchmertmannSettlement({
      profile,
      B_m: 2,
      q_net_kPa: 10,
      Df_m: 10,
      gamma_kNm3: 19.5,
      shape: 'square',
      time_years: 0.1,
      max_sublayer_thickness_m: 0.5,
      wtSource: 'design'
    });
    assert.equal(result.C1, 0.5);
  });

  test('C2 clamped at 1.0 for very small time', () => {
    const result = computeSchmertmannSettlement({
      profile,
      B_m: 2,
      q_net_kPa: 200,
      Df_m: 1.5,
      gamma_kNm3: 19.5,
      shape: 'square',
      time_years: 0.001, // very small
      max_sublayer_thickness_m: 0.5,
      wtSource: 'design'
    });
    assert.equal(result.C2, 1.0);
  });

  test('strip footing: influence depth 4B', () => {
    const stripProfile = createSoilProfile({
      layers: [
        { ...profile.layers[0], bottomDepth_m: 10 },
        { ...profile.layers[2], topDepth_m: 10 }
      ],
      measuredWT_m: 2,
      designWT_m: 1
    });
    const result = computeSchmertmannSettlement({
      profile: stripProfile,
      B_m: 2,
      q_net_kPa: 200,
      Df_m: 1.5,
      gamma_kNm3: 19.5,
      shape: 'strip',
      time_years: 0.1,
      max_sublayer_thickness_m: 0.5,
      wtSource: 'design'
    });
    // Should reach deeper (4B = 8m)
    assert.ok(result.z_influence_m === 8);
  });

  test('circular footing uses axisymmetric (2B)', () => {
    const result = computeSchmertmannSettlement({
      profile,
      B_m: 2,
      q_net_kPa: 200,
      Df_m: 1.5,
      gamma_kNm3: 19.5,
      shape: 'circular',
      time_years: 0.1,
      max_sublayer_thickness_m: 0.5,
      wtSource: 'design'
    });
    assert.ok(result.z_influence_m === 4); // 2B
  });
});

describe('P5 - Total Settlement (Combined)', () => {
  test('immediate + consolidation', () => {
    // delta_sigma_at_layer_mid_kPa is kept for backward compat but not used by new consolidation
    const deltaSigma = [20, 50, 30];
    const result = computeTotalSettlement({
      profile,
      footing,
      q_net_kPa: 200,
      gamma_kNm3: 19.5,
      delta_sigma_at_layer_mid_kPa: deltaSigma,
      time_years: 0.1,
      wtSource: 'design',
      max_sublayer_thickness_m: 0.5
    });
    assert.ok(result.S_immediate_m >= 0);
    assert.ok(result.S_consolidation_m >= 0);
    assert.ok(Math.abs(result.S_total_m - (result.S_immediate_m + result.S_consolidation_m)) < 1e-10);
    assert.ok(result.granular);
    assert.ok(result.consolidation);
    assert.ok(Array.isArray(result.consolidationCurves));
  });
});

// ============================================================================
// INTEGRATION TESTS
// ============================================================================

describe('Integration - Bearing Capacity + Stress + Settlement', () => {
  test('full workflow: qnu -> Δσz -> settlement', () => {
    // 1. Bearing capacity
    const bc = computeBearingCapacityIS6403({
      footing,
      profile,
      gamma_kNm3: 19.5,
      cPrime_kPa: 0,
      phiDeg: 30,
      wtSource: 'design'
    });
    assert.ok(bc.qnu_kPa > 0);

    // 2. Net pressure
    const q_net = bc.qns_kPa; // Use net safe as design pressure

    // 3. Stress distribution at layer mid-depths (for reference only)
    const deltaSigma = profile.layers.map((layer, i) => {
      const midDepth = (layer.topDepth_m + layer.bottomDepth_m) / 2;
      const z_from_base = midDepth - footing.Df_m;
      if (z_from_base <= 0) return 0;
      return boussinesq({ q_kPa: q_net, B_m: footing.B_m, L_m: footing.L_m, z_m: z_from_base, shape: footing.shape });
    });

    // 4. Settlement (uses new consolidation API with boussinesq callback)
    const settlement = computeTotalSettlement({
      profile,
      footing,
      q_net_kPa: q_net,
      gamma_kNm3: 19.5,
      delta_sigma_at_layer_mid_kPa: deltaSigma,
      wtSource: 'design'
    });
    assert.ok(settlement.S_total_m >= 0);
  });
});