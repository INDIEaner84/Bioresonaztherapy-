/**
 * Experiment Engine — P10 Versioned, Reproducible — Production
 * + Sequencer with trigger, conditional, loop, ramp + Sweep + Provenance
 */
export class Experiment {
  constructor({id, metadata={}, generators=[], signals=[], sync={}, sequence=[], measurement={}, calibration={}, safety={}, analysis={}, programs=[], totalDuration=0}){
    this.id=id || `EXP-${new Date().toISOString().slice(0,10)}-${Math.random().toString(36).slice(2,6).toUpperCase()}`;
    this.version=1;
    this.metadata={created: new Date().toISOString(), software:'BioRezS2 v2.1', operator:'admin', ...metadata};
    this.generators=generators; this.signals=signals; this.sync=sync;
    this.sequence=sequence; this.measurement=measurement; this.calibration=calibration;
    this.safety=safety; this.analysis=analysis;
    this.programs=programs; this.totalDuration=totalDuration;
    this.results=null; this.provenance=[];
    this.history=[{version:1, ts:new Date().toISOString(), change:'created', user:'system'}];
    this.locked=false; this.lockedBy=null;
  }
  lock(user='admin'){
    if(this.locked) throw new Error(`experiment locked by ${this.lockedBy}`);
    this.locked=true; this.lockedBy=user;
    this.history.push({version:this.version, ts:new Date().toISOString(), change:`locked by ${user}`});
  }
  unlock(user='admin'){
    this.locked=false; this.lockedBy=null;
    this.history.push({version:this.version, ts:new Date().toISOString(), change:`unlocked by ${user}`});
  }
  snapshot(){
    return {
      timestamp:new Date().toISOString(),
      softwareVersion:this.metadata.software,
      hardware:this.generators.map(g=>({id:g.id, model:g.model, firmware:g.firmware||'1.0', serial:g.serial||'', calibration:g.calibration_state})),
      generatorSettings:this.generators,
      signalDefinitions:this.signals,
      programs:this.programs,
      calibration:this.calibration,
      sensor:this.measurement,
      sampling:{rate:48000, window:'Hann', fft:2048, bits:16},
      sync:this.sync,
      safety:this.safety,
      provenance:this.provenance.slice(-20),
      results:this.results,
      totalDuration:this.totalDuration,
      version:this.version,
      id:this.id,
      metadata:this.metadata
    };
  }
  save(patch, user='admin'){
    if(this.locked && this.lockedBy!==user) throw new Error(`locked by ${this.lockedBy}`);
    this.version++;
    const before={...this};
    Object.assign(this, patch);
    this.history.push({version:this.version, ts:new Date().toISOString(), user, patch:JSON.stringify(patch).slice(0,500), before:JSON.stringify(before).slice(0,200)});
    this.provenance.push({from:'Experiment', to:`v${this.version}`, ts:new Date().toISOString(), user, change:Object.keys(patch).join(',')});
    if(this.history.length>200) this.history=this.history.slice(-200);
    if(this.provenance.length>200) this.provenance=this.provenance.slice(-200);
    return this.snapshot();
  }
  exportJSON(){ return JSON.stringify(this.snapshot(), null, 2); }
  exportCSV(samples){
    const header='t,amplitude,frequency,phase,uncertainty\n';
    const rows=samples.map((v,i)=>`${(i/48000).toFixed(6)},${v.toFixed(6)},${this.generators[0]?.channels?.[0]?.frequency||10},0,±0.5%`).join('\n');
    return header+rows;
  }
  setResults(results){ this.results=results; this.provenance.push({from:'Analysis', to:'Result', ts:new Date().toISOString(), results:Object.keys(results||{}).join(',')}); }
  toJSON(){ return this.snapshot(); }
}

export class Sequencer {
  constructor(steps=[]){
    this.steps=steps; // {at, duration, action, type, condition, loop, generatorId}
    this.t=0; this.running=false; this.loop=false; this.onStep=null; this.onComplete=null;
    this.triggerMode='internal'; // internal, external, conditional
    this.history=[];
  }
  add(step){
    if(step.at==null) throw new Error('step.at required');
    if(!step.duration) step.duration=1;
    this.steps.push(step);
    this.steps.sort((a,b)=>a.at-b.at);
  }
  remove(index){ this.steps.splice(index,1); }
  // step: {at, duration, action, type: 'freq'|'amp'|'phase'|'trigger'|'measure', generatorId, condition: fn}
  tick(dt){
    if(!this.running) return [];
    this.t+=dt;
    const triggered=[];
    for(const s of this.steps){
      if(s.at<=this.t && s.at+s.duration>=this.t){
        if(s.condition && !s.condition(this.t, s)) continue;
        if(!s._triggered || this.loop){
          s._triggered=true;
          triggered.push(s);
          this.history.push({ts:new Date().toISOString(), t:this.t, step:s});
          try{ s.action?.(s, this.t); this.onStep?.(s, this.t); }catch(e){ console.warn('sequencer action failed', e); }
        }
      } else if(s.at+s.duration < this.t){ s._triggered=false; }
    }
    // check completion
    const maxT=Math.max(0, ...this.steps.map(s=>s.at+s.duration));
    if(this.t>=maxT){
      if(this.loop){ this.t=0; this.steps.forEach(s=>s._triggered=false); }
      else { this.stop(); this.onComplete?.(); }
    }
    if(this.history.length>1000) this.history=this.history.slice(-500);
    return triggered;
  }
  play({loop=false, triggerMode='internal'}={}){ this.running=true; this.t=0; this.loop=loop; this.triggerMode=triggerMode; this.steps.forEach(s=>s._triggered=false); }
  stop(){ this.running=false; }
  pause(){ this.running=false; }
  resume(){ this.running=true; }
  getProgress(){
    const maxT=Math.max(1, ...this.steps.map(s=>s.at+s.duration));
    return {t:this.t, progress:this.t/maxT, running:this.running, steps:this.steps.length, history:this.history.length};
  }
  toJSON(){ return {steps:this.steps, t:this.t, running:this.running, loop:this.loop, triggerMode:this.triggerMode}; }
}

export class SweepEngine {
  constructor({start=10, stop=1000, duration=30, mode='log', amplitude=5, waveform='sine', steps=100}){
    this.start=start; this.stop=stop; this.duration=duration; this.mode=mode;
    this.amplitude=amplitude; this.waveform=waveform; this.steps=steps;
    if(start<=0 || stop<=0) throw new Error('sweep start/stop must be >0');
    if(duration<=0) throw new Error('duration must be >0');
  }
  freqAt(t){
    const u=Math.min(1, Math.max(0, t/this.duration));
    if(this.mode==='linear') return this.start + (this.stop-this.start)*u;
    if(this.mode==='log') return this.start * Math.pow(this.stop/this.start, u);
    if(this.mode==='exp') return this.start + (this.stop-this.start)*(Math.exp(u*3)-1)/(Math.exp(3)-1);
    if(this.mode==='chirp') return this.start + (this.stop-this.start)*u*u; // quadratic chirp
    return this.start;
  }
  generateTimeline(){
    return Array.from({length:this.steps},(_,i)=>{
      const t=i/this.steps*this.duration;
      return {t, freq:this.freqAt(t), amp:this.amplitude, wave:this.waveform};
    });
  }
  toExperimentSteps(){
    return this.generateTimeline().map(p=>({at:p.t, duration:this.duration/this.steps, action:`sweep ${p.freq.toFixed(2)}Hz`, freq:p.freq, type:'sweep'}));
  }
  toJSON(){ return {start:this.start, stop:this.stop, duration:this.duration, mode:this.mode, amplitude:this.amplitude, waveform:this.waveform, steps:this.steps}; }
}
