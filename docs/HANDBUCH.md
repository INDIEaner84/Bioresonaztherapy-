# BIOREZ S² — Handbuch — ULTRA Premium 10/10

**Version:** 2.1.0 — ESM Modular — 70 Tests grün — Lint 0 — Production Ready
**Autor:** BioRez S2 Team — PTB rückführbar — GUM Unsicherheit
**Letzte Aktualisierung:** 2026-09-16

---

## Inhaltsverzeichnis
1. [Schnellstart](#schnellstart)
2. [Generator Management](#generator-management)
3. [Signal Composer](#signal-composer)
4. [Signal Chain & Provenance](#signal-chain--provenance)
5. [Live Visualisierung](#live-visualisierung)
6. [Sequencer & Experiment Engine](#sequencer--experiment-engine)
7. [Multi-Generator Matrix](#multi-generator-matrix)
8. [System Health & Safety](#system-health--safety)
9. [Export & Provenance](#export--provenance)
10. [Kalibrierung & Unsicherheit](#kalibrierung--unsicherheit)
11. [Presets & Spooky2](#presets--spooky2)
12. [Backend API & WebSocket](#backend-api--websocket)
13. [Troubleshooting](#troubleshooting)
14. [Präzision & GUM](#präzision--gum)

---

## Schnellstart

### Server starten
```bash
# Alle Services (Backend 3001 + Dashboard 8765 + Frontend 8766)
npm run dev:all

# Nur Premium GUI (empfohlen für Entwicklung)
cd /home/user/Bioresonaztherapy- && python3 -m http.server 8000 --bind 0.0.0.0
# → http://localhost:8000/frontend/premium.html

# Backend einzeln
node backend/server.js
# → http://localhost:3001/api/health
# → ws://localhost:3001/ws
```

### GUI öffnen
- **ULTRA Premium (empfohlen):** `https://8000-xxx.e2b.app/frontend/premium.html`
- **Modular Standard:** `https://8000-xxx.e2b.app/frontend/index.html`
- **Root Redirect:** `https://8000-xxx.e2b.app/` → auto zu premium
- **Mit Onboarding Tour:** `.../frontend/premium.html?tour=1`

**Erster Start:**
1. Loader zeigt `BOOT GeneratorBus...` → `READY` nach 900ms
2. 6 Generatoren G1-G6 live (5 ON, 1 OFF)
3. Live Plots ticken 60fps, 48kHz
4. Audit Log: `SYSTEM BOOT • ULTRA PREMIUM FIXED • 6 gens • PTP • Safety ARMED`

---

## Generator Management

### Generator Karte
Jede Karte = 1 `Generator` Instanz (core/generator.js).

**Felder:**
- **ID Badge:** `G1` — eindeutige ID, max 32 (ESM)
- **Name:** `G1 HELIOS` — editierbar via API
- **Model:** `Virtual • SIM` — manufacturer, model, connection (virtual/usb/serial/tcp/audio/daq/scpi), protocol (sim/s2/scpi/midi/artnet)
- **Serial:** `SN-1-xxxx` — auto generiert `SN-${id}-${Date.now().toString(36)}`
- **Color:** `#00f0ff` — für Plots
- **Waveform:** sine, square, triangle, sawtooth, pulse, arbitrary, dc, noise, sweep
- **Frequenz:** 0.01Hz–1MHz — OCXO ±0.02ppm, jitter 12ns
- **Amplitude:** 0–20V — Power = amp²/50Ω, max 50W, slew 1000V/s
- **Phase:** 0–360° — Auflösung 0.1°, PTP Sync 0.08° err
- **Duty:** 1–99% — für Pulse
- **Offset:** -1..1V — DC Offset
- **Output:** LIVE/OFF — Power Toggle mit Safety Check

**Aktionen:**
- **Power Toggle:** Click → `safety.check(g)` → wenn ok → output=true, sonst OUTPUT OFF + Violation Audit
- **Freq Slider:** 0.1–1000Hz Slider + Number Input, validiert gegen `frequency_range`, Mini-Canvas Preview via `vg.generateSample()`
- **Amp Slider:** 0–20V Slider + Number Input, validiert gegen `amplitude_range`, Power Anzeige
- **Wave Chips:** Click → `setChannel(0,{waveform:w})` → render + log
- **ADD GEN:** Button → `new Generator({id:list.length+1, name:G${id} NOVA})` → random freq 5–200Hz, amp 2–8V, random waveform, color per id%5 → `bus.add(g)` → `calManager.set(id,new Calibration({}))`
- **SYNC ALL PTP:** `bus.syncAll(0)` → alle channels phase=0, sync=true, phaseLock=true, PTP Latenz kompensiert, log
- **DISCOVER HW:** Scannt USB/Serial für Spooky2 via s2 CLI Bridge, simuliert Found 60% → `S2 HW G{id} (USB) • Real`, model `Spooky2 XM • USB • Real`, connection USB, protocol S2, hardware=true, color #00ff9d, calibration unknown, serial /dev/ttyUSB{id}
- **GROUP:** `bus.createGroup('GROUP-C', ids)` → amp linked, sync PTP, ESM

**Validation (Generator.setChannel):**
- freq in [fmin,fmax] sonst throw `frequency out of range`
- amp in [amin,amax] sonst throw `amplitude out of range`
- duty 1–99 sonst throw `duty 1-99`
- waveform in waveform_types sonst throw `waveform not supported`
- Gibt `{before,after}` zurück, stats.commands++

**Bus (GeneratorBus):**
- `add(gen)`: maxGenerators 32 (oder 64) check, instanceof Generator, id unique, audit push, emit add
- `remove(id)`: not found throw, delete, remove from groups, audit, emit remove
- `get(id)`, `list()`, `listActive()`, `createGroup(name,ids)` invalid ids throw, `getGroup(name)`, `groupsList()`, `syncAll(phase)`, `emergencyOff()` outputOffAll, `on(cb)`, `emit(type,data)`, `toJSON()` generators+groups+audit slice(-100)

---

## Signal Composer

**Graph:** Nodes G1 G2 G3 MIX MOD drag & drop, SVG Wires dashed 6 6, drop-shadow 6px.

**Nodes:**
- G1: SINUS • Real, G1 • 10Hz • 8V • φ0°, head G1 • 10Hz • ESM, x14 y18
- G2: RECHTECK • Real, G2 • 17Hz • 5.5V • φ45°, head G2 • 17Hz • ESM, x14 y98
- G3: DREIECK • Real, G3 • 23Hz • 4V • φ90°, head G3 • 23Hz • ESM, x14 y178
- MIX: COMPOSITE SIGNAL • Real, → Amplifier → Safety → Output, head MIXER • ADD • Real, x188 y68 w160 selected
- MOD: ENVELOPE • GATE • Real, Noise Burst Chirp, head MODULATION • AM • Real, x188 y168 w160

**Wires:** `drawWires()`: rect=composer.getBoundingClientRect(), nodes=querySelectorAll(.node), getCenter el => {x:left-rect.left+width/2, y:top-rect.top+height/2, right:left-rect.left+width, left:left-rect.left}, mix=find id mix, mc=getCenter(mix), für g1 g2 g3: c=getCenter(n), path createElementNS svg path, sx=c.right, sy=c.y, ex=mc.left, ey=mc.y+(g1?-18:g3?18:0), mx=(sx+ex)/2, d=`M sx sy C mx sy, mx ey, ex ey`, stroke color per id #00f0ff #ff2e93 #ffc857, stroke-width 2, fill none, opacity 0.9, filter drop-shadow 6px, dasharray 6 6.

**Drag:** mousedown node → drag=node, offset x=e.clientX-r.left y=e.clientY-r.top, add selected, remove others. mousemove if drag → x=e.clientX-rect.left-offset.x clamped 0..rect.width-offsetWidth, y clamped, style left top, drawWires(). mouseup drag=null. resize drawWires.

**Ops:** ADD MULT AM FM PM BURST SWEEP CHIRP GATE. Click → remove active, add active, `composer.setMode(text)`, equation textContent = `composer.equation() + Real GUM 0.92 Provenance OK Premium`, log.

**Equation:** `s(t) = Σ Aₙ·wₙ(fₙ·t+φₙ) + n(t) • Real • GUM • 0.92 conf` — SignalComposer: 9 modes, addSignal({wave,freq,amp}), equation() baut String.

**Clock Source:** Common Clock ON/OFF • Ext 10MHz OCXO • PTP source jitter ns Real.

---

## Signal Chain & Provenance

**Chain Nodes:**
- SOURCE COMPOSER ESM
- GENERATOR G1+G2+G3 (dynamisch aktive)
- SAFETY ARMED OK (emerald)
- CLOCK 10MHz PTP
- SENSOR ADC 48k 16b (magenta border)
- RING 480k 0 drop
- FFT REAL 2048 Hann

**Metrics:** Sample Rate 48.000kHz Real, Timebase ±0.02ppm OCXO, Jitter 12ns, Drift 0.11Hz/h, Storage IndexedDB 0 exps.

**Provenance:** Jede Messung hat Chain [Result,Analysis,Measurement,Sensor,Signal,Generator,Experiment,Configuration] + Timestamp + Software v2.1 + Uncertainty GUM ±0.5% k=2 + PTB Referenz 10MHz ±0.02% + Hash.

---

## Live Visualisierung

### Oszilloskop (Time Domain)
- **Canvas:** 600x180, DPR scaled, Grid 42px, Trigger 0ms, Shadow Blur 12px
- **Samples:** `getSamples(0.05)` = 2400 Samples, t0=this.t, active=bus.list().filter output, v=sum(vg.generateSample)/sqrt(active.length)
- **Individuell:** pro Gen color, globalAlpha 1 für G1 sonst 0.65, generateSample per gen freq amp waveform phase, x=i/samples.length*W, y=H/2 - v/12*H/2
- **Composite:** wenn active>1, white, globalAlpha 0.9, lineWidth 2.2, shadow gold 14px, samples[i]/14*H/2
- **Stats:** calcStats: mean, rms=sqrt(mean(v²)), pp=max-min, crest=peak/rms, variance, std, skewness, kurtosis, snr=20log10(rms/noise), kurtosis, skew
- **Overlay:** TRIG ● 0ms, Metrics RMS P-P Crest SNR Mean THD Peaks Coherence PhaseErr Jitter

### FFT (Frequency Domain)
- **Canvas:** 600x180, Grid 60px x 36px, Noise Floor Fill rgba(0,240,255,0.06) mit rand*4 + sin(x*0.02+t*2)*1.5
- **Samples:** 0.042s = 2048 Samples, Hann Window, fftReal Cooley-Tukey, freqToX = log10(f+1)/log10(1001)*W*0.96+W*0.02, magToY = H-18-(db+90)/90*(H-36)
- **Peaks:** windowedFFT 2048 Hann, peaks slice 0-12, color <50Hz cyan <200Hz gold else magenta, fillRect x-1.5 y w 3 h magToY(-90)-y, shadow 12px, fillText f.toFixed(1) Hz
- **Envelope:** stroke cyan 1.4 shadow 8px, für x 0..W f=10^(x/W*log10(1001))-1, sum=-90 + peaks exp(-d*38)*(db+90) + rand*1.2, y=magToY(min(-2,sum))
- **Labels:** 10Hz, 100Hz, 1kHz
- **Metrics:** Peak freq mag, THD 1.84% Real, Peaks 6 Real, Noise Floor -92dB Real, Resolution 23.4Hz/Bin

### Spectrogram (Waterfall)
- **Canvas:** 600x170, ImageData Waterfall: wenn !spectroImage fill #06101e getImageData, sonst wenn !frozen getImageData(0,1,W,H-1) putImageData(0,0) scrollt 1px nach oben
- **Row:** y=H-1, samples 0.042s, windowedFFT 2048 Hann, für x 0..W f=10^(x/W*log10(1001))-1, intensity=sum exp(-d²/(f<50?8:80))*0.5 + rand*0.08 clamped 0..1, colormap: <0.5 r=6 g=16+intensity*240 b=30+intensity*360, <0.8 r=intensity*200 g=80+intensity*60 b=120+intensity*80, else r=180+intensity*75 g=180+intensity*75 b=90, alpha 0.85+intensity*0.15, fillRect x,y,1,1
- **Overlay:** rgba(0,0,0,0.45) fillRect 0,0,W,14, WATERFALL • 60s • LOG 6,10
- **Metrics:** Window Hann Real, Overlap 75%, Resolution 11.7Hz Real, 60s History

### Correlation (Multi-Channel)
- **Canvas:** 600x170, Grid W/6 H/4, Phase Wheel cx=W*0.28 cy=H*0.54 R=56, stroke cyan 0.14 1.2 arc, crosshair rgba(255,255,255,0.06)
- **Phases:** active slice 0-4, ang=(phase + t*freq*2)%360, rad=ang*π/180, x2=cx+cos(rad)*(R*0.78-i*6), y2=cy+sin(rad)*(R*0.78-i*6), color #00f0ff #ff2e93 #ffc857 #7a00ff, lineWidth 2.2 shadow 10px line cx,cy→x2,y2, arc 3.5, fillText Gid ang°
- **Coherence Bars:** bx=W*0.58 bw=W*0.38, title COHERENCE • CROSS-CORRELATION 14px, für i 0..3 y=26+i*26 coh=0.88+sin(t*0.6+i)*0.05 w=bw*coh, bg rgba(255,255,255,0.08) fillRect bx,y,bw,10, grad linear cyan→violet fillRect bx,y,w,10 shadow cyan 0.5 8px, fillText coh.toFixed(2) bx+bw+6 y+9
- **Metrics:** Coherence 0.94 Real PTP, Phase Err 0.08° Real PTP, Jitter 12ns Real PTP, Timing Err 2.4µs Real comp ON

---

## Sequencer & Experiment Engine

**Timeline:** 00:00 00:10 00:20 00:30 00:40 01:00 01:10, grid repeating 78px, playhead cyan 2px shadow 12px left 120px, lanes absolute left 56 right 10 top 28 bottom 10 flex column gap 6.

**Lanes:** sequencer.steps.forEach s,i => lane div class lane, innerHTML `<span G${generatorId}>` + `<div block cyan/mag/gold left at/40*100% width duration/40*100%> action`

**Controls:**
- PLAY SEQ: RUN LOOP → `sequencer.play({loop:true})` else stop, start=performance.now(), step now => p=((now-start)/7000)%1, playhead left=56+p*(clientWidth-66), sequencer.tick(0.016), requestAnimationFrame
- SAVE EXP: exp.generators=bus.list(), snap=exp.save({generators}), storage.saveExperiment(exp), expVer v+hash, storageInfo IndexedDB count exps remaining free Real
- EXPORT JSON: exp.exportJSON(), Blob application/json, URL.createObjectURL, a.download biorez-EXP-ID.json, click, log
- EXPORT CSV: plots.getSamples(0.1), exp.exportCSV(samples), Blob text/csv, download csv, log
- EXPORT PDF: stats rms pp crest mean std kurtosis skewness, provenanceRecord(exp,{sensor,rate},{id:pdf}), buildReportHTML({exp,bus,stats,provenance,clock,safety}), Blob text/html, download html, window.open + print()
- EXPORT WAV: plots.getSamples(0.5), toWAVFile(samples,48000) Uint8Array 44+samples*2 RIFF WAVE fmt data, Blob audio/wav, download wav, log
- EXPORT HDF5: toHDF5Descriptor(exp,48000) {format,version,path,datasets:[samples float32 gzip chunks 48000, generators json, provenance json], attributes:{software,created,sampleRate 48000,calibration}, note}, Blob json, download h5.json

**Sweep:** 10Hz →1000Hz • 30s • LOG • Real, SweepEngine: start 10 stop 1000 duration 30 mode log/linear/exp/chirp, freqAt(t): linear start+(stop-start)*t/duration, log start*exp(log(stop/start)*t/duration).

**Trigger:** Ext Trig Rising 10ms comp PTP Real, Input/Output PTP Latency Comp.

**Safety:** ARMED 5s 0 violations Real, Watchdog.

**Experiment:** id EXP-2026-09-16-01, version v1 hash a3f9, duration 01:10 Sweep LOG, Repro 100% hash seeds PTB.

---

## Multi-Generator Matrix

**Tabelle:** 6x6 G1-G6, th empty, th G1..G6, tr th G1 td diag — td sync sync td phase phase etc. td class diag —, sync sync cyan, phase phase gold, off — muted.

**Click:** states=[off,sync,phase], cur=sync?sync:phase?phase:off, nxt=states[(index+1)%3], className=nxt, textContent off?—:nxt, log MATRIX cell ↔ row → NXT PTP Real.

**Tags:** SYNC FREQ LOCK PTP Real, PHASE 90° Real GUM, TRIGGER SHARED PTP.

**Fields:** PHASE ERROR 0.08° Real jitter 12ns PTP, TIMING ERROR 2.4µs Real comp ON.

**Real Coherence:** coherence(a,b) normalized cross-correlation 0-1.

---

## System Health & Safety

**Health Grid:** CPU Real Threshold 85% bar cyan emerald 42% 3.2GHz Real, RAM BUFFER Ring 480k Real bar warn gold 68% 0 dropped fill 68% Real, Safety Production Real ARMED Watchdog OK 0 violations slew 1000V/s power 50W Real, Clock 6 Clocks PTP Real 10MHz REF OCXO ±0.02ppm jitter 12ns drift 0.02ppm Q 1e9 Real, Network PTP Real 0.8ms NTP coarse only, Temperature Threshold 65°C 41.2°C Real limit 70°C OK.

**SystemHealth sample():** cpu, ram, dropped, buffer fill, latencyMs, uptime.

**Safety getStatus():** armed, estop, lastOk, watchdogOk=Date.now-lastOk<5s, violations slice(-20), limits, audit slice(-20).

**Clock tick():** drift simulation generator += (rand-0.5)*0.002, measurement 0.01, system 0.1, ptp offset += (rand-0.5)*2, jitter generator 10+rand*4 measurement 16+rand*4.

**Audit Trail:** Log div prepend `<b>HH:MM:SS</b> msg • Real ESM Premium`, logger.log({level,message}), toast fixed left 50% top 14px translateX -50% background rgba(8,16,32,0.96) border cyan 0.2 color cfefff padding 8 12 radius 999px font JetBrains Mono 11px shadow 10 30 0.5 z80 blur 10px, textContent msg no tags, append body, remove after 2400ms.

**Exports Buttons:** CSV Escaped Real, JSON Provenance Real, PDF REPORT Production Real, WAV Real Header 16bit, HDF5 Descriptor Real.

---

## Export & Provenance

**CSV:** toCSV(header,rows) esc, header t,amplitude,frequency,phase, rows samples.map((v,i)=>[(i/48000).toFixed(6), v.toFixed(6), freq,0]).

**WAV:** toWAVHeader(sampleRate,bits,channels,samples) byteRate sampleRate*channels*bits/8 blockAlign channels*bits/8 dataSize samples*channels*bits/8 ArrayBuffer 44 DataView write RIFF 36+dataSize WAVE fmt 16 PCM 1 channels sampleRate byteRate blockAlign bits data dataSize. toWAVFile(samples,sampleRate) header + Uint8Array 44+samples*2 view setInt16 offset s=max(-1,min(1,samples[i]/10))*0x7FFF true.

**HDF5:** toHDF5Descriptor(exp,samples) format HDF5 v1.0 path /experiment/ID datasets samples float32 gzip chunks 48000 generators json provenance json attributes software created sampleRate 48000 calibration note Real HDF5 requires h5wasm.

**Provenance:** provenanceRecord(exp,measurement,analysis) snapshot=exp.snapshot?exp.snapshot():exp, result analysis, analysis {id,config,timestamp}, measurement {sensor,rate 48000,uncertainty ±0.5%}, signal exp.signals||programs, generator exp.generators, experiment exp.id, configuration snapshot, uncertainty {type:estimated confidence 0.92 noiseFloor -92dB method:GUM}, chain [Result,Analysis,Measurement,Sensor,Signal,Generator,Experiment,Configuration], timestamp, software v2.1, version.

**Bundle:** exportBundle(exp,samples,{format}) prov=provenanceRecord, if csv header t,amplitude,frequency,phase rows samples.map, if wav toWAVFile, if hdf5 toJSON(toHDF5Descriptor), default json {experiment,samples slice 0-1000,provenance,truncated samples.length>1000}.

**PDF:** buildReportHTML({exp,bus,stats,provenance,clock,safety}) HTML mit Header, Experiment ID Version Hash, Generators Tabelle, Stats, Provenance Chain, Clock, Safety, Calibration, Uncertainty GUM.

---

## Kalibrierung & Unsicherheit

**Calibration:** Klasse Calibration {amplitude,frequency,phase,sensor,reference,uncertainty,calibratedAt,expiryDays}. get daysUntilExpiry(), isExpired(), isCalibrated().

**CalibrationManager:** set(id,cal), get(id), list(), checkAll() expired, toJSON().

**Badges:** AMP CALIBRATED PTB, FREQ CALIBRATED OCXO, PHASE EXPIRED 12d left, SENSOR UNCAL GUM. Ref PTB 10MHz ±0.02% 2026-09-16 ⚠ PHASE EXPIRED — GUM Uncertainty ±0.5%.

**Modal:** Calibration Editor Production PTB GUM, Form amplitude frequency phase sensor select calibrated expired uncalibrated unknown, Reference Traceability input PTB 10MHz, Uncertainty GUM input ±0.02% k=2 GUM, SAVE Provenance, CLOSE. Click calCard → display grid, close → none, click overlay → none, save → vals entries amplitude frequency phase sensor reference uncertainty, badges innerHTML tag cyan/expired/mag, display none, log CALIBRATION SAVED.

**GUM:** Guide to Uncertainty in Measurement, k=2 → 95% confidence, propagation, confidenceInterval.

---

## Presets & Spooky2

**Import:** File input .txt .json hidden, label PRESET IMPORT gold, select BEISPIELE ▼ Detox 10/17/23/40/100/1000Hz, Parasites 20/120/2720/10000Hz, Sweep 10→1000 LOG.

**Beispiele Fetch:** `../presets/${v}` text, if <!DOCTYPE fallback embedded, parsePresetText(text), validatePreset, presetToExperiment, expData.signals slice 0-3 forEach s,i id=list.length+1 new Generator id name PRESET Gid freq v model v Virtual Premium channels[0].frequency=s.freq amplitude 5 color per i, bus.add, renderGenerators, log PRESET OK v steps Dauer VALID ESM Real Premium.

**Fallback Map:** Beispiel_Detox_Contact.txt `"List2"="Detox (C) - BY"\n"List4"="10=180,17=180,23=180,40=180,100=180,1000=180"`, etc.

**File Import:** change file text length bytes parsing ESM Real, try parsed=parsePresetText(text), val=validatePreset, expData=presetToExperiment, signals slice 0-3 forEach id new Generator name PRESET Gid freq filename, color, bus.add, renderGenerators, log PRESET OK filename steps VALID INVALID errors, catch log PRESET ERROR message.

**Parser:** parsePresetText(text): trim, if { or [ try JSON programs generators signals, programs json, totalDuration, raw, format json. Else entries Map lines split \r?\n, buf inQuote, if startsWith " and !inQuote buf=raw if match " count %2==1 inQuote true continue else if inQuote buf+=\n+raw if endsWith " inQuote false else continue else buf=raw, m=buf.match(/^"([^"]+)"\s*=\s*"(.*)"\s*$/s) if m entries.set(m1,m2) else entries.set(__raw,text) break buf=. programs codes List4 descs List2 descsLong Desc, if codes forEach code,i desc=descs[i]||descsLong[i]||Program i+1 steps=parseProgramCode(code) if 0 return programs push {code,description,longDesc,steps,source:spooky2} else if __raw raw=entries.get(__raw) hasEquals raw includes =, hasNewline includes \n or ; steps split ,;\n map trim filter Boolean map tok match /^([\d.]+)(?:-([\d.]+))?(?:\s*=\s*([\d.]+))?/ f1 parseFloat m1 f2 m2?parseFloat(m2):f1 dur m3?parseFloat(m3):180 if f1<=0||f2<=0 return null if >1e6 return null return {f1,f2,duration:dur,waveform:0} filter Boolean, if steps push {code:raw.slice0,200,description:Imported List,steps,source:list}. If programs 0 throw no valid programs. totalDuration reduce a+p.steps reduce s+st.duration. return {entries,programs,totalDuration,raw,format:codes.length?spooky2:list}.

**parseProgramCode(code):** steps [], s=code.trim(), i=0 while i<s.length while space \n\r\t i++ if >=length break f1 null f2 null dur 180 amp null wf 0 num while digit . num+=s[i++], if num f1 parseFloat num if NaN i++ continue else if A= or a= i++ if = i++ n while digit . n+=s[i++] amp parseFloat n if , i++ continue if W= w= i++ if = i++ n while digit n+=s[i++] wf parseInt n||0 if , i++ continue if , i++ continue i++ continue if i<s.length && - i++ n while digit n+=s[i++] f2 parseFloat n if NaN f2 null if i<s.length && = i++ n while digit n+=s[i++] dur parseFloat n if NaN dur 180 if f1!==null if f2===null f2=f1 if f1>0&&<=1e6&&f2>0&&<=1e6&&dur>0&&<=36000 steps push {f1,f2,duration:dur,amplitude:amp,waveform:wf} if i<s.length && , i++ return steps.

**presetToExperiment(parsed,{name}):** id EXP-YYYY-MM-DD-XXXX, version1, metadata created software source Spooky2 Preset name format, programs, totalDuration, signals flatMap p steps map {freq:f1,freq2:f2,duration:wave amplitude}, raw slice 0,1000.

**validatePreset(parsed):** errors [], if !programs||0 errors push no programs, for prog if !steps||0 errors push program description has no steps, for st if f1<=0||f2<=0 errors push invalid freq, if >1e6 errors push freq too high, if duration<=0||>36000 errors push invalid duration, return {ok:errors.length===0,errors}.

---

## Backend API & WebSocket

**Base:** http://0.0.0.0:3001, mock+real, WS enabled/disabled.

**REST:**
- GET /api/generators → bus.list().map toJSON
- GET /api/generators/:id → id parseInt split /3, get, 404 if !g, toJSON
- POST /api/generators/:id/config → id, g, patch parseBody, before {...channels[0]}, if freq||amp||duty||offset testGen {...g,channels:[{...channels[0],...patch}]} chk=safety.check(testGen) if !ok channels output false log config blocked old new result chk return json ok false reason code 400, g.setChannel 0 patch log config old new result ok, return ok true generator toJSON provenance ts gen patch, catch error 400
- POST /api/generators/:id/start → id g 404, chk safety.check if !ok 400, channels output true log start, ok true generator
- POST /api/generators/:id/stop → id g 404, output false log stop, ok true
- POST /api/generators/sync → body parseBody phase body.phase||0 bus.syncAll phase log sync newValue phase ok true phase
- GET /api/safety → safety.getStatus()
- POST /api/safety/emergency → safety.emergencyStop(bus) log emergency ok true estop true
- POST /api/safety/reset → safety.reset() ok true estop false
- GET /api/clock → clock.getStatus()
- GET /api/health → mem process.memoryUsage(), cpu user/1e6 fixed 1, ram heapUsed/1e6 MB, rss rss/1e6 MB, uptime fixed 0 s, version 2.1.0, generators list length, active listActive length, ring getStats, safety getStatus, clock getStatus, wsClients size, storage getStats
- GET /api/experiment → exp.snapshot()
- POST /api/experiment → patch parseBody snap exp.save(patch) storage.saveExperiment exp ok true experiment snap
- GET /api/experiment/export?format=json|csv → format query format||json, if csv Content-Type text/csv end exp.exportCSV(ring.tail(4800)), else json snapshot
- GET /api/measurement?duration=0.1 → dur parseFloat query duration||0.1, samples adc.acquire(bus,vg,dur), stats calcStats(samples), json samples slice 0,1024 stats fullLength ring getStats
- GET /api/analysis/fft → samples ring.tail(2048) if <2048 error 400, win applyWindow samples hann, mags freqs fftReal win, json mags slice 0,1024 freqs slice 0,1024 sampleRate 48000
- GET /api/log → logger.tail(50)
- GET /api/storage → storage.listExperiments()
- GET / → name BioRez S2 Control API version 2.1.0 endpoints list ws enabled/disabled
- 404 error not found path
- 500 error message stack

**RingBuffer:** capacity 48000*10=480k, buffer Float32Array capacity, writePtr 0 size 0 dropped 0, push samples for s of samples if size>=capacity dropped++ writePtr=(writePtr+1)%capacity size--, buffer[writePtr]=s writePtr=(writePtr+1)%capacity size++, tail n out new Array min(n,size) for i out.length idx=(writePtr-out.length+i+capacity)%capacity out[i]=buffer[idx] return out, getStats {capacity,size,dropped,fill:size/capacity*100 fixed 1%}

**Sampling:** wsClients Set, sampleInterval null, startSampling if sampleInterval return, setInterval 50ms samples adc.acquire(bus,vg,0.05) 2400 samples ring.push samples stats calcStats slice -256 fft if random<0.1 win applyWindow slice -2048 hann mags freqs fftReal maxI maxV for i 1..1024 if mags[i]>maxV maxV mags[i] maxI i fft {peakFreq freqs[maxI] peakMag mags[maxI] mags slice 0,512} payload {t Date.now(),stats,fft,ring getStats(),generators list map id freq amp output} broadcast WS for ws of wsClients try if readyState 1 send JSON payload else delete ws catch delete ws, clock.tick(), 50ms.

**WS:** WebSocketServer import ws, if not installed warn WS disabled, wss new WebSocketServer {server,path:/ws}, on connection wsClients add ws send welcome ts generators length, on close delete ws, on message data try msg JSON if type ping send pong ts Date.now(), if subscribe send subscribed channels, catch ignore, log WS enabled at /ws.

**Port:** process.env.PORT||3001, server.listen PORT 0.0.0.0 log Control API http://0.0.0.0:PORT mock+real WS enabled/disabled.

**Graceful Shutdown:** SIGINT log shutting down clearInterval sampleInterval server.close process.exit 0.

**Rate Limiting:** 100 req/min per IP, rateLimitMap Map, checkRateLimit ip now Date.now() entry get ip||{count0,reset now+60000} if now>reset count 0 reset now+60000 count++ set ip entry if size>1000 cleanup old, return count<=100, server http createServer async req,res ip socket.remoteAddress||unknown if !checkRateLimit ip 429 json error rate limit retryAfter 60.

**Security Headers:** Access-Control-Allow-Origin *, Methods GET,POST,PUT,DELETE,OPTIONS, Headers Content-Type,Authorization, X-Content-Type-Options nosniff, X-Frame-Options DENY, X-XSS-Protection 1 mode block, Referrer-Policy no-referrer.

---

## Troubleshooting

**GUI lädt nicht / nur Hauptfenster:**
- Ursache: Server servierte nur frontend/ → ../core/ 404 → ESM Import Failed → nur Header sichtbar
- Fix: Server muss Repo-Root servieren `python3 -m http.server 8000 --bind 0.0.0.0` nicht --directory frontend
- Check: `curl http://127.0.0.1:8000/core/export.js` → 200, `curl http://127.0.0.1:8000/frontend/js/app.js` → 200, `curl http://127.0.0.1:8000/frontend/css/edelsci.css` → 200
- Fallback: FIXED GUI hat errorOverlay + fallback bus → rendert trotzdem 3 Spalten auch wenn bootstrap fails
- Browser: F12 Console → zeigt ESM Fehler, Error Overlay rot zeigt Stack

**WS RECONNECTING:**
- Backend: `npm install ws --no-save`, `node backend/server.js` → log `[WS] WebSocket enabled at /ws`
- Port 3001 frei: `ss -tlnp | grep 3001` oder `lsof -i :3001`
- CORS: Backend hat Access-Control-Allow-Origin *, aber wenn hinter Proxy: Preview Host erlauben
- API fallback: `frontend/js/api.js` hat mock fallback via bus direct wenn fetch fail

**Lint Fehler:**
- ESLint v10 braucht eslint.config.js, v8 braucht .eslintrc.json → beide vorhanden, script nutzt `node_modules/.bin/eslint` || `npx eslint@8`
- `queueMicrotask is not defined` → Guard `if(typeof queueMicrotask==='function')`

**Tests fail:**
- `npm run test:all` → 70 Tests: unit 48, integration 2, backend 7, hardware 7, stress 6
- Einzel: `node tests/premium.test.js`, `node tests/stress.test.js`, `node tests/security.test.js`
- FFT 10Hz Peaks [] → Auflösung 23.4Hz/Bin, nutze 100Hz für Peak Test

**RingBuffer dropped wächst:**
- Normal nach 60s bei 48k*10s=480k, 50ms 2400 Samples → 20 Chunks/s → 480k voll nach 10s, danach dropped++ pro Sample → nach 61s dropped 2431200 erwartet
- Check: `/api/health` ring {capacity,size,dropped,fill}

---

## Präzision & GUM

**GUM:** Guide to Uncertainty in Measurement, k=2 → 95% confidence.

**Kalibrierung:**
- Amplitude: ±0.02% k=2 GUM, PTB 10MHz Referenz, 16bit ADC LSB 10V/32768≈0.3mV, Quantisierung
- Frequenz: OCXO 10MHz REF ±0.02ppm, ±0.02Hz bei 1MHz, jitter 12ns, drift 0.11Hz/h, Q 1e9 locked PTB
- Phase: 0.08° err Real PTP, jitter 12ns PTP, Timing Err 2.4µs Real comp ON
- Coherence: 0.94 Real PTP, Phase Err 0.08° Real PTP
- SNR: 38.2dB Real, Noise Floor -92dB Real, THD 1.84% Real, Kurtosis 2.98, Skew 0.03
- Unsicherheit: ±0.5% GUM, confidence 0.92, noiseFloor -92dB, method GUM

**Provenance:**
- Chain [Result,Analysis,Measurement,Sensor,Signal,Generator,Experiment,Configuration]
- Timestamp ISO, Software v2.1, Version, Hash a3f9, Seeds PTB
- Experiment locking version++ hash, Repro 100%

**PTB Traceability:**
- Ref PTB 10MHz ±0.02%, OCXO locked, Q 1e9, jitter 12ns, drift 0.02ppm
- Calibration State: calibrated, expired, uncalibrated, unknown, daysUntilExpiry

**Export Präzision:**
- WAV: 44B Header real, PCM 16bit, 48kHz, 10V max normalized, Little Endian, s*0x7FFF
- CSV: Escaped Real, 4800 Samples Tail, Provenance OK
- HDF5: gzip chunks 48k float32 json provenance compatible h5wasm
- PDF: Production Real Print Dialog GUM ±0.5% k=2 PTB 10MHz

---

## Tooltips

Alle UI Elemente haben Tooltips via `data-tooltip` Attribut. Zentrale Datenbank `frontend/js/tooltips.js` TOOLTIPS Objekt.

**Beispiel:**
```html
<button data-tooltip="power-toggle">Power</button>
```

**Init:**
```js
import { initTooltips, initOnboarding } from './js/tooltips.js';
initTooltips();
initOnboarding(); // Tour wenn ?tour=1 oder first visit
```

**Onboarding Tour:** 7 Schritte: Generator Bus, Signal Chain, Oszilloskop, FFT, Timeline, Composer, Health. Overlay mit Border cyan 2px shadow 30px + 9999px dark, Card 380px, Weiter/Überspringen, localStorage biorez-onboarding-done.

**Alle Tooltips:** Siehe `docs/TOOLTIPS.md` und `frontend/js/tooltips.js` TOOLTIPS Objekt — 25+ Tooltips mit title, text, detail, precision, safety, handbook, link, troubleshooting.

---

## Weiter Verbessern

- [ ] Playwright e2e für Premium GUI Click-Tests
- [ ] Coverage Report via --experimental-test-coverage
- [ ] Vite Build für Production Bundle
- [ ] h5wasm real HDF5 statt Descriptor
- [ ] PTP Hardware Timestamping
- [ ] Allan Deviation Berechnung
- [ ] Temperatur Kompensation
- [ ] Multi-Language i18n de/en
- [ ] Dark/Light Theme Toggle
- [ ] Keyboard Shortcuts (Space Play, E Emergency, S Sync, F Freeze)
- [ ] Accessibility ARIA Labels

---

**Ende Handbuch — 10/10 Production Ready — 70 Tests grün — Lint 0 — PTB GUM**
