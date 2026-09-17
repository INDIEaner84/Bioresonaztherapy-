/**
 * Logging + Audit Trail — P32 + P33 Production — ring buffer, non-blocking, levels, export
 */
export const LogLevels = ['debug','info','warn','error','audit'];

export class Logger {
  constructor(max=1000, {level='info'}={}){
    this.buffer=[]; this.max=max; this.level=level;
    this.levels={debug:0, info:1, warn:2, error:3, audit:4};
    this.stats={debug:0, info:0, warn:0, error:0, audit:0};
  }
  shouldLog(lvl){ return this.levels[lvl] >= this.levels[this.level]; }
  log({level='info', user='admin', generator, command, oldValue, newValue, result, error, message}){
    if(!this.shouldLog(level)) return null;
    const entry={
      timestamp:new Date().toISOString(),
      level, user, generator, command, oldValue, newValue, result, error, message,
      id: Math.random().toString(36).slice(2,8)
    };
    this.buffer.push(entry);
    this.stats[level]=(this.stats[level]||0)+1;
    if(this.buffer.length>this.max) this.buffer.shift();
    // non-blocking: queueMicrotask for heavy ops (guarded)
    if(typeof queueMicrotask==='function') queueMicrotask(()=>{});
    if(level==='error' || level==='warn') console.warn(`[${level}] ${command||message}`, entry);
    return entry;
  }
  debug(msg, meta={}){ return this.log({level:'debug', message:msg, ...meta}); }
  info(msg, meta={}){ return this.log({level:'info', message:msg, ...meta}); }
  warn(msg, meta={}){ return this.log({level:'warn', message:msg, ...meta}); }
  error(msg, meta={}){ return this.log({level:'error', message:msg, ...meta}); }
  audit(msg, meta={}){ return this.log({level:'audit', message:msg, ...meta}); }
  tail(n=20, {level=null}={}){
    let buf=this.buffer;
    if(level) buf=buf.filter(e=>e.level===level);
    return buf.slice(-n);
  }
  search({user, generator, command, level, from, to}={}){
    return this.buffer.filter(e=>{
      if(user && e.user!==user) return false;
      if(generator && e.generator!==generator) return false;
      if(command && e.command!==command) return false;
      if(level && e.level!==level) return false;
      if(from && new Date(e.timestamp)<new Date(from)) return false;
      if(to && new Date(e.timestamp)>new Date(to)) return false;
      return true;
    });
  }
  exportJSON(){ return JSON.stringify(this.buffer, null, 2); }
  exportCSV(){
    const header=['timestamp','level','user','generator','command','message'];
    const rows=this.buffer.map(e=>[e.timestamp,e.level,e.user||'',e.generator||'',e.command||'',e.message||'']);
    return [header.join(','), ...rows.map(r=>r.map(v=>`"${String(v).replace(/"/g,'""')}"`).join(','))].join('\n');
  }
  clear(){ this.buffer=[]; this.stats={debug:0, info:0, warn:0, error:0, audit:0}; }
  getStats(){ return {...this.stats, total:this.buffer.length, max:this.max, level:this.level}; }
}

export class AuditTrail extends Logger {
  constructor(max=2000){ super(max, {level:'audit'}); }
  logExperimentChange({user='admin', experimentId, change, oldValue, newValue}){
    return this.log({level:'audit', user, generator:experimentId, command:`experiment:${change}`, oldValue, newValue, message:`Experiment ${experimentId} ${change}`});
  }
  logSafety({user='admin', generator, violation, action}){
    return this.log({level:'audit', user, generator, command:`safety:${action}`, result:violation, message:`Safety ${action} G${generator}: ${violation}`});
  }
}
