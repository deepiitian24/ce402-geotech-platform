# CE 402 Geotechnical Engineering Platform

**Group 6 — CE 402 Geotechnical Engineering, IIT Mandi**

A pure client-side web platform for geotechnical foundation design calculations per Indian Standards (IS 2131:1981, IS 6403:1981). Built with plain HTML/CSS and ES Module JavaScript — system fonts only, Chart.js loaded from CDN, zero backend, no build step, nothing to install.

---

## 🚀 Quick Start

### Run Locally

The app uses ES modules (`type="module"`), so browsers block `file://` imports. You must serve it over HTTP:

```bash
python -m http.server 8000 --bind 127.0.0.1
```

Then open: **http://127.0.0.1:8000**

(`file:///.../index.html` will not work — ES module imports are blocked by CORS on file URLs.)

### Run Unit Tests

```bash
npm test
```

Runs `node --test` over `tests/test_p1_p2.test.js` and `tests/test_p3_p4_p5.test.js` using the built-in `node:test` + `node:assert/strict` — no external test runner. All **173 tests** must pass.

### Deploy via GitHub Pages

1. Push this repository to GitHub.
2. Go to **Settings → Pages**.
3. Build and deployment: **Deploy from a branch** → `main` (or `master`), folder `/ (root)`.
4. The site goes live at your GitHub Pages URL (see "Team & Live Deployment" below).

---

## 🧭 App Walkthrough

| Tab | Purpose |
|-----|---------|
| **P1 Soil Profile** | Layer table (top/bottom, γmoist, γsat, c′, φ′, su, Es, e0, Cc, Cr, σ′p, cv), measured & design water tables, σ′v0 at any depth, SVG borehole visualization |
| **P2 Parameter Tools** | SPT N-value corrections per IS 2131:1981 (CN overburden + N″ dilatancy), direct shear OLS Mohr–Coulomb fit with Chart.js |
| **P3 Bearing Capacity** | IS 6403:1981 Cl. 5.1.2.1 factors for strip / square / rectangular / circular footings, general/local/intermediate shear, eccentricity, water-table factor W′, load inclination, gross safe `qs = qns + q` |
| **P4 Stress Increase** | Boussinesq centre / corner, 2:1 method, Δσz vs depth chart and table |
| **P5 Settlement** | Schmertmann (1978) granular settlement, 1D Terzaghi consolidation with ≤ 0.5 m sublayers, time–settlement curve |

Header actions: **Load Sample Profile**, **Import JSON**, **Export JSON**.

---

## 📁 Project Structure

```
ce402-geotech-platform/
├── index.html           # Main HTML, 5-tab UI (do not edit — tests depend on it)
├── LICENSE              # MIT License
├── README.md            # This file
├── package.json         # "test": "node --test"
├── css/
│   └── styles.css       # Custom properties, no framework
├── js/
│   ├── models.js        # Shared data models & SI-unit validators
│   ├── soilProfile.js   # P1: effective stress, layer geometry
│   ├── spt.js           # P2: IS 2131 SPT corrections + direct shear OLS
│   ├── bearingCapacity.js  # P3: IS 6403 bearing capacity
│   ├── stress.js        # P4: Boussinesq + 2:1 stress distribution
│   ├── settlement.js    # P5: Schmertmann + Terzaghi consolidation
│   └── app.js           # Main UI wiring (ES Module)
├── tests/
│   ├── test_p1_p2.test.js   # Wave 1: models, P1, P2
│   └── test_p3_p4_p5.test.js # Wave 2: P3, P4, P5
└── docs/
    ├── AI_LOG.md        # Structured AI session log
    └── AI_AUDIT.md      # AI-introduced engineering errors & corrections
```

---

## 🧪 Testing

```bash
npm test
# 173 tests, 41 suites, 0 failures
# Wave 1: models / P1 / P2
# Wave 2: P3 / P4 / P5 + integration
```

All tests use Node.js built-in `node:test` + `node:assert/strict` — no external test runner needed.

---

## 📝 Documentation

- `docs/AI_LOG.md` — structured AI session log (all six development waves)
- `docs/AI_AUDIT.md` — engineering audit: AI-introduced errors caught and corrected

---

## 🔧 Tech Stack

- **HTML5 + CSS3** — custom properties, no framework, no build step
- **ES2022 Module JavaScript** — `.js` files with `type: "module"`, zero bundler
- **Fonts** — system fonts only (no Google Fonts, no Inter, no JetBrains Mono)
- **Charts** — Chart.js 4.4.1 UMD from CDN (needs internet on first load)
- **Tests** — Node.js `node:test` + `node:assert/strict` (built-in)

---

## ⚠️ Known Limitations

- No backend — all calculations run in-browser
- Chart.js from CDN — requires internet for first load (cacheable)
- No Web Workers — heavy calculations block the main thread
- IS 6403 / IS 2131 only — no AASHTO, Eurocode, or other standards yet

---

## 👥 Team & Live Deployment

| # | Member name (placeholder) | Role |
|---|---------------------------|------|
| 1 | [Member 1] | |
| 2 | [Member 2] | |
| 3 | [Member 3] | |
| 4 | [Member 4] | |
| 5 | [Member 5] | |

**Live deployment (GitHub Pages):** `https://<username>.github.io/<repo>/` — replace with the actual URL after enabling Pages in the repository settings.

---

## 📄 License

MIT License — see `LICENSE`.

---

## 🙏 Acknowledgments

IS 2131:1981, IS 6403:1981, IS 2720, IS 8009 · Terzaghi & Peck (1967), Das (2010), Lambe & Whitman (1969) · Schmertmann et al. (1978), Newmark (1935), Boussinesq (1885).
