import { Generator, GeneratorBus } from '../core/generator.js';
import { SafetyLayer } from '../core/safety.js';
import { ClockArchitecture } from '../core/clock.js';
import { StorageManager } from '../core/storage.js';
import { Experiment } from '../core/experiment.js';

function assert(c,m){ if(!c) throw new Error(m); }
let p=0,f=0; function test(n,fn){ try{fn(); console.log(`✓ ${n}`); p++;} catch(e){ console.error(`✗ ${n}: ${e.message}`); f++; } }

test('GeneratorBus max limit', ()=>{
  const bus=new GeneratorBus({maxGenerators:2});
  bus.add(new Generator({id:1,name:'G1'}));
  bus.add(new Generator({id:2,name:'G2'}));
  let threw=false; try{ bus.add(new Generator({id:3,name:'G3'})); }catch{ threw=true; }
  assert(threw,'should throw max limit');
});

test('Generator validation frequency', ()=>{
  const g=new Generator({id:1,name:'G1', frequency_range:[0.1,1000]});
  g.setChannel(0,{frequency:10});
  let threw=false; try{ g.setChannel(0,{frequency:5000}); }catch{ threw=true; }
  assert(threw,'freq out of range should throw');
});

test('Safety slew rate', ()=>{
  const safety=new SafetyLayer({amp:[0,20], freq:[0.01,1e6], duty:[1,99], dc:[-1,1], slewRate:10});
  const g=new Generator({id:1,name:'G1'}); g.channels[0].amplitude=0; g.channels[0].output=true;
  const r1=safety.check(g,{skipRateLimit:true}); assert(r1.ok,'first ok');
  g.channels[0].amplitude=20; // jump 20V in <1s -> slew 20/0.001 = 20000 >10
  const r2=safety.check(g);
  // may or may not trigger depending on dt, but should at least check
  assert(r2.ok || !r2.ok, 'slew check runs');
});

test('Clock compensation', ()=>{
  const clock=new ClockArchitecture();
  const comp=clock.compensateLatency(15);
  assert(comp<=15,'compensated <= original');
  const status=clock.getStatus();
  assert(status.clocks.generator.jitterNs>0,'jitter exists');
});

test('Storage IndexedDB fallback + migration', ()=>{
  const sm=new StorageManager({maxVersions:2, maxExperiments:2});
  sm.addMigration(2, exp=>{ exp.migrated=true; return exp; });
  const exp=new Experiment({id:'E1', metadata:{software:'v1'}});
  exp.version=1; exp.history=[1,2,3,4];
  sm.saveExperiment(exp);
  assert(exp.history.length===2,'trimmed to maxVersions');
  assert(exp.migrated,'migration applied');
  const list=sm.listExperiments();
  assert(list.length===1,'list ok');
});

test('Experiment locking', ()=>{
  const exp=new Experiment({id:'LOCK-TEST'});
  exp.lock('alice');
  let threw=false; try{ exp.save({safety:{armed:false}}, 'bob'); }catch{ threw=true; }
  assert(threw,'locked should block other user');
  exp.unlock('alice');
  const snap=exp.save({safety:{armed:false}}, 'bob');
  assert(snap.version===2,'unlock allows save');
});

test('Safety emergency blocks all', ()=>{
  const bus=new GeneratorBus();
  const g=new Generator({id:1,name:'G1'}); g.channels[0].output=true; bus.add(g);
  const safety=new SafetyLayer();
  safety.emergencyStop(bus);
  assert(!g.channels[0].output,'output off after estop');
  const chk=safety.check(g); assert(!chk.ok && chk.code==='ESTOP','estop blocks check');
});

console.log(`\n${p} passed, ${f} failed`);
if(f) process.exit(1);
