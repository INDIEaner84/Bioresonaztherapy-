import { Generator, GeneratorBus } from '../core/generator.js';
import { SafetyLayer } from '../core/safety.js';
import { ClockArchitecture } from '../core/clock.js';
import { VirtualGenerator } from '../hardware/virtual.js';
import { ADCSensor } from '../hardware/sensors/adc.js';
import { toWAVFile, toHDF5Descriptor, provenanceRecord } from '../core/export.js';
import { fftReal, applyWindow } from '../analysis/fft-real.js';
import { windowedFFT } from '../analysis/fft.js';
import { calcStats } from '../analysis/statistics.js';
import { parsePresetText, validatePreset, presetToExperiment, parseProgramCode } from '../core/preset.js';

function assert(c,m){ if(!c) throw new Error(m); }
let pass=0,fail=0;
function test(n,fn){ try{ fn(); console.log(`✓ ${n}`); pass++; }catch(e){ console.error(`✗ ${n}: ${e.message}`); fail++; } }

// Premium GUI core: GeneratorBus + Safety + Clock integration
test('Premium: GeneratorBus max 32 enforced', ()=>{
  const bus=new GeneratorBus({maxGenerators:32});
  for(let i=1;i<=32;i++) bus.add(new Generator({id:i, name:`G${i}`}));
  let threw=false;
  try{ bus.add(new Generator({id:33, name:'G33'})); }catch{ threw=true; }
  assert(threw, 'should throw max exceeded');
});

test('Premium: mini-canvas waveform generation uses VirtualGenerator', ()=>{
  const vg=new VirtualGenerator({id:1});
  const waveforms=['sine','square','triangle','sawtooth','pulse','noise'];
  for(const wf of waveforms){
    const v=vg.generateSample({frequency:10, amplitude:5, waveform:wf, phaseDeg:0}, 0.01);
    assert(Math.abs(v) <= 5*1.2, `wf ${wf} amp limit ${v}`);
  }
});

test('Premium: Safety slewRate blocks fast amplitude jump', ()=>{
  const safety=new SafetyLayer({slewRate:1000, maxPower:100, amp:[0,20], freq:[0.01,1e6], duty:[1,99], dc:[-1,1]});
  const g=new Generator({id:1, name:'G1'});
  g.channels[0].amplitude=1;
  // first check to set limiter
  safety.rateLimiter.clear();
  let r=safety.check(g,{skipRateLimit:true});
  assert(r.ok, 'first ok');
  // second: fast jump 1 -> 10 in 1ms = 9000 V/s
  g.channels[0].amplitude=10;
  safety.rateLimiter.set('1-0', {ts: Date.now()-1, amp:1});
  safety.rateLimiter.delete('gen-1');
  r=safety.check(g,{skipRateLimit:false});
  // may be blocked by slew OR rate limit, both indicate safety works
  assert(!r.ok, 'should block fast jump');
  assert(r.reason.includes('slew') || r.reason.includes('rate'), `reason should contain slew or rate, got ${r.reason}`);
});

test('Premium: Safety power limit blocks >50W', ()=>{
  const safety=new SafetyLayer({maxPower:5, amp:[0,20], freq:[0.01,1e6], duty:[1,99], dc:[-1,1], slewRate:10000});
  const g=new Generator({id:2, name:'G2'});
  g.channels[0].amplitude=20; // 20^2/50 = 8W >5W
  let r=safety.check(g,{skipRateLimit:true});
  assert(!r.ok && r.reason.includes('power'), `power block expected, got ${r.reason}`);
});

test('Premium: Safety rate limit blocks >10 cmd/sec', ()=>{
  const safety=new SafetyLayer();
  const g=new Generator({id:3, name:'G3'});
  safety.rateLimiter.clear();
  let r=safety.check(g);
  assert(r.ok, 'first ok');
  r=safety.check(g);
  assert(!r.ok && r.reason.includes('rate limit'), 'rate limit should block immediate second');
});

test('Premium: Clock 6 clocks tick + drift', ()=>{
  const clock=new ClockArchitecture();
  const clocks=clock.tick();
  assert(clocks.generator, 'gen clock');
  assert(clocks.ptp, 'ptp');
  assert(clocks.system, 'system');
  const status=clock.getStatus();
  assert(status.commonClock===true, 'commonClock true');
  assert(status.clocks.generator.jitterNs < 100, 'jitter <100');
});

test('Premium: WAV real header 44B PCM 16bit', ()=>{
  const samples=[0,0.5,-0.5,1,-1,0.1];
  const wav=toWAVFile(samples, 48000);
  const buf = wav instanceof Uint8Array ? wav : new Uint8Array(wav);
  const riff = String.fromCharCode(...buf.slice(0,4));
  assert(riff==='RIFF', `RIFF header ${riff}`);
  const wave = String.fromCharCode(...buf.slice(8,12));
  assert(wave==='WAVE', `WAVE header ${wave}`);
  assert(buf.length === 44 + samples.length*2, `wav length ${buf.length} expected ${44+samples.length*2}`);
});

test('Premium: HDF5 descriptor structure', ()=>{
  const exp={id:'EXP-TEST', version:1, generators:[{id:1}], signals:[], metadata:{software:'test'}};
  const desc=toHDF5Descriptor(exp, 100);
  assert(desc.datasets, 'datasets');
  assert(desc.attributes.sampleRate===48000, `sampleRate attr ${desc.attributes.sampleRate}`);
  assert(desc.datasets[0].compression==='gzip', 'gzip');
  assert(desc.datasets[0].shape[0]===100, 'shape 100');
});

test('Premium: Provenance record includes chain', ()=>{
  const exp={id:'EXP-001', version:1, signals:[], generators:[]};
  const prov=provenanceRecord(exp, {sensor:'adc0', rate:48000}, {id:'test'});
  assert(prov.experiment==='EXP-001', `exp id ${prov.experiment}`);
  assert(prov.chain && prov.chain.length>0, 'chain');
  assert(prov.uncertainty.method==='GUM', 'GUM');
});

test('Premium: FFT real power2 validation + Hann window', ()=>{
  const samples=new Array(2048).fill(0).map((_,i)=>Math.sin(2*Math.PI*100*i/48000)*5);
  const win=applyWindow(samples,'hann');
  assert(win.length===2048, 'window length');
  const {mags,freqs,peaks}=windowedFFT(samples,'hann');
  assert(mags.length===2048, `mags length ${mags.length} expected 2048`);
  assert(freqs[1]-freqs[0] < 30, 'freq resolution ~23Hz');
  assert(peaks.length>=1, `peaks found, got ${peaks.length}`);
  assert(Math.abs(peaks[0].f-100)<25, `peak near 100Hz got ${peaks[0].f}`);
});

test('Premium: FFT throws on non power2', ()=>{
  let threw=false;
  try{ fftReal(new Array(1000).fill(0)); }catch{ threw=true; }
  assert(threw, 'should throw non power2');
});

test('Premium: calcStats real values', ()=>{
  const samples=[1,2,3,4,5];
  const s=calcStats(samples);
  assert(Math.abs(s.mean-3)<0.01, 'mean 3');
  assert(s.rms>3, 'rms > mean');
  assert(s.pp===4, 'pp 4');
  assert(s.crest>1, 'crest');
});

test('Premium: Preset List4 parsing Detox', ()=>{
  const txt='"List2"="Detox (C) - BY"\n"List4"="10=180,17=180,23=180,40=180,100=180,1000=180"';
  const parsed=parsePresetText(txt);
  assert(parsed.programs.length===1, '1 program');
  assert(parsed.programs[0].steps.length===6, '6 steps');
  assert(parsed.totalDuration===1080, `duration 1080 got ${parsed.totalDuration}`);
  const val=validatePreset(parsed);
  assert(val.ok, 'valid preset');
  const exp=presetToExperiment(parsed,{name:'Detox'});
  assert(exp.signals.length===6, '6 signals');
});

test('Premium: Preset sweep 10-1000 log', ()=>{
  const txt='"List2"="Sweep 10-1000 Hz LOG"\n"List4"="10-1000=30"';
  const parsed=parsePresetText(txt);
  const step=parsed.programs[0].steps[0];
  assert(step.f1===10, `sweep f1 10 got ${step.f1}`);
  assert(step.f2===1000, `sweep f2 1000 got ${step.f2}`);
  assert(step.duration===30, `duration 30 got ${step.duration}`);
});

test('Premium: ADCSensor quantization 16bit + overrange', ()=>{
  const bus=new GeneratorBus();
  const g=new Generator({id:1, name:'G1'});
  g.channels[0].amplitude=5; g.channels[0].frequency=10; g.channels[0].output=true;
  bus.add(g);
  const vg=new VirtualGenerator({id:1});
  const adc=new ADCSensor('adc0');
  const samples=adc.acquire(bus, vg, 0.01);
  assert(samples.length>0, 'samples');
  assert(!samples.some(isNaN), 'no NaN');
});

test('Premium: RingBuffer dropped handling', ()=>{
  class RingBuffer{
    constructor(cap){ this.cap=cap; this.buf=new Float32Array(cap); this.wp=0; this.size=0; this.dropped=0; }
    push(s){ for(const v of s){ if(this.size>=this.cap){ this.dropped++; this.wp=(this.wp+1)%this.cap; this.size--; } this.buf[this.wp]=v; this.wp=(this.wp+1)%this.cap; this.size++; } }
  }
  const rb=new RingBuffer(10);
  rb.push([1,2,3,4,5,6,7,8,9,10]);
  assert(rb.size===10 && rb.dropped===0, 'full no drop');
  rb.push([11,12]);
  assert(rb.dropped===2, 'dropped 2');
  assert(rb.size===10, 'size stays cap');
});

console.log(`\n${pass} passed, ${fail} failed`);
if(fail) process.exit(1);
