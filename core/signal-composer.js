/**
 * Signal Composer — P5 Production — ADD/MULT/AM/FM/PM/Burst/Sweep/Chirp/Gate/Equation
 */
export class SignalComposer {
  constructor(){ this.signals=[]; this.mode='ADD'; this.modulation={depth:0.3, freq:2, beta:2, phase:5}; this.noiseFloorDb=-92; }
  addSignal(sig){
    if(!sig.freq) throw new Error('signal freq required');
    this.signals.push({wave:sig.wave||'sine', freq:sig.freq, amp:sig.amp||1, phase:sig.phase||0, ...sig});
  }
  removeSignal(index){ this.signals.splice(index,1); }
  setMode(m){
    const modes=['ADD','MULT','AM','FM','PM','BURST','SWEEP','CHIRP','GATE'];
    if(!modes.includes(m)) throw new Error(`mode ${m} invalid, use ${modes}`);
    this.mode=m;
  }
  setModulation(patch){ Object.assign(this.modulation, patch); }
  equation(){
    if(!this.signals.length) return 's(t)=0';
    const terms=this.signals.map((s,i)=>`A${i+1}·${s.wave}(${s.freq}Hz·t+φ${i+1})`).join(this.mode==='ADD'?' + ':' × ');
    const mods={
      ADD:'Σ', MULT:'Π',
      AM:`[1+${this.modulation.depth}·cos(2π${this.modulation.freq}t)]·`,
      FM:`sin(2πf_c t + ${this.modulation.beta}·sin(2πf_m t))`,
      PM:`sin(2πf_c t + ${this.modulation.phase}°·PM)`,
      BURST:'burst(10ms, 100ms)',
      SWEEP:'sweep(10→1000Hz)',
      CHIRP:'chirp(10→1000Hz, 30s)',
      GATE:'gate(50%)'
    };
    return `s(t) = ${mods[this.mode]||'Σ'} ${terms} + n(t) -92dB`;
  }
  compose(t){
    if(!this.signals.length) return 0;
    const noise = (Math.random()*2-1)* Math.pow(10, this.noiseFloorDb/20)*0.1;
    if(this.mode==='ADD') return this.signals.reduce((a,s)=>a+ (s.amp||1)*Math.sin(2*Math.PI*s.freq*t + (s.phase||0)*Math.PI/180),0) + noise;
    if(this.mode==='MULT') return this.signals.reduce((a,s)=>a* Math.sin(2*Math.PI*s.freq*t),1) + noise;
    if(this.mode==='AM'){
      const c=this.signals[0]; const m=this.signals[1]||{freq:this.modulation.freq};
      return (1+this.modulation.depth*Math.cos(2*Math.PI*m.freq*t))*Math.sin(2*Math.PI*c.freq*t) + noise;
    }
    if(this.mode==='FM'){
      const c=this.signals[0]; const m=this.signals[1]||{freq:this.modulation.freq};
      return Math.sin(2*Math.PI*c.freq*t + this.modulation.beta*Math.sin(2*Math.PI*m.freq*t)) + noise;
    }
    if(this.mode==='PM'){
      const c=this.signals[0];
      return Math.sin(2*Math.PI*c.freq*t + this.modulation.phase*Math.PI/180*Math.sin(2*Math.PI*2*t)) + noise;
    }
    if(this.mode==='BURST'){
      const c=this.signals[0]; const on = (t*1000)%100 < 10; return on? Math.sin(2*Math.PI*c.freq*t):0;
    }
    if(this.mode==='SWEEP' || this.mode==='CHIRP'){
      const f=10*Math.pow(1000/10, (t%30)/30);
      return Math.sin(2*Math.PI*f*t) + noise;
    }
    if(this.mode==='GATE'){
      const gate = Math.sin(2*Math.PI*1*t)>0 ? 1:0;
      return gate*this.signals.reduce((a,s)=>a+Math.sin(2*Math.PI*s.freq*t),0) + noise;
    }
    return 0;
  }
  generateSamples(duration=1, sampleRate=48000){
    const n=Math.floor(duration*sampleRate);
    return Array.from({length:n},(_,i)=> this.compose(i/sampleRate));
  }
  toJSON(){ return {signals:this.signals, mode:this.mode, modulation:this.modulation, equation:this.equation()}; }
}
