import { SafetyLayer } from '../core/safety.js';
import { Generator, GeneratorBus } from '../core/generator.js';
import { PluginSecurity as SecurityManager } from '../plugins/security.js';

function assert(c,m){ if(!c) throw new Error(m); }
let pass=0,fail=0;
function test(n,fn){ try{ fn(); console.log(`✓ ${n}`); pass++; }catch(e){ console.error(`✗ ${n}: ${e.message}`); fail++; } }

test('Security: Safety blocks DC offset >1V', ()=>{
  const safety=new SafetyLayer();
  const g=new Generator({id:1, name:'G1'});
  g.channels[0].offset=2;
  const r=safety.check(g,{skipRateLimit:true});
  assert(!r.ok, 'should block DC offset');
});

test('Security: Safety blocks duty out of 1-99', ()=>{
  const safety=new SafetyLayer();
  const g=new Generator({id:2, name:'G2'});
  g.channels[0].duty=0;
  let r=safety.check(g,{skipRateLimit:true});
  assert(!r.ok, 'duty 0 blocked');
  g.channels[0].duty=50;
  r=safety.check(g,{skipRateLimit:true});
  assert(r.ok, 'duty 50 ok');
});

test('Security: Safety blocks freq out of range', ()=>{
  const safety=new SafetyLayer({freq:[0.01,1e6], amp:[0,20], duty:[1,99], dc:[-1,1], slewRate:10000, maxPower:100});
  const g=new Generator({id:3, name:'G3', frequency_range:[0.01,1e6]});
  g.channels[0].frequency=2e6;
  const r=safety.check(g,{skipRateLimit:true});
  assert(!r.ok, 'freq 2MHz blocked');
});

test('Security: Generator validates amplitude range throws', ()=>{
  const g=new Generator({id:4, name:'G4', amplitude_range:[0,20]});
  let threw=false;
  try{ g.setChannel(0,{amplitude:30}); }catch{ threw=true; }
  assert(threw, 'should throw amplitude out of range');
});

test('Security: Generator validates waveform supported', ()=>{
  const g=new Generator({id:5, name:'G5', waveform_types:['sine','square']});
  let threw=false;
  try{ g.setChannel(0,{waveform:'arbitrary'}); }catch{ threw=true; }
  assert(threw, 'should throw unsupported waveform');
});

test('Security: Bus prevents duplicate id', ()=>{
  const bus=new GeneratorBus();
  bus.add(new Generator({id:1, name:'G1'}));
  let threw=false;
  try{ bus.add(new Generator({id:1, name:'G1 dup'})); }catch{ threw=true; }
  assert(threw, 'duplicate id blocked');
});

test('Security: Bus prevents invalid group ids', ()=>{
  const bus=new GeneratorBus();
  bus.add(new Generator({id:1, name:'G1'}));
  let threw=false;
  try{ bus.createGroup('BAD', [1,999]); }catch{ threw=true; }
  assert(threw, 'invalid group ids blocked');
});

test('Security: Emergency stop blocks all output', ()=>{
  const bus=new GeneratorBus();
  const g1=new Generator({id:1, name:'G1'}); g1.channels[0].output=true; bus.add(g1);
  const g2=new Generator({id:2, name:'G2'}); g2.channels[0].output=true; bus.add(g2);
  const safety=new SafetyLayer();
  safety.emergencyStop(bus);
  assert(!g1.channels[0].output && !g2.channels[0].output, 'all off after estop');
  const chk=safety.check(g1,{skipRateLimit:true});
  assert(!chk.ok && chk.code==='ESTOP', 'estop blocks check');
});

test('Security: Allowlist blocks unknown plugin', ()=>{
  const sec=new SecurityManager({allowlist:['core','safe-plugin']});
  const res=sec.canLoad({id:'evil-plugin', type:'evil'});
  assert(!res.ok, 'evil plugin blocked');
  const res2=sec.canLoad({id:'core', type:'core'});
  assert(res2.ok, 'core allowed');
});

test('Security: Capability negotiation', ()=>{
  const sec=new SecurityManager();
  const caps=sec.negotiate(['sine','square','arbitrary'], ['sine','square']);
  assert(caps.ok.length===2, '2 granted');
  assert(caps.missing.includes('arbitrary'), 'arbitrary denied');
});

console.log(`\n${pass} passed, ${fail} failed`);
if(fail) process.exit(1);
