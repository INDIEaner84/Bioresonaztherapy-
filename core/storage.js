/**
 * Storage & Limits — P14 Production Hardening + IndexedDB + Versioning
 * Long-running experiments, offline support, migration
 */
export class StorageManager {
  constructor({maxVersions=100, maxExperiments=50, maxSamples=48000*60*10, backend='memory'}={}){
    this.maxVersions=maxVersions; this.maxExperiments=maxExperiments; this.maxSamples=maxSamples;
    this.backend=backend;
    this.db=new Map(); // in-mem primary, IndexedDB secondary if available
    this.migrations=[];
    this.stats={saves:0, loads:0, evictions:0};
    // try IndexedDB in browser
    this.idb=null;
    if(typeof indexedDB!=='undefined'){
      try{
        const req=indexedDB.open('biorez-s2',2);
        req.onupgradeneeded=e=>{
          const db=e.target.result;
          if(!db.objectStoreNames.contains('experiments')) db.createObjectStore('experiments',{keyPath:'id'});
          if(!db.objectStoreNames.contains('samples')) db.createObjectStore('samples',{keyPath:'id'});
        };
        req.onsuccess=e=>{ this.idb=e.target.result; this.backend='idb'; };
      }catch(_e){ /* ignore */ }
    }
    // localStorage fallback for Node testing
    this.ls = typeof localStorage!=='undefined' ? localStorage : {getItem:()=>null,setItem:()=>{},removeItem:()=>{}};
  }
  addMigration(version, fn){ this.migrations.push({version, fn}); this.migrations.sort((a,b)=>a.version-b.version); }
  migrate(exp){
    const v=exp.version||1;
    for(const m of this.migrations){ if(m.version>v){ exp=m.fn(exp); exp.version=m.version; } }
    return exp;
  }
  saveExperiment(exp){
    if(!exp || !exp.id) throw new Error('experiment id required');
    exp = this.migrate(exp);
    if(this.db.size >= this.maxExperiments){
      const oldest=[...this.db.keys()][0];
      this.db.delete(oldest);
      this.stats.evictions++;
      // idb eviction
      if(this.idb){
        try{ const tx=this.idb.transaction('experiments','readwrite'); tx.objectStore('experiments').delete(oldest); }catch(_e){ /* ignore */ }
      }
    }
    if(exp.history && exp.history.length > this.maxVersions){
      exp.history = exp.history.slice(-this.maxVersions);
    }
    // deep clone to avoid mutation
    const clone=JSON.parse(JSON.stringify(exp));
    this.db.set(exp.id, clone);
    this.stats.saves++;
    if(this.idb){
      try{ const tx=this.idb.transaction('experiments','readwrite'); tx.objectStore('experiments').put(clone); }catch(_e){ /* ignore */ }
    } else {
      try{ this.ls.setItem(`exp-${exp.id}`, JSON.stringify(clone).slice(0,5000000)); }catch(_e){ /* ignore */ }
    }
    return {ok:true, stored:exp.id, remaining:this.maxExperiments - this.db.size, stats:this.stats};
  }
  loadExperiment(id){
    this.stats.loads++;
    if(this.db.has(id)) return this.db.get(id);
    try{
      const raw=this.ls.getItem(`exp-${id}`);
      if(raw){ const parsed=JSON.parse(raw); this.db.set(id, parsed); return parsed; }
    }catch(_e){ /* ignore */ }
    return null;
  }
  listExperiments(){ return [...this.db.values()].map(e=>({id:e.id, version:e.version, ts:e.metadata?.created||e.history?.[0]?.ts, name:e.metadata?.name||e.id})); }
  deleteExperiment(id){
    this.db.delete(id);
    if(this.idb){ try{ const tx=this.idb.transaction('experiments','readwrite'); tx.objectStore('experiments').delete(id); }catch(_e){ /* ignore */ } }
    try{ this.ls.removeItem(`exp-${id}`);}catch(_e){ /* ignore */ }
    return {ok:true};
  }
  checkLimits(samplesLength){
    if(samplesLength > this.maxSamples) return {ok:false, reason:`storage limit ${this.maxSamples} samples exceeded`, limit:this.maxSamples, actual:samplesLength};
    return {ok:true, remaining:this.maxSamples - samplesLength};
  }
  exportAll(){ return JSON.stringify([...this.db.values()], null, 2); }
  exportOne(id){ const exp=this.loadExperiment(id); return exp? JSON.stringify(exp,null,2): null; }
  getStats(){ return {...this.stats, count:this.db.size, maxExperiments:this.maxExperiments, maxVersions:this.maxVersions, backend:this.backend}; }
}
