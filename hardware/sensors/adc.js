/**
 * Measurement Feedback Layer — P14 + P15 Closed Loop — Production
 * ADCSensor with quantization, noise, jitter, calibration, uncertainty
 */
import { SensorPlugin } from '../../plugins/interface.js';

export class ADCSensor extends SensorPlugin {
  constructor(id='adc0', {sampleRate=48000, bits=16, vRange=10, noiseFloorDb=-92, jitterNs=18, calibration='calibrated'}={}){
    super(id, {sampleRate, bits, vRange});
    this.sampleRate=sampleRate; this.bits=bits; this.vRange=vRange;
    this.noiseFloorDb=noiseFloorDb; this.jitterNs=jitterNs;
    this.calibration=calibration;
    this.stats={samples:0, overrange:0, lastAcquire:0};
  }
  // Simulated acquisition from VirtualGenerator summed output
  acquire(bus, vg, durationSec=0.1){
    if(durationSec<=0 || durationSec>10) throw new Error('duration 0-10s');
    const n=Math.floor(this.sampleRate*durationSec);
    const t0=Date.now()/1000;
    const lsb=(2*this.vRange)/Math.pow(2,this.bits);
    const out=new Array(n);
    for(let i=0;i<n;i++){
      const t=t0 + i/this.sampleRate + (Math.random()-0.5)*this.jitterNs*1e-9;
      let v=0;
      for(const g of bus.list()){
        for(const ch of g.channels){
          if(!ch.output) continue;
          v+= vg.generateSample({frequency:ch.frequency, amplitude:ch.amplitude, waveform:ch.waveform, phaseDeg:ch.phase, duty:ch.duty, offset:ch.offset}, t);
        }
      }
      // ADC quantization + clipping
      if(Math.abs(v) > this.vRange) this.stats.overrange++;
      v=Math.max(-this.vRange, Math.min(this.vRange, v));
      v=Math.round(v/lsb)*lsb;
      // ADC noise
      v+= (Math.random()*2-1)* Math.pow(10, this.noiseFloorDb/20) * lsb;
      out[i]=v;
    }
    this.stats.samples+=n; this.stats.lastAcquire=Date.now();
    return out;
  }
  // Continuous streaming mock
  *stream(bus, vg, chunkDuration=0.05){
    while(true){
      yield this.acquire(bus, vg, chunkDuration);
    }
  }
  getUncertainty(){
    return {
      type:'estimated',
      noiseFloor:this.noiseFloorDb,
      jitterNs:this.jitterNs,
      calibration:this.calibration,
      uncertainty:'±0.5% ±1LSB',
      bits:this.bits,
      vRange:this.vRange,
      lsb: (2*this.vRange)/Math.pow(2,this.bits),
      method:'GUM'
    };
  }
  calibrate(){ this.calibration='calibrated'; return {ok:true, ts:new Date().toISOString()}; }
  getStats(){ return {...this.stats, sampleRate:this.sampleRate, bits:this.bits}; }
}

export class SensorRegistry {
  constructor(){ this.sensors=new Map(); }
  register(s){ if(!s.id) throw new Error('sensor id required'); this.sensors.set(s.id, s); }
  get(id){ return this.sensors.get(id); }
  list(){ return [...this.sensors.values()]; }
  remove(id){ this.sensors.delete(id); }
}
