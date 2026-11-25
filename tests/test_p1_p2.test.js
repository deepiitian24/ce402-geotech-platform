/**
 * CE 402 Geotechnical Engineering Platform - Unit Tests for P1 & P2
 * Run with: npm test (node --test)
 */

import { describe, it, test } from 'node:test';
import assert from 'node:assert/strict';

// Import models
import {
  GAMMA_W,
  validateSoilLayer,
  createSoilLayer,
  validateSoilProfile,
  createSoilProfile,
  validateFooting,
  createFooting,
  SoilType,
  FootingShape,
  clone,
  lerp
} from '../js/models.js';

// Import soilProfile (P1)
import {
  computeEffectiveVerticalStress,
  computeLayerMidDepthStresses,
  getLayerPropertyProfile,
  getLayerAtDepth,
  computeTotalVerticalStress,
  computePoreWaterPressure,
  prepareSoilProfile
} from '../js/soilProfile.js';

// Import spt (P2)
import {
  computeOverburdenCorrectionCN,
  computeDilatancyCorrection,
  correctSPT_N_IS2131,
  correctSPT_N_Batch,
  directShearOLS,
  estimatePhiFromSPT
} from '../js/spt.js';

// ============================================================================
// TEST HELPERS
// ============================================================================

/** Creates a standard test soil profile */
function createTestProfile(overrides = {}) {
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
        su_kPa: undefined,
        Es_kPa: 25000,
        e0: 0.65,
        Cc: 0.15,
        Cr: 0.03,
        sigmaP_kPa: 150,
        cv_m2s: 1e-7
      },
      {
        topDepth_m: 3,
        bottomDepth_m: 8,
        soilType: SoilType.CLAY,
        gammaMoist_kNm3: 18.0,
        gammaSat_kNm3: 20.0,
        cPrime_kPa: 15,
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
        topDepth_m: 8,
        bottomDepth_m: 15,
        soilType: SoilType.SAND,
        gammaMoist_kNm3: 18.5,
        gammaSat_kNm3: 20.5,
        cPrime_kPa: 0,
        phiDeg: 36,
        su_kPa: undefined,
        Es_kPa: 40000,
        e0: 0.55,
        Cc: 0.10,
        Cr: 0.02,
        sigmaP_kPa: 300,
        cv_m2s: 2e-7
      }
    ],
    measuredWT_m: 2.0,
    designWT_m: 1.0,
    ...overrides
  });
}

// ============================================================================
// MODELS TESTS
// ============================================================================

describe('Models - SoilLayer Validation', () => {
  test('valid layer passes validation', () => {
    const layer = {
      topDepth_m: 0,
      bottomDepth_m: 3,
      soilType: SoilType.SAND,
      gammaMoist_kNm3: 17.5,
      gammaSat_kNm3: 19.5,
      cPrime_kPa: 0,
      phiDeg: 32
    };
    const result = validateSoilLayer(layer);
    assert.ok(result.valid, JSON.stringify(result.errors));
  });

  test('rejects negative topDepth', () => {
    const layer = { topDepth_m: -1, bottomDepth_m: 3, soilType: SoilType.SAND, gammaMoist_kNm3: 17.5, gammaSat_kNm3: 19.5, cPrime_kPa: 0, phiDeg: 32 };
    const result = validateSoilLayer(layer);
    assert.ok(!result.valid);
    assert.ok(result.errors.some(e => e.includes('topDepth_m')));
  });

  test('rejects bottomDepth <= topDepth', () => {
    const layer = { topDepth_m: 3, bottomDepth_m: 3, soilType: SoilType.SAND, gammaMoist_kNm3: 17.5, gammaSat_kNm3: 19.5, cPrime_kPa: 0, phiDeg: 32 };
    const result = validateSoilLayer(layer);
    assert.ok(!result.valid);
    assert.ok(result.errors.some(e => e.includes('bottomDepth_m')));
  });

  test('rejects invalid soilType', () => {
    const layer = { topDepth_m: 0, bottomDepth_m: 3, soilType: 'invalid', gammaMoist_kNm3: 17.5, gammaSat_kNm3: 19.5, cPrime_kPa: 0, phiDeg: 32 };
    const result = validateSoilLayer(layer);
    assert.ok(!result.valid);
    assert.ok(result.errors.some(e => e.includes('soilType')));
  });

  test('rejects gammaSat < gammaMoist (allows equality for submerged)', () => {
    const layer = { topDepth_m: 0, bottomDepth_m: 3, soilType: SoilType.SAND, gammaMoist_kNm3: 20, gammaSat_kNm3: 19, cPrime_kPa: 0, phiDeg: 32 };
    const result = validateSoilLayer(layer);
    assert.ok(!result.valid);
    assert.ok(result.errors.some(e => e.includes('gammaSat_kNm3')));
  });

  test('allows gammaSat === gammaMoist (permanently submerged)', () => {
    const layer = { topDepth_m: 0, bottomDepth_m: 3, soilType: SoilType.SAND, gammaMoist_kNm3: 19.5, gammaSat_kNm3: 19.5, cPrime_kPa: 0, phiDeg: 32 };
    const result = validateSoilLayer(layer);
    assert.ok(result.valid, JSON.stringify(result.errors));
  });

  test('rejects phiDeg > 90', () => {
    const layer = { topDepth_m: 0, bottomDepth_m: 3, soilType: SoilType.SAND, gammaMoist_kNm3: 17.5, gammaSat_kNm3: 19.5, cPrime_kPa: 0, phiDeg: 95 };
    const result = validateSoilLayer(layer);
    assert.ok(!result.valid);
    assert.ok(result.errors.some(e => e.includes('phiDeg')));
  });

  test('createSoilLayer throws on invalid', () => {
    assert.throws(() => createSoilLayer({ topDepth_m: -1, bottomDepth_m: 3, soilType: SoilType.SAND, gammaMoist_kNm3: 17.5, gammaSat_kNm3: 19.5, cPrime_kPa: 0, phiDeg: 32 }));
  });

  test('optional fields validated when present', () => {
    const layer = { topDepth_m: 0, bottomDepth_m: 3, soilType: SoilType.SAND, gammaMoist_kNm3: 17.5, gammaSat_kNm3: 19.5, cPrime_kPa: 0, phiDeg: 32, Cr: 0.1, Cc: 0.05 };
    const result = validateSoilLayer(layer);
    assert.ok(!result.valid);
    assert.ok(result.errors.some(e => e.includes('Cr must be <= Cc')));
  });
});

describe('Models - SoilProfile Validation', () => {
  test('valid profile passes', () => {
    const profile = createTestProfile();
    const result = validateSoilProfile(profile);
    assert.ok(result.valid, JSON.stringify(result.errors));
  });

  test('rejects empty layers', () => {
    const result = validateSoilProfile({ layers: [], measuredWT_m: 2, designWT_m: 1 });
    assert.ok(!result.valid);
    assert.ok(result.errors.some(e => e.includes('non-empty array')));
  });

  test('rejects layer gaps', () => {
    const profile = {
      layers: [
        { topDepth_m: 0, bottomDepth_m: 2.0, soilType: SoilType.SAND, gammaMoist_kNm3: 17.5, gammaSat_kNm3: 19.5, cPrime_kPa: 0, phiDeg: 32 },
        { topDepth_m: 3.5, bottomDepth_m: 8, soilType: SoilType.CLAY, gammaMoist_kNm3: 18.0, gammaSat_kNm3: 20.0, cPrime_kPa: 15, phiDeg: 22 }
      ],
      measuredWT_m: 2.0,
      designWT_m: 1.0
    };
    const result = validateSoilProfile(profile);
    assert.ok(!result.valid);
    assert.ok(result.errors.some(e => e.includes('Gap/overlap')));
  });

  test('rejects negative WT', () => {
    const result = validateSoilProfile({ ...createTestProfile(), measuredWT_m: -1 });
    assert.ok(!result.valid);
    assert.ok(result.errors.some(e => e.includes('measuredWT_m')));
  });
});

describe('Models - Footing Validation', () => {
  test('valid strip footing passes (L_m can differ from B_m)', () => {
    const footing = { shape: FootingShape.STRIP, B_m: 2, L_m: 5, Df_m: 1.5, loadV_kN: 500 };
    const result = validateFooting(footing);
    assert.ok(result.valid, JSON.stringify(result.errors));
  });

  test('valid rectangular footing passes', () => {
    const footing = { shape: FootingShape.RECTANGULAR, B_m: 2, L_m: 3, Df_m: 1.5, loadV_kN: 500 };
    const result = validateFooting(footing);
    assert.ok(result.valid, JSON.stringify(result.errors));
  });

  test('valid square footing passes (L_m === B_m)', () => {
    const footing = { shape: FootingShape.SQUARE, B_m: 2, L_m: 2, Df_m: 1.5, loadV_kN: 500 };
    const result = validateFooting(footing);
    assert.ok(result.valid, JSON.stringify(result.errors));
  });

  test('valid circular footing passes (L_m === B_m)', () => {
    const footing = { shape: FootingShape.CIRCULAR, B_m: 2, L_m: 2, Df_m: 1.5, loadV_kN: 500 };
    const result = validateFooting(footing);
    assert.ok(result.valid, JSON.stringify(result.errors));
  });

  test('rejects L_m !== B_m for square', () => {
    const footing = { shape: FootingShape.SQUARE, B_m: 2, L_m: 3, Df_m: 1.5, loadV_kN: 500 };
    const result = validateFooting(footing);
    assert.ok(!result.valid);
    assert.ok(result.errors.some(e => e.includes('L_m must equal B_m')));
  });

  test('rejects L_m !== B_m for circular', () => {
    const footing = { shape: FootingShape.CIRCULAR, B_m: 2, L_m: 3, Df_m: 1.5, loadV_kN: 500 };
    const result = validateFooting(footing);
    assert.ok(!result.valid);
    assert.ok(result.errors.some(e => e.includes('L_m must equal B_m')));
  });

  test('applies defaults in createFooting', () => {
    const footing = createFooting({ shape: FootingShape.SQUARE, B_m: 2, L_m: 2, Df_m: 1.5, loadV_kN: 500 });
    assert.equal(footing.loadH_kN, 0);
    assert.equal(footing.Mx_kNm, 0);
    assert.equal(footing.My_kNm, 0);
    assert.equal(footing.fos, 3.0);
  });

  test('rejects fos < 1', () => {
    const result = validateFooting({ shape: FootingShape.SQUARE, B_m: 2, L_m: 2, Df_m: 1.5, loadV_kN: 500, fos: 0.5 });
    assert.ok(!result.valid);
    assert.ok(result.errors.some(e => e.includes('fos')));
  });
});

describe('Models - Utilities', () => {
  test('clone deep copies', () => {
    const obj = { a: 1, b: { c: 2 } };
    const cloned = clone(obj);
    cloned.b.c = 99;
    assert.equal(obj.b.c, 2);
  });

  test('lerp interpolates correctly', () => {
    assert.equal(lerp(0.5, 0, 1, 10, 20), 15);
    assert.equal(lerp(0, 0, 1, 10, 20), 10);
    assert.equal(lerp(1, 0, 1, 10, 20), 20);
    assert.equal(lerp(2, 0, 1, 10, 20), 30); // extrapolation
  });
});

// ============================================================================
// P1 - SOIL PROFILE TESTS
// ============================================================================

describe('P1 - Effective Vertical Stress (σ\'v0)', () => {
  const profile = createTestProfile();

  test('σ\'v0 at surface (z=0) is 0', () => {
    const sigma = computeEffectiveVerticalStress({ profile, depth_m: 0, wtSource: 'design' });
    assert.equal(sigma, 0);
  });

  test('σ\'v0 above design WT uses moist unit weight', () => {
    // design WT = 1m, test at 0.5m in sand layer (gammaMoist = 17.5)
    const sigma = computeEffectiveVerticalStress({ profile, depth_m: 0.5, wtSource: 'design' });
    assert.equal(sigma, 17.5 * 0.5);
  });

  test('σ\'v0 at design WT (z=1m)', () => {
    // 0-1m: sand moist (17.5)
    const sigma = computeEffectiveVerticalStress({ profile, depth_m: 1.0, wtSource: 'design' });
    assert.equal(sigma, 17.5 * 1.0);
  });

  test('σ\'v0 below design WT uses saturated weight minus pore pressure', () => {
    // design WT = 1m
    // 0-1m: sand moist (17.5) = 17.5
    // 1-2m: sand sat (19.5) = 19.5
    // Total = 37.0, u = 9.81 * 1 = 9.81, σ' = 27.19
    const sigma = computeEffectiveVerticalStress({ profile, depth_m: 2.0, wtSource: 'design' });
    const expected = 17.5 * 1.0 + 19.5 * 1.0 - GAMMA_W * 1.0;
    assert.ok(Math.abs(sigma - expected) < 0.01, `Got ${sigma}, expected ${expected}`);
  });

  test('σ\'v0 uses measured WT when specified', () => {
    // measured WT = 2m, test at 1.5m (above measured WT)
    const sigmaMeasured = computeEffectiveVerticalStress({ profile, depth_m: 1.5, wtSource: 'measured' });
    const sigmaDesign = computeEffectiveVerticalStress({ profile, depth_m: 1.5, wtSource: 'design' });
    // measured: 0-1.5m all moist = 17.5 * 1.5 = 26.25
    // design: 0-1m moist + 1-1.5m sat - u = 17.5 + 19.5*0.5 - 9.81*0.5 = 17.5 + 9.75 - 4.905 = 22.345
    assert.equal(sigmaMeasured, 17.5 * 1.5);
    assert.ok(sigmaMeasured > sigmaDesign);
  });

  test('σ\'v0 across layer boundary (3m)', () => {
    // design WT = 1m
    // 0-1m: sand moist 17.5 = 17.5
    // 1-3m: sand sat 19.5 * 2 = 39.0
    // Total = 56.5, u = 9.81 * 2 = 19.62, σ' = 36.88
    const sigma = computeEffectiveVerticalStress({ profile, depth_m: 3.0, wtSource: 'design' });
    const expected = 17.5 * 1.0 + 19.5 * 2.0 - GAMMA_W * 2.0;
    assert.ok(Math.abs(sigma - expected) < 0.01, `Got ${sigma}, expected ${expected}`);
  });

  test('σ\'v0 in clay layer (5m)', () => {
    // design WT = 1m
    // 0-1m: sand moist 17.5 = 17.5
    // 1-3m: sand sat 19.5 * 2 = 39.0
    // 3-5m: clay sat 20.0 * 2 = 40.0
    // Total = 96.5, u = 9.81 * 4 = 39.24, σ' = 57.26
    const sigma = computeEffectiveVerticalStress({ profile, depth_m: 5.0, wtSource: 'design' });
    const expected = 17.5 * 1.0 + 19.5 * 2.0 + 20.0 * 2.0 - GAMMA_W * 4.0;
    assert.ok(Math.abs(sigma - expected) < 0.01, `Got ${sigma}, expected ${expected}`);
  });

  test('σ\'v0 in deep sand layer (10m)', () => {
    // design WT = 1m
    // 0-1m: sand moist 17.5 = 17.5
    // 1-3m: sand sat 19.5 * 2 = 39.0
    // 3-8m: clay sat 20.0 * 5 = 100.0
    // 8-10m: sand sat 20.5 * 2 = 41.0
    // Total = 197.5, u = 9.81 * 9 = 88.29, σ' = 109.21
    const sigma = computeEffectiveVerticalStress({ profile, depth_m: 10.0, wtSource: 'design' });
    const expected = 17.5 * 1.0 + 19.5 * 2.0 + 20.0 * 5.0 + 20.5 * 2.0 - GAMMA_W * 9.0;
    assert.ok(Math.abs(sigma - expected) < 0.01, `Got ${sigma}, expected ${expected}`);
  });

  test('layer straddling WT handled correctly', () => {
    // Layer from 0 to 2.0, WT at 1.0
    // 0-1.0: moist, 1.0-2.0: sat
    const customProfile = createSoilProfile({
      layers: [{
        topDepth_m: 0,
        bottomDepth_m: 2.0,
        soilType: SoilType.SAND,
        gammaMoist_kNm3: 17.0,
        gammaSat_kNm3: 19.0,
        cPrime_kPa: 0,
        phiDeg: 30
      }],
      measuredWT_m: 1.0,
      designWT_m: 1.0
    });
    // At 2.0m: 17*1.0 + 19*1.0 - 9.81*1.0 = 26.19
    const sigma = computeEffectiveVerticalStress({ profile: customProfile, depth_m: 2.0, wtSource: 'design' });
    const expected = 17.0 * 1.0 + 19.0 * 1.0 - GAMMA_W * 1.0;
    assert.ok(Math.abs(sigma - expected) < 0.01, `Got ${sigma}, expected ${expected}`);
  });

  test('computeLayerMidDepthStresses returns correct mid-depths', () => {
    const stresses = computeLayerMidDepthStresses(profile, 'design');
    assert.equal(stresses.length, 3);
    assert.equal(stresses[0].midDepth_m, 1.5);
    assert.equal(stresses[1].midDepth_m, 5.5);
    assert.equal(stresses[2].midDepth_m, 11.5);
    // All should have positive effective stress
    stresses.forEach(s => assert.ok(s.sigmaV0Prime_kPa > 0));
  });
});

describe('P1 - Total Vertical Stress & Pore Pressure', () => {
  const profile = createTestProfile();

  test('computeTotalVerticalStress matches manual calc', () => {
    const sigma = computeTotalVerticalStress(profile, 5.0, 'design');
    const expected = 17.5 * 1.0 + 19.5 * 2.0 + 20.0 * 2.0;
    assert.equal(sigma, expected);
  });

  test('computePoreWaterPressure above WT is 0', () => {
    const u = computePoreWaterPressure(profile, 0.5, 'design');
    assert.equal(u, 0);
  });

  test('computePoreWaterPressure below WT is γw * (z - WT)', () => {
    const u = computePoreWaterPressure(profile, 5.0, 'design');
    assert.equal(u, GAMMA_W * (5.0 - 1.0));
  });

  test('σv0 - u = σ\'v0 at various depths', () => {
    for (const depth of [0.5, 1.0, 1.5, 2.0, 3.0, 5.0, 7.5, 10.0, 12.0]) {
      const sigma_v0 = computeTotalVerticalStress(profile, depth, 'design');
      const u = computePoreWaterPressure(profile, depth, 'design');
      const sigma_v0_prime = computeEffectiveVerticalStress({ profile, depth_m: depth, wtSource: 'design' });
      assert.ok(Math.abs((sigma_v0 - u) - sigma_v0_prime) < 0.001, `Failed at depth ${depth}m`);
    }
  });

  // REGRESSION TEST: Bug #4 - σv0 - u = σ'v0 inside a straddling layer (above WT)
  test('σv0 - u = σ\'v0 inside layer straddling WT (depth above WT)', () => {
    // Layer 0.5-2.5m, WT at 1.5m. Test at 1.0m (above WT, inside layer)
    const customProfile = createSoilProfile({
      layers: [{
        topDepth_m: 0,
        bottomDepth_m: 2.0,
        soilType: SoilType.SAND,
        gammaMoist_kNm3: 17.0,
        gammaSat_kNm3: 19.0,
        cPrime_kPa: 0,
        phiDeg: 30
      }],
      measuredWT_m: 1.0,
      designWT_m: 1.0
    });
    const depth = 0.5; // Inside layer, above WT
    const sigma_v0 = computeTotalVerticalStress(customProfile, depth, 'design');
    const u = computePoreWaterPressure(customProfile, depth, 'design');
    const sigma_v0_prime = computeEffectiveVerticalStress({ profile: customProfile, depth_m: depth, wtSource: 'design' });
    // At 1.0m: only 0.5m of layer (0.5-1.0m), all moist
    // σv0 = 17.0 * 0.5 = 8.5, u = 0, σ'v0 = 8.5
    assert.equal(sigma_v0, 8.5);
    assert.equal(u, 0);
    assert.ok(Math.abs((sigma_v0 - u) - sigma_v0_prime) < 0.001);
  });

  // REGRESSION TEST: Bug #4 - σv0 - u = σ'v0 inside a straddling layer (below WT)
  test('σv0 - u = σ\'v0 inside layer straddling WT (depth below WT)', () => {
    // Layer 0-2.0m, WT at 1.0m. Test at 1.5m (below WT, inside layer)
    const customProfile = createSoilProfile({
      layers: [{
        topDepth_m: 0,
        bottomDepth_m: 2.0,
        soilType: SoilType.SAND,
        gammaMoist_kNm3: 17.0,
        gammaSat_kNm3: 19.0,
        cPrime_kPa: 0,
        phiDeg: 30
      }],
      measuredWT_m: 1.0,
      designWT_m: 1.0
    });
    const depth = 1.5; // Inside layer, below WT
    const sigma_v0 = computeTotalVerticalStress(customProfile, depth, 'design');
    const u = computePoreWaterPressure(customProfile, depth, 'design');
    const sigma_v0_prime = computeEffectiveVerticalStress({ profile: customProfile, depth_m: depth, wtSource: 'design' });
    // At 1.5m: 0-1.0m moist (1.0m), 1.0-1.5m sat (0.5m)
    // σv0 = 17.0*1.0 + 19.0*0.5 = 26.5
    // u = 9.81 * (2.0 - 1.5) = 4.905
    // σ'v0 = 21.595
    assert.ok(Math.abs(sigma_v0 - 26.5) < 0.001);
    assert.ok(Math.abs(u - 4.905) < 0.001);
    assert.ok(Math.abs((sigma_v0 - u) - sigma_v0_prime) < 0.001);
  });
});

describe('P1 - Plot Geometry & Layer Lookup', () => {
  const profile = createTestProfile();

  test('getLayerPropertyProfile returns step coordinates', () => {
    const { x, y } = getLayerPropertyProfile(profile, 'gammaMoist_kNm3');
    // 3 layers = 6 points (2 per layer)
    assert.equal(x.length, 6);
    assert.equal(y.length, 6);
    // First layer: 0 to 3 at 17.5
    assert.equal(x[0], 0);
    assert.equal(x[1], 3);
    assert.equal(y[0], 17.5);
    assert.equal(y[1], 17.5);
  });

  test('getLayerPropertyProfile handles missing optional properties', () => {
    const { x, y } = getLayerPropertyProfile(profile, 'su_kPa');
    // Sand layer has undefined su_kPa -> NaN
    assert.ok(Number.isNaN(y[0]));
    assert.ok(Number.isNaN(y[1]));
    // Clay layer has su_kPa = 80
    assert.equal(y[2], 80);
    assert.equal(y[3], 80);
  });

  test('getLayerAtDepth finds correct layer', () => {
    const layer1 = getLayerAtDepth(profile, 1.0);
    assert.equal(layer1.soilType, SoilType.SAND);

    const layer2 = getLayerAtDepth(profile, 5.0);
    assert.equal(layer2.soilType, SoilType.CLAY);

    const layer3 = getLayerAtDepth(profile, 10.0);
    assert.equal(layer3.soilType, SoilType.SAND);
  });

  test('getLayerAtDepth returns null beyond profile', () => {
    const layer = getLayerAtDepth(profile, 20.0);
    assert.equal(layer, null);
  });

  test('getLayerAtDepth at exact bottom of last layer returns last layer', () => {
    const layer = getLayerAtDepth(profile, 15.0);
    assert.equal(layer.soilType, SoilType.SAND);
  });
});

// ============================================================================
// P2 - SPT CORRECTIONS (IS 2131:1981)
// ============================================================================

describe('P2 - Overburden Correction CN (IS 2131:1981 Clause 3.6.1 & Fig. 1)', () => {
  test('CN at σ\'v0 = 0 -> clamped to 2.0', () => {
    const { CN, CN_raw, limited } = computeOverburdenCorrectionCN(0);
    assert.equal(CN, 2.0);
    assert.ok(limited);
  });

  test('CN at σ\'v0 = 10 kPa -> 0.77*log10(2000/10) = 0.77*log10(200) = 0.77*2.301 = 1.77', () => {
    const { CN, CN_raw, limited } = computeOverburdenCorrectionCN(10);
    const expected = 0.77 * Math.log10(2000 / 10);
    assert.ok(Math.abs(CN - expected) < 0.001);
    assert.ok(!limited);
  });

  test('CN at σ\'v0 = 100 kPa -> 0.77*log10(20) = 0.77*1.301 = 1.00', () => {
    const { CN, limited } = computeOverburdenCorrectionCN(100);
    const expected = 0.77 * Math.log10(2000 / 100);
    assert.ok(Math.abs(CN - expected) < 0.001);
    assert.ok(!limited);
  });

  test('CN at σ\'v0 = 200 kPa -> 0.77*log10(10) = 0.77', () => {
    const { CN, limited } = computeOverburdenCorrectionCN(200);
    const expected = 0.77 * Math.log10(2000 / 200);
    assert.ok(Math.abs(CN - expected) < 0.001);
    assert.ok(!limited);
  });

  test('CN at σ\'v0 = 2000 kPa -> 0.77*log10(1) = 0 -> clamped to 0.40', () => {
    const { CN, limited } = computeOverburdenCorrectionCN(2000);
    assert.equal(CN, 0.40);
    assert.ok(limited);
  });

  test('CN at σ\'v0 = 5000 kPa -> clamped to 0.40', () => {
    const { CN, limited } = computeOverburdenCorrectionCN(5000);
    assert.equal(CN, 0.40);
    assert.ok(limited);
  });

  test('CN limited to 2.0 for very low stresses (e.g., 1 kPa)', () => {
    const { CN, limited } = computeOverburdenCorrectionCN(1);
    // 0.77 * log10(2000) = 0.77 * 3.301 = 2.54 > 2.0
    assert.equal(CN, 2.0);
    assert.ok(limited);
  });

  test('CN formula uses SI units (kPa), not kg/cm²', () => {
    // Verify the formula is 0.77 * log10(2000 / σ'v0_kPa)
    // NOT the old 1.7 / (0.7 + σ'v0_kgcm2)
    const { CN } = computeOverburdenCorrectionCN(98.1); // 1 kg/cm² = 98.1 kPa
    const expected = 0.77 * Math.log10(2000 / 98.1);
    assert.ok(Math.abs(CN - expected) < 0.001);
  });
});

describe('P2 - Dilatancy Correction (IS 2131:1981 Clause 3.6.2)', () => {
  test('not applied for coarse sand', () => {
    const result = computeDilatancyCorrection({ N_prime: 20, isFineSandOrSilt: false, belowWaterTable: true });
    assert.equal(result.N_doublePrime, 20);
    assert.ok(!result.applied);
    assert.ok(result.reason.includes('Not fine sand'));
  });

  test('not applied above water table', () => {
    const result = computeDilatancyCorrection({ N_prime: 20, isFineSandOrSilt: true, belowWaterTable: false });
    assert.equal(result.N_doublePrime, 20);
    assert.ok(!result.applied);
    assert.ok(result.reason.includes('Above water table'));
  });

  test('not applied when N\' ≤ 15', () => {
    const result = computeDilatancyCorrection({ N_prime: 15, isFineSandOrSilt: true, belowWaterTable: true });
    assert.equal(result.N_doublePrime, 15);
    assert.ok(!result.applied);
    assert.ok(result.reason.includes('≤ 15'));
  });

  test('applied for fine sand/silt below WT with N\' > 15', () => {
    const result = computeDilatancyCorrection({ N_prime: 25, isFineSandOrSilt: true, belowWaterTable: true });
    // N'' = 15 + 0.5 * (25 - 15) = 20
    assert.equal(result.N_doublePrime, 20);
    assert.ok(result.applied);
    assert.ok(result.reason.includes('N\' = 25'));
  });

  test('N\' = 30 -> N\'\' = 22.5', () => {
    const result = computeDilatancyCorrection({ N_prime: 30, isFineSandOrSilt: true, belowWaterTable: true });
    assert.equal(result.N_doublePrime, 22.5);
  });
});

describe('P2 - Full SPT Correction Pipeline', () => {
  test('coarse sand above WT: only overburden correction (isCohesionless default true)', () => {
    const result = correctSPT_N_IS2131({
      N_field: 10,
      sigmaV0Prime_kPa: 100,
      isFineSandOrSilt: false,
      belowWaterTable: false
    });
    // CN at 100 kPa = 0.77 * log10(20) = 1.002
    // N' = 1.002 * 10 = 10.02
    // No dilatancy
    assert.ok(Math.abs(result.N_prime - 10.02) < 0.1);
    assert.equal(result.N_corrected, result.N_prime);
    assert.ok(!result.dilatancyApplied);
    assert.equal(result.isCohesionless, true);
  });

  test('fine sand below WT, N\' ≤ 15: only overburden', () => {
    const result = correctSPT_N_IS2131({
      N_field: 10,
      sigmaV0Prime_kPa: 100,
      isFineSandOrSilt: true,
      belowWaterTable: true
    });
    // N' ≈ 10.02 ≤ 15, no dilatancy
    assert.equal(result.N_corrected, result.N_prime);
    assert.ok(!result.dilatancyApplied);
  });

  test('fine sand below WT, N\' > 15: both corrections', () => {
    const result = correctSPT_N_IS2131({
      N_field: 30,
      sigmaV0Prime_kPa: 50,
      isFineSandOrSilt: true,
      belowWaterTable: true
    });
    // CN at 50 kPa = 0.77 * log10(40) = 0.77 * 1.602 = 1.234
    // N' = 1.234 * 30 = 37.02
    // N'' = 15 + 0.5 * (37.02 - 15) = 15 + 11.01 = 26.01
    assert.ok(result.N_prime > 15);
    assert.ok(result.dilatancyApplied);
    assert.ok(Math.abs(result.N_doublePrime - 26.01) < 0.1);
    assert.equal(result.N_corrected, result.N_doublePrime);
  });

  // REGRESSION TEST: Bug #1 - isCohesionless=false skips overburden & dilatancy
  test('clay (isCohesionless=false): CN=1.0, N\'=N_field, no dilatancy', () => {
    const result = correctSPT_N_IS2131({
      N_field: 8,
      sigmaV0Prime_kPa: 100,
      isFineSandOrSilt: true,
      belowWaterTable: true,
      isCohesionless: false
    });
    assert.equal(result.CN, 1.0);
    assert.equal(result.CN_raw, 1.0);
    assert.ok(!result.CN_limited);
    assert.equal(result.N_prime, 8); // N' = N_field
    assert.equal(result.N_doublePrime, 8); // No dilatancy
    assert.ok(!result.dilatancyApplied);
    assert.equal(result.isCohesionless, false);
    assert.equal(result.N_corrected, 8);
  });

  test('CN clamped to [0.40, 2.0] range', () => {
    // Very low stress -> CN = 2.0
    let result = correctSPT_N_IS2131({ N_field: 5, sigmaV0Prime_kPa: 1, isFineSandOrSilt: false, belowWaterTable: false });
    assert.equal(result.CN, 2.0);
    assert.equal(result.N_prime, 10);

    // Very high stress -> CN = 0.40
    result = correctSPT_N_IS2131({ N_field: 50, sigmaV0Prime_kPa: 10000, isFineSandOrSilt: false, belowWaterTable: false });
    assert.equal(result.CN, 0.40);
    assert.equal(result.N_prime, 20);
  });

  test('returns all intermediate values including isCohesionless', () => {
    const result = correctSPT_N_IS2131({
      N_field: 20,
      sigmaV0Prime_kPa: 80,
      isFineSandOrSilt: true,
      belowWaterTable: true
    });
    assert.ok('N_field' in result);
    assert.ok('sigmaV0Prime_kPa' in result);
    assert.ok('CN_raw' in result);
    assert.ok('CN' in result);
    assert.ok('CN_limited' in result);
    assert.ok('N_prime' in result);
    assert.ok('N_doublePrime' in result);
    assert.ok('dilatancyApplied' in result);
    assert.ok('dilatancyReason' in result);
    assert.ok('N_corrected' in result);
    assert.ok('isCohesionless' in result);
  });
});

describe('P2 - Batch SPT Correction', () => {
  const profile = createTestProfile();

  // REGRESSION TEST: Bug #2 - default wtSource changed to 'measured'
  test('correctSPT_N_Batch default wtSource is measured', () => {
    const tests = [{ depth_m: 1.5, N_field: 15, isFineSandOrSilt: false }];
    const results = correctSPT_N_Batch(tests, profile); // No wtSource specified
    // Should use measured WT (2.0m), so 1.5m is above measured WT
    assert.ok(results[0].belowWaterTable === false);
  });

  test('correctSPT_N_Batch computes σ\'v0 from profile with measured WT', () => {
    const tests = [
      { depth_m: 1.5, N_field: 15, isFineSandOrSilt: false },
      { depth_m: 5.0, N_field: 10, isFineSandOrSilt: true }
    ];
    const results = correctSPT_N_Batch(tests, profile); // default 'measured'

    assert.equal(results.length, 2);
    // 1.5m < measured WT (2.0m) -> above WT
    assert.equal(results[0].belowWaterTable, false);
    // 5.0m > measured WT (2.0m) -> below WT
    assert.equal(results[1].belowWaterTable, true);
  });

  test('correctSPT_N_Batch respects explicit wtSource parameter', () => {
    const tests = [{ depth_m: 1.5, N_field: 15, isFineSandOrSilt: false }];
    // With design WT (1.0m), 1.5m is below WT
    const results = correctSPT_N_Batch(tests, profile, 'design');
    assert.equal(results[0].belowWaterTable, true);
  });

  test('correctSPT_N_Batch passes isCohesionless through', () => {
    const tests = [{ depth_m: 5.0, N_field: 8, isFineSandOrSilt: true, isCohesionless: false }];
    const results = correctSPT_N_Batch(tests, profile, 'measured');
    assert.equal(results[0].isCohesionless, false);
    assert.equal(results[0].CN, 1.0);
  });
});

// ============================================================================
// P2 - DIRECT SHEAR OLS REGRESSION
// ============================================================================

describe('P2 - Direct Shear OLS', () => {
  test('perfect linear fit: τ = 10 + σn * tan(30°)', () => {
    const tan30 = Math.tan(30 * Math.PI / 180);
    const dataPoints = [
      { sigma_n_kPa: 50, tau_f_kPa: 10 + 50 * tan30 },
      { sigma_n_kPa: 100, tau_f_kPa: 10 + 100 * tan30 },
      { sigma_n_kPa: 150, tau_f_kPa: 10 + 150 * tan30 },
      { sigma_n_kPa: 200, tau_f_kPa: 10 + 200 * tan30 }
    ];
    const result = directShearOLS(dataPoints);
    assert.ok(Math.abs(result.cPrime_kPa - 10) < 0.01);
    assert.ok(Math.abs(result.phiDeg - 30) < 0.01);
    assert.ok(Math.abs(result.R2 - 1.0) < 1e-10);
  });

  test('cohesionless sand: c\' = 0, φ\' = 35°', () => {
    const tan35 = Math.tan(35 * Math.PI / 180);
    const dataPoints = [
      { sigma_n_kPa: 50, tau_f_kPa: 50 * tan35 },
      { sigma_n_kPa: 100, tau_f_kPa: 100 * tan35 },
      { sigma_n_kPa: 200, tau_f_kPa: 200 * tan35 }
    ];
    const result = directShearOLS(dataPoints);
    assert.ok(result.cPrime_kPa < 0.1);
    assert.ok(Math.abs(result.phiDeg - 35) < 0.01);
    assert.ok(Math.abs(result.R2 - 1.0) < 1e-10);
  });

  test('clay with cohesion: c\' = 25 kPa, φ\' = 20°', () => {
    const tan20 = Math.tan(20 * Math.PI / 180);
    const dataPoints = [
      { sigma_n_kPa: 50, tau_f_kPa: 25 + 50 * tan20 },
      { sigma_n_kPa: 100, tau_f_kPa: 25 + 100 * tan20 },
      { sigma_n_kPa: 150, tau_f_kPa: 25 + 150 * tan20 },
      { sigma_n_kPa: 200, tau_f_kPa: 25 + 200 * tan20 }
    ];
    const result = directShearOLS(dataPoints);
    assert.ok(Math.abs(result.cPrime_kPa - 25) < 0.1);
    assert.ok(Math.abs(result.phiDeg - 20) < 0.1);
    assert.ok(Math.abs(result.R2 - 1.0) < 1e-10);
  });

  test('realistic data with scatter', () => {
    const dataPoints = [
      { sigma_n_kPa: 50, tau_f_kPa: 42 },
      { sigma_n_kPa: 100, tau_f_kPa: 70 },
      { sigma_n_kPa: 150, tau_f_kPa: 95 },
      { sigma_n_kPa: 200, tau_f_kPa: 122 },
      { sigma_n_kPa: 250, tau_f_kPa: 148 }
    ];
    const result = directShearOLS(dataPoints);
    assert.ok(result.cPrime_kPa >= 0);
    assert.ok(result.phiDeg > 0 && result.phiDeg < 45);
    assert.ok(result.R2 > 0.95);
    assert.equal(result.fittedLine.length, 2);
    assert.ok(result.fittedLine[0].sigma_n_kPa < result.fittedLine[1].sigma_n_kPa);
  });

  test('rejects fewer than 2 points', () => {
    assert.throws(() => directShearOLS([{ sigma_n_kPa: 100, tau_f_kPa: 50 }]));
  });

  test('rejects identical sigma_n values', () => {
    const dataPoints = [
      { sigma_n_kPa: 100, tau_f_kPa: 50 },
      { sigma_n_kPa: 100, tau_f_kPa: 60 }
    ];
    assert.throws(() => directShearOLS(dataPoints));
  });

  test('rejects negative values', () => {
    const dataPoints = [
      { sigma_n_kPa: -10, tau_f_kPa: 50 },
      { sigma_n_kPa: 100, tau_f_kPa: 60 }
    ];
    assert.throws(() => directShearOLS(dataPoints));
  });

  test('returns residuals for diagnostics', () => {
    const dataPoints = [
      { sigma_n_kPa: 50, tau_f_kPa: 42 },
      { sigma_n_kPa: 100, tau_f_kPa: 70 }
    ];
    const result = directShearOLS(dataPoints);
    assert.equal(result.residuals.length, 2);
    assert.ok('residual_kPa' in result.residuals[0]);
    assert.ok('tau_fitted_kPa' in result.residuals[0]);
  });

  test('c\' clamped to >= 0', () => {
    const dataPoints = [
      { sigma_n_kPa: 200, tau_f_kPa: 140 },
      { sigma_n_kPa: 300, tau_f_kPa: 210 },
      { sigma_n_kPa: 400, tau_f_kPa: 280 }
    ];
    const result = directShearOLS(dataPoints);
    assert.ok(result.cPrime_kPa >= 0);
  });

  // REGRESSION TEST: Bug #3 - SE guarded against floating-point negative MSE
  test('SE guarded against negative MSE from floating-point noise', () => {
    // Create data that could produce slightly negative MSE due to FP error
    // Perfect fit through origin with 3 points
    const dataPoints = [
      { sigma_n_kPa: 100, tau_f_kPa: 70 },
      { sigma_n_kPa: 200, tau_f_kPa: 140 },
      { sigma_n_kPa: 300, tau_f_kPa: 210 }
    ];
    const result = directShearOLS(dataPoints);
    // MSE should be 0 (perfect fit), SE = sqrt(max(0, MSE)) = 0
    assert.ok(result.MSE >= 0);
    assert.equal(result.SE_kPa, 0);
    assert.ok(Number.isFinite(result.SE_kPa));
  });

  test('SE is finite for near-perfect fits', () => {
    // Nearly collinear points that might produce tiny negative MSE
    const dataPoints = [
      { sigma_n_kPa: 100, tau_f_kPa: 57.735 },
      { sigma_n_kPa: 200, tau_f_kPa: 115.47 },
      { sigma_n_kPa: 300, tau_f_kPa: 173.205 }
    ];
    const result = directShearOLS(dataPoints);
    assert.ok(Number.isFinite(result.SE_kPa));
    assert.ok(result.SE_kPa >= 0);
  });
});

describe('P2 - Phi Estimation from SPT', () => {
  test('sand correlations', () => {
    assert.equal(estimatePhiFromSPT(3, 'sand'), 28);
    assert.equal(estimatePhiFromSPT(5, 'sand'), 30);
    assert.equal(estimatePhiFromSPT(20, 'sand'), 34);
    assert.equal(estimatePhiFromSPT(40, 'sand'), 38);
    assert.equal(estimatePhiFromSPT(60, 'sand'), 42);
  });

  test('silt correlations', () => {
    assert.equal(estimatePhiFromSPT(3, 'silt'), 26);
    assert.equal(estimatePhiFromSPT(5, 'silt'), 28);
    assert.equal(estimatePhiFromSPT(20, 'silt'), 30);
    assert.equal(estimatePhiFromSPT(40, 'silt'), 32);
    assert.equal(estimatePhiFromSPT(60, 'silt'), 34);
  });

  test('clay returns 0', () => {
    assert.equal(estimatePhiFromSPT(20, 'clay'), 0);
  });
});

// ============================================================================
// INTEGRATION TESTS
// ============================================================================

describe('Integration - Profile + SPT Corrections', () => {
  const profile = createTestProfile();

  test('SPT at 1.5m (sand, above measured WT, below design WT)', () => {
    // Using default measured WT (2.0m)
    const result = correctSPT_N_IS2131({
      N_field: 18,
      sigmaV0Prime_kPa: computeEffectiveVerticalStress({ profile, depth_m: 1.5, wtSource: 'measured' }),
      isFineSandOrSilt: false,
      belowWaterTable: false // 1.5m < measured WT (2.0m)
    });
    assert.ok(result.N_prime > 0);
    assert.ok(!result.dilatancyApplied); // coarse sand
  });

  test('SPT at 5m (clay, below both WTs) with isCohesionless=false', () => {
    const result = correctSPT_N_IS2131({
      N_field: 8,
      sigmaV0Prime_kPa: computeEffectiveVerticalStress({ profile, depth_m: 5.0, wtSource: 'measured' }),
      isFineSandOrSilt: false,
      belowWaterTable: true,
      isCohesionless: false // clay
    });
    assert.equal(result.CN, 1.0);
    assert.equal(result.N_prime, 8);
    assert.equal(result.N_corrected, 8);
  });

  test('SPT at 10m (dense sand, below both WTs)', () => {
    const result = correctSPT_N_IS2131({
      N_field: 45,
      sigmaV0Prime_kPa: computeEffectiveVerticalStress({ profile, depth_m: 10.0, wtSource: 'measured' }),
      isFineSandOrSilt: false,
      belowWaterTable: true
    });
    assert.ok(result.N_prime > 0);
    assert.ok(!result.dilatancyApplied); // coarse sand
  });
});