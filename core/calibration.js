/**
 * Calibration — P13 Production
 * Jeder Generator/Sensor hat Calibration State + History + Expiry + Traceability
 */
export const CalStates = ['uncalibrated','calibrated','expired','unknown'];
export const CalTypes = ['amplitude','frequency','phase','offset','sensor','dc'];

export class Calibration {
  constructor({
    amplitude='calibrated', frequency='calibrated', phase='expired', offset='calibrated',
    sensor='uncalibrated', dc='calibrated',
    timestamp=new Date().toISOString(), reference='PTB 10MHz', uncertainty='±0.02%',
    status='calibrated', intervalDays=180, operator='admin', method='auto', traceability='PTB',
    history=[]
  }={}){
    this.amplitude=amplitude; this.frequency=frequency; this.phase=phase; this.offset=offset;
    this.sensor=sensor; this.dc=dc;
    this.timestamp=timestamp; this.reference=reference; this.uncertainty=uncertainty;
    this.status=status; this.intervalDays=intervalDays; this.operator=operator;
    this.method=method; this.traceability=traceability;
    this.history=history.length? history : [{ts:timestamp, status, reference, operator}];
  }
  isExpired(){
    const ageDays = (Date.now() - new Date(this.timestamp).getTime()) / (1000*3600*24);
    return this.status==='expired' || ageDays > this.intervalDays ||
           this.amplitude==='expired' || this.phase==='expired';
  }
  daysUntilExpiry(){
    const ageDays = (Date.now() - new Date(this.timestamp).getTime()) / (1000*3600*24);
    return Math.max(0, this.intervalDays - ageDays);
  }
  badge(state){
    const map={
      calibrated:['cyan','CAL','rgba(0,240,255,0.12)'],
      expired:['gold','EXP','rgba(255,200,87,0.12)'],
      uncalibrated:['mag','UNCAL','rgba(255,46,147,0.12)'],
      unknown:['muted','UNK','rgba(255,255,255,0.06)']
    };
    const [color,label,bg]=map[state]||['','UNK',''];
    return {color, label, bg, state};
  }
  getAllBadges(){
    return {
      amplitude:this.badge(this.amplitude),
      frequency:this.badge(this.frequency),
      phase:this.badge(this.phase),
      offset:this.badge(this.offset),
      sensor:this.badge(this.sensor),
      dc:this.badge(this.dc)
    };
  }
  calibrate({type='all', reference=this.reference, operator='admin', uncertainty='±0.02%'}){
    const now=new Date().toISOString();
    if(type==='all' || type==='amplitude') this.amplitude='calibrated';
    if(type==='all' || type==='frequency') this.frequency='calibrated';
    if(type==='all' || type==='phase') this.phase='calibrated';
    if(type==='all' || type==='offset') this.offset='calibrated';
    if(type==='all' || type==='sensor') this.sensor='calibrated';
    if(type==='all' || type==='dc') this.dc='calibrated';
    this.timestamp=now; this.reference=reference; this.operator=operator;
    this.uncertainty=uncertainty; this.status='calibrated';
    this.history.push({ts:now, type, reference, operator, uncertainty});
    if(this.history.length>50) this.history.shift();
    return this;
  }
  expire(reason='interval'){ this.status='expired'; this.history.push({ts:new Date().toISOString(), type:'expire', reason}); }
  toJSON(){
    return {
      amplitude:this.amplitude, frequency:this.frequency, phase:this.phase,
      offset:this.offset, sensor:this.sensor, dc:this.dc,
      timestamp:this.timestamp, reference:this.reference, uncertainty:this.uncertainty,
      status:this.status, intervalDays:this.intervalDays, operator:this.operator,
      method:this.method, traceability:this.traceability,
      expired:this.isExpired(), daysUntilExpiry:this.daysUntilExpiry(),
      history:this.history.slice(-10)
    };
  }
}

export class CalibrationManager {
  constructor(){ this.cals=new Map(); }
  set(id, cal){ this.cals.set(id, cal instanceof Calibration ? cal : new Calibration(cal)); }
  get(id){ return this.cals.get(id); }
  list(){ return [...this.cals.entries()].map(([id,cal])=>({id, ...cal.toJSON()})); }
  checkAll(){
    const expired=[]; for(const [id,cal] of this.cals){ if(cal.isExpired()) expired.push(id); }
    return {expired, total:this.cals.size, ok:this.cals.size-expired.length};
  }
}
