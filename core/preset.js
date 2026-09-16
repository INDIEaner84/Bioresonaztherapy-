/**
 * Preset / Program Import — P19 Production — Spooky2 TXT + JSON + CSV + Validation
 * Unterstützt:
 *  - Spooky2 Preset TXT (List4=Frequenzprogramme, List2=Beschreibung, key="value")
 *  - Einfache Frequenzliste: "10, 17, 23, 40" oder "10=180, 20=180" oder "10-20=60"
 *  - JSON Experiment
 *  - CSV
 * Liefert: {programs:[{code, description, duration, steps:[{f1,f2,duration,waveform}]}], raw}
 */

export function parsePresetText(text){
  if(!text || typeof text!=='string') throw new Error('preset text required');
  text=text.trim();
  if(!text) throw new Error('empty preset');
  // Try JSON first
  if(text.startsWith('{') || text.startsWith('[')){
    try{
      const j=JSON.parse(text);
      if(j.programs || j.generators || j.signals){
        const programs=j.programs||[{code:'json', description:j.metadata?.name||'JSON Import', steps:(j.signals||[]).map(s=>({f1:s.freq||s.frequency||10, f2:s.freq2||s.frequency||10, duration:s.duration||180, waveform:0}))}];
        const totalDuration=programs.reduce((a,p)=>a+p.steps.reduce((s,st)=>s+(st.duration||0),0),0);
        return {entries:new Map([['json',text]]), programs, totalDuration, raw:text, format:'json', json:j};
      }
    }catch(_e){ /* ignore */ }
  }

  const entries=new Map();
  const lines=text.split(/\r?\n/);
  let buf='', inQuote=false;
  for(const raw of lines){
    if(!raw.trim()) continue;
    if(raw.trim().startsWith('"') && !inQuote){
      buf=raw;
      if((raw.match(/"/g)||[]).length %2===1) { inQuote=true; continue; }
    } else if(inQuote){
      buf+='\n'+raw;
      if(raw.trim().endsWith('"')) inQuote=false; else continue;
    } else { buf=raw; }
    const m=buf.match(/^"([^"]+)"\s*=\s*"(.*)"\s*$/s);
    if(m){ entries.set(m[1], m[2]); }
    else {
      entries.set('__raw', text);
      break;
    }
    buf='';
  }

  const programs=[];
  const codes=[...entries.entries()].filter(([k])=> k.startsWith('List4')).map(([,v])=>v);
  const descs=[...entries.entries()].filter(([k])=> k.startsWith('List2')).map(([,v])=>v);
  const descsLong=[...entries.entries()].filter(([k])=> k.startsWith('Desc')).map(([,v])=>v);

  if(codes.length){
    codes.forEach((code,i)=>{
      const desc=descs[i]||descsLong[i]||`Program ${i+1}`;
      const steps=parseProgramCode(code);
      if(steps.length===0) return;
      programs.push({code, description:desc, longDesc:descsLong[i]||'', steps, source:'spooky2'});
    });
  } else if(entries.has('__raw')){
    const raw=entries.get('__raw');
    // Simple list or program code: split by comma, semicolon, newline
    // Detect if it's CSV with 3 columns per line (freq,freq2,duration) vs simple freq list
    // For "10, 17, 23" -> 3 steps, not 1 CSV row
    const hasEquals=raw.includes('=');
    const hasNewline=raw.includes('\n') || raw.includes(';');
    let steps=[];
    if(hasEquals){
      // program code style: "10=180,20=180" or "10-20=60"
      steps=raw.split(/[,;\n]+/).map(s=>s.trim()).filter(Boolean).map(tok=>{
        const m=tok.match(/^([\d.]+)(?:-([\d.]+))?(?:\s*=\s*([\d.]+))?/);
        if(!m) return null;
        const f1=parseFloat(m[1]), f2=m[2]?parseFloat(m[2]):f1, dur=m[3]?parseFloat(m[3]):180;
        if(f1<=0 || f2<=0) return null;
        if(f1>1e6 || f2>1e6) return null;
        return {f1,f2,duration:dur, waveform:0};
      }).filter(Boolean);
    } else if(hasNewline){
      // Try CSV detection: each line may have 2-3 numbers
      const lines=raw.split(/[\n;]+/).map(l=>l.trim()).filter(Boolean);
      const csvSteps=lines.map(line=>{
        const parts=line.split(',').map(p=>p.trim()).filter(Boolean);
        if(parts.length>=2 && parts.every(p=>!isNaN(parseFloat(p)))){
          // CSV row: f1,f2,duration or f1,duration or f1,f2
          const f1=parseFloat(parts[0]);
          let f2=f1, dur=180;
          if(parts.length===2){
            // Could be "10,180" -> freq,duration  OR "10,20" -> f1,f2
            // Heuristic: if second value > 1000 and first <1000, treat as duration? But keep simple: if second <=1e6 and second>0 and second<1e6 and raw has no = -> treat as freq list, not CSV
            // For backward compat, treat as freq list when no newline? We are in hasNewline branch
            const second=parseFloat(parts[1]);
            if(second>3600){ // likely freq2
              f2=second;
            } else if(second>0 && second<=36000 && parts.length===2 && lines.length===1){
              // single line "10, 17" ambiguous, treat as two freqs, not CSV
              return null;
            } else {
              f2=f1; dur=second;
            }
          } else if(parts.length>=3){
            f2=parseFloat(parts[1]); dur=parseFloat(parts[2]);
            if(isNaN(f2)) f2=f1; if(isNaN(dur)) dur=180;
          }
          if(f1>0 && f1<=1e6) return {f1,f2:isNaN(f2)?f1:f2,duration:isNaN(dur)?180:dur, waveform:0};
        }
        return null;
      }).filter(Boolean);
      if(csvSteps.length>0 && csvSteps.length===lines.length){
        steps=csvSteps;
      } else {
        // fallback to simple split
        steps=raw.split(/[,;\n]+/).map(s=>s.trim()).filter(Boolean).map(tok=>{
          const m=tok.match(/^([\d.]+)(?:-([\d.]+))?(?:\s*=\s*([\d.]+))?/);
          if(!m) return null;
          const f1=parseFloat(m[1]), f2=m[2]?parseFloat(m[2]):f1, dur=m[3]?parseFloat(m[3]):180;
          if(f1<=0 || f2<=0) return null;
          if(f1>1e6 || f2>1e6) return null;
          return {f1,f2,duration:dur, waveform:0};
        }).filter(Boolean);
      }
    } else {
      // Simple comma list: "10, 17, 23"
      steps=raw.split(/[,;\n]+/).map(s=>s.trim()).filter(Boolean).map(tok=>{
        const m=tok.match(/^([\d.]+)(?:-([\d.]+))?(?:\s*=\s*([\d.]+))?/);
        if(!m) return null;
        const f1=parseFloat(m[1]), f2=m[2]?parseFloat(m[2]):f1, dur=m[3]?parseFloat(m[3]):180;
        if(f1<=0 || f2<=0) return null;
        if(f1>1e6 || f2>1e6) return null;
        return {f1,f2,duration:dur, waveform:0};
      }).filter(Boolean);
    }
    if(steps.length) programs.push({code:raw.slice(0,200), description:'Imported List', steps, source:'list'});
  }

  if(programs.length===0) throw new Error('no valid programs found in preset');

  const totalDuration=programs.reduce((a,p)=>a+p.steps.reduce((s,st)=>s+(st.duration||0),0),0);
  return {entries, programs, totalDuration, raw:text, format: codes.length?'spooky2':'list'};
}

export function parseProgramCode(code){
  if(!code || typeof code!=='string') return [];
  const steps=[];
  const s=code.trim(); let i=0;
  while(i<s.length){
    while(i<s.length && (s[i]===' ' || s[i]==='\n' || s[i]==='\r' || s[i]==='\t')) i++;
    if(i>=s.length) break;
    let f1=null, f2=null, dur=180, amp=null, wf=0;
    let num=''; while(i<s.length && /[\d.]/.test(s[i])){ num+=s[i++]; }
    if(num){
      f1=parseFloat(num);
      if(isNaN(f1)) { i++; continue; }
    } else {
      // handle A= amplitude, W= waveform etc.
      if(s[i]==='A' || s[i]==='a'){ i++; if(s[i]==='=') i++; let n=''; while(i<s.length && /[\d.]/.test(s[i])) n+=s[i++]; amp=parseFloat(n); if(s[i]===',') i++; continue; }
      if(s[i]==='W' || s[i]==='w'){ i++; if(s[i]==='=') i++; let n=''; while(i<s.length && /[\d.]/.test(s[i])) n+=s[i++]; wf=parseInt(n)||0; if(s[i]===',') i++; continue; }
      if(s[i]===','){ i++; continue; }
      i++; continue;
    }
    if(i<s.length && s[i]==='-'){ i++; let n=''; while(i<s.length && /[\d.]/.test(s[i])) n+=s[i++]; f2=parseFloat(n); if(isNaN(f2)) f2=null; }
    if(i<s.length && s[i]==='='){ i++; let n=''; while(i<s.length && /[\d.]/.test(s[i])) n+=s[i++]; dur=parseFloat(n); if(isNaN(dur)) dur=180; }
    if(f1!==null){
      if(f2===null) f2=f1;
      // safety clamp
      if(f1>0 && f1<=1e6 && f2>0 && f2<=1e6 && dur>0 && dur<=36000){
        steps.push({f1,f2,duration:dur, amplitude:amp, waveform:wf});
      }
    }
    if(i<s.length && s[i]===',') i++;
  }
  return steps;
}

export function presetToExperiment(parsed, {name='Imported Preset'}={}){
  if(!parsed || !parsed.programs) throw new Error('parsed programs required');
  const exp={
    id:`EXP-${new Date().toISOString().slice(0,10)}-${Math.random().toString(36).slice(2,6).toUpperCase()}`,
    version:1,
    metadata:{created:new Date().toISOString(), software:'BioRezS2 v2.1', source:'Spooky2 Preset', name, format:parsed.format||'unknown'},
    programs: parsed.programs,
    totalDuration: parsed.totalDuration,
    signals: parsed.programs.flatMap(p=> p.steps.map(s=> ({
      freq:s.f1, freq2:s.f2, duration:s.duration,
      wave:['sine','square','triangle','sawtooth','custom'][s.waveform]||'sine',
      amplitude:s.amplitude||5
    }))),
    raw: parsed.raw?.slice(0,1000)||'',
  };
  return exp;
}

export function validatePreset(parsed){
  const errors=[];
  if(!parsed.programs || parsed.programs.length===0) errors.push('no programs');
  for(const prog of parsed.programs||[]){
    if(!prog.steps || prog.steps.length===0) errors.push(`program ${prog.description} has no steps`);
    for(const st of prog.steps||[]){
      if(st.f1<=0 || st.f2<=0) errors.push(`invalid freq ${st.f1}-${st.f2}`);
      if(st.f1>1e6 || st.f2>1e6) errors.push(`freq too high ${st.f1}`);
      if(st.duration<=0 || st.duration>36000) errors.push(`invalid duration ${st.duration}`);
    }
  }
  return {ok:errors.length===0, errors};
}
