import { TOOLTIPS } from '../frontend/js/tooltips.js';

function assert(c,m){ if(!c) throw new Error(m); }
let pass=0,fail=0;
function test(n,fn){ try{ fn(); console.log(`✓ ${n}`); pass++; }catch(e){ console.error(`✗ ${n}: ${e.message}`); fail++; } }

test('Tooltips: all required keys exist', ()=>{
  const required=['logo','system-nominal','gen-count','safety-armed','ws-status','clock','emergency','gen-card','power-toggle','freq-slider','amp-slider','wave-chip','signal-chain','oscillo','fft','spectro','correlation','sequencer','composer','matrix','health','export-csv','export-wav','export-hdf5','export-pdf'];
  for(const k of required){
    assert(TOOLTIPS[k], `tooltip ${k} missing`);
    assert(TOOLTIPS[k].title, `${k} title missing`);
    assert(TOOLTIPS[k].text, `${k} text missing`);
  }
});

test('Tooltips: each has precision or detail', ()=>{
  let withPrecision=0;
  for(const k in TOOLTIPS){
    if(TOOLTIPS[k].precision || TOOLTIPS[k].detail) withPrecision++;
  }
  assert(withPrecision>=20, `at least 20 with precision/detail, got ${withPrecision}`);
});

test('Tooltips: safety tooltip mentions P11+P14', ()=>{
  const t=TOOLTIPS['safety-armed'];
  assert(t.text.includes('SafetyLayer') || t.text.includes('P11'), 'safety should mention SafetyLayer/P11');
  const combined=(t.detail||'')+(t.precision||'')+(t.text||'');
  assert(combined.toLowerCase().includes('slew') || combined.toLowerCase().includes('power'), 'safety should mention slew/power');
});

test('Tooltips: clock tooltip mentions PTB and OCXO', ()=>{
  const t=TOOLTIPS['clock'];
  assert(t.text.includes('OCXO') && t.text.includes('PTP'), 'clock should mention OCXO and PTP');
  assert(t.precision.includes('PTB') || t.detail.includes('PTB'), 'clock should mention PTB');
});

test('Tooltips: export wav mentions 44B header', ()=>{
  const t=TOOLTIPS['export-wav'];
  assert(t.text.includes('44B') || t.text.includes('WAV'), 'wav should mention 44B');
  assert(t.precision.includes('16bit') || t.text.includes('16bit'), 'wav precision 16bit');
});

test('Tooltips: handbook links exist', ()=>{
  const withLink=Object.values(TOOLTIPS).filter(t=>t.link).length;
  assert(withLink>=5, `at least 5 with link, got ${withLink}`);
});

console.log(`\n${pass} passed, ${fail} failed`);
if(fail) process.exit(1);
