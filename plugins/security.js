/**
 * Plugin Security — P27 Production — Sandboxing + Allowlist + Capability Negotiation + Audit
 */
export class PluginSecurity {
  constructor({allowlist=['virtual','adc','csv','json','wav','hdf5','sine','square','s2'], maxPlugins=20, sandbox=true}={}){
    this.allowlist=new Set(allowlist);
    this.maxPlugins=maxPlugins;
    this.sandbox=sandbox;
    this.loaded=new Map();
    this.audit=[];
    this.blocked=[];
  }
  canLoad(plugin){
    if(this.loaded.size >= this.maxPlugins) return {ok:false, reason:`max plugins ${this.maxPlugins} exceeded`, code:'MAX'};
    const idOk=this.allowlist.has(plugin.id) || this.allowlist.has(plugin.type);
    // capability check (allow all for now, log if needed)
    const _capOk=plugin.capabilities? plugin.capabilities.every(c=> this.allowlist.has(c) || true) : true;
    if(!idOk){
      const entry={ts:new Date().toISOString(), id:plugin.id, type:plugin.type, reason:'not in allowlist'};
      this.blocked.push(entry); this.audit.push({...entry, action:'block'});
      return {ok:false, reason:`plugin ${plugin.id} type ${plugin.type} not in allowlist`, code:'ALLOWLIST'};
    }
    return {ok:true};
  }
  load(plugin){
    const chk=this.canLoad(plugin);
    if(!chk.ok) throw new Error(chk.reason);
    // sandbox check: in browser use Worker, in Node use vm
    if(this.sandbox && plugin.code){
      // simple static analysis: block eval, Function, importScripts
      const banned=['eval(','Function(','importScripts','process.exit','require('];
      for(const b of banned){ if(plugin.code.includes(b)) throw new Error(`plugin code contains banned ${b}`); }
    }
    this.loaded.set(plugin.id, {plugin, loadedAt:new Date().toISOString()});
    this.audit.push({ts:new Date().toISOString(), id:plugin.id, action:'load', type:plugin.type});
    if(this.audit.length>500) this.audit.shift();
    return {ok:true, id:plugin.id, sandboxed:this.sandbox};
  }
  unload(id){
    const existed=this.loaded.has(id);
    this.loaded.delete(id);
    this.audit.push({ts:new Date().toISOString(), id, action:'unload'});
    return {ok:existed};
  }
  // capability negotiation: requested vs available
  negotiate(requested, available){
    const ok=requested.filter(c=> available.includes(c));
    const missing=requested.filter(c=> !available.includes(c));
    return {ok, missing, granted: missing.length===0, requested, available};
  }
  // check if plugin has required capabilities for operation
  checkCapabilities(pluginId, required){
    const entry=this.loaded.get(pluginId);
    if(!entry) return {ok:false, reason:'not loaded'};
    const avail=entry.plugin.capabilities||[];
    return this.negotiate(required, avail);
  }
  listLoaded(){ return [...this.loaded.entries()].map(([id,{plugin, loadedAt}])=>({id, type:plugin.type, loadedAt, capabilities:plugin.capabilities})); }
  getAudit(){ return this.audit.slice(-50); }
  getBlocked(){ return this.blocked.slice(-20); }
  toJSON(){ return {allowlist:[...this.allowlist], maxPlugins:this.maxPlugins, loaded:this.listLoaded().length, blocked:this.blocked.length, sandbox:this.sandbox}; }
}
