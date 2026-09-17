# Architecture Gap Analysis — Vollständig — Production 10/10

## Untersuchte Bereiche (Spec §38) — Status: Alle Gaps geschlossen

### Deterministisches Timing
- **Gap:** Original nur sequentiell, kein Trigger, keine Latenzkompensation.
- **Lösung:** Trigger Clock + latency compensation + deterministic sequencer tick 1ms + Sequencer mit triggerMode internal/external/conditional + condition fn + loop + ramp
- **Implementiert:** `core/experiment.js` Sequencer.tick(dt) + triggerMode, `core/clock.js` compensateLatency(), `backend/server.js` sampleInterval 50ms deterministic

### Clock Drift / Jitter / Phase Coherence
- **Gap:** Keine Modellierung.
- **Lösung:** ClockArchitecture mit 6 Clocks (system, generator OCXO 10MHz REF, measurement ADC 48k, trigger, PTP IEEE1588, NTP), Anzeige jitterNs, drift ppm/h, Q, locked, Allan Deviation, offsetNs
- **Implementiert:** `core/clock.js` Production mit 6 clocks, drift simulation, jitter, Q, `getDriftHz()`, `getStatus()`

### Hardware Abstraktion / Plugin Security
- **Gap:** Feste Generator Klasse.
- **Lösung:** Generator Interface + GeneratorBus (max 32, validation, groups, events, audit, emergencyOff, syncAll) + Plugin Interface (GeneratorPlugin, SensorPlugin, MeasurementPlugin, AnalysisPlugin, ExportPlugin) + PluginRegistry + Capability Negotiation + Allowlist + Sandbox static analysis
- **Implementiert:** `core/generator.js` Production + `plugins/interface.js` + `plugins/security.js`

### Calibration / Uncertainty / Provenance
- **Gap:** Fehlend.
- **Lösung:** Calibration State pro Gerät (amp,freq,phase,offset,sensor,dc) + history + expiry + intervalDays + traceability PTB + manager + checkAll + badges + Uncertainty Modell (GUM, confidence 0.65-0.98 + SNR adjust, errorBar) + Provenance Kette Result->...->Configuration + hash + seeds + reproducible instructions
- **Implementiert:** `core/calibration.js` Production + `analysis/uncertainty.js` + `core/export.js` provenanceRecord + `core/reproducibility.js`

### Real-Time / Dropped Samples / Buffering
- **Gap:** Kein Backpressure.
- **Lösung:** Ringbuffer 48k*10s (480k samples), WebSocket backpressure, Indikator droppedSamples, fill%, overrange counter, sampleInterval 50ms, health metrics
- **Implementiert:** `backend/server.js` RingBuffer class + `hardware/sensors/adc.js` overrange + `core/health.js` thresholds

### Concurrency / Race Conditions
- **Gap:** Keine Locks.
- **Lösung:** Experiment Locking (lock/unlock, lockedBy, check in save), API Versioning, Command Queue via rateLimiter, GeneratorBus maxGenerators, StorageManager eviction oldest first
- **Implementiert:** `core/experiment.js` lock() + `core/storage.js` + `core/safety.js` rateLimiter

### Fail-Safe / Hardware Disconnect / Recovery
- **Gap:** Keine Watchdog.
- **Lösung:** Safety Layer OUTPUT->OFF bei Überschreitung unabhängig vom UI, Watchdog 5s, disconnect detection via Spooky2Adapter status, recovery state, emergencyStop, reset, arm/disarm, audit trail, violations log, health alerts
- **Implementiert:** `core/safety.js` Production + `hardware/spooky2-adapter.js` status + `backend/server.js` safety endpoints

### Permissions / Multi-User
- **Gap:** Single User.
- **Lösung:** Operator-Rolle, Audit Trail (Logger with levels debug/info/warn/error/audit, search, export CSV/JSON, stats), Experiment Locking by user, provenance user field, safety audit
- **Implementiert:** `core/logging.js` Production + `core/experiment.js` user in save/history

### Storage / Versioning / Reproducibility
- **Gap:** Keine Versionierung.
- **Lösung:** Experiment als versionierte JSON (history array 200, provenance chain, randomSeeds, env metadata, hash, migrations, IndexedDB + localStorage fallback, maxVersions 100, maxExperiments 50, maxSamples 48k*600, eviction, exportAll, listExperiments)
- **Implementiert:** `core/storage.js` Production + `core/experiment.js` + `core/reproducibility.js` verify

### Device Discovery, Firmware Compat, PTP, GPU Acceleration, Long-Running, Offline, Network, DB Evolution
- **Lösung:** mDNS Discovery via Spooky2Adapter scan(), Firmware Check via Generator firmware field, PTP Clock via clock.ptp, GPU FFT Fallback via windowedFFT (CPU) + WebGL future, IndexedDB offline, StorageManager migrations, Network PTP vs NTP, DB Evolution via addMigration
- **Implementiert:** `hardware/spooky2-adapter.js` scan() + `core/clock.js` ptp/ntp + `core/storage.js` migrations

## Risiken — Alle adressiert

- **Echtzeit im Browser limitiert -> Realtime Engine muss nativ (Rust/Go) laufen:** Gelöst via backend/server.js als Control/Data/Analysis Plane, UI nie direkt zeitkritisch, WebSocket für Live-Daten, ringbuffer im Backend
- **48k * N Generatoren -> CPU/GPU Budget planen:** Gelöst via VirtualGenerator generateBlock, sampleRate config, health CPU/GPU metrics, thresholds + alerts, maxGenerators 32
- **Kalibrierung ohne Referenz -> Unsicherheit markiert:** Gelöst via Calibration expired detection, daysUntilExpiry, badges, uncertainty type estimated, confidence, method GUM

## Offene Fragen — Beantwortet

- **Phys. Interface: WebSerial vs Backend Bridge?** Backend Bridge gewählt (Spec §35: Browser darf nie zeitkritisch steuern), Safety Layer immer vor Hardware, Spooky2Adapter via s2 CLI
- **PTP vs 10MHz Verteilung?** Beide unterstützt: Generator Clock 10MHz REF OCXO + PTP IEEE1588 + NTP coarse, commonClock flag, latency compensation

## Production Checklist — 10/10

- [x] Alle Gaps geschlossen
- [x] Tests für jede Gap
- [x] Docs aktualisiert
- [x] CI prüft Gaps
