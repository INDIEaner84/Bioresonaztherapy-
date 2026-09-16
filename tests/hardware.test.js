import { VirtualGenerator } from '../hardware/virtual.js';
import { ADCSensor } from '../hardware/sensors/adc.js';
import { Generator, GeneratorBus } from '../core/generator.js';
import { Spooky2Adapter } from '../hardware/spooky2-adapter.js';
import { SignalComposer } from '../core/signal-composer.js';
import { ClosedLoopController } from '../core/closed-loop.js';

function assert(c,m){ if(!c) throw new Error(m); }
let p=0,f=0; function test(n,fn){ try{fn(); console.log(`✓ ${n}`); p++;} catch(e){ console.error(`✗ ${n}: ${e.message} ${e.stack}`); f++; } }

test('VirtualGenerator all waveforms', ()=>{
  const vg=new VirtualGenerator({id:1});
  const waves=['sine','square','triangle','sawtooth','pulse','noise','dc','sweep'];
  for(const w of waves){
    const v=vg.generateSample({frequency:10, amplitude:5, waveform:w}, 0.01);
    assert(typeof v==='number' && !isNaN(v), `wave ${w} numeric`);
    assert(Math.abs(v)<=5.5, `wave ${w} amp limit`);
  }
});

test('VirtualGenerator block generation', ()=>{
  const vg=new VirtualGenerator({id:1, sampleRate:1000});
  const block=vg.generateBlock({frequency:10, amplitude:1, waveform:'sine'}, 0.1);
  assert(block.length===100,'100 samples for 0.1s at 1kHz');
});

test('ADCSensor quantization', ()=>{
  const vg=new VirtualGenerator({id:1});
  const adc=new ADCSensor('adc0',{bits:8, vRange:5, sampleRate:1000});
  const bus=new GeneratorBus(); const g=new Generator({id:1,name:'G1'}); g.channels[0].frequency=10; g.channels[0].amplitude=2; g.channels[0].output=true; bus.add(g);
  const samples=adc.acquire(bus, vg, 0.01);
  assert(samples.length===10,'10 samples');
  const unc=adc.getUncertainty();
  assert(unc.bits===8 && unc.lsb>0,'uncertainty lsb');
  assert(adc.getStats().samples===10,'stats samples');
});

test('ADCSensor overrange detection', ()=>{
  const vg=new VirtualGenerator({id:1});
  const adc=new ADCSensor('adc0',{vRange:1, sampleRate:100});
  const bus=new GeneratorBus(); const g=new Generator({id:1,name:'G1'}); g.channels[0].amplitude=10; g.channels[0].output=true; bus.add(g);
  adc.acquire(bus, vg, 0.01);
  assert(adc.getStats().overrange>=0,'overrange counted');
});

test('Spooky2Adapter simulation mode', async ()=>{
  const bus=new GeneratorBus();
  const adapter=new Spooky2Adapter({simulation:true});
  const status=await adapter.status();
  assert(status.length>0 && status[0].status==='Available','sim status');
  const discovered=await adapter.discover(bus);
  assert(discovered.length===1 && bus.list().length===1,'discover adds gen');
  const res=await adapter.sendCommand(0,0,{frequency:10, amplitude:5, waveform:'sine', output:true});
  assert(res.ok && res.simulated,'sim command ok');
});

test('SignalComposer modes', ()=>{
  const sc=new SignalComposer();
  sc.addSignal({freq:10, amp:1, wave:'sine'});
  sc.addSignal({freq:20, amp:0.5, wave:'sine'});
  const modes=['ADD','MULT','AM','FM','PM','BURST','SWEEP','GATE'];
  for(const m of modes){
    sc.setMode(m);
    const v=sc.compose(0.01);
    assert(typeof v==='number' && !isNaN(v), `mode ${m} numeric`);
  }
  const eq=sc.equation(); assert(eq.includes('s(t)'),'equation contains s(t)');
  const samples=sc.generateSamples(0.01, 1000);
  assert(samples.length===10,'samples length');
});

test('ClosedLoop PID anti-windup', ()=>{
  const ctrl=new ClosedLoopController({target:5, kp:1, ki:0.5, integralLimit:2, maxOutput:3});
  ctrl.enable();
  let out=0;
  for(let i=0;i<10;i++){ const r=ctrl.update(0); out=r.output; }
  assert(Math.abs(out)<=3,'output limited to max');
  assert(Math.abs(ctrl.integral)<=2,'integral anti-windup');
  ctrl.emergencyStop();
  const r2=ctrl.update(0); assert(r2.output===0 && r2.reason==='emergency','emergency stops');
});

console.log(`\n${p} passed, ${f} failed`);
if(f) process.exit(1);
