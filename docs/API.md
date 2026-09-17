# API — P34 Production — OpenAPI 3.0 Compatible

## Base URL
`http://localhost:3001` (backend mock + real bridge)

## REST Endpoints

### Generators
```
GET    /api/generators
  -> [{id, name, model, channels:[{frequency, amplitude, waveform, phase, output}], calibration_state, ...}]

GET    /api/generators/:id
  -> Generator JSON

POST   /api/generators/:id/config
  Body: {frequency?, amplitude?, waveform?, phase?, duty?, offset?}
  -> {ok, generator, provenance} | {ok:false, reason, code}
  SafetyLayer prüft vor Apply: amp 0-20V, freq 0.01-1MHz, duty 1-99%, slewRate, power

POST   /api/generators/:id/start
  -> {ok, generator}  // output true, safety check

POST   /api/generators/:id/stop
  -> {ok, generator}  // output false

POST   /api/generators/sync
  Body: {phase: 0}
  -> {ok, phase}  // sync all generators phase-lock

```

### Safety
```
GET    /api/safety
  -> {armed, estop, lastOk, watchdogOk, violations[], limits, audit[]}

POST   /api/safety/emergency
  -> {ok, estop:true}  // OUTPUT->OFF for all, independent of UI

POST   /api/safety/reset
  -> {ok, estop:false}
```

### Clock
```
GET    /api/clock
  -> {uptime, ticks, commonClock, latencyCompensation, clocks:{system, generator, measurement, trigger, ptp, ntp}}
  generator: {source:'10MHz REF OCXO', accuracy:'±0.02 ppm', jitterNs:12, drift, locked}
```

### Health
```
GET    /api/health
  -> {cpu, ram, rss, uptime, version, generators, active, ring:{capacity,size,dropped,fill}, safety, clock, wsClients, storage}
```

### Experiment
```
GET    /api/experiment
  -> Experiment snapshot {timestamp, softwareVersion, hardware[], generatorSettings, signalDefinitions, calibration, sensor, sampling, provenance, version, id}

POST   /api/experiment
  Body: patch {safety?, signals?, ...}
  -> {ok, experiment}  // version++, history, provenance logged, stored via StorageManager

GET    /api/experiment/export?format=csv|json|wav|hdf5
  -> CSV or JSON snapshot
```

### Measurement
```
GET    /api/measurement?duration=0.1
  -> {samples:[1024], stats:{mean,var,std,rms,peak,pp,crest,kurtosis,skewness}, fullLength, ring}

GET    /api/analysis/fft
  -> {mags:[1024], freqs:[1024], sampleRate:48000}  // real FFT 2048 Hann

GET    /api/log?  -> last 50 audit logs
GET    /api/storage -> listExperiments
GET    / -> API index
```

## WebSocket Live
```
ws://localhost:3001/ws

Client -> Server:
  {type:'ping'}
  {type:'subscribe', channels:['all']}

Server -> Client:
  {type:'welcome', ts, generators}
  {t, stats:{rms, mean, std}, fft:{peakFreq, peakMag, mags:[512]}, ring:{size,dropped,fill}, generators:[{id,freq,amp,output}]}
  {type:'pong', ts}

Backpressure: Ringbuffer 48k*10s (480k samples), dropped counter, fill%
```

## Safety Rules
- Vor jeder Hardware-Ausgabe: SafetyLayer.check()
- Limits: amp 0-20V, freq 0.01-1MHz, duty 1-99%, dc -1..1V, slewRate 1000 V/s, maxPower 50W
- Rate limit: max 10 cmd/s per generator
- Watchdog 5s, emergency -> OUTPUT OFF unabhängig vom UI
- Audit Trail: alle Config Changes geloggt

## Provenance
Jeder API Call loggt Provenance: timestamp, generator, patch, user
Experiment snapshot enthält full chain: Result->Analysis->Measurement->Sensor->Signal->Generator->Experiment->Configuration

## Error Codes
- ESTOP: emergency stop active
- LIMIT_VIOLATION: amplitude/freq/duty out of range
- DISARMED: safety disarmed
- MAX: max generators exceeded
- ALLOWLIST: plugin not in allowlist

## Frontend Usage
```js
import { APIClient } from './frontend/js/api.js';
const api=new APIClient({baseUrl:'http://localhost:3001', bus});
await api.getGenerators();
await api.postConfig(1, {frequency:40});
api.connectWS({onData: d=> console.log(d.stats.rms)});
```

## Mock Fallback
Wenn backend nicht erreichbar und bus vorhanden, fallback zu direktem bus Zugriff (für offline demo).
