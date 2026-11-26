import test from 'node:test';
import assert from 'node:assert/strict';
import { analyzeHostel, calculatorInput, siteProfile } from '../examples/hostel.js';
import { validateSoilProfile } from '../js/models.js';
import { computeTotalSettlement } from '../js/settlement.js';
import { computeOverburdenCorrectionCN } from '../js/spt.js';

test('Group 6 checks every column and every 5 m bay with importable profiles', () => {
  const { columns, pairs } = analyzeHostel();
  assert.equal(new Set(columns.map(c => c.name)).size, 28);
  assert.equal(new Set(pairs.map(p => p.a + p.b)).size, 45);
  for (const c of columns) {
    assert.equal(validateSoilProfile(siteProfile(c.id)).valid, true);
    assert.equal(calculatorInput(c).f.V, c.footing.loadV_kN);
    assert.ok(Number.isFinite(c.total) && c.total > 0);
  }
  assert.equal(columns.find(c => c.name === 'C4').footing.My_kNm, 159);
  assert.ok(pairs[0].delta > 10);
  assert.ok(pairs.every(p => p.delta <= pairs[0].delta));
});

test('missing stiffness in one contributing granular layer marks a partial result', () => {
  const profile = siteProfile('BH-1');
  delete profile.layers[2].Es_kPa;
  const footing = {B_m:3,L_m:3,Df_m:1.5,shape:'square'};
  const s = computeTotalSettlement({profile,footing,q_net_kPa:120});
  assert.deepEqual(s.granular.missingStiffness,[2]);
  assert.ok(s.S_total_mm > 0 && !s.complete);
});

test('SPT logarithmic curve follows graphical benchmarks over typical design stresses', () => {
  // Approximate readings of Fig. 1, IS 2131:1981; 1 kgf/cm² = 98.0665 kPa.
  for (const [pressure, chart] of [[0.5,1.24],[1,1.0],[2,0.78],[3,0.63]]) {
    assert.ok(Math.abs(computeOverburdenCorrectionCN(pressure*98.0665).CN-chart)<0.05);
  }
});
