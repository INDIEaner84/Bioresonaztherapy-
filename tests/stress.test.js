import { Generator, GeneratorBus } from '../core/generator.js';
import { SafetyLayer } from '../core/safety.js';
import { VirtualGenerator } from '../hardware/virtual.js';
import { ClockArchitecture } from '../core/clock.js';
import { fftReal, applyWindow } from '../analysis/fft-real.js';
import { calcStats } from '../analysis/statistics.js';

function assert(c,m){ if(!c) throw new Error(m); }
let pass=0,fail=0;
function test(n,fn){ try{ fn(); console.log(`✓ ${n}`); pass++; }catch(e){ console.error(`✗ ${n}: ${e.message}`); fail++; } }

test('Stress: 32 generators simultaneous', ()=>{
  const bus=new GeneratorBus({maxGenerators:32});
  const vg=new VirtualGenerator({id:1});
  for(let i=1;i<=32;i++){
    const g=new Generator({id:i, name:`G${i}`});
    g.channels[0].frequency=10+i;
    g.channels[0].amplitude=2+Math.random()*3;
    g.channels[0].output=true;
    bus.add(g);
  }
  assert(bus.list().length===32, '32 gens');
  // generate 48k samples mixed
  const mixed=new Array(480).fill(0);
  for(let i=0;i<mixed.length;i++){
    let sum=0;
    for(const g of bus.list()){
      sum+=vg.generateSample({frequency:g.channels[0].frequency, amplitude:g.channels[0].amplitude, waveform:'sine', phaseDeg:0}, i/48000);
    }
    mixed[i]=sum/32;
  }
  const stats=calcStats(mixed);
  assert(stats.rms>0, 'rms >0');
});

test('Stress: Safety 1000 checks no leak', ()=>{
  const safety=new SafetyLayer();
  const g=new Generator({id:1, name:'G1'});
  for(let i=0;i<1000;i++){
    g.channels[0].amplitude=5+Math.sin(i*0.01);
    safety.check(g,{skipRateLimit:true});
  }
  assert(safety.audit.length<=500, `audit capped ${safety.audit.length}`);
});

test('Stress: Clock 10000 ticks stable', ()=>{
  const clock=new ClockArchitecture();
  let last=clock.tick();
  for(let i=0;i<10000;i++){
    const cur=clock.tick();
    assert(Math.abs(cur.generator.jitterNs) < 100, 'jitter <100ns');
    last=cur;
  }
});

test('Stress: FFT 100 times performance <2s', ()=>{
  const start=Date.now();
  for(let i=0;i<100;i++){
    const samples=new Array(2048).fill(0).map((_,j)=>Math.sin(2*Math.PI*10*j/48000));
    const win=applyWindow(samples,'hann');
    fftReal(win);
  }
  const dur=Date.now()-start;
  console.log(`  FFT 100x took ${dur}ms`);
  assert(dur<2000, `FFT 100x should be <2s got ${dur}ms`);
});

test('Stress: RingBuffer 480k push tail performance', ()=>{
  class RingBuffer{
    constructor(cap){ this.capacity=cap; this.buffer=new Float32Array(cap); this.wp=0; this.size=0; }
    push(s){ for(const v of s){ this.buffer[this.wp]=v; this.wp=(this.wp+1)%this.capacity; if(this.size<this.capacity) this.size++; } }
    tail(n){ const out=new Array(Math.min(n,this.size)); for(let i=0;i<out.length;i++){ const idx=(this.wp-out.length+i+this.capacity)%this.capacity; out[i]=this.buffer[idx]; } return out; }
  }
  const rb=new RingBuffer(480000);
  const chunk=new Array(2400).fill(1);
  const start=Date.now();
  for(let i=0;i<200;i++) rb.push(chunk); // 480k
  const t=rb.tail(2048);
  const dur=Date.now()-start;
  console.log(`  RingBuffer 480k push 200 chunks took ${dur}ms`);
  assert(t.length===2048, 'tail 2048');
  assert(dur<1000, `should be <1s got ${dur}ms`);
});

test('Stress: GeneratorBus audit 1000 entries', ()=>{
  const bus=new GeneratorBus({maxGenerators:100});
  for(let i=1;i<=100;i++){
    try{ bus.add(new Generator({id:i, name:`G${i}`})); }catch{}
    if(i%2===0) try{ bus.remove(i-1); }catch{}
  }
  assert(bus.audit.length>0, 'audit not empty');
  assert(bus.audit.length<=1000, 'audit capped');
});

console.log(`\n${pass} passed, ${fail} failed`);
if(fail) process.exit(1);
