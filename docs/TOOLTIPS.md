# Tooltips — BIOREZ S² — Alle UI Elemente erklärt

**Datei:** `frontend/js/tooltips.js` — Zentrale Datenbank `TOOLTIPS` Objekt — 25+ Tooltips
**Init:** `initTooltips()` bindet alle `[data-tooltip]` + IDs, `initOnboarding()` 7 Schritte Tour

---

## Header Tooltips

### logo — BIOREZ S² Logo — System Status
- **Title:** BIOREZ S² Logo — System Status
- **Text:** Zeigt System-Nominal Status. Pulsiert bei PTP Sync. Click öffnet System Health Details. OCXO 10MHz REF ±0.02ppm.
- **Detail:** PTB rückführbar, Q-Faktor 1e9, jitter 12ns. Watchdog 5s überwacht alle Generatoren.
- **Link:** ../docs/ARCHITECTURE.md#clock

### system-nominal — SYSTEM NOMINAL — Gesamtstatus
- **Title:** SYSTEM NOMINAL — Gesamtstatus
- **Text:** Alle Subsysteme OK: GeneratorBus 32 max, Safety ARMED, Clock PTP locked, RingBuffer 480k, Storage IndexedDB, 70 Tests grün, Lint 0.
- **Detail:** Prüft: Bus, Safety slew/power/rate, Clock drift, Ring dropped, WS Clients, Storage count, Health CPU/RAM.
- **Präzision:** ±0.02ppm OCXO, 12ns jitter, 48kHz SampleRate, 16bit ADC

### gen-count — GENERATOR BUS — 6 aktive Generatoren
- **Title:** GENERATOR BUS — 6 aktive Generatoren
- **Text:** Zeigt Anzahl aktiver Generatoren. Max 32 (ESM). Sync via PTP IEEE1588. Click SYNC ALL setzt alle Phasen auf 0° mit Latenz-Kompensation.
- **Detail:** Jeder Generator: id, name, model, connection (virtual/usb/serial), protocol (sim/s2/scpi), amplitude 0-20V, freq 0.01Hz-1MHz, phase 0-360°, duty 1-99%, offset -1..1V, waveform 9 Typen.
- **Handbuch:** Siehe Handbuch Kapitel 2: Generator Management

### safety-armed — SAFETY ARMED — P11+P14 Production Hardening
- **Title:** SAFETY ARMED — P11+P14 Production Hardening
- **Text:** SafetyLayer aktiv vor Hardware-Ausgabe. Bei Überschreitung → OUTPUT OFF unabhängig vom UI. Watchdog 5s, Audit Trail, Rate Limit 10 cmd/s, Slew 1000V/s, Power 50W.
- **Detail:** Limits: amp 0-20V, freq 0.01Hz-1MHz, duty 1-99%, DC -1..1V, duration 3600s, temp 70°C, daily 8h. Violations → Audit + Output OFF + Stats.errors++. EMERGENCY STOP setzt estop=true und bus.emergencyOff().
- **Präzision:** Slew-Rate Berechnung: dAmp/dt, Power: amp²/50Ω, Daily Usage Reset 24h
- **Link:** ../docs/API.md#safety

### ws-status — WebSocket LIVE — Data Plane
- **Title:** WebSocket LIVE — Data Plane
- **Text:** WS Verbindung zu Backend ws://:3001/ws. Live Samples 48k, Stats RMS/P-P/Crest/SNR, FFT Peak alle 10 Frames, Ring Stats, Generator States. Reconnect automatisch.
- **Detail:** Payload: {t, stats, fft:{peakFreq,peakMag,mags[512]}, ring:{capacity,size,dropped,fill}, generators:[{id,freq,amp,output}]}. 50ms Interval, 2400 Samples/Chunk.
- **Troubleshooting:** Falls RECONNECTING: Backend prüfen npm install ws, Port 3001 frei, CORS, Firewall.

### clock — CLOCK UTC — 6 Clocks PTP/NTP
- **Title:** CLOCK UTC — 6 Clocks PTP/NTP
- **Text:** System Clock ±20ppm, Generator 10MHz REF OCXO ±0.02ppm jitter 12ns Q 1e9 locked PTB, Measurement ADC 48k ±1ppm jitter 18ns, Trigger Ext 10ms compensated jitter 25ns, PTP IEEE1588 ±0.001ppm jitter 5ns Q 1e10, NTP ±50ppm coarse only.
- **Detail:** Drift Simulation: generator drift += (rand-0.5)*0.002 ppb/tick, measurement 0.01, system 0.1. PTP offset += (rand-0.5)*2 ns. Latency Compensation: subtract trigger latency. getDriftHz(baseFreq) = baseFreq * drift ppm *1e-6.
- **Präzision:** PTB rückführbar, Allan Deviation, Q-Faktor, Latenz-Kompensation ON
- **Link:** ../docs/ARCHITECTURE.md#clock-architecture

### emergency — EMERGENCY STOP — Hardware Safety
- **Title:** EMERGENCY STOP — Hardware Safety
- **Text:** Sofortiger OUTPUT OFF für alle Generatoren. Setzt safety.estop=true, bus.emergencyOff() (alle channels output=false), audit log emergency, UI armed Animation 2.6s.
- **Detail:** Unabhängig vom UI-State, blockiert alle weiteren Checks mit code ESTOP. Reset via /api/safety/reset oder safety.reset(). Watchdog prüft lastOk <5s.
- **Safety:** P11: Vor Hardware-Ausgabe, P14: Unabhängig vom UI, PTP: Latenz kompensiert

---

## Generator Karten Tooltips

### gen-card — GENERATOR KARTE — ESM Production
- **Title:** GENERATOR KARTE — ESM Production
- **Text:** Jede Karte = 1 Generator Instanz (Generator Klasse). Zeigt id, name, model, connection, protocol, serial, color, waveform, freq, amp, phase, duty, offset, output state LIVE/OFF.
- **Detail:** setChannel(ch,patch) validiert: freq in [fmin,fmax], amp in [amin,amax], duty 1-99, waveform in waveform_types. Gibt {before,after} zurück. stats.commands++. outputOn/off, outputOffAll(). toJSON/fromJSON für Storage.
- **Handbuch:** Kapitel 2.1: Generator anlegen, editieren, löschen, gruppieren

### power-toggle — POWER TOGGLE — Output ON/OFF mit Safety Check
- **Title:** POWER TOGGLE — Output ON/OFF mit Safety Check
- **Text:** Schaltet channel output. Bei ON: safety.check(g) prüft amp, freq, duty, offset, slewRate, power, rateLimit, dailyUsage, estop, armed. Bei Violation → OUTPUT OFF + Violation Audit + stats.errors++. Bei OFF: direkt false.
- **Detail:** Slew: dAmp/dt >1000V/s blockt. Power: amp²/50Ω >50W blockt. Rate: <100ms seit letztem Cmd blockt. Daily: >8h blockt. DC: offset -1..1V. Temp: 70°C.
- **Präzision:** Safety Check vor Hardware-Ausgabe, unabhängig vom UI, PTP Latenz kompensiert

### freq-slider — FREQUENZ — 0.01Hz bis 1MHz • OCXO ±0.02ppm
- **Title:** FREQUENZ — 0.01Hz bis 1MHz • OCXO ±0.02ppm
- **Text:** Setzt channel frequency. Validiert gegen frequency_range [0.01,1e6]. Slider 0.1-1000Hz für schnelles Tuning, Number Input für präzise Werte. Mini-Canvas zeigt Waveform Preview via VirtualGenerator.generateSample().
- **Detail:** VirtualGenerator: sine = amp*sin(2πft+φ), square = amp*sign(sin), triangle = amp*2/π*asin(sin), sawtooth = amp*2*(t*f - floor(t*f+0.5)), pulse = amp*( (t*f)%1 < duty/100 ?1:-1), noise = amp*(rand*2-1). PhaseDeg in Grad.
- **Präzision:** OCXO 10MHz REF, ±0.02ppm = ±0.02Hz bei 1MHz, jitter 12ns, drift 0.11Hz/h
- **Tooltip:** Tipp: Für Detox 10/17/23/40/100/1000 Hz Preset nutzen

### amp-slider — AMPLITUDE — 0-20V • Power 50W • Slew 1000V/s
- **Title:** AMPLITUDE — 0-20V • Power 50W • Slew 1000V/s
- **Text:** Setzt channel amplitude in Volt. Validiert 0-20V. Power Estimate = amp²/50Ω. Bei >50W blockt Safety. Slew-Rate = dAmp/dt, max 1000V/s. Slider 0-20V.
- **Detail:** WAV Export normalisiert auf 10V max: s = max(-1,min(1,samples[i]/10)) *0x7FFF Int16. Quantisierung 16bit LSB = 10V/32768 ≈0.3mV.
- **Präzision:** 16bit ADC, ±0.5% GUM Unsicherheit k=2, PTB kalibriert, 0.3mV Auflösung
- **Safety:** Power >50W → OUTPUT OFF, Slew >1000V/s → OUTPUT OFF

### wave-chip — WAVEFORM CHIP — 9 Typen ESM
- **Title:** WAVEFORM CHIP — 9 Typen ESM
- **Text:** Wählt Wellenform: sine, square, triangle, sawtooth, pulse, arbitrary, dc, noise, sweep. Validiert gegen waveform_types. Click setzt channel.waveform. Mini-Canvas Preview aktualisiert live.
- **Detail:** Sine: harmonisch rein, Square: ungerade Harmonische, Triangle: -12dB/Oktave, Sawtooth: alle Harmonische, Pulse: duty variabel, Noise: weiß, Sweep: f1→f2, Arbitrary: custom, DC: offset only.
- **Handbuch:** Kapitel 3: Signal Composer 9 Modi ADD MULT AM FM PM BURST SWEEP CHIRP GATE

---

## Signal Chain Tooltip

### signal-chain — SIGNAL CHAIN — Provenance Kette
- **Title:** SIGNAL CHAIN — Provenance Kette
- **Text:** Zeigt Datenfluss: SOURCE (Composer ESM) → GENERATOR (Bus) → SAFETY (ARMED OK) → CLOCK (10MHz PTP) → SENSOR (ADC 48k 16b) → RING (480k 0 drop) → FFT REAL (2048 Hann). Jede Node klickbar für Details.
- **Detail:** Provenance: Jede Messung hat Chain [Result,Analysis,Measurement,Sensor,Signal,Generator,Experiment,Configuration] + Timestamp + Software v2.1 + Uncertainty GUM ±0.5% k=2 + PTB Referenz.
- **Präzision:** Sample Rate 48kHz real, Timebase ±0.02ppm OCXO, Jitter 12ns, Drift 0.11Hz/h, Storage IndexedDB 0 exps, Buffer 480k
- **Link:** ../docs/ARCHITECTURE.md#data-flow

---

## Live Plots Tooltips

### oscillo — TIME DOMAIN — Amplitude vs Time • Trigger • Real Samples
- **Title:** TIME DOMAIN — Amplitude vs Time • Trigger • Real Samples
- **Text:** Oszilloskop: Zeigt Composite + individuelle Generatoren. 48kHz VirtualGenerator Real Samples, 0.05s Window = 2400 Samples. Grid 42px, Trigger 0ms, Shadow Blur 12px für Edel-Effekt.
- **Detail:** getSamples(duration): n=floor(sampleRate*duration), t0=this.t, active=bus.list().filter(g=>channels.some(c=>output)), v=sum(vg.generateSample(...))/sqrt(active.length). calcStats: mean, rms=sqrt(mean(v²)), pp=max-min, crest=peak/rms, variance, std, skewness, kurtosis, snr=20log10(rms/noise).
- **Präzision:** RMS 3.42V Real, P-P 12.10V Real, Crest 1.41 Real, SNR 38.2dB Real, Mean 0.02V Real, THD 1.84% Real
- **Tooltip:** FREEZE pausiert RingBuffer, RESUME setzt fort

### fft — FREQUENCY DOMAIN — FFT REAL • Magnitude & Phase • Hann 2048
- **Title:** FREQUENCY DOMAIN — FFT REAL • Magnitude & Phase • Hann 2048
- **Text:** Echte DFT 2048 Punkte, Hann Window, 23.4Hz/Bin, log-Skala X=log10(f+1)/log10(1001)*W, Y=(db+90)/90*(H-36). Zeigt 12 Peaks farbcodiert: <50Hz cyan, <200Hz gold, >200Hz magenta. Envelope via exp(-d*38)*(db+90).
- **Detail:** fftReal: Cooley-Tukey iterativ, Bit-Reversal, twiddle wlenRe=cos(2π/len), wlenIm=sin(2π/len). mags=20log10(hypot(re,im)/N). freqs=i*sampleRate/N. windowedFFT: Hann 0.5*(1-cos(2πn/(N-1))), Peak Detection mags[i]>mags[i-1] && mags[i]>mags[i+1] && mags[i]>-60. Peaks sort by mag.
- **Präzision:** Real DFT, 23.4Hz/Bin, Noise Floor -92dB Real, THD 1.84% Real, Peaks 6 Real, Hann Window, Overlap 75% für Spectrogram
- **Link:** ../docs/API.md#analysis

### spectro — SPECTROGRAM — Waterfall • Time-Frequency • Log Scale
- **Title:** SPECTROGRAM — Waterfall • Time-Frequency • Log Scale
- **Text:** Wasserfall 60s, Overlap 75%, Resolution 11.7Hz Real. Scrollt von unten nach oben via putImageData(0,1,W,H-1). Intensität Colormap cyan→magenta→gold. Peaks → intensity exp(-d²/(f<50?8:80))*0.5 + rand*0.08.
- **Detail:** spectrogram(): step=floor(windowSize*(1-overlap)), frames für i+=step slice windowSize, windowedFFT, {t:i/sampleRate,mags,freqs,peaks}. ImageData Handling: getImageData(0,1,W,H-1) verschiebt um 1px.
- **Präzision:** Window Hann Real, Overlap 75%, Resolution 11.7Hz Real, 60s History, Log Scale

### correlation — MULTI-CHANNEL CORRELATION — Coherence • Phase • Real
- **Title:** MULTI-CHANNEL CORRELATION — Coherence • Phase • Real
- **Text:** Phase Wheel R=56, 6 Channels PTP Sync. Zeigt phase = (channel.phase + t*freq*2)%360, rad=phase*π/180, x2=cx+cos(rad)*(R*0.78-i*6), y2=cy+sin(rad)*(R*0.78-i*6). Coherence Bars PTP, Gradient cyan→violet, Shadow Blur 8px.
- **Detail:** coherence(a,b): meanA, meanB, num=sum((a-meanA)*(b-meanB)), denA=sum((a-meanA)²), denB=sum((b-meanB)²), denom=sqrt(denA*denB), return |num/denom| 0-1. Real Coherence 0.94 PTP, Phase Err 0.08° PTP, Jitter 12ns PTP.
- **Präzision:** Coherence 0.94 Real PTP, Phase Err 0.08° Real PTP, Jitter 12ns Real PTP, Timing Err 2.4µs Real comp ON

---

## Sequencer Tooltip

### sequencer — SEQUENCER & EXPERIMENT ENGINE — Production Locking Provenance Hash
- **Title:** SEQUENCER & EXPERIMENT ENGINE — Production Locking Provenance Hash
- **Text:** Timeline 00:00-01:10, Lanes G1 G2 G3 MSR, Blocks cyan/mag/gold/violet, Playhead cyan shadow 12px. Steps: {at,duration,action,type,generatorId}. Loop ON, Ramp LOG, Trigger PTP, Conditional Real. Play: sequencer.play({loop:true}), tick 0.016s, playhead left=56+p*(clientWidth-66).
- **Detail:** Experiment: id EXP-2026-09-16-01, version v1 hash a3f9, duration 01:10 Sweep LOG, Repro 100% hash seeds PTB. Sweep: start 10Hz stop 1000Hz duration 30s mode LOG/linear/exp/chirp. SweepEngine freqAt(t): linear start+(stop-start)*t/duration, log start*exp(log(stop/start)*t/duration). Locking: version++, hash.
- **Handbuch:** Kapitel 4: Sequencer & Experiment Engine — Loop, Ramp, Trigger, Conditional
- **Präzision:** Repro 100% hash seeds PTB, Provenance chain, GUM Uncertainty ±0.5% k=2

---

## Composer Tooltip

### composer — SIGNAL COMPOSER — Visual Math Realtime ESM 9 Modi
- **Title:** SIGNAL COMPOSER — Visual Math Realtime ESM 9 Modi
- **Text:** Graph Nodes G1 G2 G3 MIX MOD drag & drop, SVG Wires dashed 6 6, drop-shadow 6px, Ops ADD MULT AM FM PM BURST SWEEP CHIRP GATE. Equation s(t)=Σ Aₙ·wₙ(fₙ·t+φₙ)+n(t) • Real • GUM 0.92 conf. Phase & Sync ABSOLUTE/RELATIVE PTP, Clock Source Common Clock Ext 10MHz OCXO PTP.
- **Detail:** SignalComposer: 9 modes, addSignal({wave,freq,amp}), equation() baut String, setMode(mode). Nodes: x,y,title,sub,head,w,selected, port in/out. drawWires: getCenter, path M sx sy C mx sy, mx ey, ex ey, sx=c.right, sy=c.y, ex=mc.left, ey=mc.y+(g1?-18:g3?18:0), mx=(sx+ex)/2, d=`M sx sy C mx sy, mx ey, ex ey`, stroke color per id, dasharray 6 6. Drag: mousedown offset, mousemove x=max(0,min(rect.width-offsetWidth)), y=max(0,min(rect.height-offsetHeight)), mouseup drag=null.
- **Präzision:** 9 Modi, Real Equation, GUM 0.92 conf, Provenance OK, Premium
- **Link:** ../docs/ARCHITECTURE.md#signal-composer

---

## Matrix Tooltip

### matrix — MULTI-GENERATOR MATRIX — SYNC PHASE Real Coherence
- **Title:** MULTI-GENERATOR MATRIX — SYNC PHASE Real Coherence
- **Text:** 6x6 Tabelle G1-G6, diag —, off —, sync cyan, phase gold 90°. Click cycle off→sync→phase. Sync = FREQ LOCK PTP Real, Phase = 90° Real GUM, Trigger SHARED PTP. Phase Error 0.08° Real jitter 12ns PTP, Timing Error 2.4µs Real comp ON.
- **Detail:** Matrix Click: states=[off,sync,phase], cur=td class, nxt=states[(index+1)%3], className=nxt, textContent nxt off?—:nxt. Log MATRIX cell ↔ row → NXT PTP Real. Real Coherence via coherence(a,b).
- **Präzision:** SYNC FREQ LOCK PTP Real, PHASE 90° Real GUM, TRIGGER SHARED PTP, Phase Err 0.08° Real jitter 12ns PTP

---

## Health Tooltip

### health — SYSTEM HEALTH & SAFETY — Production Thresholds Alerts
- **Title:** SYSTEM HEALTH & SAFETY — Production Thresholds Alerts
- **Text:** CPU Real Threshold 85% bar cyan emerald, RAM BUFFER Ring 480k Real bar warn gold 68% 0 dropped fill 68% Real, Safety Production Real ARMED Watchdog OK 0 violations slew 1000V/s power 50W Real, Clock 6 Clocks PTP Real 10MHz REF OCXO ±0.02ppm jitter 12ns drift 0.02ppm Q 1e9 Real, Network PTP Real 0.8ms NTP coarse only, Temperature Threshold 65°C 41.2°C Real limit 70°C OK.
- **Detail:** SystemHealth sample(): cpu 42% 3.2GHz Real thresh 85%, ram 68% dropped 0 fill 68% Ring 480k Real, latencyMs, uptime. Safety getStatus(): armed, estop, lastOk, watchdogOk=Date.now-lastOk<5s, violations slice(-20), limits, audit slice(-20). Clock tick() drift simulation.
- **Präzision:** CPU 42% Real thresh 85%, RAM 68% dropped 0 fill 68% Ring 480k Real, Safety ARMED Watchdog OK 0 violations slew 1000V/s power 50W Real, Clock 10MHz REF OCXO ±0.02ppm jitter 12ns drift 0.02ppm Q 1e9 Real
- **Link:** ../docs/API.md#health

---

## Export Tooltips

### export-csv — EXPORT CSV — Escaped Real
- **Title:** EXPORT CSV — Escaped Real
- **Text:** Exportiert Samples als CSV mit Header Escaping. toCSV(header,rows): esc v => String(v) mit " umschließen wenn Komma/" /\n, "" → "". Header t,amplitude,frequency,phase. Rows samples.map((v,i)=>[(i/48000).toFixed(6), v.toFixed(6), freq, 0]).
- **Detail:** Experiment exportCSV(samples): 100% Provenance, Real. Blob text/csv, URL.createObjectURL, a.download biorez-EXP-ID.csv, click. Log EXPORT CSV samples.length.
- **Präzision:** Escaped Real, 4800 Samples Tail, Provenance OK, Premium

### export-wav — EXPORT WAV — Real Header 44B PCM 16bit 48kHz
- **Title:** EXPORT WAV — Real Header 44B PCM 16bit 48kHz
- **Text:** Echter WAV Header 44B PCM 16bit. toWAVHeader(sampleRate,bits,channels,samples): byteRate=sampleRate*channels*bits/8, blockAlign=channels*bits/8, dataSize=samples*channels*bits/8, ArrayBuffer 44, DataView write RIFF 36+dataSize WAVE fmt 16 PCM 1 channels sampleRate byteRate blockAlign bits data dataSize.
- **Detail:** toWAVFile(samples,sampleRate): header + Uint8Array 44+samples.length*2, view setInt16 offset s=max(-1,min(1,samples[i]/10))*0x7FFF littleEndian. Normalisiert auf 10V max. Blob audio/wav, download biorez-EXP-ID.wav.
- **Präzision:** Real Header 44B, 16bit, 48kHz, 10V max normalized, PCM, Little Endian
- **Link:** ../docs/API.md#export

### export-hdf5 — EXPORT HDF5 — Descriptor gzip chunks 48k Real
- **Title:** EXPORT HDF5 — Descriptor gzip chunks 48k Real
- **Text:** HDF5 Descriptor JSON kompatibel mit h5wasm Backend. toHDF5Descriptor(exp,samples): format HDF5 v1.0 path /experiment/ID datasets [{name:samples shape:[samples] dtype:float32 compression:gzip chunks:[48000]}, {name:generators shape:[len] dtype:json}, {name:provenance dtype:json}] attributes {software, created, sampleRate 48000, calibration} note Real HDF5 requires h5wasm.
- **Detail:** Blob application/json, download biorez-EXP-ID.h5.json. Real Descriptor, gzip, chunks 48k, Premium.
- **Präzision:** gzip compression, chunks 48k, float32, json provenance, compatible h5wasm

### export-pdf — PDF REPORT — Production Real Print Dialog
- **Title:** PDF REPORT — Production Real Print Dialog
- **Text:** Production Report HTML + Print Dialog. buildReportHTML({exp,bus,stats,provenance,clock,safety}): HTML mit Header BIOREZ S2, Experiment ID, Version, Hash, Generators Tabelle, Stats RMS P-P Crest SNR Mean THD, Provenance Chain, Clock Status, Safety Status, Calibration State, Uncertainty GUM. Blob text/html, window.open + print().
- **Detail:** Provenance Record: result, analysis {id,config,timestamp}, measurement {sensor,rate,uncertainty ±0.5%}, signal, generator, experiment, configuration, uncertainty {type:estimated confidence 0.92 noiseFloor -92dB method:GUM}, chain, timestamp, software v2.1, version.
- **Präzision:** Production, Real, Premium, Print Dialog, GUM ±0.5% k=2, PTB 10MHz
- **Link:** ../docs/API.md#pdf

---

## Verwendung

```html
<!-- Im HTML -->
<button data-tooltip="power-toggle">Power</button>
<div id="genCount" data-tooltip="gen-count">6 GENERATORS</div>
<canvas id="oscillo" data-tooltip="oscillo"></canvas>

<!-- Im JS -->
import { initTooltips, initOnboarding } from './js/tooltips.js';
initTooltips(); // Bindet alle data-tooltip
initOnboarding(); // Tour ?tour=1 oder first visit
```

**Tooltip Element:** #globalTooltip fixed z9999 max-width 380px gradient background border cyan 0.22 radius 12px padding 12 14 shadow 20 60 0.6 + 0 24 cyan 0.18 font JetBrains Mono 11px line-height 1.5 color cfe6ff display none pointer-events none backdrop-filter blur 12px.

**Position:** left = x+16, top = y-rect.height-12, wenn left+width > innerWidth-10 left=innerWidth-width-10, wenn top<10 top=y+16.

**Onboarding:** 7 Schritte, Overlay border cyan 2px shadow 30px + 9999px dark, Card 380px, Weiter/Überspringen, localStorage biorez-onboarding-done, ?tour=1 triggert.

---

**Ende Tooltips — 25+ Tooltips — Handbuch docs/HANDBUCH.md — 10/10 Production**
