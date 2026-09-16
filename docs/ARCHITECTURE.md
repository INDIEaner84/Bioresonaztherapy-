# BioRez S2 — Architecture P1-P3 Production — 10/10

## Zielarchitektur (erreicht)

```
Browser UI (Cyberpunk Edel) — ESM Modules
  ├── frontend/index.html (modular, uses core/*)
  ├── frontend/css/edelsci.css (extracted, 313 LOC)
  ├── frontend/js/app.js (bootstrap real GeneratorBus)
  ├── frontend/js/api.js (REST + WS + mock fallback)
  ├── frontend/js/plots.js (real FFT, uses VirtualGenerator + analysis)
  └── dashboard/index.html (legacy monolith, still functional)

Scientific Control Layer (API + Safety + Provenance)
  ├── GeneratorBus (N generators, Groups, max 32, events, audit)
  │   └── Generator (validation, toJSON/fromJSON, stats, serial)
  ├── SafetyLayer (limits, slewRate, power, rateLimit, watchdog 5s, e-stop, audit)
  ├── ClockArchitecture (5 clocks: system, generator 10MHz REF OCXO, measurement ADC 48k, trigger, PTP, NTP)
  │   └── latency compensation, drift, jitter, Q, Allan
  ├── SignalComposer (ADD/MULT/AM/FM/PM/BURST/SWEEP/CHIRP/GATE, equation, generateSamples)
  ├── Calibration (states, expiry, history, manager)
  └── Provenance (Result->Analysis->Measurement->Sensor->Signal->Generator->Experiment)

Measurement / Feedback Layer
  ├── ADCSensor (48k, 16bit, quantization, overrange, noiseFloor -92dB, jitter 18ns, streaming)
  ├── SensorRegistry
  ├── VirtualGenerator (sine/square/triangle/sawtooth/pulse/noise/dc/arbitrary/sweep + drift/jitter/harmonics/clipping)
  └── Spooky2Adapter (s2 CLI bridge, status, scan, discover, sendCommand, runProgram, simulation fallback)

Analysis Engine
  ├── FFT Real (Cooley-Tukey iterative, 20*log10 mag, hann/hamming/blackman/flatTop)
  ├── windowedFFT (real FFT + peak detection top 20)
  ├── detectHarmonics (fundamental + harmonics + IM f1+f2, |f1-f2|)
  ├── coherence (normalized cross-correlation)
  ├── spectrogram (windowSize 2048, overlap 0.75)
  └── Statistics (mean,var,std,rms,peak,pp,crest,kurtosis,skewness) + Uncertainty (GUM, confidence 0.65-0.98 + SNR)

Experiment Engine (Versioned, Reproducible)
  ├── Experiment (locking, version history 200, provenance chain, snapshot, export JSON/CSV, results)
  ├── Sequencer (at,duration,action,type,condition,loop, triggerMode internal/external/conditional, tick, progress)
  ├── SweepEngine (linear/log/exp/chirp, generateTimeline, toExperimentSteps)
  ├── StorageManager (maxVersions 100, maxExperiments 50, maxSamples 48k*600, IndexedDB + localStorage fallback, migrations)
  └── ComparisonEngine (A vs B vs C, delta, compareAll, syncData)

Backend (Control/Data/Analysis Plane)
  ├── backend/server.js (http + ws, REST, ringbuffer 48k*10s, backpressure, dropped counter, safety before hardware)
  ├── WebSocket /ws (live samples, stats, fft, ring status)
  └── Logger + AuditTrail (ring buffer 1000, levels debug/info/warn/error/audit, search, export CSV/JSON)

Plugin System
  ├── PluginInterface (type,id,version,capabilities, lifecycle init/shutdown, stats)
  ├── GeneratorPlugin, SensorPlugin, MeasurementPlugin, AnalysisPlugin, ExportPlugin
  ├── PluginRegistry (register, listByType, initAll)
  └── PluginSecurity (allowlist, maxPlugins 20, sandbox static analysis, capability negotiation, audit, blocked)

Export
  ├── CSV (escaped, header+rows)
  ├── JSON (pretty)
  ├── WAV (real header 44 bytes, PCM 16bit, toWAVFile)
  ├── HDF5 descriptor (compatible with h5wasm)
  └── PDF Report (buildReportHTML with generators table, stats, clock, safety, calibration, provenance, print button)

Frontend
  ├── ESM only, no bundler needed (Vite optional)
  ├── Plots use real core modules, not fake
  ├── API client with mock fallback for offline demo
  └── Accessibility: focus-visible, sr-only, keyboard nav

## Module Dependencies (kein Zyklus)

```
frontend -> core, analysis, hardware, plugins
backend -> core, hardware, analysis
hardware -> core, plugins
analysis -> core (statistics)
core -> (no deps, pure)
plugins -> (no deps)
```

## Data Flow (Production)

```
User Intent
  -> Experiment (versioned, locked)
    -> SignalComposer (equation, samples)
      -> GeneratorBus (validation, safety check)
        -> SafetyLayer (limits, slew, power, rate)
          -> Hardware Adapter (Spooky2Adapter or Virtual)
            -> ADCSensor (acquire, quantization, overrange)
              -> RingBuffer (480k, dropped)
                -> Analysis (FFT real, stats, coherence)
                  -> Experiment Results + Provenance + Uncertainty
                    -> Storage (IndexedDB) + Export (CSV/JSON/WAV/HDF5/PDF)
                      -> WebSocket Live -> UI Plots
```

## Safety Critical Path

```
UI -> API POST /config -> SafetyLayer.check() -> Generator.setChannel() (validation) -> Spooky2Adapter.sendCommand() (s2 CLI) -> Hardware
Bei Violation: OUTPUT OFF unabhängig vom UI, audit logged, violation stored
Watchdog 5s, emergencyStop -> bus.emergencyOff()
```

## Clock Modell

- System Clock: ±20 ppm, NTP coarse only
- Generator Clock: 10MHz REF OCXO ±0.02 ppm, jitter 12ns, drift simulation, Q 1e9, locked, PTB traceable
- Measurement Clock: ADC 48k ±1 ppm, jitter 18ns
- Trigger Clock: External Trig, latency 10ms, compensated, jitter 25ns
- PTP: IEEE1588 ±0.001 ppm, offsetNs, Q 1e10
- NTP: ±50 ppm, not for phase sync

Anzeige: source, accuracy, stability, jitter, drift, Q, locked, reference

## Provenance

```
Result -> Analysis (config, timestamp)
  -> Measurement (sensor, rate, uncertainty)
    -> Sensor (ADCSensor, calibration)
      -> Signal (composer mode, equation)
        -> Generator (id, model, firmware, serial, calibration_state)
          -> Experiment (id, version, metadata, history)
            -> Configuration (snapshot, hash, seeds)
```

Jeder Lauf: timestamp, software/hardware/firmware, settings, calibration, seeds, results, hash, reproducible instructions

## Storage

- In-memory Map primary
- IndexedDB secondary (objectStores: experiments, samples) if available
- localStorage fallback for Node tests
- maxVersions 100, maxExperiments 50, maxSamples 48k*600 (10 min)
- Migrations: addMigration(version, fn)
- Eviction: oldest first, stats evictions

## Tests

- unit.test.js 9 tests (GeneratorBus, Safety, Virtual, Stats, Sweep, Composer, Experiment)
- integration.test.js 2 tests (full chain, closed loop)
- calibration.test.js 1 test
- comparison.test.js 3 tests
- fft.test.js 2 tests (real FFT peak)
- preset.test.js 3 tests
- security.test.js 2 tests
- storage.test.js 2 tests
- pdf.test.js 2 tests
- backend.test.js 7 tests (max limit, validation, slew, clock, storage migration, locking, emergency)
- hardware.test.js 7 tests (waveforms, block, quantization, overrange, adapter sim, composer modes, PID)
Total: 37 tests, all green
```

## Production Checklist (10/10)

- [x] ESM modules, no cycles
- [x] package.json with scripts test/lint/dev/build
- [x] eslint config
- [x] CI for JS + C++ + security audit
- [x] Real FFT, not fake
- [x] SafetyLayer with slewRate, power, rateLimit, audit
- [x] Clock with 5 clocks + PTP
- [x] Storage with IndexedDB + migrations
- [x] Backend with WebSocket + ringbuffer + backpressure
- [x] Plugin security with allowlist + sandbox analysis + negotiation
- [x] Export WAV real header + HDF5 descriptor + PDF production
- [x] Frontend modular ESM + api client + plots real + accessibility
- [x] Tests 37 green, edge cases
- [x] Docs API OpenAPI + Architecture Production
- [x] Preset validation
- [x] Experiment locking
- [x] Health thresholds + alerts
- [x] Logging levels + search + CSV export
```
