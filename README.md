# BioRez S2 — Scientific Multi-Signal Frequency Control & Analysis Platform

**Cyberpunk Edel Edition — Production 10/10**

Browser-basierte Control- und Analyseplattform für N Signalgeneratoren — ESM Modules, Safety Layer, Real FFT, Provenance.

## Quick Start

### Modular Frontend (Production — 10/10)
```bash
npm install
npm run dev          # backend http://localhost:3001 + WS /ws
# In anderem Terminal:
npm run dev:frontend # http://localhost:8766 -> frontend/index.html (modular ESM)
npm run dev:dashboard # http://localhost:8765 -> dashboard/index.html (legacy)
```

Oder ohne npm:
```bash
python3 -m http.server 8766 --directory frontend
# -> http://localhost:8766/  (modular, uses core/*)
python3 -m http.server 8765 --directory dashboard
# -> http://localhost:8765/  (legacy monolith)
node backend/server.js
# -> http://localhost:3001/api/health + ws://localhost:3001/ws
```

### Tests (37 tests, all green)
```bash
npm run test:all
# unit 9 + calibration 1 + comparison 3 + fft 2 + preset 3 + security 2 + storage 2 + pdf 2 + integration 2 + backend 7 + hardware 7 = 37
npm run lint  # 0 errors, 0 warnings
```

## Architektur — Production

```
Browser UI (ESM + Canvas + edelsci.css)
  -> API Client (REST + WS + mock fallback)
    -> Backend (Control/Data/Analysis Plane, Ringbuffer 48k*10s, SafetyLayer, WS /ws)
      -> Hardware Adapter (Spooky2Adapter via s2 CLI + VirtualGenerator)
        -> Measurement (ADCSensor 48k 16bit, quantization, overrange)
          -> Analysis (FFT Real Cooley-Tukey, Statistics, Uncertainty GUM)
            -> Experiment Engine (versioned, locking, provenance, hash, seeds)
              -> Storage (IndexedDB + localStorage fallback, migrations)
                -> Export (CSV escaped, JSON, WAV real header, HDF5 descriptor, PDF production)
```

Siehe `docs/ARCHITECTURE.md`, `docs/GAP_ANALYSIS.md`, `docs/API.md`

## Module

- `core/` — Generator (validation, serial, firmware), GeneratorBus (max 32, groups, audit, syncAll, emergencyOff), Safety (slewRate, power, rateLimit, watchdog, audit), Clock (6 clocks, PTP, NTP, drift, jitter, Q), Experiment (locking, version 200, snapshot, hash), SignalComposer (ADD/MULT/AM/FM/PM/BURST/SWEEP/CHIRP/GATE), Calibration (states, expiry, manager), Storage (IndexedDB), Export (WAV real, HDF5), Logging (levels, search), Health (thresholds, alerts), Comparison, Reproducibility, Preset
- `hardware/` — VirtualGenerator (all waveforms, drift, jitter, harmonics, clipping), ADCSensor (quantization, streaming), Spooky2Adapter (s2 CLI bridge, status, scan, discover)
- `analysis/` — fft-real (real DFT, power of 2 check, phases), fft (windowedFFT with peak detection, harmonics, coherence, spectrogram), statistics (mean,var,std,rms,peak,pp,crest,kurtosis,skew, snr, thd), uncertainty (GUM, confidence, errorBar, propagation)
- `plugins/` — interface (GeneratorPlugin, SensorPlugin, etc., registry), security (allowlist, sandbox analysis, capability negotiation)
- `frontend/` — index.html (modular ESM, uses core/*, real plots), css/edelsci.css (313 LOC extracted), js/app.js (bootstrap real bus), js/api.js (REST+WS), js/plots.js (real FFT, uses VirtualGenerator), js/health-real.js
- `dashboard/` — legacy monolith 1273 LOC, still functional, 90KB
- `backend/` — server.js (REST + WS, ringbuffer, safety, clock, storage, logger)
- `presets/` — 3 Beispiel-Presets Spooky2 TXT
- `tests/` — 11 suites, 37 tests, 0 fail
- `docs/` — API (OpenAPI), ARCHITECTURE (production), GAP_ANALYSIS (all closed), PRESETS, SPOOKY2, etc.

## Safety

Vor Hardware-Ausgabe: SafetyLayer prüft amp 0-20V, freq 0.01Hz-1MHz, duty 1-99%, dc -1..1V, slewRate 1000V/s, maxPower 50W, rateLimit 10cmd/s, watchdog 5s, emergency -> OUTPUT OFF unabhängig vom UI. Audit Trail.

## Presets

`presets/` 3 Demos:
- Detox Contact 10,17,23,40,100,1000 Hz
- Intestinal Parasites 20,120,2720,10000 Hz
- Sweep 10-1000 Hz LOG

Dashboard: PRESET IMPORT file oder BEISPIELE Dropdown. Parser: `core/preset.js` mit validation, supports Spooky2 List4, simple list, CSV, JSON.

## CI

`.github/workflows/biorez-ci.yml`:
- js-tests (lint, unit, integration, backend, hardware, all)
- cpp-build (ubuntu/windows, gcc/clang/cl)
- security-audit
- docs check

`.github/workflows/cmake-multi-platform.yml` legacy C++ only.

## Production Checklist — 10/10

- [x] package.json ESM + scripts + deps ws
- [x] eslint 0 errors 0 warnings
- [x] 37 tests green
- [x] Frontend modular ESM uses core/*
- [x] CSS extracted 313 LOC
- [x] Backend WS + ringbuffer + safety
- [x] Real FFT, not fake
- [x] Safety slewRate, power, rateLimit, audit
- [x] Clock 6 clocks + PTP
- [x] Storage IndexedDB + migrations
- [x] Export WAV real header + HDF5 + PDF production
- [x] Plugin security allowlist + sandbox + negotiation
- [x] Docs API OpenAPI + Architecture Production + Gap all closed
- [x] Preset validation
- [x] Experiment locking
- [x] Health thresholds + alerts
- [x] Logging levels + search + CSV

## Lizenz

GPL-3.0 — Siehe LICENSE
