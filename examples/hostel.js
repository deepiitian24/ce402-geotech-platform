// Optional Group 6 dataset. The general-purpose calculator starts with a blank profile.
import { computeBearingCapacityIS6403 } from '../js/bearingCapacity.js';
import { computeTotalVerticalStress } from '../js/soilProfile.js';
import { directShearOLS } from '../js/spt.js';
import { boussinesqCorner } from '../js/stress.js';
import { computeSchmertmannSettlement, computeConsolidationSettlement } from '../js/settlement.js';

const shear = (values) => directShearOLS(values.map((tau, i) => ({sigma_n_kPa: 50 * (i + 1), tau_f_kPa: tau})));
export const shearFits = [[37,67,97.2], [29.8,58.9,87.5], [34.9,68.3,103.4]].map(shear);
// Oedometer compression and rebound slopes on e-log10(p), IS 8009 Part 1.
const Cc = (0.779 - 0.603) / Math.log10(8 / 2);
const Cr = (0.649 - 0.603) / Math.log10(8 / 0.5);
const input = {
  'BH-2': {rl:100.20, wt:3.2, high:1.7, ends:[0.5,3.8,7.6,9.6,15], moist:[16.5,18.2,19.3,18,20], sat:[19,20,20.6,18.7,21.5], Es:[0,20000,42000,0,80000], spt:[[1.5,14],[3,17],[4.5,26],[6,31],[7.5,34],[9,9]]},
  'BH-1': {rl:100, wt:2.6, high:1, ends:[0.6,3.4,5.8,10.6,15], moist:[16.5,18,19,18,20], sat:[19,20,20.4,18.6,21.5], Es:[0,18000,35000,0,80000], spt:[[1.5,13],[3,16],[4.5,24],[6,6],[7.5,5],[10.5,8]]},
  'BH-3': {rl:99.70, wt:1.9, high:0.6, ends:[0.9,2.6,4.4,11.2,15], moist:[16,17.5,18.6,18,20], sat:[19,19.5,20,18.5,21.5], Es:[0,9000,22000,0,80000], spt:[[1.5,6],[3,14],[4.5,4],[6,4],[7.5,5],[9,6],[10.5,8]]}
};
export const holes = Object.keys(input);
export const groundRL = id => input[id].rl;
export function siteProfile(id, clayFactor = 1) {
  const data = input[id];
  const types = ['fill','sand','sand','clay','gravel'];
  const phi = [0, shearFits[1].phiDeg, shearFits[2].phiDeg, 0, 38];
  const layers = data.ends.map((end,i) => ({
    topDepth_m:i ? data.ends[i-1] : 0, bottomDepth_m:end, soilType:types[i],
    gammaMoist_kNm3:data.moist[i], gammaSat_kNm3:data.sat[i], cPrime_kPa:0, phiDeg:phi[i],
    ...(data.Es[i] ? {Es_kPa:data.Es[i]} : {}),
    ...(i === 3 ? {e0:id === 'BH-1' ? 0.918 : 2.7 * (id === 'BH-2' ? 0.33 : 0.35), Cc:Cc*clayFactor, Cr:Cr*clayFactor, sigmaP_kPa:98.0665, cv_m2s:6.3e-8} : {})
  }));
  return {layers, measuredWT_m:data.wt, designWT_m:data.high};
}

function column(row,line) {
  const name = 'ABCD'[row] + line;
  const id = line <= 2 ? 'BH-2' : line <= 5 ? 'BH-1' : 'BH-3';
  const profile = siteProfile(id);
  const outerRow = row === 0 || row === 3;
  const outerLine = line === 1 || line === 7;
  const load = 1.06 * (outerRow && outerLine ? 650 : outerRow || outerLine ? 1000 : 1450);
  const B = outerRow && outerLine ? 2.8 : outerRow || outerLine ? 3.3 : 3.8;
  const L = name === 'C4' ? 4.1 : B;
  // Assumed 0.50 m RC at 24 kN/m³ and 1 m backfill at 18 kN/m³ above footing.
  const V = load + B * L * 30;
  const footing = {shape:B === L ? 'square' : 'rectangular', B_m:B, L_m:L, Df_m:1.5,
    loadV_kN:V, Mx_kNm:0, My_kNm:name === 'C4' ? 150*1.06 : 0, loadH_kN:0, fos:3};
  const layer = profile.layers[1];
  const capacity = computeBearingCapacityIS6403({footing, profile, gamma_kNm3:profile.designWT_m <= 1.5 ? layer.gammaSat_kNm3 : layer.gammaMoist_kNm3,
    cPrime_kPa:0, phiDeg:layer.phiDeg, shearMode:'local'});
  const net = V/capacity.A_prime_m2 - computeTotalVerticalStress(profile,1.5);
  return {name,id,row,line,load,footing,capacity,net, x:(line-1)*5 + capacity.eB_m, y:row*5};
}

export function calculatorInput(c) {
  const p = siteProfile(c.id);
  const spt = input[c.id].spt.map(([depth,N]) => ({depth,N,coh:depth < p.layers[3].topDepth_m,fine:depth < p.layers[1].bottomDepth_m}));
  const f = c.footing;
  return {layers:p.layers, measuredWT:p.measuredWT_m, designWT:p.designWT_m,spt,
    ds:[29.8,58.9,87.5].map((tf,i)=>({sn:50*(i+1),tf})),
    f:{shape:f.shape,B:f.B_m,L:f.L_m,Df:f.Df_m,V:f.loadV_kN,H:0,Mx:f.Mx_kNm,My:f.My_kNm,fos:3,mode:'local',wt:'design',manual:false},
    st:{shape:f.shape,B:c.capacity.B_prime_m,L:c.capacity.L_prime_m,q:c.net,zmax:12,zstep:0.5},
    t:{q:'',qDirty:false,years:1,unit:'years',drainage:'double'}};
}

// Signed corner superposition, Newmark (1935). Each rectangle is loaded on its own base elevation.
function influence(c,x,y,elevation) {
  const z = groundRL(c.id) - c.footing.Df_m - elevation;
  if (z <= 0) return 0;
  const corner = (a,b) => Math.sign(a*b) * boussinesqCorner({q_kPa:c.net,B_m:Math.abs(a),L_m:Math.abs(b),z_m:z});
  const dx = c.x-x, dy = c.y-y;
  const halfB = c.capacity.B_prime_m/2, halfL = c.capacity.L_prime_m/2;
  return corner(dx+halfB,dy+halfL)-corner(dx-halfB,dy+halfL)-corner(dx+halfB,dy-halfL)+corner(dx-halfB,dy-halfL);
}

export function analyzeHostel(eastClayFactor=1) {
  const columns = Array.from({length:28},(_,i)=>column(Math.floor(i/7),i%7+1));
  for (const c of columns) {
    const profile = siteProfile(c.id,c.id === 'BH-3' ? eastClayFactor : 1);
    const granular = computeSchmertmannSettlement({profile, B_m:c.capacity.B_prime_m,L_m:c.capacity.L_prime_m,
      Df_m:1.5,shape:c.footing.shape,q_net_kPa:c.net,time_years:1});
    const clay = computeConsolidationSettlement({profile,layer:profile.layers[3],
      deltaSigmaFn:depth=>columns.reduce((sum,other)=>sum+influence(other,c.x,c.y,groundRL(c.id)-depth),0)});
    c.immediate = granular.S_mm;
    c.clay = clay.S_mm;
    c.total = c.immediate + c.clay;
  }
  const pairs = [];
  for (const c of columns) {
    for (const other of columns.filter(o=>o.row===c.row && o.line===c.line+1 || o.line===c.line && o.row===c.row+1)) {
      const delta = Math.abs(c.total-other.total);
      pairs.push({a:c.name,b:other.name,delta,angle:delta/5000});
    }
  }
  return {columns,pairs:pairs.sort((a,b)=>b.delta-a.delta)};
}
