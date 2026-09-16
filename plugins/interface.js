/**
 * Plugin Interface — P27 Production — Capability Negotiation + Lifecycle
 */
export class PluginInterface {
  constructor(type, id, {version='1.0', author='unknown', capabilities=[]}={}){
    if(!type||!id) throw new Error('type and id required');
    this.type=type; this.id=id; this.version=version; this.author=author;
    this.capabilities=capabilities;
    this.enabled=true; this.initialized=false;
    this.createdAt=new Date().toISOString();
    this.stats={calls:0, errors:0};
  }
  async init(){ this.initialized=true; return {ok:true}; }
  async shutdown(){ this.initialized=false; this.enabled=false; return {ok:true}; }
  hasCapability(cap){ return this.capabilities.includes(cap); }
  toJSON(){ return {type:this.type, id:this.id, version:this.version, author:this.author, capabilities:this.capabilities, enabled:this.enabled, initialized:this.initialized}; }
}

export class GeneratorPlugin extends PluginInterface {
  constructor(id, opts={}){
    super('generator', id, opts);
    this.opts=opts;
  }
  // must implement: open(), close(), write(channel, data), read(), capabilities()
  async open(){ throw new Error('open() not implemented'); }
  async close(){}
  async write(channel, data){ this.stats.calls++; return {ok:true, channel, data}; }
  async read(){ return []; }
  getCapabilities(){ return this.capabilities.length? this.capabilities : ['sine','square','AM','FM']; }
}

export class SensorPlugin extends PluginInterface {
  constructor(id, opts={}){
    super('sensor', id, opts);
    this.opts=opts; this.sampleRate=opts.sampleRate||48000;
  }
  async readSamples(n){ this.stats.calls++; return Array.from({length:n},()=> (Math.random()*2-1)*0.1); }
  async calibrate(){ return {ok:true, ts:new Date().toISOString()}; }
  getUncertainty(){ return {type:'estimated', confidence:0.82}; }
}

export class MeasurementPlugin extends PluginInterface {
  constructor(id, opts={}){ super('measurement', id, opts); }
  async measure(_bus, _sensor){ return {ok:true, samples:[]}; }
}

export class AnalysisPlugin extends PluginInterface {
  constructor(id, opts={}){ super('analysis', id, opts); }
  async analyze(_samples){ return {rms:0, peaks:[]}; }
}

export class ExportPlugin extends PluginInterface {
  constructor(id, opts={}){ super('export', id, opts); }
  async export(data, _format){ this.stats.calls++; return data; }
  getSupportedFormats(){ return ['csv','json','wav','hdf5']; }
}

export class PluginRegistry {
  constructor(){ this.plugins=new Map(); }
  register(plugin){ if(!(plugin instanceof PluginInterface)) throw new Error('must be PluginInterface'); this.plugins.set(plugin.id, plugin); }
  get(id){ return this.plugins.get(id); }
  list(){ return [...this.plugins.values()].map(p=>p.toJSON()); }
  listByType(type){ return [...this.plugins.values()].filter(p=>p.type===type).map(p=>p.toJSON()); }
  async initAll(){ for(const p of this.plugins.values()){ try{ await p.init(); }catch(e){ p.stats.errors++; console.warn(`plugin ${p.id} init failed`, e); } } }
  async shutdownAll(){ for(const p of this.plugins.values()){ try{ await p.shutdown(); }catch(_e){ /* ignore */ } } }
}
