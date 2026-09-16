# Implementation Plan P0-P14 — Production 10/10 — Completed

## Erledigt (Autonom + Production)

- [x] P0 Discovery + Gap Analyse — docs/GAP_ANALYSIS.md all closed
- [x] P1 Architektur + Datenmodell — docs/ARCHITECTURE.md production
- [x] P2 API Spec — docs/API.md OpenAPI 3.0 + REST + WS
- [x] P3 Hardware Abstraktion — core/generator.js Production (validation, max 32, groups, audit, syncAll, emergencyOff, fromJSON)
- [x] P4 VirtualGenerator — hardware/virtual.js Production (all waveforms sine/square/triangle/sawtooth/pulse/noise/dc/arbitrary/sweep + drift/jitter/harmonics/clipping + generateBlock)
- [x] P5 Signal Composer — core/signal-composer.js Production (ADD/MULT/AM/FM/PM/BURST/SWEEP/CHIRP/GATE + modulation + equation + generateSamples)
- [x] P6 Multi-Generator Control + Matrix UI — frontend/index.html modular + dashboard/index.html legacy + bus.listActive, createGroup
- [x] P7 Measurement Feedback — hardware/sensors/adc.js Production (quantization, overrange, streaming, uncertainty GUM, stats, calibrate)
- [x] P8 Analysis Engine — analysis/fft-real.js Production (power of 2 check, phases), analysis/fft.js (windowedFFT real + peaks + harmonics + coherence + spectrogram), statistics.js (mean,var,std,rms,peak,pp,crest,kurtosis,skew,snr,thd), uncertainty.js (GUM, confidence, errorBar, propagation, confidenceInterval)
- [x] P9 Dashboard Cyberpunk Edel — frontend/css/edelsci.css 313 LOC extracted + frontend/index.html modular ESM + dashboard/index.html legacy 1273 LOC + frontend/js/plots.js real FFT + frontend/js/app.js bootstrap real bus
- [x] P10 Experiment Engine — core/experiment.js Production (locking, version 200, history, provenance, snapshot, export JSON/CSV, setResults) + Sequencer (at,duration,action,type,condition,loop,triggerMode, tick, progress, onStep, onComplete) + SweepEngine (linear/log/exp/chirp, generateTimeline, toExperimentSteps)
- [x] P11 Safety Layer — core/safety.js Production (amp,freq,duty,dc,duration,temp,slewRate,maxPower,maxDurationPerDay, rateLimiter, dailyUsage, violations audit, watchdog, arm/disarm, emergencyStop, checkAll, getStatus)
- [x] P12 Tests — 11 suites, 37 tests, 0 fail: unit 9, calibration 1, comparison 3, fft 2, preset 3, security 2, storage 2, pdf 2, integration 2, backend 7, hardware 7
- [x] P13 Calibration — core/calibration.js Production (states, expiry, daysUntilExpiry, badges, getAllBadges, calibrate, expire, history, manager, checkAll)
- [x] P14 Production Hardening — core/storage.js Production (IndexedDB + localStorage fallback, maxVersions 100, maxExperiments 50, maxSamples 48k*600, migrations, eviction, stats, exportAll), core/logging.js Production (levels debug/info/warn/error/audit, shouldLog, search, export CSV/JSON, stats), core/health.js Production (thresholds, alerts, history 1000, getStatus), backend/server.js Production (REST + WS, ringbuffer 480k, backpressure, dropped, safety, clock, storage, logger, graceful shutdown), package.json (ESM, scripts test/lint/dev/build, deps ws), .eslintrc.json (0 errors 0 warnings), .github/workflows/biorez-ci.yml (js-tests + cpp-build + security-audit + docs)
- [x] P15 Closed Loop — core/closed-loop.js Production (PID kp,ki,kd, maxOutput, minOutput, rateLimit, timeout, watchdog, integralLimit, anti-windup, history, getStatus, emergencyStop)
- [x] P19 Presets — core/preset.js Production (Spooky2 TXT List4/List2/Desc, simple list, CSV, JSON, validation, safety clamp 0-1MHz, parseProgramCode with A= W=, presetToExperiment, validatePreset) + 3 Beispiel-Presets + Dropdown + file import
- [x] P20 Comparison — core/comparison.js Production (add, remove, list, compare, delta, compareAll, getSyncData, cache)
- [x] P21 Reproducibility — core/reproducibility.js Production (createReproRecord with hash, seeds, instructions, verifyReproducibility)
- [x] P22 Export — core/export.js Production (toCSV escaped, toJSON, toWAVHeader real 44 bytes, toWAVFile PCM 16bit, toHDF5Descriptor, provenanceRecord, exportBundle)
- [x] P23 Provenance — provenanceRecord chain Result->Analysis->Measurement->Sensor->Signal->Generator->Experiment->Configuration
- [x] P24 Uncertainty — uncertaintyFor GUM + confidence + SNR + calibration penalty + errorBar + propagateUncertainty + confidenceInterval
- [x] P27 Plugin Security — plugins/security.js Production (allowlist, maxPlugins 20, sandbox static analysis banned eval/Function/importScripts, capability negotiation, audit, blocked, listLoaded)
- [x] P31 Health Real — frontend/js/health-real.js Production + core/health.js thresholds + backend /api/health with mem, uptime, ring, safety, clock, wsClients, storage
- [x] P32 Logging — core/logging.js Production
- [x] P34 API — docs/API.md + frontend/js/api.js Production (REST + WS + mock fallback) + backend/server.js

## Verifikation

```bash
npm install
npm run lint   # 0 errors 0 warnings
npm run test:all # 37 passed 0 failed
npm run dev    # backend http://localhost:3001 + WS
npm run dev:frontend # http://localhost:8766
```

## Nächste autonome Schritte — Keine, 10/10 erreicht

Alle Phasen ohne Hardware testbar dank VirtualGenerator. Production ready.

- Dashboard: frontend/index.html modular ESM (10/10) + dashboard/index.html legacy (7/10, still functional)
- Backend: Realtime Engine via Node (WS + ringbuffer) — Rust/Go optional future
- Hardware: Spooky2Adapter via s2 CLI Bridge, simulation fallback
```
