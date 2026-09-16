/**
 * VirtualGenerator — P6 Simulator mit kontrolliertem Rauschen/Drift/Jitter/Harmonics — Production
 */
export class VirtualGenerator {
  constructor({id, jitterNs=12, driftHzPerHour=0.11, noiseFloorDb=-92, harmonicDb=-18, clipping=true, sampleRate=48000}){
    this.id=id; this.jitterNs=jitterNs; this.driftHzPerHour=driftHzPerHour;
    this.noiseFloorDb=noiseFloorDb; this.harmonicDb=harmonicDb; this.clipping=clipping;
    this.sampleRate=sampleRate;
    this.t0=Date.now()/1000;
    this.calibration={amp:'calibrated', freq:'calibrated', phase:'calibrated'};
  }
  // t in seconds
  generateSample({frequency, amplitude, waveform='sine', phaseDeg=0, duty=50, offset=0}, t){
    const ph = phaseDeg*Math.PI/180;
    const jitter = (Math.random()-0.5)* this.jitterNs*1e-9 * 2*Math.PI*frequency*0.1;
    const drift = (this.driftHzPerHour/3600)*t*0.01;
    const f = Math.max(0.01, frequency + drift);
    const p = 2*Math.PI*f*t + ph + jitter;
    let v=0;
    switch(waveform){
      case 'sine': v=amplitude*Math.sin(p); break;
      case 'square': v=amplitude*Math.sign(Math.sin(p)); break;
      case 'triangle': v=amplitude*(2/Math.PI)*Math.asin(Math.sin(p)); break;
      case 'sawtooth': v=amplitude*(2*(t*f - Math.floor(t*f+0.5))); break;
      case 'pulse': v=amplitude*((t*f %1) < duty/100 ? 1 : -1); break;
      case 'noise': v=amplitude*(Math.random()*2-1)*0.3; break;
      case 'dc': v=offset; break;
      case 'arbitrary': v=amplitude*Math.sin(p) + 0.3*amplitude*Math.sin(2*p+0.5); break;
      case 'sweep': {
        const sweepF = 10*Math.pow(1000/10, (t%30)/30);
        v=amplitude*Math.sin(2*Math.PI*sweepF*t + ph);
        break;
      }
      default: v=amplitude*Math.sin(p);
    }
    // harmonics + clipping simulation
    if(waveform==='sine'){
      const harmAmp = Math.pow(10, this.harmonicDb/20);
      v += harmAmp*amplitude*Math.sin(2*p) + (harmAmp*0.5)*amplitude*Math.sin(3*p) + (harmAmp*0.25)*amplitude*Math.sin(4*p);
    }
    if(this.clipping && Math.abs(v) > amplitude*0.98) v = Math.sign(v)*amplitude*0.98;
    // noise floor
    const noiseAmp = Math.pow(10, this.noiseFloorDb/20) * amplitude *0.1;
    v += (Math.random()*2-1)* noiseAmp;
    return v + offset;
  }
  generateBlock({frequency, amplitude, waveform, phaseDeg, duty, offset}, duration=0.1){
    const n=Math.floor(this.sampleRate*duration);
    const t0=Date.now()/1000;
    return Array.from({length:n},(_,i)=> this.generateSample({frequency, amplitude, waveform, phaseDeg, duty, offset}, t0 + i/this.sampleRate));
  }
  getCalibration(){ return this.calibration; }
  setDrift(drift){ this.driftHzPerHour=drift; }
}
