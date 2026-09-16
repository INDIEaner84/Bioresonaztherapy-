/**
 * Backend — Control Plane / Data Plane / Analysis Plane — Production
 * - REST API: /api/generators, /api/generators/:id/config, /start, /stop, /api/experiment, /api/health, /api/safety, /api/clock, /api/provenance
 * - WebSocket: ws://localhost:3001/ws live samples + FFT + stats
 * - Ringbuffer 48k*10s, backpressure, droppedSamples, SafetyLayer, GeneratorBus
 * Run: node backend/server.js (port 3001)
 */
import http from 'http';
import { URL } from 'url';
import { Generator, GeneratorBus } from '../core/generator.js';
import { SafetyLayer } from '../core/safety.js';
import { ClockArchitecture } from '../core/clock.js';
import { VirtualGenerator } from '../hardware/virtual.js';
import { ADCSensor } from '../hardware/sensors/adc.js';
import { calcStats } from '../analysis/statistics.js';
import { fftReal, applyWindow } from '../analysis/fft-real.js';
import { Experiment } from '../core/experiment.js';
import { StorageManager } from '../core/storage.js';
import { Logger } from '../core/logging.js';

// Try ws, fallback mock
let WebSocketServer;
try{
  const wsMod = await import('ws');
  WebSocketServer = wsMod.WebSocketServer;
}catch{
  console.warn('[Control API] ws package not installed, WebSocket disabled — run npm install');
  WebSocketServer = null;
}

const bus=new GeneratorBus({maxGenerators:32});
[
  {id:1,name:'G1 HELIOS',freq:10},
  {id:2,name:'G2 AETHER',freq:17},
  {id:3,name:'G3 NYX',freq:23},
  {id:4,name:'G4 ORION',freq:40},
  {id:5,name:'G5 VEGA',freq:100},
  {id:6,name:'G6 NEBULA',freq:1000}
].forEach(c=>{
  const g=new Generator({id:c.id, name:c.name, manufacturer:'S2', model:'Virtual', connection:'virtual'});
  g.channels[0].frequency=c.freq;
  g.channels[0].output=c.id!==6;
  bus.add(g);
});

const safety=new SafetyLayer();
const clock=new ClockArchitecture();
const vg=new VirtualGenerator({id:1});
const adc=new ADCSensor('adc0');
const storage=new StorageManager();
const logger=new Logger(1000);
const exp=new Experiment({id:`EXP-${new Date().toISOString().slice(0,10)}-01`, generators:bus.list()});

// Ringbuffer 48k * 10s = 480k samples per channel
class RingBuffer {
  constructor(capacity=48000*10){ this.capacity=capacity; this.buffer=new Float32Array(capacity); this.writePtr=0; this.size=0; this.dropped=0; }
  push(samples){
    for(const s of samples){
      if(this.size>=this.capacity){ this.dropped++; this.writePtr=(this.writePtr+1)%this.capacity; this.size--; }
      this.buffer[this.writePtr]=s; this.writePtr=(this.writePtr+1)%this.capacity; this.size++;
    }
  }
  tail(n){ // last n samples
    const out=new Array(Math.min(n,this.size));
    for(let i=0;i<out.length;i++){
      const idx=(this.writePtr - out.length + i + this.capacity)%this.capacity;
      out[i]=this.buffer[idx];
    }
    return out;
  }
  getStats(){ return {capacity:this.capacity, size:this.size, dropped:this.dropped, fill:(this.size/this.capacity*100).toFixed(1)+'%'}; }
}
const ring=new RingBuffer();

const wsClients=new Set();
let sampleInterval=null;

function startSampling(){
  if(sampleInterval) return;
  sampleInterval=setInterval(()=>{
    const samples=adc.acquire(bus, vg, 0.05); // 50ms = 2400 samples
    ring.push(samples);
    // live stats
    const stats=calcStats(samples.slice(-256));
    // FFT every 10th
    let fft=null;
    if(Math.random()<0.1){
      const win=applyWindow(samples.slice(-2048),'hann');
      const {mags,freqs}=fftReal(win);
      let maxI=0,maxV=-999; for(let i=1;i<1024;i++) if(mags[i]>maxV){maxV=mags[i]; maxI=i;}
      fft={peakFreq:freqs[maxI], peakMag:mags[maxI], mags:mags.slice(0,512)};
    }
    const payload={t:Date.now(), stats, fft, ring: ring.getStats(), generators: bus.list().map(g=>({id:g.id, freq:g.channels[0].frequency, amp:g.channels[0].amplitude, output:g.channels[0].output}))};
    // broadcast WS
    for(const ws of wsClients){
      try{
        if(ws.readyState===1) ws.send(JSON.stringify(payload));
        else wsClients.delete(ws);
      }catch{ wsClients.delete(ws); }
    }
    clock.tick();
  }, 50);
}
startSampling();

function json(res, data, status=200){
  res.statusCode=status;
  res.setHeader('Content-Type','application/json');
  res.end(JSON.stringify(data));
}
function parseBody(req){
  return new Promise((resolve,reject)=>{
    let body=''; req.on('data',c=>body+=c); req.on('end',()=>{ try{ resolve(body?JSON.parse(body):{}); }catch(e){ reject(e); } }); req.on('error',reject);
  });
}

// Rate limiting: 100 req/min per IP
const rateLimitMap=new Map();
function checkRateLimit(ip){
  const now=Date.now();
  const entry=rateLimitMap.get(ip)||{count:0, reset:now+60000};
  if(now>entry.reset){ entry.count=0; entry.reset=now+60000; }
  entry.count++;
  rateLimitMap.set(ip,entry);
  // cleanup old entries every 100 requests
  if(rateLimitMap.size>1000){
    for(const [k,v] of rateLimitMap){ if(now>v.reset) rateLimitMap.delete(k); }
  }
  return entry.count<=100;
}

const server=http.createServer(async (req,res)=>{
  const ip=req.socket.remoteAddress||'unknown';
  if(!checkRateLimit(ip)){
    res.statusCode=429;
    res.setHeader('Content-Type','application/json');
    return res.end(JSON.stringify({error:'rate limit exceeded', retryAfter:60}));
  }
  // Security headers
  res.setHeader('Access-Control-Allow-Origin','*');
  res.setHeader('Access-Control-Allow-Methods','GET,POST,PUT,DELETE,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers','Content-Type,Authorization');
  res.setHeader('X-Content-Type-Options','nosniff');
  res.setHeader('X-Frame-Options','DENY');
  res.setHeader('X-XSS-Protection','1; mode=block');
  res.setHeader('Referrer-Policy','no-referrer');
  if(req.method==='OPTIONS'){ res.statusCode=204; return res.end(); }

  const url=new URL(req.url, `http://${req.headers.host}`);
  const path=url.pathname;

  try{
    if(path==='/api/generators' && req.method==='GET'){
      return json(res, bus.list().map(g=>g.toJSON()));
    }
    if(path.match(/^\/api\/generators\/\d+$/) && req.method==='GET'){
      const id=parseInt(path.split('/')[3]);
      const g=bus.get(id); if(!g) return json(res,{error:'not found'},404);
      return json(res, g.toJSON());
    }
    if(path.match(/^\/api\/generators\/\d+\/config$/) && req.method==='POST'){
      const id=parseInt(path.split('/')[3]);
      const g=bus.get(id); if(!g) return json(res,{error:'not found'},404);
      const patch=await parseBody(req);
      // safety check before apply
      const before={...g.channels[0]};
      try{
        if(patch.frequency!==undefined || patch.amplitude!==undefined || patch.duty!==undefined || patch.offset!==undefined){
          const testGen={...g, channels:[{...g.channels[0], ...patch}]};
          const chk=safety.check(testGen);
          if(!chk.ok){ g.channels[0].output=false; logger.log({generator:id, command:'config blocked', oldValue:before, newValue:patch, result:chk}); return json(res,{ok:false, reason:chk.reason, code:chk.code},400); }
        }
        g.setChannel(0, patch);
        logger.log({generator:id, command:'config', oldValue:before, newValue:patch, result:{ok:true}});
        return json(res,{ok:true, generator:g.toJSON(), provenance:{ts:new Date().toISOString(), gen:id, patch}});
      }catch(e){ return json(res,{ok:false, error:e.message},400); }
    }
    if(path.match(/^\/api\/generators\/\d+\/start$/) && req.method==='POST'){
      const id=parseInt(path.split('/')[3]);
      const g=bus.get(id); if(!g) return json(res,{error:'not found'},404);
      const chk=safety.check(g); if(!chk.ok) return json(res,{ok:false, reason:chk.reason},400);
      g.channels[0].output=true; logger.log({generator:id, command:'start'}); return json(res,{ok:true, generator:g.toJSON()});
    }
    if(path.match(/^\/api\/generators\/\d+\/stop$/) && req.method==='POST'){
      const id=parseInt(path.split('/')[3]);
      const g=bus.get(id); if(!g) return json(res,{error:'not found'},404);
      g.channels[0].output=false; logger.log({generator:id, command:'stop'}); return json(res,{ok:true, generator:g.toJSON()});
    }
    if(path==='/api/generators/sync' && req.method==='POST'){
      const body=await parseBody(req); const phase=body.phase||0;
      bus.syncAll(phase); logger.log({command:'sync', newValue:{phase}}); return json(res,{ok:true, phase});
    }
    if(path==='/api/safety' && req.method==='GET'){
      return json(res, safety.getStatus());
    }
    if(path==='/api/safety/emergency' && req.method==='POST'){
      safety.emergencyStop(bus); logger.log({command:'emergency'}); return json(res,{ok:true, estop:true});
    }
    if(path==='/api/safety/reset' && req.method==='POST'){
      safety.reset(); return json(res,{ok:true, estop:false});
    }
    if(path==='/api/clock' && req.method==='GET'){
      return json(res, clock.getStatus());
    }
    if(path==='/api/health' && req.method==='GET'){
      const mem=process.memoryUsage();
      return json(res,{
        cpu: (process.cpuUsage().user/1e6).toFixed(1),
        ram: (mem.heapUsed/1048576).toFixed(1)+' MB',
        rss: (mem.rss/1048576).toFixed(1)+' MB',
        uptime: process.uptime().toFixed(0)+'s',
        version:'2.1.0',
        generators: bus.list().length,
        active: bus.listActive().length,
        ring: ring.getStats(),
        safety: safety.getStatus(),
        clock: clock.getStatus(),
        wsClients: wsClients.size,
        storage: storage.getStats()
      });
    }
    if(path==='/api/experiment' && req.method==='GET'){
      return json(res, exp.snapshot());
    }
    if(path==='/api/experiment' && req.method==='POST'){
      const patch=await parseBody(req);
      const snap=exp.save(patch); storage.saveExperiment(exp); return json(res,{ok:true, experiment:snap});
    }
    if(path==='/api/experiment/export' && req.method==='GET'){
      const format=url.searchParams.get('format')||'json';
      if(format==='csv') { res.setHeader('Content-Type','text/csv'); return res.end(exp.exportCSV(ring.tail(4800))); }
      return json(res, exp.snapshot());
    }
    if(path==='/api/measurement' && req.method==='GET'){
      const dur=parseFloat(url.searchParams.get('duration')||'0.1');
      const samples=adc.acquire(bus, vg, dur);
      const stats=calcStats(samples);
      return json(res,{samples:samples.slice(0,1024), stats, fullLength:samples.length, ring:ring.getStats()});
    }
    if(path==='/api/analysis/fft' && req.method==='GET'){
      const samples=ring.tail(2048);
      if(samples.length<2048) return json(res,{error:'not enough samples'},400);
      const win=applyWindow(samples,'hann');
      const {mags,freqs}=fftReal(win);
      return json(res,{mags: mags.slice(0,1024), freqs: freqs.slice(0,1024), sampleRate:48000});
    }
    if(path==='/api/log' && req.method==='GET'){
      return json(res, logger.tail(50));
    }
    if(path==='/api/storage' && req.method==='GET'){
      return json(res, storage.listExperiments());
    }
    if(path==='/' && req.method==='GET'){
      return json(res,{name:'BioRez S2 Control API', version:'2.1.0', endpoints:['/api/generators','/api/health','/api/clock','/api/safety','/api/experiment','/api/measurement','/api/analysis/fft','/ws'], ws: WebSocketServer?'enabled':'disabled (npm install ws)'});
    }
    return json(res,{error:'not found', path},404);
  }catch(e){
    console.error(e);
    return json(res,{error:e.message, stack:e.stack},500);
  }
});

let wss=null;
if(WebSocketServer){
  wss=new WebSocketServer({server, path:'/ws'});
  wss.on('connection', ws=>{
    wsClients.add(ws);
    ws.send(JSON.stringify({type:'welcome', ts:new Date().toISOString(), generators:bus.list().length}));
    ws.on('close',()=> wsClients.delete(ws));
    ws.on('message', data=>{
      try{
        const msg=JSON.parse(data);
        if(msg.type==='ping') ws.send(JSON.stringify({type:'pong', ts:Date.now()}));
        if(msg.type==='subscribe') ws.send(JSON.stringify({type:'subscribed', channels:msg.channels||['all']}));
      }catch(_e){ /* ignore */ }
    });
  });
  console.log('[WS] WebSocket enabled at /ws');
}

const PORT=process.env.PORT||3001;
server.listen(PORT, '0.0.0.0', ()=> console.log(`[Control API] http://0.0.0.0:${PORT} — mock+real — ${WebSocketServer?'WS enabled':'WS disabled'}`));

// graceful shutdown
process.on('SIGINT',()=>{ console.log('shutting down'); clearInterval(sampleInterval); server.close(()=>process.exit(0)); });
