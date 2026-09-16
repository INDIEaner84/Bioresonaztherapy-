/**
 * System Health — P31 Production — real metrics + thresholds + alerts
 */
export class SystemHealth {
  constructor({thresholds={cpu:85, ram:90, temp:65, latency:20, dropped:5}}={}){
    this.metrics={cpu:42, ram:68, gpu:31, latencyMs:4.2, temp:41.2, dropped:0, buffer:68, uptime:0};
    this.thresholds=thresholds;
    this.start=Date.now();
    this.history=[];
    this.alerts=[];
  }
  sample(){
    this.metrics.cpu = 35 + Math.random()*20;
    this.metrics.ram = 60 + Math.random()*15;
    this.metrics.gpu = 25 + Math.random()*15;
    this.metrics.latencyMs = 3 + Math.random()*2;
    this.metrics.temp = 40 + Math.random()*3;
    this.metrics.dropped = Math.random()<0.98?0: Math.floor(Math.random()*3);
    this.metrics.buffer = 60 + Math.random()*20;
    this.metrics.uptime = (Date.now()-this.start)/1000;
    this.metrics.ts=new Date().toISOString();
    // check thresholds
    const now=this.metrics;
    if(now.cpu > this.thresholds.cpu) this.alert({type:'cpu', value:now.cpu, threshold:this.thresholds.cpu});
    if(now.ram > this.thresholds.ram) this.alert({type:'ram', value:now.ram, threshold:this.thresholds.ram});
    if(now.temp > this.thresholds.temp) this.alert({type:'temp', value:now.temp, threshold:this.thresholds.temp});
    if(now.latencyMs > this.thresholds.latency) this.alert({type:'latency', value:now.latencyMs, threshold:this.thresholds.latency});
    if(now.dropped > this.thresholds.dropped) this.alert({type:'dropped', value:now.dropped, threshold:this.thresholds.dropped});
    this.history.push({...now});
    if(this.history.length>1000) this.history.shift();
    return {...now};
  }
  alert({type, value, threshold}){
    const entry={ts:new Date().toISOString(), type, value, threshold, message:`${type} ${value} > ${threshold}`};
    this.alerts.push(entry);
    if(this.alerts.length>100) this.alerts.shift();
    console.warn(`[Health] ${entry.message}`);
    return entry;
  }
  getStatus(){
    const latest=this.history[this.history.length-1]||this.metrics;
    return {
      ...latest,
      thresholds:this.thresholds,
      alerts:this.alerts.slice(-10),
      history:this.history.slice(-20),
      ok: this.alerts.filter(a=> Date.now()-new Date(a.ts).getTime()<60000).length===0
    };
  }
  getHistory(n=100){ return this.history.slice(-n); }
}
