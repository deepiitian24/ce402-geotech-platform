/**
 * CE 402 Geotechnical Engineering Platform: UI layer.
 * Wires the verified engine modules (models, soilProfile, spt, bearingCapacity, stress, settlement)
 * to the DOM. No engineering equation is implemented here; every number shown comes from the engine.
 */

import { SoilType, validateSoilProfile, validateFooting, createFooting } from './models.js';
import {
  computeEffectiveVerticalStress, computeTotalVerticalStress, computePoreWaterPressure,
  computeLayerMidDepthStresses, getLayerAtDepth
} from './soilProfile.js';
import { correctSPT_N_Batch, directShearOLS, estimatePhiFromSPT } from './spt.js';
import { computeBearingCapacityIS6403, computeEffectiveDimensions } from './bearingCapacity.js';
import { generateStressProfile } from './stress.js';
import {
  computeTotalSettlement, generateTimeSettlementCurve, schmertmannIz
} from './settlement.js';

// ============================================================================
// HELPERS
// ============================================================================
const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const num = (v) => {
  if (v === '' || v === null || v === undefined) return undefined;
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
};
const fmt = (x, d = 2) => (typeof x === 'number' && Number.isFinite(x) ? x.toFixed(d) : '–');
const fmtSci = (x) => (typeof x === 'number' && Number.isFinite(x) ? x.toExponential(2) : '–');
const cap = (s) => (s ? s[0].toUpperCase() + s.slice(1) : '');
const showMsgs = (el, items, kind = 'err') => {
  el.innerHTML = items.map((m) => `<div class="msg ${kind}">${esc(m)}</div>`).join('');
};
const clearTbody = (id) => { $(id).innerHTML = ''; };

// ============================================================================
// STATE (all user-editable; nothing is hard-coded)
// ============================================================================
const LAYER_COLS = [
  { k: 'topDepth_m', step: 0.1 }, { k: 'bottomDepth_m', step: 0.1 }, { k: 'soilType' },
  { k: 'gammaMoist_kNm3', step: 0.1 }, { k: 'gammaSat_kNm3', step: 0.1 }, { k: 'cPrime_kPa', step: 1 },
  { k: 'phiDeg', step: 0.5 }, { k: 'su_kPa', step: 1 }, { k: 'Es_kPa', step: 500 }, { k: 'e0', step: 0.01 },
  { k: 'Cc', step: 0.01 }, { k: 'Cr', step: 0.01 }, { k: 'sigmaP_kPa', step: 1 }, { k: 'cv_m2s', step: 'any' }
];
const NUM_KEYS = LAYER_COLS.filter((c) => c.k !== 'soilType').map((c) => c.k);

const state = {
  measuredWT: '', designWT: '',
  layers: [],
  spt: [],
  ds: [],
  calc: { depth: '3', wt: 'design' },
  f: { shape: 'strip', B: '', L: '1', Df: '', V: '', H: '0', Mx: '0', My: '0', fos: '3', mode: 'local', wt: 'design', gamma: '', c: '', phi: '', manual: false },
  st: { q: '', shape: 'square', B: '', L: '', zmax: '10', zstep: '0.5' },
  t: { q: '', years: '0.1', unit: 'days', drainage: 'double', qDirty: false }
};
let activeTab = 'p1';
const charts = {};

const blankLayer = (top = '') => ({ topDepth_m: top, bottomDepth_m: '', soilType: SoilType.SAND });

function sampleData() {
  const L = (top, bot, type, gm, gs, c, phi, extra = {}) =>
    ({ topDepth_m: top, bottomDepth_m: bot, soilType: type, gammaMoist_kNm3: gm, gammaSat_kNm3: gs, cPrime_kPa: c, phiDeg: phi, ...extra });
  return {
    measuredWT: '1.5', designWT: '1.0',
    layers: [
      L(0, 2, 'sand', 17.5, 19.5, 0, 32, { Es_kPa: 25000 }),
      L(2, 6, 'clay', 18, 19.5, 10, 22, { su_kPa: 50, Es_kPa: 8000, e0: 0.9, Cc: 0.3, Cr: 0.06, sigmaP_kPa: 90, cv_m2s: 2e-7 }),
      L(6, 12, 'sand', 18.5, 20.5, 0, 34, { Es_kPa: 40000 })
    ],
    spt: [
      { depth: 1.5, N: 12, coh: true, fine: false }, { depth: 3.5, N: 9, coh: false, fine: false },
      { depth: 7, N: 28, coh: true, fine: true }, { depth: 9, N: 32, coh: true, fine: true }
    ],
    ds: [{ sn: 50, tf: 31 }, { sn: 100, tf: 49 }, { sn: 150, tf: 72 }, { sn: 200, tf: 90 }],
    f: { shape: 'square', B: '2', L: '2', Df: '1.5', V: '800', H: '0', Mx: '0', My: '0', fos: '3', mode: 'local', wt: 'design', gamma: '', c: '', phi: '', manual: false },
    st: { q: '200', shape: 'square', B: '2', L: '2', zmax: '10', zstep: '0.5' },
    t: { q: '', years: '0.1', unit: 'days', drainage: 'double', qDirty: false }
  };
}

function loadState(s) {
  state.measuredWT = String(s.measuredWT ?? '');
  state.designWT = String(s.designWT ?? '');
  state.layers = (s.layers || []).map((l) => {
    const o = { soilType: l.soilType || SoilType.SAND };
    NUM_KEYS.forEach((k) => { o[k] = l[k] === undefined || l[k] === null ? '' : String(l[k]); });
    return o;
  });
  state.spt = (s.spt || []).map((r) => ({ depth: String(r.depth ?? ''), N: String(r.N ?? ''), coh: r.coh !== false, fine: !!r.fine }));
  state.ds = (s.ds || []).map((r) => ({ sn: String(r.sn ?? ''), tf: String(r.tf ?? '') }));
  Object.keys(state.f).forEach((k) => { if (s.f && s.f[k] !== undefined) state.f[k] = typeof state.f[k] === 'boolean' ? !!s.f[k] : String(s.f[k]); });
  Object.keys(state.st).forEach((k) => { if (s.st && s.st[k] !== undefined) state.st[k] = String(s.st[k]); });
  Object.keys(state.t).forEach((k) => { if (s.t && s.t[k] !== undefined) state.t[k] = typeof state.t[k] === 'boolean' ? !!s.t[k] : String(s.t[k]); });
  state.t.qDirty = !!(s.t && s.t.qDirty);
  buildAllTables();
  syncInputs();
  recompute();
}

// ============================================================================
// PROFILE / FOOTING ACCESSORS (validated through the engine's own validators)
// ============================================================================
function getProfile() {
  const layers = state.layers.map((l) => {
    const o = { soilType: l.soilType };
    NUM_KEYS.forEach((k) => { const n = num(l[k]); if (n !== undefined) o[k] = n; });
    return o;
  });
  const profile = { layers, measuredWT_m: num(state.measuredWT), designWT_m: num(state.designWT) };
  const v = validateSoilProfile(profile);
  return v.valid ? { profile, errors: [] } : { profile: null, errors: v.errors };
}

function getFooting() {
  const f = state.f;
  const raw = {
    shape: f.shape, B_m: num(f.B), L_m: num(f.L), Df_m: num(f.Df), loadV_kN: num(f.V),
    loadH_kN: num(f.H) ?? 0, Mx_kNm: num(f.Mx) ?? 0, My_kNm: num(f.My) ?? 0, fos: num(f.fos) ?? 3
  };
  Object.keys(raw).forEach((k) => raw[k] === undefined && delete raw[k]);
  const v = validateFooting(raw);
  return v.valid ? { footing: createFooting(raw), errors: [] } : { footing: null, errors: v.errors };
}

const wtDepth = (profile, src) => (src === 'measured' ? profile.measuredWT_m : profile.designWT_m);

// ============================================================================
// TABLE BUILDERS (rebuilt only on structural changes so typing never loses focus)
// ============================================================================
function buildLayerTable() {
  const tb = $('layers-body');
  tb.innerHTML = state.layers.map((l, i) => {
    const cells = LAYER_COLS.map((c) => {
      if (c.k === 'soilType') {
        return `<td class="l"><select data-i="${i}" data-k="soilType">${Object.values(SoilType).map((t) => `<option value="${t}"${t === l.soilType ? ' selected' : ''}>${cap(t)}</option>`).join('')}</select></td>`;
      }
      return `<td><input type="number" step="${c.step}" data-i="${i}" data-k="${c.k}" value="${esc(l[c.k])}"></td>`;
    }).join('');
    return `<tr><td class="l num">${i + 1}</td>${cells}<td><button type="button" class="icon" data-del="${i}" aria-label="Delete layer ${i + 1}">Delete</button></td></tr>`;
  }).join('');
}

function buildSptTable() {
  $('spt-body').innerHTML = state.spt.map((r, i) => `<tr data-i="${i}">
    <td class="l num">${i + 1}</td>
    <td><input type="number" step="0.1" min="0" data-k="depth" value="${esc(r.depth)}"></td>
    <td><input type="number" step="1" min="0" data-k="N" value="${esc(r.N)}"></td>
    <td><input type="checkbox" data-k="coh" ${r.coh ? 'checked' : ''} aria-label="Cohesionless"></td>
    <td><input type="checkbox" data-k="fine" ${r.fine ? 'checked' : ''} aria-label="Fine sand or silt"></td>
    <td class="out" data-o="sigma">–</td><td class="out" data-o="wt">–</td><td class="out" data-o="cnraw">–</td><td class="out" data-o="cn">–</td>
    <td class="out" data-o="np">–</td><td class="out" data-o="npp">–</td><td class="l" data-o="why">–</td><td class="out" data-o="phi">–</td>
    <td><button type="button" class="icon" data-del="${i}" aria-label="Delete SPT test ${i + 1}">Delete</button></td></tr>`).join('');
}

function buildDsTable() {
  $('ds-body').innerHTML = state.ds.map((r, i) => `<tr data-i="${i}">
    <td class="l num">${i + 1}</td>
    <td><input type="number" step="1" min="0" data-k="sn" value="${esc(r.sn)}"></td>
    <td><input type="number" step="1" min="0" data-k="tf" value="${esc(r.tf)}"></td>
    <td class="out" data-o="fit">–</td><td class="out" data-o="res">–</td>
    <td><button type="button" class="icon" data-del="${i}" aria-label="Delete data point ${i + 1}">Delete</button></td></tr>`).join('');
}

function buildAllTables() { buildLayerTable(); buildSptTable(); buildDsTable(); }

// ============================================================================
// INPUT BINDING
// ============================================================================
const BIND = {
  'wt-measured': [state, 'measuredWT'], 'wt-design': [state, 'designWT'],
  'calc-depth': [state.calc, 'depth'], 'calc-wt': [state.calc, 'wt'],
  'f-shape': [state.f, 'shape'], 'f-B': [state.f, 'B'], 'f-L': [state.f, 'L'], 'f-Df': [state.f, 'Df'], 'f-V': [state.f, 'V'],
  'f-H': [state.f, 'H'], 'f-Mx': [state.f, 'Mx'], 'f-My': [state.f, 'My'], 'f-fos': [state.f, 'fos'], 'f-mode': [state.f, 'mode'],
  'f-wt': [state.f, 'wt'], 'f-gamma': [state.f, 'gamma'], 'f-c': [state.f, 'c'], 'f-phi': [state.f, 'phi'],
  's-q': [state.st, 'q'], 's-shape': [state.st, 'shape'], 's-B': [state.st, 'B'], 's-L': [state.st, 'L'],
  's-zmax': [state.st, 'zmax'], 's-zstep': [state.st, 'zstep'],
  't-q': [state.t, 'q'], 't-years': [state.t, 'years'], 't-unit': [state.t, 'unit']
};

function syncInputs() {
  Object.entries(BIND).forEach(([id, [obj, key]]) => { $(id).value = obj[key]; });
  applyShapeLock();
  setDrainButtons();
}

function applyShapeLock() {
  const lockF = state.f.shape === 'square' || state.f.shape === 'circular';
  if (lockF) { state.f.L = state.f.B; $('f-L').value = state.f.L; }
  $('f-L').disabled = lockF;
  const lockS = state.st.shape === 'square' || state.st.shape === 'circular';
  if (lockS) { state.st.L = state.st.B; $('s-L').value = state.st.L; }
  $('s-L').disabled = lockS;
}

function setDrainButtons() {
  $('drain-single').setAttribute('aria-pressed', String(state.t.drainage === 'single'));
  $('drain-double').setAttribute('aria-pressed', String(state.t.drainage === 'double'));
}

function bindStatic() {
  Object.entries(BIND).forEach(([id, [obj, key]]) => {
    $(id).addEventListener('input', () => {
      obj[key] = $(id).value;
      if (['f-gamma', 'f-c', 'f-phi'].includes(id)) state.f.manual = true;
      if (id === 't-q') state.t.qDirty = true;
      if (['f-shape', 'f-B', 's-shape', 's-B'].includes(id)) applyShapeLock();
      recompute();
    });
  });

  // Layers table
  $('layers-body').addEventListener('input', (e) => {
    const el = e.target; const i = Number(el.dataset.i); const k = el.dataset.k;
    if (Number.isNaN(i) || !k) return;
    const old = state.layers[i][k];
    state.layers[i][k] = el.value;
    if (k === 'bottomDepth_m' && state.layers[i + 1]) {
      const next = state.layers[i + 1];
      if (next.topDepth_m === '' || next.topDepth_m === old) {
        next.topDepth_m = el.value;
        const inp = $('layers-body').querySelector(`input[data-i="${i + 1}"][data-k="topDepth_m"]`);
        if (inp) inp.value = el.value;
      }
    }
    recompute();
  });
  $('layers-body').addEventListener('click', (e) => {
    const b = e.target.closest('[data-del]'); if (!b) return;
    state.layers.splice(Number(b.dataset.del), 1); buildLayerTable(); recompute();
  });
  $('btn-add-layer').addEventListener('click', () => {
    const last = state.layers[state.layers.length - 1];
    state.layers.push(blankLayer(last ? last.bottomDepth_m : '0')); buildLayerTable(); recompute();
  });

  // SPT table
  $('spt-body').addEventListener('input', (e) => {
    const el = e.target; const tr = el.closest('tr'); if (!tr || !el.dataset.k) return;
    state.spt[Number(tr.dataset.i)][el.dataset.k] = el.type === 'checkbox' ? el.checked : el.value;
    recompute();
  });
  $('spt-body').addEventListener('click', (e) => {
    const b = e.target.closest('[data-del]'); if (!b) return;
    state.spt.splice(Number(b.dataset.del), 1); buildSptTable(); recompute();
  });
  $('btn-add-spt').addEventListener('click', () => { state.spt.push({ depth: '', N: '', coh: true, fine: false }); buildSptTable(); recompute(); });

  // Direct shear table
  $('ds-body').addEventListener('input', (e) => {
    const el = e.target; const tr = el.closest('tr'); if (!tr || !el.dataset.k) return;
    state.ds[Number(tr.dataset.i)][el.dataset.k] = el.value; recompute();
  });
  $('ds-body').addEventListener('click', (e) => {
    const b = e.target.closest('[data-del]'); if (!b) return;
    state.ds.splice(Number(b.dataset.del), 1); buildDsTable(); recompute();
  });
  $('btn-add-ds').addEventListener('click', () => { state.ds.push({ sn: '', tf: '' }); buildDsTable(); recompute(); });

  // P3 / P4 / P5 buttons
  $('btn-refill').addEventListener('click', () => { state.f.manual = false; recompute(); });
  $('btn-q-from-p3').addEventListener('click', () => {
    const { footing } = getFooting();
    if (!footing) { showMsgs($('p4-msg'), ['Complete the P3 footing inputs first.'], 'warn'); return; }
    const { profile } = getProfile();
    if (!profile) { showMsgs($('p4-msg'), ['Complete the P1 profile first.'], 'warn'); return; }
    try {
      const { net, footprint } = serviceDemand(footing, profile);
      state.st.shape = footprint.shape;
      state.st.B = String(footprint.B_m);
      state.st.L = String(footprint.L_m);
      state.st.q = String(net);
    } catch (err) { showMsgs($('p4-msg'), [err.message]); return; }
    syncInputs(); recompute();
  });
  $('btn-q-reset').addEventListener('click', () => { state.t.qDirty = false; recompute(); });
  ['single', 'double'].forEach((d) => $(`drain-${d}`).addEventListener('click', () => { state.t.drainage = d; setDrainButtons(); recompute(); }));

  // Tabs
  document.querySelectorAll('nav.tabs button').forEach((b) => b.addEventListener('click', () => {
    activeTab = b.dataset.tab;
    document.querySelectorAll('nav.tabs button').forEach((x) => x.setAttribute('aria-selected', String(x === b)));
    document.querySelectorAll('section.panel').forEach((s) => s.classList.toggle('active', s.id === activeTab));
    recompute();
  }));

  // Header actions
  $('btn-sample').addEventListener('click', () => { loadState(sampleData()); showMsgs($('global-msg'), ['Sample profile loaded. Every value is editable.'], 'ok'); setTimeout(() => { $('global-msg').innerHTML = ''; }, 3500); });
  $('btn-export').addEventListener('click', exportJSON);
  $('btn-import').addEventListener('click', () => $('file-import').click());
  $('file-import').addEventListener('change', importJSON);
}

// ============================================================================
// IMPORT / EXPORT
// ============================================================================
function exportJSON() {
  const data = {
    app: 'CE402', version: 1,
    measuredWT: state.measuredWT, designWT: state.designWT, layers: state.layers,
    spt: state.spt, ds: state.ds, f: state.f, st: state.st, t: state.t
  };
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = 'ce402-project.json';
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

function importJSON(e) {
  const file = e.target.files[0]; if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const s = JSON.parse(reader.result);
      if (!s || typeof s !== 'object' || !Array.isArray(s.layers)) throw new Error('File has no "layers" array.');
      loadState(s);
      showMsgs($('global-msg'), [`Imported ${file.name}.`], 'ok');
      setTimeout(() => { $('global-msg').innerHTML = ''; }, 3500);
    } catch (err) {
      showMsgs($('global-msg'), [`Import failed: ${err.message}`]);
    }
  };
  reader.readAsText(file);
  e.target.value = '';
}

// ============================================================================
// CHART HELPER
// ============================================================================
function drawChart(key, canvasId, config) {
  if (charts[key]) { charts[key].destroy(); delete charts[key]; }
  const canvas = $(canvasId);
  if (typeof Chart === 'undefined') {
    canvas.style.display = 'none';
    if (!canvas.parentElement.querySelector('.empty')) canvas.parentElement.insertAdjacentHTML('beforeend', '<div class="empty">Chart.js could not be loaded. Check your internet connection and reload.</div>');
    return;
  }
  Chart.defaults.font.family = 'ui-monospace, SFMono-Regular, Menlo, monospace';
  Chart.defaults.font.size = 11;
  charts[key] = new Chart(canvas, config);
}

// ============================================================================
// P1: SOIL PROFILE
// ============================================================================
const SOIL_COLORS = { clay: '#E3CDB0', silt: '#D9DEE7', sand: '#F4E6B8', gravel: '#D3D9C7', peat: '#B79F8A', fill: '#DCDCE0', rock: '#AAB6C6', organic: '#B9C7A0' };

function patternDefs() {
  const s = '#475569';
  const P = (t, w, h, body) => `<pattern id="pat-${t}" width="${w}" height="${h}" patternUnits="userSpaceOnUse"><rect width="${w}" height="${h}" fill="${SOIL_COLORS[t]}"/>${body}</pattern>`;
  return '<defs>' + [
    P('clay', 8, 8, `<path d="M0 8L8 0M-2 2L2 -2M6 10L10 6" stroke="${s}" stroke-width=".7" opacity=".6"/>`),
    P('silt', 8, 6, `<path d="M1 3h4" stroke="${s}" stroke-width=".8" opacity=".6"/>`),
    P('sand', 8, 8, `<circle cx="2" cy="2" r=".9" fill="${s}" opacity=".7"/><circle cx="6" cy="6" r=".9" fill="${s}" opacity=".7"/>`),
    P('gravel', 14, 14, `<circle cx="4" cy="4" r="3" fill="none" stroke="${s}" stroke-width=".8" opacity=".7"/><circle cx="11" cy="10" r="2.5" fill="none" stroke="${s}" stroke-width=".8" opacity=".7"/>`),
    P('peat', 10, 6, `<path d="M0 3q2.5-3 5 0t5 0" fill="none" stroke="${s}" stroke-width=".8" opacity=".7"/>`),
    P('fill', 8, 8, `<path d="M0 0L8 8M8 0L0 8" stroke="${s}" stroke-width=".6" opacity=".5"/>`),
    P('rock', 12, 12, `<path d="M0 6h12M6 0v6M0 12h12M3 6v6M9 6v6" stroke="${s}" stroke-width=".8" opacity=".6" fill="none"/>`),
    P('organic', 8, 8, `<circle cx="2" cy="2" r=".8" fill="${s}" opacity=".7"/><path d="M4 6h3" stroke="${s}" stroke-width=".8" opacity=".6"/>`)
  ].join('') + '</defs>';
}

function renderBorehole(profile) {
  const wrap = $('bh-wrap');
  if (!profile) { wrap.innerHTML = '<div class="empty">Enter valid layers to draw the borehole profile.</div>'; return; }
  const colX = 120, colW = 200, top = 28, bot = 402;
  const D = profile.layers[profile.layers.length - 1].bottomDepth_m;
  const y = (z) => top + (z / D) * (bot - top);
  let out = `<svg class="bh" viewBox="0 0 560 440" role="img" aria-label="Borehole soil profile">${patternDefs()}`;
  out += `<clipPath id="col-clip"><rect x="${colX}" y="${top}" width="${colW}" height="${bot - top}"/></clipPath>`;

  // Layers, clipped strictly to the column
  out += '<g clip-path="url(#col-clip)">';
  profile.layers.forEach((l) => {
    out += `<rect x="${colX}" y="${y(l.topDepth_m)}" width="${colW}" height="${y(l.bottomDepth_m) - y(l.topDepth_m)}" fill="url(#pat-${l.soilType})" stroke="#334155" stroke-width="1"/>`;
  });
  out += '</g>';
  out += `<rect x="${colX}" y="${top}" width="${colW}" height="${bot - top}" fill="none" stroke="#334155" stroke-width="1.2"/>`;

  // Water table markers (drawn before tick labels so labels sit on top)
  const wts = [
    { name: 'M', full: 'Measured WT', z: profile.measuredWT_m, col: '#0D9488' },
    { name: 'D', full: 'Design WT', z: profile.designWT_m, col: '#0F4C81' }
  ].filter((w) => w.z <= D);
  const close = wts.length === 2 && Math.abs(y(wts[0].z) - y(wts[1].z)) < 13;
  wts.forEach((w, idx) => {
    const yy = y(w.z);
    let ly = yy + 3.5;
    if (close) ly += (wts[0].z <= wts[1].z) === (idx === 0) ? -5 : 6;
    out += `<line x1="84" y1="${yy}" x2="${colX + colW + 8}" y2="${yy}" stroke="${w.col}" stroke-width="1.6" stroke-dasharray="6 4"/>`;
    out += `<polygon points="74,${yy - 5} 74,${yy + 5} 84,${yy}" fill="${w.col}"/>`;
    out += `<text x="70" y="${ly}" text-anchor="end" font-size="10" font-weight="700" fill="${w.col}">${w.name} ${fmt(w.z, 1)}</text>`;
  });

  // Depth axis
  out += `<line x1="${colX}" y1="${top}" x2="${colX}" y2="${bot}" stroke="#475569"/>`;
  const steps = [0.5, 1, 2, 5, 10, 20, 50, 100];
  const step = steps.find((s) => D / s <= 10) || 100;
  for (let z = 0; z <= D + 1e-9; z += step) {
    out += `<line x1="${colX - 6}" y1="${y(z)}" x2="${colX}" y2="${y(z)}" stroke="#475569"/>`;
    out += `<text x="${colX - 9}" y="${y(z) + 3.5}" text-anchor="end" font-size="10" fill="#334155" stroke="#fff" stroke-width="3" paint-order="stroke" style="font-family:ui-monospace,monospace">${fmt(z, step < 1 ? 1 : 0)}</text>`;
  }
  out += `<text transform="translate(14 ${(top + bot) / 2}) rotate(-90)" text-anchor="middle" font-size="11" fill="#64748B">Depth (m)</text>`;

  // Right-side callouts with anti-overlap
  const gap = 30;
  const ys = profile.layers.map((l) => y((l.topDepth_m + l.bottomDepth_m) / 2));
  const ly = ys.slice();
  for (let i = 1; i < ly.length; i++) ly[i] = Math.max(ly[i], ly[i - 1] + gap);
  const limit = bot - 4;
  if (ly[ly.length - 1] > limit) {
    ly[ly.length - 1] = limit;
    for (let i = ly.length - 2; i >= 0; i--) ly[i] = Math.min(ly[i], ly[i + 1] - gap);
  }
  const x0 = colX + colW;
  profile.layers.forEach((l, i) => {
    out += `<circle cx="${x0}" cy="${ys[i]}" r="2.2" fill="#334155"/>`;
    out += `<polyline points="${x0},${ys[i]} ${x0 + 22},${ly[i]} ${x0 + 32},${ly[i]}" fill="none" stroke="#94A3B8" stroke-width="1"/>`;
    out += `<text x="${x0 + 38}" y="${ly[i] - 1}" font-size="11.5" font-weight="600" fill="#0F172A">${i + 1}. ${esc(cap(l.soilType))}</text>`;
    out += `<text x="${x0 + 38}" y="${ly[i] + 12}" font-size="10.5" fill="#64748B">${fmt(l.topDepth_m, 1)}–${fmt(l.bottomDepth_m, 1)} m · φ′ ${fmt(l.phiDeg, 1)}° · c′ ${fmt(l.cPrime_kPa, 0)} kPa</text>`;
  });

  // Legend
  out += `<line x1="${colX}" y1="428" x2="${colX + 26}" y2="428" stroke="#0D9488" stroke-width="1.6" stroke-dasharray="6 4"/><text x="${colX + 32}" y="431.5" font-size="10.5" fill="#334155">M = Measured WT (m)</text>`;
  out += `<line x1="${colX + 160}" y1="428" x2="${colX + 186}" y2="428" stroke="#0F4C81" stroke-width="1.6" stroke-dasharray="6 4"/><text x="${colX + 192}" y="431.5" font-size="10.5" fill="#334155">D = Design WT (m)</text>`;
  out += '</svg>';
  wrap.innerHTML = out;
}

function renderP1() {
  const { profile, errors } = getProfile();
  showMsgs($('p1-msg'), errors.length ? errors : (state.layers.length ? [] : ['Add at least one layer.']), 'err');
  renderBorehole(profile);

  const mid = $('mid-body');
  if (!profile) { mid.innerHTML = '<tr><td colspan="4" class="empty">Fix the profile errors above.</td></tr>'; $('calc-out').innerHTML = ''; return; }
  const d = computeLayerMidDepthStresses(profile, 'design');
  const m = computeLayerMidDepthStresses(profile, 'measured');
  mid.innerHTML = d.map((r, i) => `<tr><td class="l num">${i + 1}</td><td class="num">${fmt(r.midDepth_m)}</td><td class="num">${fmt(r.sigmaV0Prime_kPa)}</td><td class="num">${fmt(m[i].sigmaV0Prime_kPa)}</td></tr>`).join('');

  const z = num(state.calc.depth);
  const out = $('calc-out');
  if (z === undefined || z < 0) { out.innerHTML = 'Enter a depth ≥ 0 m.'; return; }
  const src = state.calc.wt;
  const total = computeTotalVerticalStress(profile, z, src);
  const u = computePoreWaterPressure(profile, z, src);
  const eff = computeEffectiveVerticalStress({ profile, depth_m: z, wtSource: src });
  const D = profile.layers[profile.layers.length - 1].bottomDepth_m;
  const lay = getLayerAtDepth(profile, z);
  out.innerHTML = `Water table used: <b>${fmt(wtDepth(profile, src))} m</b><br>
    σ<sub>v0</sub> (total) = <b>${fmt(total)} kPa</b><br>u (pore pressure) = <b>${fmt(u)} kPa</b><br>
    σ′<sub>v0</sub> = σ<sub>v0</sub> − u = <b>${fmt(eff)} kPa</b>
    ${lay ? `<br>Layer at z: <b>${profile.layers.indexOf(lay) + 1} (${esc(cap(lay.soilType))})</b>` : ''}
    ${z > D ? `<div class="msg warn">Depth is below the last layer (${fmt(D)} m); stress extrapolates the final layer to the requested depth.</div>` : ''}`;
}

// ============================================================================
// P2: SPT + DIRECT SHEAR
// ============================================================================
function renderP2() {
  const { profile, errors } = getProfile();
  const msg = $('spt-msg');
  const rows = $('spt-body').querySelectorAll('tr');
  if (!profile) {
    showMsgs(msg, ['SPT corrections need a valid P1 profile: ' + (errors[0] || 'add layers') ], 'warn');
  } else { msg.innerHTML = ''; }
  const warn = [];
  rows.forEach((tr, i) => {
    const r = state.spt[i]; const o = (k) => tr.querySelector(`[data-o="${k}"]`);
    const depth = num(r.depth); const N = num(r.N);
    const cells = ['sigma', 'wt', 'cnraw', 'cn', 'np', 'npp', 'why', 'phi'];
    if (!profile || depth === undefined || N === undefined || depth < 0 || N < 0) { cells.forEach((c) => { o(c).textContent = '–'; }); return; }
    const res = correctSPT_N_Batch([{ depth_m: depth, N_field: N, isFineSandOrSilt: r.fine, isCohesionless: r.coh }], profile, 'measured')[0];
    const D = profile.layers[profile.layers.length - 1].bottomDepth_m;
    if (depth > D) warn.push(`Test ${i + 1}: depth is below the profile (${fmt(D)} m).`);
    o('sigma').textContent = fmt(res.sigmaV0Prime_kPa);
    o('wt').textContent = res.belowWaterTable ? 'yes' : 'no';
    o('cnraw').textContent = res.isCohesionless ? fmt(res.CN_raw, 3) : 'n/a';
    o('cn').textContent = res.isCohesionless ? fmt(res.CN, 3) + (res.CN_limited ? ' *' : '') : '1.000';
    o('np').textContent = fmt(res.N_prime);
    o('npp').textContent = fmt(res.N_doublePrime);
    o('why').textContent = res.isCohesionless ? res.dilatancyReason : 'Cohesive soil: no corrections';
    o('phi').textContent = res.isCohesionless ? fmt(estimatePhiFromSPT(res.N_corrected, r.fine ? 'silt' : 'sand'), 0) : '–';
  });
  if (profile && state.spt.length) warn.push('* C_N limited to the plotted 0.40–2.0 range; logarithmic approximation to Fig. 1.');
  if (warn.length) msg.innerHTML += warn.map((w) => `<div class="msg warn">${esc(w)}</div>`).join('');

  renderDirectShear();
}

function renderDirectShear() {
  const rows = $('ds-body').querySelectorAll('tr');
  const pts = [];
  state.ds.forEach((r) => { const a = num(r.sn), b = num(r.tf); if (a !== undefined && b !== undefined && a >= 0 && b >= 0) pts.push({ sigma_n_kPa: a, tau_f_kPa: b }); });
  const out = $('ds-out');
  const clearOut = () => rows.forEach((tr) => { tr.querySelector('[data-o="fit"]').textContent = '–'; tr.querySelector('[data-o="res"]').textContent = '–'; });
  if (pts.length < 2) {
    out.innerHTML = '<div class="msg warn">Enter at least 2 (σ<sub>n</sub>, τ<sub>f</sub>) points.</div>'; clearOut();
    drawChart('ds', 'ds-chart', dsChartConfig(pts, null)); return;
  }
  let res;
  try { res = directShearOLS(pts); } catch (err) { out.innerHTML = `<div class="msg err">${esc(err.message)}</div>`; clearOut(); return; }
  rows.forEach((tr, i) => {
    const r = state.ds[i]; const a = num(r.sn), b = num(r.tf);
    if (a === undefined || b === undefined) { clearOut(); return; }
    const fit = res.intercept_kPa + res.slope * a;
    tr.querySelector('[data-o="fit"]').textContent = fmt(fit);
    tr.querySelector('[data-o="res"]').textContent = fmt(b - fit);
  });
  out.innerHTML = `<div class="result">c′ = <b>${fmt(res.cPrime_kPa)} kPa</b>${res.intercept_kPa < 0 ? ` (raw intercept ${fmt(res.intercept_kPa)} kPa, floored at 0)` : ''}<br>
    φ′ = <b>${fmt(res.phiDeg)} deg</b> &nbsp; (tan φ′ = ${fmt(res.slope, 4)})<br>
    R² = <b>${fmt(res.R2, 4)}</b> &nbsp; SE = <b>${res.n > 2 ? fmt(res.SE_kPa) + ' kPa' : 'n/a (needs ≥ 3 points)'}</b><br>n = ${res.n} points</div>`;
  drawChart('ds', 'ds-chart', dsChartConfig(pts, res));
}

function dsChartConfig(pts, res) {
  const xmax = Math.max(10, ...pts.map((p) => p.sigma_n_kPa)) * 1.1;
  const ds = [{ label: 'Test data (kPa)', data: pts.map((p) => ({ x: p.sigma_n_kPa, y: p.tau_f_kPa })), showLine: false, pointRadius: 5, backgroundColor: '#0F4C81' }];
  if (res) ds.push({ label: `Fit: c′=${fmt(res.cPrime_kPa)} kPa, φ′=${fmt(res.phiDeg)}°`, data: [{ x: 0, y: res.intercept_kPa }, { x: xmax, y: res.intercept_kPa + res.slope * xmax }], showLine: true, pointRadius: 0, borderColor: '#0D9488', borderWidth: 2 });
  return {
    type: 'scatter', data: { datasets: ds },
    options: {
      responsive: true, maintainAspectRatio: false,
      scales: {
        x: { min: 0, title: { display: true, text: 'Normal stress σn (kPa)' } },
        y: { title: { display: true, text: 'Shear strength τf (kPa)' } }
      }
    }
  };
}

// ============================================================================
// P3: BEARING CAPACITY
// ============================================================================
// Effective-area approximation for eccentric loads (IS 6403, clause 4).
function serviceDemand(footing, profile) {
  const dims = computeEffectiveDimensions(footing);
  const gross = footing.loadV_kN / dims.A_prime_m2;
  const removed = computeTotalVerticalStress(profile, footing.Df_m, state.f.wt);
  const shape = footing.shape === 'square' && dims.B_prime_m !== dims.L_prime_m ? 'rectangular' : footing.shape;
  return { gross, net: gross - removed, footprint: { ...footing, shape, B_m: dims.B_prime_m, L_m: dims.L_prime_m } };
}

function autofillBaseSoil(profile) {
  const note = $('f-note');
  const Df = num(state.f.Df);
  if (!profile || Df === undefined || Df < 0) { note.textContent = 'Base soil auto-fill needs a valid P1 profile and D_f.'; return; }
  let layer = getLayerAtDepth(profile, Df);
  const below = !layer;
  if (!layer) layer = profile.layers[profile.layers.length - 1];
  const idx = profile.layers.indexOf(layer) + 1;
  const wt = wtDepth(profile, state.f.wt);
  const gamma = wt <= Df ? layer.gammaSat_kNm3 : layer.gammaMoist_kNm3;
  const useSu = layer.phiDeg === 0 && layer.cPrime_kPa === 0 && layer.su_kPa > 0;
  if (!state.f.manual) {
    state.f.gamma = String(gamma);
    state.f.c = String(useSu ? layer.su_kPa : layer.cPrime_kPa);
    state.f.phi = String(layer.phiDeg);
    $('f-gamma').value = state.f.gamma; $('f-c').value = state.f.c; $('f-phi').value = state.f.phi;
  }
  note.textContent = state.f.manual
    ? 'Manual override active. Click "Re-fill from P1" to restore P1 values.'
    : `Taken from layer ${idx} (${cap(layer.soilType)}) at D_f = ${fmt(Df)} m: γ = ${wt <= Df ? 'γ sat (WT at or above base)' : 'γ moist'}${useSu ? '; φ′ = 0 and c′ = 0, so s_u is used as c' : ''}${below ? '; D_f is below the profile, last layer used' : ''}.`;
}

function kpi(label, val, unit, teal = false) {
  return `<div class="kpi${teal ? ' t' : ''}"><div class="k">${label}</div><div class="v">${val}<span class="u">${unit}</span></div></div>`;
}

function renderP3() {
  const { profile, errors: pe } = getProfile();
  const { footing, errors: fe } = getFooting();
  autofillBaseSoil(profile);
  const msg = $('p3-msg'); const kp = $('p3-kpis'); const tb = $('p3-factors');
  const problems = [...pe.map((e) => 'P1: ' + e), ...fe.map((e) => 'Footing: ' + e)];
  const gamma = num(state.f.gamma), c = num(state.f.c), phi = num(state.f.phi);
  if (gamma === undefined || c === undefined || phi === undefined) problems.push('Base soil γ, c′ and φ′ are required.');
  if (problems.length) { showMsgs(msg, problems, 'warn'); kp.innerHTML = ''; tb.innerHTML = ''; return; }

  const r = computeBearingCapacityIS6403({ footing, profile, gamma_kNm3: gamma, cPrime_kPa: c, phiDeg: phi, shearMode: state.f.mode, wtSource: state.f.wt });
  const demand = serviceDemand(footing, profile);
  const items = [];
  // Elastic full-contact pressure at the least compressed corner: qmin/qavg = 1 - 6ex/B - 6ey/L.
  const kernRatio = footing.shape === 'circular'
    ? 8 * Math.hypot(r.eB_m, r.eL_m) / footing.B_m
    : 6 * (r.eB_m / footing.B_m + r.eL_m / footing.L_m);
  if (kernRatio > 1) items.push(['warn', 'Resultant outside the kern. Full contact is lost; verify the compressed contact area.']);
  if (state.f.mode === 'auto') items.push(['warn', 'Legacy friction-angle heuristic. Select general or local shear using site evidence (IS 6403 Table 3 for sands).']);
  items.push(demand.net <= r.qns_kPa
    ? ['ok', 'Net service pressure is within net safe bearing capacity.']
    : ['err', 'Net service pressure exceeds net safe bearing capacity.']);
  msg.innerHTML = items.map(([k, t]) => `<div class="msg ${k}">${esc(t)}</div>`).join('');

  kp.innerHTML = kpi('Net ultimate bearing capacity q<sub>nu</sub>', fmt(r.qnu_kPa, 1), 'kPa')
    + kpi('Net safe bearing capacity q<sub>ns</sub> = q<sub>nu</sub>/FoS', fmt(r.qns_kPa, 1), 'kPa')
    + kpi('Gross service pressure V/A′', fmt(demand.gross, 1), 'kPa')
    + kpi('Net service pressure after excavation relief', fmt(demand.net, 1), 'kPa', true);

  const R = (name, sym, v, unit, note = '', d = 3) => `<tr><td class="l">${name}</td><td class="l">${sym}</td><td class="num">${typeof v === 'number' ? fmt(v, d) : esc(v)}</td><td class="num">${unit}</td><td class="l">${esc(note)}</td></tr>`;
  tb.innerHTML = [
    R('Shear mode used', '', r.shearModeUsed, '–', r.isIntermediate ? 'Interpolated between local and general (29° to 36°)' : ''),
    R('Effective friction angle', 'φ<sub>eff</sub>', r.phi_eff_deg, 'deg', '', 2),
    R('Effective cohesion', 'c<sub>eff</sub>', r.c_eff_kPa, 'kPa', '', 2),
    R('Bearing capacity factor', 'N<sub>c</sub>', r.Nc, '–'), R('Bearing capacity factor', 'N<sub>q</sub>', r.Nq, '–'), R('Bearing capacity factor', 'N<sub>γ</sub>', r.Ngamma, '–'),
    R('Shape factor', 's<sub>c</sub>', r.sc, '–'), R('Shape factor', 's<sub>q</sub>', r.sq, '–'), R('Shape factor', 's<sub>γ</sub>', r.sgamma, '–'),
    R('Depth factor', 'd<sub>c</sub>', r.dc, '–'), R('Depth factor', 'd<sub>q</sub>', r.dq, '–'), R('Depth factor', 'd<sub>γ</sub>', r.dgamma, '–'),
    R('Inclination factor', 'i<sub>c</sub>', r.ic, '–'), R('Inclination factor', 'i<sub>q</sub>', r.iq, '–'), R('Inclination factor', 'i<sub>γ</sub>', r.igamma, '–'),
    R('Water table factor', 'W′', r.W_prime, '–', `WT is ${fmt(r.Dw_m)} m below the base`),
    R('Effective width', 'B′', r.B_prime_m, 'm', `e_B = ${fmt(r.eB_m)} m`),
    R('Effective length', 'L′', r.L_prime_m, 'm', `e_L = ${fmt(r.eL_m)} m`),
    R('Effective area', 'A′', r.A_prime_m2, 'm²'),
    R('Overburden at base', 'q', r.q_kPa, 'kPa', 'Effective stress at D_f', 2),
    R('Cohesion term', 'c N<sub>c</sub> s<sub>c</sub> d<sub>c</sub> i<sub>c</sub>', r.term1_c_kPa, 'kPa', '', 2),
    R('Surcharge term', 'q (N<sub>q</sub>−1) s<sub>q</sub> d<sub>q</sub> i<sub>q</sub>', r.term2_q_kPa, 'kPa', '', 2),
    R('Unit weight term', '½ γ B′ N<sub>γ</sub> s<sub>γ</sub> d<sub>γ</sub> i<sub>γ</sub> W′', r.term3_gamma_kPa, 'kPa', '', 2)
  ].join('');
}

// ============================================================================
// P4: STRESS INCREASE
// ============================================================================
function renderP4() {
  const q = num(state.st.q), B = num(state.st.B), L = num(state.st.L) ?? B;
  const zmax = num(state.st.zmax), zstep = num(state.st.zstep);
  const msg = $('p4-msg'); const tb = $('st-body');
  const errs = [];
  if (!(q > 0)) errs.push('q must be > 0 kPa.');
  if (!(B > 0)) errs.push('B must be > 0 m.');
  if (!(L > 0)) errs.push('L must be > 0 m.');
  if (!(zmax > 0)) errs.push('z_max must be > 0 m.');
  if (!(zstep > 0)) errs.push('Depth step must be > 0 m.');
  if (!errs.length && zmax / zstep > 2000) errs.push('Too many depth points; increase the step.');
  if (errs.length) { showMsgs(msg, errs, 'warn'); tb.innerHTML = ''; if (charts.st) { charts.st.destroy(); delete charts.st; } return; }
  msg.innerHTML = '';
  const base = { q_kPa: q, B_m: B, L_m: L, z_max_m: zmax, z_step_m: zstep, shape: state.st.shape };
  const c = generateStressProfile({ ...base, method: 'boussinesq' });
  const k = generateStressProfile({ ...base, method: 'boussinesq_corner' });
  const t = generateStressProfile({ ...base, method: '2to1' });
  const pts = (arr) => c.depths_m.map((z, i) => ({ x: arr[i], y: z }));
  tb.innerHTML = c.depths_m.map((z, i) => `<tr><td class="num">${fmt(z)}</td><td class="num">${fmt(c.deltaSigma_kPa[i])}</td><td class="num">${fmt(k.deltaSigma_kPa[i])}</td><td class="num">${fmt(t.deltaSigma_kPa[i])}</td></tr>`).join('');
  const line = (label, data, color, dash) => ({ label, data, borderColor: color, backgroundColor: color, borderWidth: 2, pointRadius: 2, showLine: true, borderDash: dash || [] });
  drawChart('st', 'st-chart', {
    type: 'scatter',
    data: { datasets: [
      line('Boussinesq centre', pts(c.deltaSigma_kPa), '#0F4C81'),
      line('Boussinesq corner', pts(k.deltaSigma_kPa), '#0D9488'),
      line('2:1 method', pts(t.deltaSigma_kPa), '#B45309', [6, 4])
    ] },
    options: {
      responsive: true, maintainAspectRatio: false,
      scales: {
        x: { position: 'top', min: 0, title: { display: true, text: 'Stress increase Δσz (kPa)' } },
        y: { reverse: true, min: 0, title: { display: true, text: 'Depth z below footing base (m)' } }
      }
    }
  });
}

// ============================================================================
// P5: SETTLEMENT
// ============================================================================
function renderP5() {
  const { profile, errors: pe } = getProfile();
  const { footing, errors: fe } = getFooting();
  const msg = $('p5-msg');
  const kp = $('p5-kpis');
  const reset = () => {
    kp.innerHTML = ''; $('p5-schm').innerHTML = ''; clearTbody('p5-schm-body'); clearTbody('p5-con-body');
    if (charts.ts) { charts.ts.destroy(); delete charts.ts; }
    $('p5-curve-note').textContent = '';
  };
  const problems = [...pe.map((e) => 'P1: ' + e), ...fe.map((e) => 'P3 footing: ' + e)];
  if (problems.length) { showMsgs(msg, problems, 'warn'); reset(); return; }

  // Net pressure default from P3 footing (total overburden removed at D_f)
  const { net: autoQ, footprint } = serviceDemand(footing, profile);
  if (!state.t.qDirty) { state.t.q = fmt(Math.max(0, autoQ), 2); $('t-q').value = state.t.q; }
  const qNet = num(state.t.q); const years = num(state.t.years);
  const errs = [];
  if (!(qNet > 0)) errs.push('Net pressure must be > 0 kPa.');
  if (!(years > 0)) errs.push('Time for creep must be > 0 years.');
  if (errs.length) { showMsgs(msg, errs, 'warn'); reset(); return; }

  const gamma = num(state.f.gamma) ?? 0;
  const res = computeTotalSettlement({
    profile, footing: footprint, q_net_kPa: qNet, gamma_kNm3: gamma, delta_sigma_at_layer_mid_kPa: [],
    time_years: years, wtSource: state.f.wt, max_sublayer_thickness_m: 0.5,
    drainage: state.t.drainage
  });
  const notes = [];
  const g = res.granular;
  const hasGran = g.sublayers.length > 0;
  for (const i of g.missingStiffness ?? []) notes.push('Layer ' + (i + 1) + ': missing granular stiffness. Settlement excludes this layer.');
  if (!hasGran) notes.push('No sand or gravel layer with E_s inside the Schmertmann influence depth; immediate settlement is zero.');
  res.consolidation.layerResults.forEach((lr) => { if (lr.note === 'Missing consolidation parameters') notes.push(`Layer ${lr.layerIndex + 1}: e₀, C_c, C_r and σ′_p are all needed for consolidation settlement.`); });
  showMsgs(msg, notes, 'warn');

  kp.innerHTML = kpi('Immediate (granular) S<sub>imm</sub>', fmt(res.S_immediate_mm, 1), 'mm')
    + kpi('Consolidation S<sub>c</sub>', fmt(res.S_consolidation_mm, 1), 'mm')
    + kpi(res.complete ? 'Total settlement' : 'Partial settlement (incomplete inputs)', fmt(res.S_total_mm, 1), 'mm', true);

  let izPeak;
  if (hasGran) izPeak = schmertmannIz({ z_m: g.z_peak_m, B_m: footprint.B_m, L_m: footprint.L_m, q_net_kPa: qNet, sigma_vp_prime_kPa: g.sigma_vp_prime_kPa, shape: footprint.shape });
  $('p5-schm').innerHTML = hasGran
    ? `C<sub>1</sub> = <b>${fmt(g.C1, 3)}</b> (–) &nbsp; C<sub>2</sub> = <b>${fmt(g.C2, 3)}</b> (–) &nbsp; I<sub>z,peak</sub> = <b>${fmt(izPeak, 3)}</b> (–)<br>
       z<sub>peak</sub> = <b>${fmt(g.z_peak_m)} m</b> &nbsp; influence depth = <b>${fmt(g.z_influence_m)} m</b> &nbsp; σ′<sub>vp</sub> = <b>${fmt(g.sigma_vp_prime_kPa)} kPa</b><br>
       S<sub>imm</sub> = <b>${fmt(g.S_mm, 2)} mm</b>`
    : 'No granular sublayers contribute.';
  $('p5-schm-body').innerHTML = g.sublayers.map((s) => `<tr><td class="l num">${s.layerIndex + 1}</td><td class="num">${fmt(s.z_from_base_m)}</td><td class="num">${fmt(s.dz_m)}</td><td class="num">${fmt(s.Iz, 3)}</td><td class="num">${fmt(s.Es_kPa, 0)}</td><td class="num">${fmt(s.S_mm, 3)}</td></tr>`).join('')
    || '<tr><td colspan="6" class="empty">No contributing sublayers.</td></tr>';

  const CASE = { NC: 'NC (σ′v0 ≥ σ′p)', OC_below: 'OC, stays below σ′p', OC_crossing: 'OC, crosses σ′p' };
  const conRows = [];
  res.consolidation.layerResults.forEach((lr) => (lr.sublayers || []).forEach((s) => conRows.push(`<tr><td class="l num">${lr.layerIndex + 1}</td><td class="num">${fmt(s.z_mid_m)}</td><td class="num">${fmt(s.dz_m)}</td><td class="num">${fmt(s.sigma_v0_prime_kPa)}</td><td class="num">${fmt(s.delta_sigma_kPa)}</td><td class="num">${fmt(s.sigma_v0_final_kPa)}</td><td class="l">${CASE[s.case_type] || esc(s.case_type)}</td><td class="num">${fmt(s.S_mm, 3)}</td></tr>`)));
  $('p5-con-body').innerHTML = conRows.join('') || '<tr><td colspan="8" class="empty">No clay or silt layer with e₀, C<sub>c</sub>, C<sub>r</sub> and σ′<sub>p</sub>.</td></tr>';

  // Time-settlement: one curve per layer using the user's drainage choice
  const unit = state.t.unit;
  const palette = ['#0F4C81', '#0D9488', '#B45309', '#7C3AED', '#BE123C'];
  const datasets = []; const curves = [];
  res.consolidation.layerResults.forEach((lr) => {
    if (!(lr.S_m > 0)) return;
    const layer = profile.layers[lr.layerIndex];
    if (!(layer.cv_m2s > 0)) { notes.push(`Layer ${lr.layerIndex + 1}: add c_v to plot its time-settlement curve.`); return; }
    const H = layer.bottomDepth_m - layer.topDepth_m;
    const cv = generateTimeSettlementCurve({ S_final_m: lr.S_m, cv_m2s: layer.cv_m2s, H_m: H, drainage: state.t.drainage });
    if (!cv.data) return;
    curves.push({ lr, cv, H });
  });
  curves.forEach(({ lr, cv }, i) => datasets.push({
    label: `Layer ${lr.layerIndex + 1} (H_dr = ${fmt(cv.Hdr_m)} m)`,
    data: cv.data.map((d) => ({ x: unit === 'days' ? d.t_days : d.t_years, y: d.S_mm })),
    borderColor: palette[i % palette.length], backgroundColor: palette[i % palette.length], borderWidth: 2, pointRadius: 0, showLine: true
  }));
  if (curves.length > 1) {
    datasets.push({
      label: 'Sum of layers', borderColor: '#0F172A', borderDash: [6, 4], borderWidth: 2, pointRadius: 0, showLine: true,
      data: curves[0].cv.data.map((d0, j) => ({ x: unit === 'days' ? d0.t_days : d0.t_years, y: curves.reduce((a, c) => a + c.cv.data[j].S_mm, 0) }))
    });
  }
  if (!datasets.length) {
    if (charts.ts) { charts.ts.destroy(); delete charts.ts; }
    $('p5-curve-note').textContent = 'No consolidating clay layer with c_v, so no time-settlement curve.';
    showMsgs(msg, notes, 'warn');
    return;
  }
  showMsgs(msg, notes, 'warn');
  $('p5-curve-note').textContent = `Drainage: ${state.t.drainage}. Each layer is drained independently over 1 day to 100 years. Final S_c = ${fmt(res.S_consolidation_mm, 1)} mm.`;
  drawChart('ts', 'ts-chart', {
    type: 'scatter', data: { datasets },
    options: {
      responsive: true, maintainAspectRatio: false,
      scales: {
        x: { type: 'logarithmic', title: { display: true, text: `Time t (${unit}, log scale)` } },
        y: { reverse: true, min: 0, title: { display: true, text: 'Consolidation settlement S(t) (mm)' } }
      }
    }
  });
}

// ============================================================================
// DISPATCH
// ============================================================================
function recompute() {
  try {
    if (activeTab === 'p1') renderP1();
    else if (activeTab === 'p2') renderP2();
    else if (activeTab === 'p3') renderP3();
    else if (activeTab === 'p4') renderP4();
    else if (activeTab === 'p5') renderP5();
  } catch (err) {
    if (activeTab === 'p3') { $('p3-kpis').innerHTML = ''; clearTbody('p3-factors'); $('p3-msg').textContent = err.message; }
    if (activeTab === 'p5') { $('p5-kpis').innerHTML = ''; $('p5-schm').innerHTML = ''; clearTbody('p5-schm-body'); clearTbody('p5-con-body'); charts.ts?.destroy(); delete charts.ts; $('p5-curve-note').textContent = ''; $('p5-msg').textContent = err.message; }
    console.error(err);
    showMsgs($('global-msg'), [`Calculation error: ${err.message}`]);
  }
}

function init() {
  state.layers = [blankLayer('0')];
  buildAllTables();
  bindStatic();
  syncInputs();
  recompute();
}

if (typeof document !== 'undefined') {
  init();
  const name = new URLSearchParams(window.location.search).get('column');
  if (name) {
    const { analyzeHostel, calculatorInput } = await import('../examples/hostel.js');
    const column = analyzeHostel().columns.find(c => c.name === name);
    if (column) {
      loadState(calculatorInput(column));
      showMsgs($('global-msg'), ['Group 6 ' + name + ' · ' + column.id + (name === 'C4' ? ' · provisional axial load and moment' : '')], 'ok');
    }
  }
}
