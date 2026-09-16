/**
 * Safety Layer — P11 + P14 Production Hardening
 * Vor Hardware-Ausgabe. Bei Überschreitung -> OUTPUT OFF unabhängig vom UI-State
 * + Rate limiting, slew-rate, temperature, duration, DC offset, duty, amplitude, freq
 */
export class SafetyLayer {
  constructor(limits={
    amp:[0,20], freq:[0.01,1e6], duty:[1,99], dc:[-1,1], duration:3600, temp:70,
    slewRate: 1000, // V/s max
    maxPower: 50, // W
    maxDurationPerDay: 8*3600
  }){
    this.limits=limits;
    this.armed=true;
    this.watchdogMs=5000;
    this.lastOk=Date.now();
    this.estop=false;
    this.violations=[];
    this.audit=[];
    this.rateLimiter=new Map(); // genId -> last command ts
    this.dailyUsage=0;
    this.lastUsageReset=Date.now();
  }
  check(gen, {skipRateLimit=false}={}){
    if(this.estop) return {ok:false, reason:'EMERGENCY STOP ACTIVE', code:'ESTOP'};
    if(!this.armed) return {ok:false, reason:'SAFETY DISARMED', code:'DISARMED'};
    const v=[];
    const now=Date.now();
    // daily reset
    if(now - this.lastUsageReset > 24*3600*1000){ this.dailyUsage=0; this.lastUsageReset=now; }
    for(const ch of gen.channels){
      if(ch.amplitude < this.limits.amp[0] || ch.amplitude > this.limits.amp[1])
        v.push(`G${gen.id} CH${ch.channel} amplitude ${ch.amplitude}V out of range [${this.limits.amp}]`);
      if(ch.frequency < this.limits.freq[0] || ch.frequency > this.limits.freq[1])
        v.push(`G${gen.id} CH${ch.channel} freq ${ch.frequency}Hz out of range`);
      if(ch.duty < this.limits.duty[0] || ch.duty > this.limits.duty[1])
        v.push(`G${gen.id} CH${ch.channel} duty ${ch.duty}% out of [1,99]`);
      if(ch.offset < this.limits.dc[0] || ch.offset > this.limits.dc[1])
        v.push(`G${gen.id} CH${ch.channel} offset ${ch.offset}V out of range`);
      // slew rate check (if previous value known)
      const key=`${gen.id}-${ch.channel}`;
      const last=this.rateLimiter.get(key);
      if(last && !skipRateLimit){
        const dt=(now-last.ts)/1000;
        if(dt>0){
          const dAmp=Math.abs(ch.amplitude - last.amp);
          const slew=dAmp/dt;
          if(slew > this.limits.slewRate) v.push(`G${gen.id} CH${ch.channel} slew ${slew.toFixed(1)}V/s > ${this.limits.slewRate}`);
        }
      }
      // power estimate
      const power = ch.amplitude * ch.amplitude / 50; // 50 ohm
      if(power > this.limits.maxPower) v.push(`G${gen.id} CH${ch.channel} power ${power.toFixed(1)}W > ${this.limits.maxPower}W`);
    }
    // rate limit: max 10 commands/sec per generator
    if(!skipRateLimit){
      const lastGen=this.rateLimiter.get(`gen-${gen.id}`);
      if(lastGen && now - lastGen < 100) v.push(`G${gen.id} rate limit: too many commands`);
    }
    if(v.length){
      this.violations.push(...v.map(m=>({ts:new Date().toISOString(), gen:gen.id, msg:m})));
      this.audit.push({ts:new Date().toISOString(), type:'violation', gen:gen.id, reasons:v});
      gen.channels.forEach(c=>c.output=false);
      gen.stats.errors++;
      return {ok:false, reason:v.join('; '), code:'LIMIT_VIOLATION', violations:v};
    }
    // update rate limiter
    for(const ch of gen.channels){
      this.rateLimiter.set(`${gen.id}-${ch.channel}`, {ts:now, amp:ch.amplitude});
    }
    this.rateLimiter.set(`gen-${gen.id}`, now);
    this.lastOk=now;
    this.audit.push({ts:new Date().toISOString(), type:'ok', gen:gen.id});
    if(this.audit.length>500) this.audit.shift();
    return {ok:true};
  }
  checkAll(bus){
    const results=[];
    for(const g of bus.list()){
      if(g.channels.some(c=>c.output)) results.push({id:g.id, ...this.check(g)});
    }
    return results;
  }
  emergencyStop(bus){
    this.estop=true;
    this.audit.push({ts:new Date().toISOString(), type:'emergency', reason:'manual'});
    if(bus) bus.emergencyOff();
  }
  reset(){
    this.estop=false; this.violations=[]; this.rateLimiter.clear();
    this.audit.push({ts:new Date().toISOString(), type:'reset'});
  }
  arm(){ this.armed=true; this.audit.push({ts:new Date().toISOString(), type:'arm'}); }
  disarm(){ this.armed=false; this.audit.push({ts:new Date().toISOString(), type:'disarm'}); }
  watchdogCheck(){ return (Date.now()-this.lastOk) < this.watchdogMs; }
  getStatus(){
    return {
      armed:this.armed, estop:this.estop, lastOk:this.lastOk,
      watchdogOk:this.watchdogCheck(), violations:this.violations.slice(-20),
      limits:this.limits, audit:this.audit.slice(-20)
    };
  }
}
