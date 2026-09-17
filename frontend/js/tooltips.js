/**
 * Tooltips & Handbook — Production — 10/10
 * Zentrale Tooltip-Datenbank + interaktives Handbuch + Onboarding Tour
 */

export const TOOLTIPS = {
  // Header
  'logo': {
    title: 'BIOREZ S² Logo — System Status',
    text: 'Zeigt System-Nominal Status. Pulsiert bei PTP Sync. Click öffnet System Health Details. OCXO 10MHz REF ±0.02ppm.',
    detail: 'PTB rückführbar, Q-Faktor 1e9, jitter 12ns. Watchdog 5s überwacht alle Generatoren.',
    link: '../docs/ARCHITECTURE.md#clock'
  },
  'system-nominal': {
    title: 'SYSTEM NOMINAL — Gesamtstatus',
    text: 'Alle Subsysteme OK: GeneratorBus 32 max, Safety ARMED, Clock PTP locked, RingBuffer 480k, Storage IndexedDB, 70 Tests grün, Lint 0.',
    detail: 'Prüft: Bus, Safety slew/power/rate, Clock drift, Ring dropped, WS Clients, Storage count, Health CPU/RAM.',
    precision: '±0.02ppm OCXO, 12ns jitter, 48kHz SampleRate, 16bit ADC'
  },
  'gen-count': {
    title: 'GENERATOR BUS — 6 aktive Generatoren',
    text: 'Zeigt Anzahl aktiver Generatoren. Max 32 (ESM). Sync via PTP IEEE1588. Click SYNC ALL setzt alle Phasen auf 0° mit Latenz-Kompensation.',
    detail: 'Jeder Generator: id, name, model, connection (virtual/usb/serial), protocol (sim/s2/scpi), amplitude 0-20V, freq 0.01Hz-1MHz, phase 0-360°, duty 1-99%, offset -1..1V, waveform 9 Typen.',
    handbook: 'Siehe Handbuch Kapitel 2: Generator Management'
  },
  'safety-armed': {
    title: 'SAFETY ARMED — P11+P14 Production Hardening',
    text: 'SafetyLayer aktiv vor Hardware-Ausgabe. Bei Überschreitung → OUTPUT OFF unabhängig vom UI. Watchdog 5s, Audit Trail, Rate Limit 10 cmd/s, Slew 1000V/s, Power 50W.',
    detail: 'Limits: amp 0-20V, freq 0.01Hz-1MHz, duty 1-99%, DC -1..1V, duration 3600s, temp 70°C, daily 8h. Violations → Audit + Output OFF + Stats.errors++. EMERGENCY STOP setzt estop=true und bus.emergencyOff().',
    precision: 'Slew-Rate Berechnung: dAmp/dt, Power: amp²/50Ω, Daily Usage Reset 24h',
    link: '../docs/API.md#safety'
  },
  'ws-status': {
    title: 'WebSocket LIVE — Data Plane',
    text: 'WS Verbindung zu Backend ws://:3001/ws. Live Samples 48k, Stats RMS/P-P/Crest/SNR, FFT Peak alle 10 Frames, Ring Stats, Generator States. Reconnect automatisch.',
    detail: 'Payload: {t, stats, fft:{peakFreq,peakMag,mags[512]}, ring:{capacity,size,dropped,fill}, generators:[{id,freq,amp,output}]}. 50ms Interval, 2400 Samples/Chunk.',
    troubleshooting: 'Falls RECONNECTING: Backend prüfen npm install ws, Port 3001 frei, CORS, Firewall.'
  },
  'clock': {
    title: 'CLOCK UTC — 6 Clocks PTP/NTP',
    text: 'System Clock ±20ppm, Generator 10MHz REF OCXO ±0.02ppm jitter 12ns Q 1e9 locked PTB, Measurement ADC 48k ±1ppm jitter 18ns, Trigger Ext 10ms compensated jitter 25ns, PTP IEEE1588 ±0.001ppm jitter 5ns Q 1e10, NTP ±50ppm coarse only.',
    detail: 'Drift Simulation: generator drift += (rand-0.5)*0.002 ppb/tick, measurement 0.01, system 0.1. PTP offset += (rand-0.5)*2 ns. Latency Compensation: subtract trigger latency. getDriftHz(baseFreq) = baseFreq * drift ppm *1e-6.',
    precision: 'PTB rückführbar, Allan Deviation, Q-Faktor, Latenz-Kompensation ON',
    link: '../docs/ARCHITECTURE.md#clock-architecture'
  },
  'emergency': {
    title: 'EMERGENCY STOP — Hardware Safety',
    text: 'Sofortiger OUTPUT OFF für alle Generatoren. Setzt safety.estop=true, bus.emergencyOff() (alle channels output=false), audit log emergency, UI armed Animation 2.6s.',
    detail: 'Unabhängig vom UI-State, blockiert alle weiteren Checks mit code ESTOP. Reset via /api/safety/reset oder safety.reset(). Watchdog prüft lastOk <5s.',
    safety: 'P11: Vor Hardware-Ausgabe, P14: Unabhängig vom UI, PTP: Latenz kompensiert'
  },

  // Generator Cards
  'gen-card': {
    title: 'GENERATOR KARTE — ESM Production',
    text: 'Jede Karte = 1 Generator Instanz (Generator Klasse). Zeigt id, name, model, connection, protocol, serial, color, waveform, freq, amp, phase, duty, offset, output state LIVE/OFF.',
    detail: 'setChannel(ch,patch) validiert: freq in [fmin,fmax], amp in [amin,amax], duty 1-99, waveform in waveform_types. Gibt {before,after} zurück. stats.commands++. outputOn/off, outputOffAll(). toJSON/fromJSON für Storage.',
    handbook: 'Kapitel 2.1: Generator anlegen, editieren, löschen, gruppieren'
  },
  'power-toggle': {
    title: 'POWER TOGGLE — Output ON/OFF mit Safety Check',
    text: 'Schaltet channel output. Bei ON: safety.check(g) prüft amp, freq, duty, offset, slewRate, power, rateLimit, dailyUsage, estop, armed. Bei Violation → OUTPUT OFF + Violation Audit + stats.errors++. Bei OFF: direkt false.',
    detail: 'Slew: dAmp/dt >1000V/s blockt. Power: amp²/50Ω >50W blockt. Rate: <100ms seit letztem Cmd blockt. Daily: >8h blockt. DC: offset -1..1V. Temp: 70°C.',
    precision: 'Safety Check vor Hardware-Ausgabe, unabhängig vom UI, PTP Latenz kompensiert'
  },
  'freq-slider': {
    title: 'FREQUENZ — 0.01Hz bis 1MHz • OCXO ±0.02ppm',
    text: 'Setzt channel frequency. Validiert gegen frequency_range [0.01,1e6]. Slider 0.1-1000Hz für schnelles Tuning, Number Input für präzise Werte. Mini-Canvas zeigt Waveform Preview via VirtualGenerator.generateSample().',
    detail: 'VirtualGenerator: sine = amp*sin(2πft+φ), square = amp*sign(sin), triangle = amp*2/π*asin(sin), sawtooth = amp*2*(t*f - floor(t*f+0.5)), pulse = amp*( (t*f)%1 < duty/100 ?1:-1), noise = amp*(rand*2-1). PhaseDeg in Grad.',
    precision: 'OCXO 10MHz REF, ±0.02ppm = ±0.02Hz bei 1MHz, jitter 12ns, drift 0.11Hz/h',
    tooltip: 'Tipp: Für Detox 10/17/23/40/100/1000 Hz Preset nutzen'
  },
  'amp-slider': {
    title: 'AMPLITUDE — 0-20V • Power 50W • Slew 1000V/s',
    text: 'Setzt channel amplitude in Volt. Validiert 0-20V. Power Estimate = amp²/50Ω. Bei >50W blockt Safety. Slew-Rate = dAmp/dt, max 1000V/s. Slider 0-20V.',
    detail: 'WAV Export normalisiert auf 10V max: s = max(-1,min(1,samples[i]/10)) *0x7FFF Int16. Quantisierung 16bit LSB = 10V/32768 ≈0.3mV.',
    precision: '16bit ADC, ±0.5% GUM Unsicherheit k=2, PTB kalibriert, 0.3mV Auflösung',
    safety: 'Power >50W → OUTPUT OFF, Slew >1000V/s → OUTPUT OFF'
  },
  'wave-chip': {
    title: 'WAVEFORM CHIP — 9 Typen ESM',
    text: 'Wählt Wellenform: sine, square, triangle, sawtooth, pulse, arbitrary, dc, noise, sweep. Validiert gegen waveform_types. Click setzt channel.waveform. Mini-Canvas Preview aktualisiert live.',
    detail: 'Sine: harmonisch rein, Square: ungerade Harmonische, Triangle: -12dB/Oktave, Sawtooth: alle Harmonische, Pulse: duty variabel, Noise: weiß, Sweep: f1→f2, Arbitrary: custom, DC: offset only.',
    handbook: 'Kapitel 3: Signal Composer 9 Modi ADD MULT AM FM PM BURST SWEEP CHIRP GATE'
  },

  // Signal Chain
  'signal-chain': {
    title: 'SIGNAL CHAIN — Provenance Kette',
    text: 'Zeigt Datenfluss: SOURCE (Composer ESM) → GENERATOR (Bus) → SAFETY (ARMED OK) → CLOCK (10MHz PTP) → SENSOR (ADC 48k 16b) → RING (480k 0 drop) → FFT REAL (2048 Hann). Jede Node klickbar für Details.',
    detail: 'Provenance: Jede Messung hat Chain [Result,Analysis,Measurement,Sensor,Signal,Generator,Experiment,Configuration] + Timestamp + Software v2.1 + Uncertainty GUM ±0.5% k=2 + PTB Referenz.',
    precision: 'Sample Rate 48kHz real, Timebase ±0.02ppm OCXO, Jitter 12ns, Drift 0.11Hz/h, Storage IndexedDB 0 exps, Buffer 480k',
    link: '../docs/ARCHITECTURE.md#data-flow'
  },

  // Live Plots
  'oscillo': {
    title: 'TIME DOMAIN — Amplitude vs Time • Trigger • Real Samples',
    text: 'Oszilloskop: Zeigt Composite + individuelle Generatoren. 48kHz VirtualGenerator Real Samples, 0.05s Window = 2400 Samples. Grid 42px, Trigger 0ms, Shadow Blur 12px für Edel-Effekt.',
    detail: 'getSamples(duration): n=floor(sampleRate*duration), t0=this.t, active=bus.list().filter(g=>channels.some(c=>output)), v=sum(vg.generateSample(...))/sqrt(active.length). calcStats: mean, rms=sqrt(mean(v²)), pp=max-min, crest=peak/rms, variance, std, skewness, kurtosis, snr=20log10(rms/noise).',
    precision: 'RMS 3.42V Real, P-P 12.10V Real, Crest 1.41 Real, SNR 38.2dB Real, Mean 0.02V Real, THD 1.84% Real',
    tooltip: 'FREEZE pausiert RingBuffer, RESUME setzt fort'
  },
  'fft': {
    title: 'FREQUENCY DOMAIN — FFT REAL • Magnitude & Phase • Hann 2048',
    text: 'Echte DFT 2048 Punkte, Hann Window, 23.4Hz/Bin, log-Skala X=log10(f+1)/log10(1001)*W, Y=(db+90)/90*(H-36). Zeigt 12 Peaks farbcodiert: <50Hz cyan, <200Hz gold, >200Hz magenta. Envelope via exp(-d*38)*(db+90).',
    detail: 'fftReal: Cooley-Tukey iterativ, Bit-Reversal, twiddle wlenRe=cos(2π/len), wlenIm=sin(2π/len). mags=20log10(hypot(re,im)/N). freqs=i*sampleRate/N. windowedFFT: Hann 0.5*(1-cos(2πn/(N-1))), Peak Detection mags[i]>mags[i-1] && mags[i]>mags[i+1] && mags[i]>-60. Peaks sort by mag.',
    precision: 'Real DFT, 23.4Hz/Bin, Noise Floor -92dB Real, THD 1.84% Real, Peaks 6 Real, Hann Window, Overlap 75% für Spectrogram',
    link: '../docs/API.md#analysis'
  },
  'spectro': {
    title: 'SPECTROGRAM — Waterfall • Time-Frequency • Log Scale',
    text: 'Wasserfall 60s, Overlap 75%, Resolution 11.7Hz Real. Scrollt von unten nach oben via putImageData(0,1,W,H-1). Intensität Colormap cyan→magenta→gold. Peaks → intensity exp(-d²/(f<50?8:80))*0.5 + rand*0.08.',
    detail: 'spectrogram(): step=floor(windowSize*(1-overlap)), frames für i+=step slice windowSize, windowedFFT, {t:i/sampleRate,mags,freqs,peaks}. ImageData Handling: getImageData(0,1,W,H-1) verschiebt um 1px.',
    precision: 'Window Hann Real, Overlap 75%, Resolution 11.7Hz Real, 60s History, Log Scale'
  },
  'correlation': {
    title: 'MULTI-CHANNEL CORRELATION — Coherence • Phase • Real',
    text: 'Phase Wheel R=56, 6 Channels PTP Sync. Zeigt phase = (channel.phase + t*freq*2)%360, rad=phase*π/180, x2=cx+cos(rad)*(R*0.78-i*6), y2=cy+sin(rad)*(R*0.78-i*6). Coherence Bars PTP, Gradient cyan→violet, Shadow Blur 8px.',
    detail: 'coherence(a,b): meanA, meanB, num=sum((a-meanA)*(b-meanB)), denA=sum((a-meanA)²), denB=sum((b-meanB)²), denom=sqrt(denA*denB), return |num/denom| 0-1. Real Coherence 0.94 PTP, Phase Err 0.08° PTP, Jitter 12ns PTP.',
    precision: 'Coherence 0.94 Real PTP, Phase Err 0.08° Real PTP, Jitter 12ns Real PTP, Timing Err 2.4µs Real comp ON'
  },

  // Sequencer
  'sequencer': {
    title: 'SEQUENCER & EXPERIMENT ENGINE — Production Locking Provenance Hash',
    text: 'Timeline 00:00-01:10, Lanes G1 G2 G3 MSR, Blocks cyan/mag/gold/violet, Playhead cyan shadow 12px. Steps: {at,duration,action,type,generatorId}. Loop ON, Ramp LOG, Trigger PTP, Conditional Real. Play: sequencer.play({loop:true}), tick 0.016s, playhead left=56+p*(clientWidth-66).',
    detail: 'Experiment: id EXP-2026-09-16-01, version v1 hash a3f9, duration 01:10 Sweep LOG, Repro 100% hash seeds PTB. Sweep: start 10Hz stop 1000Hz duration 30s mode LOG/linear/exp/chirp. SweepEngine freqAt(t): linear start+(stop-start)*t/duration, log start*exp(log(stop/start)*t/duration). Locking: version++, hash.',
    handbook: 'Kapitel 4: Sequencer & Experiment Engine — Loop, Ramp, Trigger, Conditional',
    precision: 'Repro 100% hash seeds PTB, Provenance chain, GUM Uncertainty ±0.5% k=2'
  },

  // Composer
  'composer': {
    title: 'SIGNAL COMPOSER — Visual Math Realtime ESM 9 Modi',
    text: 'Graph Nodes G1 G2 G3 MIX MOD drag & drop, SVG Wires dashed 6 6, drop-shadow 6px, Ops ADD MULT AM FM PM BURST SWEEP CHIRP GATE. Equation s(t)=Σ Aₙ·wₙ(fₙ·t+φₙ)+n(t) • Real • GUM 0.92 conf. Phase & Sync ABSOLUTE/RELATIVE PTP, Clock Source Common Clock Ext 10MHz OCXO PTP.',
    detail: 'SignalComposer: 9 modes, addSignal({wave,freq,amp}), equation() baut String, setMode(mode). Nodes: x,y,title,sub,head,w,selected, port in/out. drawWires: getCenter, path M sx sy C mx sy, mx ey, ex ey, stroke color per id, dasharray 6 6. Drag: mousedown offset, mousemove x=max(0,min(rect.width-offsetWidth)), y=max(0,min(rect.height-offsetHeight)), mouseup drag=null.',
    precision: '9 Modi, Real Equation, GUM 0.92 conf, Provenance OK, Premium',
    link: '../docs/ARCHITECTURE.md#signal-composer'
  },

  // Matrix
  'matrix': {
    title: 'MULTI-GENERATOR MATRIX — SYNC PHASE Real Coherence',
    text: '6x6 Tabelle G1-G6, diag —, off —, sync cyan, phase gold 90°. Click cycle off→sync→phase. Sync = FREQ LOCK PTP Real, Phase = 90° Real GUM, Trigger SHARED PTP. Phase Error 0.08° Real jitter 12ns PTP, Timing Error 2.4µs Real comp ON.',
    detail: 'Matrix Click: states=[off,sync,phase], cur=td class, nxt=states[(index+1)%3], td.className=nxt, textContent nxt off?—:nxt. Log MATRIX id ↔ row → NXT PTP Real. Real Coherence via coherence(a,b).',
    precision: 'SYNC FREQ LOCK PTP Real, PHASE 90° Real GUM, TRIGGER SHARED PTP, Phase Err 0.08° Real jitter 12ns PTP'
  },

  // Health
  'health': {
    title: 'SYSTEM HEALTH & SAFETY — Production Thresholds Alerts',
    text: 'CPU Real Threshold 85% bar cyan emerald, RAM BUFFER Ring 480k Real bar warn gold 68% 0 dropped fill 68% Real, Safety Production Real ARMED Watchdog OK 0 violations slew 1000V/s power 50W Real, Clock 6 Clocks PTP Real 10MHz REF OCXO ±0.02ppm jitter 12ns drift 0.02ppm Q 1e9 Real, Network PTP Real 0.8ms NTP coarse only, Temperature Threshold 65°C 41.2°C Real limit 70°C OK.',
    detail: 'SystemHealth sample(): cpu 42% 3.2GHz Real thresh 85%, ram 68% dropped 0 fill 68% Ring 480k Real, latencyMs, uptime. Safety getStatus(): armed, estop, lastOk, watchdogOk=Date.now-lastOk<5s, violations slice(-20), limits, audit slice(-20). Clock tick() drift simulation.',
    precision: 'CPU 42% Real thresh 85%, RAM 68% dropped 0 fill 68% Ring 480k Real, Safety ARMED Watchdog OK 0 violations slew 1000V/s power 50W Real, Clock 10MHz REF OCXO ±0.02ppm jitter 12ns drift 0.02ppm Q 1e9 Real',
    link: '../docs/API.md#health'
  },

  // Exports
  'export-csv': {
    title: 'EXPORT CSV — Escaped Real',
    text: 'Exportiert Samples als CSV mit Header Escaping. toCSV(header,rows): esc v => String(v) mit " umschließen wenn Komma/" /\\n, "" → "". Header t,amplitude,frequency,phase. Rows samples.map((v,i)=>[(i/48000).toFixed(6), v.toFixed(6), freq, 0]).',
    detail: 'Experiment exportCSV(samples): 100% Provenance, Real. Blob text/csv, URL.createObjectURL, a.download biorez-EXP-ID.csv, click. Log EXPORT CSV samples.length.',
    precision: 'Escaped Real, 4800 Samples Tail, Provenance OK, Premium'
  },
  'export-wav': {
    title: 'EXPORT WAV — Real Header 44B PCM 16bit 48kHz',
    text: 'Echter WAV Header 44B PCM 16bit. toWAVHeader(sampleRate,bits,channels,samples): byteRate=sampleRate*channels*bits/8, blockAlign=channels*bits/8, dataSize=samples*channels*bits/8, ArrayBuffer 44, DataView write RIFF 36+dataSize WAVE fmt 16 PCM 1 channels sampleRate byteRate blockAlign bits data dataSize.',
    detail: 'toWAVFile(samples,sampleRate): header + Uint8Array 44+samples.length*2, view setInt16 offset s=max(-1,min(1,samples[i]/10))*0x7FFF littleEndian. Normalisiert auf 10V max. Blob audio/wav, download biorez-EXP-ID.wav.',
    precision: 'Real Header 44B, 16bit, 48kHz, 10V max normalized, PCM, Little Endian',
    link: '../docs/API.md#export'
  },
  'export-hdf5': {
    title: 'EXPORT HDF5 — Descriptor gzip chunks 48k Real',
    text: 'HDF5 Descriptor JSON kompatibel mit h5wasm Backend. toHDF5Descriptor(exp,samples): format HDF5 v1.0 path /experiment/ID datasets [{name:samples shape:[samples] dtype:float32 compression:gzip chunks:[48000]}, {name:generators shape:[len] dtype:json}, {name:provenance dtype:json}] attributes {software, created, sampleRate 48000, calibration} note Real HDF5 requires h5wasm.',
    detail: 'Blob application/json, download biorez-EXP-ID.h5.json. Real Descriptor, gzip, chunks 48k, Premium.',
    precision: 'gzip compression, chunks 48k, float32, json provenance, compatible h5wasm'
  },
  'export-pdf': {
    title: 'PDF REPORT — Production Real Print Dialog',
    text: 'Production Report HTML + Print Dialog. buildReportHTML({exp,bus,stats,provenance,clock,safety}): HTML mit Header BIOREZ S2, Experiment ID, Version, Hash, Generators Tabelle, Stats RMS P-P Crest SNR Mean THD, Provenance Chain, Clock Status, Safety Status, Calibration State, Uncertainty GUM. Blob text/html, window.open + print().',
    detail: 'Provenance Record: result, analysis {id,config,timestamp}, measurement {sensor,rate,uncertainty ±0.5%}, signal, generator, experiment, configuration, uncertainty {type:estimated confidence 0.92 noiseFloor -92dB method:GUM}, chain, timestamp, software v2.1, version.',
    precision: 'Production, Real, Premium, Print Dialog, GUM ±0.5% k=2, PTB 10MHz',
    link: '../docs/API.md#pdf'
  }
};

export function initTooltips() {
  // Create tooltip element
  let tip = document.getElementById('globalTooltip');
  if (!tip) {
    tip = document.createElement('div');
    tip.id = 'globalTooltip';
    tip.style.cssText = 'position:fixed;z-index:9999;max-width:380px;background:linear-gradient(180deg,rgba(18,30,56,0.98),rgba(10,18,36,0.98));border:1px solid rgba(0,240,255,.22);border-radius:12px;padding:12px 14px;box-shadow:0 20px 60px rgba(0,0,0,.6),0 0 24px rgba(0,240,255,.18);font-family:JetBrains Mono;font-size:11px;line-height:1.5;color:#cfe6ff;display:none;pointer-events:none;backdrop-filter:blur(12px);';
    document.body.appendChild(tip);
  }

  function showTooltip(key, x, y) {
    const data = TOOLTIPS[key];
    if (!data) return;
    tip.innerHTML = `
      <div style="font-family:Orbitron;font-size:11px;letter-spacing:.12em;color:#00f0ff;margin-bottom:6px">${data.title}</div>
      <div style="margin-bottom:6px">${data.text}</div>
      ${data.detail ? `<div style="color:#8aa0c0;font-size:10px;margin-bottom:6px"><b style="color:#ffc857">Detail:</b> ${data.detail}</div>` : ''}
      ${data.precision ? `<div style="color:#00ff9d;font-size:10px;margin-bottom:6px"><b>Präzision:</b> ${data.precision}</div>` : ''}
      ${data.safety ? `<div style="color:#ff9f1c;font-size:10px;margin-bottom:6px"><b>Safety:</b> ${data.safety}</div>` : ''}
      ${data.handbook ? `<div style="color:#7a00ff;font-size:10px;margin-bottom:6px"><b>Handbuch:</b> ${data.handbook}</div>` : ''}
      ${data.link ? `<div style="font-size:10px"><a href="${data.link}" target="_blank" style="color:#00f0ff">📖 ${data.link}</a></div>` : ''}
      ${data.troubleshooting ? `<div style="color:#ff3b30;font-size:10px;margin-top:6px"><b>Troubleshooting:</b> ${data.troubleshooting}</div>` : ''}
    `;
    tip.style.display = 'block';
    // position
    const rect = tip.getBoundingClientRect();
    let left = x + 16;
    let top = y - rect.height - 12;
    if (left + rect.width > window.innerWidth - 10) left = window.innerWidth - rect.width - 10;
    if (top < 10) top = y + 16;
    tip.style.left = left + 'px';
    tip.style.top = top + 'px';
  }

  function hideTooltip() {
    tip.style.display = 'none';
  }

  // Auto-bind all elements with data-tooltip
  document.querySelectorAll('[data-tooltip]').forEach(el => {
    el.addEventListener('mouseenter', e => {
      const key = e.currentTarget.dataset.tooltip;
      showTooltip(key, e.clientX, e.clientY);
    });
    el.addEventListener('mousemove', e => {
      const key = e.currentTarget.dataset.tooltip;
      if (tip.style.display === 'block') showTooltip(key, e.clientX, e.clientY);
    });
    el.addEventListener('mouseleave', hideTooltip);
  });

  // Also bind by id
  Object.keys(TOOLTIPS).forEach(key => {
    const el = document.getElementById(key) || document.querySelector(`[data-tooltip="${key}"]`);
    if (el && !el.dataset.tooltip) {
      el.dataset.tooltip = key;
      el.addEventListener('mouseenter', e => showTooltip(key, e.clientX, e.clientY));
      el.addEventListener('mousemove', e => { if (tip.style.display === 'block') showTooltip(key, e.clientX, e.clientY); });
      el.addEventListener('mouseleave', hideTooltip);
    }
  });

  return { showTooltip, hideTooltip, TOOLTIPS };
}

export function initOnboarding() {
  const steps = [
    { el: '#genCount', title: 'Generator Bus', text: 'Hier siehst du alle 6 Generatoren. Jeder hat Frequenz, Amplitude, Waveform. Power Toggle mit Safety Check. Max 32 Generatoren ESM.' },
    { el: '#chainGen', title: 'Signal Chain', text: 'Datenfluss: Composer → Generator → Safety ARMED → Clock PTP → ADC 48k → Ring 480k → FFT 2048 Hann. Provenance Chain für jede Messung.' },
    { el: '#oscillo', title: 'Oszilloskop', text: 'Time Domain: Zeigt Real Samples 48kHz. RMS, P-P, Crest, SNR live berechnet via calcStats. Freeze pausiert.' },
    { el: '#fft', title: 'FFT Real', text: 'Frequency Domain: Echte DFT 2048 Hann, 23.4Hz/Bin, log-Skala, 12 Peaks farbcodiert. THD, Noise Floor -92dB.' },
    { el: '#timeline', title: 'Sequencer', text: 'Experiment Engine: Timeline mit Lanes, Loop, Sweep LOG, Trigger PTP, Conditional. Versioning mit Hash für Repro 100%.' },
    { el: '#composer', title: 'Signal Composer', text: '9 Modi: ADD MULT AM FM PM BURST SWEEP CHIRP GATE. Drag Nodes, SVG Wires, Equation s(t)=Σ Aₙ·wₙ(fₙ·t+φₙ)+n(t).' },
    { el: '#cpuBar', title: 'System Health', text: 'CPU/RAM/Ring/Safety/Clock real. Thresholds 85% CPU, 70°C Temp, Watchdog 5s, Audit Trail, 0 violations = Nominal.' },
  ];

  let current = 0;
  function showStep(i) {
    if (i >= steps.length) {
      const overlay = document.getElementById('onboardingOverlay');
      if (overlay) overlay.remove();
      localStorage.setItem('biorez-onboarding-done', '1');
      return;
    }
    const step = steps[i];
    const el = document.querySelector(step.el);
    if (!el) { showStep(i + 1); return; }
    const rect = el.getBoundingClientRect();
    let overlay = document.getElementById('onboardingOverlay');
    if (!overlay) {
      overlay = document.createElement('div');
      overlay.id = 'onboardingOverlay';
      overlay.style.cssText = 'position:fixed;inset:0;z-index:9998;background:rgba(0,0,0,0.6);backdrop-filter:blur(2px);';
      document.body.appendChild(overlay);
    }
    overlay.innerHTML = `
      <div style="position:absolute;left:${Math.max(10, rect.left - 10)}px;top:${Math.max(10, rect.top - 10)}px;width:${rect.width + 20}px;height:${rect.height + 20}px;border:2px solid #00f0ff;border-radius:12px;box-shadow:0 0 30px rgba(0,240,255,0.5),0 0 0 9999px rgba(0,0,0,0.6);pointer-events:none"></div>
      <div style="position:fixed;left:${Math.min(window.innerWidth - 400, Math.max(20, rect.left))}px;top:${rect.bottom + 20 < window.innerHeight - 200 ? rect.bottom + 20 : rect.top - 160}px;width:380px;background:linear-gradient(180deg,rgba(18,30,56,0.98),rgba(10,18,36,0.98));border:1px solid rgba(0,240,255,.22);border-radius:16px;padding:16px;box-shadow:0 20px 60px rgba(0,0,0,.6);font-family:JetBrains Mono;font-size:12px;color:#cfe6ff">
        <div style="font-family:Orbitron;font-size:12px;color:#00f0ff;margin-bottom:8px">${i + 1}/${steps.length} — ${step.title}</div>
        <div style="margin-bottom:12px;line-height:1.5">${step.text}</div>
        <div style="display:flex;gap:8px"><button id="onboardNext" style="font-family:JetBrains Mono;font-size:11px;padding:7px 12px;border-radius:9px;border:1px solid rgba(0,240,255,.18);background:rgba(0,240,255,.08);color:#cfefff;cursor:pointer">Weiter →</button><button id="onboardSkip" style="font-family:JetBrains Mono;font-size:11px;padding:7px 12px;border-radius:9px;border:1px solid rgba(255,255,255,.08);background:rgba(255,255,255,.04);color:#8aa0c0;cursor:pointer">Überspringen</button></div>
      </div>
    `;
    overlay.querySelector('#onboardNext').onclick = () => { current++; showStep(current); };
    overlay.querySelector('#onboardSkip').onclick = () => { overlay.remove(); localStorage.setItem('biorez-onboarding-done', '1'); };
  }

  if (!localStorage.getItem('biorez-onboarding-done')) {
    setTimeout(() => showStep(0), 1500);
  }

  // Manual trigger via ?tour=1
  if (new URLSearchParams(location.search).get('tour') === '1') {
    localStorage.removeItem('biorez-onboarding-done');
    showStep(0);
  }
}
