// Run from any directory with node examples/build-report.js.
import {writeFileSync} from 'node:fs';
import {analyzeHostel, siteProfile, groundRL, holes, shearFits} from './hostel.js';

const {columns,pairs} = analyzeHostel();
const worst = pairs[0];
const fmt = n => n.toFixed(1);
const table = (headers,rows) => '<div class="tbl-wrap"><table><thead><tr>'+headers.map(h=>'<th>'+h+'</th>').join('')+'</tr></thead><tbody>'+rows.map(row=>'<tr>'+row.map(cell=>'<td>'+cell+'</td>').join('')+'</tr>').join('')+'</tbody></table></div>';
const colors = ['#e0dfd8','#f0cc82','#d9a958','#a5b9bd','#bbbec8'];
// Common reduced-level datum makes both clay boundaries comparable across the site.
function section() {
  const y = rl => 40+(101-rl)*16;
  const centers = [90,255,420];
  let drawing = '';
  for (const [i,id] of holes.entries()) {
    const p = siteProfile(id), x = centers[i], rl = groundRL(id);
    drawing += '<text x="'+x+'" y="20" text-anchor="middle">'+id+'</text>';
    p.layers.forEach((layer,k)=>{
      const top=y(rl-layer.topDepth_m), height=(layer.bottomDepth_m-layer.topDepth_m)*16;
      drawing += '<rect x="'+(x-38)+'" y="'+top+'" width="76" height="'+height+'" stroke="#556" fill="'+colors[k]+'"/>';
      if (height>16) drawing += '<text x="'+x+'" y="'+(top+height/2+4)+'" text-anchor="middle">'+['Fill','SM','SP','CI','GW'][k]+'</text>';
    });
    for (const [wt,color] of [[p.measuredWT_m,'#194879'],[p.designWT_m,'#168477']]) {
      drawing += '<path d="M'+(x-46)+' '+y(rl-wt)+'h92" stroke="'+color+'" stroke-width="2" stroke-dasharray="5 2"/>';
    }
    if(i) for(const edge of ['topDepth_m','bottomDepth_m']) {
      const prev=holes[i-1];
      drawing += '<line x1="'+(centers[i-1]+38)+'" y1="'+y(groundRL(prev)-siteProfile(prev).layers[3][edge])+'" x2="'+(x-38)+'" y2="'+y(rl-p.layers[3][edge])+'" stroke="#444" stroke-dasharray="3 3"/>';
    }
  }
  for(const rl of [100,95,90,85]) drawing += '<text x="3" y="'+y(rl)+'">'+rl+'</text>';
  return '<svg viewBox="0 0 500 315" role="img" aria-label="West to east site section on a common elevation datum" style="max-width:720px;width:100%;font:12px sans-serif">'+drawing+'</svg>';
}
const schedule = table(['Column','Hole','P column (kN)','B × L (m)','V gross (kN)','Mᵧ (kN·m)','q net (kPa)','q net safe (kPa)','Bearing','Granular (mm)','Clay (mm)','Total (mm)','Total ≤60 mm'], columns.map(c=>[
  '<a href="../index.html?column='+c.name+'">'+c.name+'</a>',c.id,fmt(c.load),fmt(c.footing.B_m)+' × '+fmt(c.footing.L_m),fmt(c.footing.loadV_kN),fmt(c.footing.My_kNm),fmt(c.net),fmt(c.capacity.qns_kPa),c.net<=c.capacity.qns_kPa?'Pass':'Fail',fmt(c.immediate),fmt(c.clay),fmt(c.total),c.total<=60?'Pass':'Fail'
]));
const grid = table(['Grid',1,2,3,4,5,6,7],['A','B','C','D'].map((r,i)=>[r,...columns.filter(c=>c.row===i).map(c=>[worst.a,worst.b].includes(c.name)?'<strong>'+fmt(c.total)+'</strong>':fmt(c.total))]));
const differences = table(['Pair','Difference (mm)','Distortion (rad, small angle)','≤10 mm and ≤1/500'],pairs.map(p=>[p.a+'–'+p.b,fmt(p.delta),p.angle.toFixed(5),p.delta<=10?'Pass':'Fail']));
const sensitivity = table(['BH-3 Cc and Cr multiplier','Maximum BH-3 total (mm)','Critical bay, whole site','Difference (mm)'],[0.7,1,1.3].map(f=>{
  const r=analyzeHostel(f);
  return [f,fmt(Math.max(...r.columns.filter(c=>c.id==='BH-3').map(c=>c.total))),r.pairs[0].a+'–'+r.pairs[0].b,fmt(r.pairs[0].delta)];
}));
const report = `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Group 6 hostel foundation study</title><link rel="stylesheet" href="../css/styles.css"><main class="wrap">
<a href="../index.html">Open calculator</a><h1>Group 6 · Mandi hostel foundation study</h1>
<p>Trial isolated footings fail the adopted criteria. ${columns.filter(c=>c.net>c.capacity.qns_kPa).length} of 28 exceed net safe bearing capacity. The governing 5 m bay is ${worst.a}–${worst.b}, with ${fmt(worst.delta)} mm differential settlement. C4 is a provisional load scenario throughout.</p>
<h2>Ground model, west to east</h2>${section()}
<p>Elevations in metres RL. Blue dashes show the measured water table and green dashes the seasonal high used for design. Dotted boundaries interpolate the clay between logs. Horizontal spacing is schematic. BH-2 serves lines 1–2, BH-1 lines 3–5 and BH-3 lines 6–7. The design water depths are 1.7, 1.0 and 0.6 m respectively.</p>
<h2>Inputs and assumptions</h2>
<p>The 30 × 15 m grid has 5 m bays. Service column loads use λ = 1.06. C4 has no specified load row. For a reproducible sensitivity baseline only, assume unscaled P = 1450 kN and Mᵧ = 150 kN·m, giving 1537 kN and 159 kN·m. Confirm both and the moment axis before adopting a design. All footings start at 1.5 m bgl. Gross V adds 0.5 m of concrete at 24 kN/m³ and 1.0 m of backfill at 18 kN/m³, over the full footing area. Water loading is represented consistently by total service loads and excavation relief. No horizontal load was supplied.</p>
<p>Drained shear regressions (c′ in kPa, φ′ in degrees) for SM unsoaked, SM soaked and SP soaked respectively give ${shearFits.map(s=>fmt(s.cPrime_kPa)+' / '+fmt(s.phiDeg)).join(', ')}. Use soaked angles for seasonal groundwater and neglect apparent cohesion. Transfer BH-1 sand angles to the other holes as an assumption. The two UU series give mean sᵤ of 28.5 and 36.1 kPa from half the failure deviator; these describe BH-1 clay. Exclude the cobble strike at 9 m and retain refusal as a penetration observation. Neither provides a representative numerical clay or gravel N.</p>
<p>For UDS-1, 1 kgf/cm² = 98.0665 kPa. The virgin 2–8 kgf/cm² slope gives Cc = 0.292 and the 8–0.5 unloading slope gives Cr = 0.038. Adopt the loading knee near 1 kgf/cm² as an approximate σ′p of 98 kPa. The 2 kgf/cm² increment gives cᵥ = 6.3 × 10⁻⁸ m²/s. BH-1 uses e₀ = 0.918. Assume saturated clay and Gs = 2.70 at the other holes, giving e₀ = wGs. Transfer BH-1 compression parameters provisionally and vary both slopes at BH-3. Drainage is assumed double between permeable granular strata. Granular moduli (SM/SP, MPa) are assumed 20/42, 18/35 and 9/22 west to east based on relative SPT resistance; gravel modulus is assumed 80 MPa. These are stiffness estimates, not laboratory measurements.</p>
<h2>Footing schedule</h2><p>All cases use FoS 3 on net ultimate capacity. Adopt local shear as a conservative trial for loose or medium-dense founding sand; IS 6403 Table 3 allows interpolation for medium density when density evidence supports it. Each column link opens that footing and its borehole in the editable calculator. The building calculation adds the other 27 footings to clay stress; P5 opened individually shows the single-footing result.</p>${schedule}
<h2>Settlement on the column grid (mm)</h2>${grid}<p>The bold cells identify the governing adjacent pair. Adopt the 60 mm total guide for isolated footings founded in sand over clay and the 0.002L and 1/500 guides for a multistorey frame with masonry panel walls (IS 1904:1986 Table 1, iii(a)). For L = 5000 mm the limit is 10 mm. Each row below uses unrounded settlement values.</p>${differences}
<h2>Method and sensitivity</h2><p>Granular settlement uses Schmertmann et al. (1978), at one year for its creep factor. Clay settlement is ultimate primary settlement on sublayers ≤0.5 m, summing signed Newmark rectangular corner stresses from all footings at each midpoint. For C4, use a uniform effective rectangle centred under the resultant. Local granular settlement omits adjacent-footing interaction. The calculation assumes laterally continuous layers within each borehole zone. Actual transition geometry needs confirmation.</p>${sensitivity}
<h2>Foundation decision</h2><p>Reject this shallow trial. Wider bases within 5 m bays have limited clearance and still load a continuous compressible clay layer. A raft can redistribute column loads, but also loads the full clay thickness. Prefer investigation of a single piled foundation system through the clay into the very dense gravel, including the zone transitions, to reduce differential movement. The top of gravel is at 9.6, 10.6 and 11.2 m bgl west to east. A conceptual four-pile cap beneath an ordinary interior column carries about 384 kN per pile from the 1537 kN column load alone, before cap weight and moment redistribution. This is demand only. Select diameter, penetration and spacing from deeper investigation and load testing; verify group settlement, downdrag, seismic/lateral response, boulders and stream-side groundwater before accepting the alternative.</p>
<h2>Calculation references</h2><p>IS 2131:1981 §3.6 and Fig. 1 (SPT); IS 6403:1981 §§4–5, Tables 1–3 (effective dimensions, bearing and modifiers); IS 1904:1986 Table 1 iii(a) (settlement criteria); Schmertmann, Hartman &amp; Brown (1978), Improved Strain Influence Factor Diagrams; Newmark (1935), Simplified Computation of Vertical Pressures in Elastic Foundations; Das, Principles of Foundation Engineering (2010), effective stress and one-dimensional consolidation; IS 8009 Part 1 (1976). Site inputs are from the supplied CE 402 assignment, pp. 1–6.</p></main></html>`;
writeFileSync(new URL('./hostel.html',import.meta.url), report+'\n');
