/**
 * API — P34 Production — REST + WebSocket Live + Mock fallback
 * GET /api/generators, POST /api/generators/:id/config, /start, /stop, /api/health, /api/clock, /api/safety, /ws
 */

export class APIClient {
  constructor({baseUrl='http://localhost:3001', bus=null, mockFallback=true}={}){
    this.baseUrl=baseUrl.replace(/\/$/,'');
    this.bus=bus;
    this.mockFallback=mockFallback;
    this.ws=null;
    this.wsConnected=false;
    this.listeners=new Map();
  }
  async request(path, {method='GET', body=null}={}){
    const url=`${this.baseUrl}${path}`;
    try{
      const res=await fetch(url, {
        method,
        headers: body? {'Content-Type':'application/json'} : {},
        body: body? JSON.stringify(body) : null
      });
      if(!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`);
      const data=await res.json();
      return data;
    }catch(e){
      if(this.mockFallback && this.bus){
        // fallback to bus directly
        console.warn(`[API] fetch failed ${path}, using mock fallback:`, e.message);
        if(path==='/api/generators') return this.bus.list().map(g=>g.toJSON());
        if(path.startsWith('/api/generators/')){
          const id=parseInt(path.split('/')[3]);
          const g=this.bus.get(id);
          if(!g) throw new Error('not found');
          if(path.endsWith('/config') && method==='POST'){
            Object.assign(g.channels[0], body);
            return {ok:true, generator:g.toJSON()};
          }
          if(path.endsWith('/start')){ g.channels[0].output=true; return {ok:true}; }
          if(path.endsWith('/stop')){ g.channels[0].output=false; return {ok:true}; }
          return g.toJSON();
        }
        if(path==='/api/health') return {cpu:'42', ram:'68 MB', version:'2.1 mock'};
        throw e;
      }
      throw e;
    }
  }
  getGenerators(){ return this.request('/api/generators'); }
  getGenerator(id){ return this.request(`/api/generators/${id}`); }
  postConfig(id, patch){ return this.request(`/api/generators/${id}/config`, {method:'POST', body:patch}); }
  start(id){ return this.request(`/api/generators/${id}/start`, {method:'POST'}); }
  stop(id){ return this.request(`/api/generators/${id}/stop`, {method:'POST'}); }
  sync(phase=0){ return this.request('/api/generators/sync', {method:'POST', body:{phase}}); }
  getHealth(){ return this.request('/api/health'); }
  getClock(){ return this.request('/api/clock'); }
  getSafety(){ return this.request('/api/safety'); }
  emergency(){ return this.request('/api/safety/emergency', {method:'POST'}); }
  getExperiment(){ return this.request('/api/experiment'); }
  getMeasurement(duration=0.1){ return this.request(`/api/measurement?duration=${duration}`); }
  getFFT(){ return this.request('/api/analysis/fft'); }

  // WebSocket live
  connectWS({onData=null, onOpen=null, onClose=null}={}){
    if(this.ws) this.ws.close();
    const wsUrl=this.baseUrl.replace('http','ws')+'/ws';
    try{
      const ws=new WebSocket(wsUrl);
      this.ws=ws;
      ws.onopen=()=>{ this.wsConnected=true; onOpen?.(); this.emit('open',{}); };
      ws.onclose=()=>{ this.wsConnected=false; onClose?.(); this.emit('close',{}); setTimeout(()=>this.connectWS({onData,onOpen,onClose}), 3000); };
      ws.onmessage=e=>{
        try{
          const data=JSON.parse(e.data);
          onData?.(data);
          this.emit('data',data);
        }catch(_e){ /* ignore */ }
      };
      ws.onerror=()=>{ this.wsConnected=false; };
      return ws;
    }catch(e){
      console.warn('[API] WS not available, using mock stream', e.message);
      // mock stream via bus
      let t=0;
      setInterval(()=>{
        const samples=Array.from({length:256},()=> Math.sin(2*Math.PI*40*t/48000)*5 + (Math.random()*2-1)*0.2);
        t+=256;
        const data={t:Date.now(), samples, stats:{rms:3.4}, ring:{size:2400}};
        onData?.(data);
        this.emit('data',data);
      }, 50);
      return null;
    }
  }
  on(event, cb){
    if(!this.listeners.has(event)) this.listeners.set(event,[]);
    this.listeners.get(event).push(cb);
  }
  emit(event, data){ (this.listeners.get(event)||[]).forEach(cb=>{ try{cb(data);}catch(_e){ /* ignore */ } }); }
}

export class MockAPI extends APIClient {
  constructor(bus){
    super({bus, mockFallback:true});
    this.bus=bus;
    this.wsConnected=true;
  }
  getGenerators(){ return this.bus.list().map(g=>g.toJSON()); }
  getGenerator(id){ return this.bus.get(id)?.toJSON(); }
  postConfig(id, patch){
    const g=this.bus.get(id); if(!g) throw new Error('not found');
    g.setChannel(0, patch);
    this.emit('update', {id, patch});
    return {ok:true, provenance:{ts:new Date().toISOString(), generator:id, patch}};
  }
  start(id){ const g=this.bus.get(id); if(g) g.channels.forEach(c=>c.output=true); return {ok:true}; }
  stop(id){ const g=this.bus.get(id); if(g) g.channels.forEach(c=>c.output=false); return {ok:true}; }
  stream(cb){ setInterval(()=> cb({t:Date.now(), samples:Array.from({length:256},()=>Math.random()*2-1)}), 32); }
}
