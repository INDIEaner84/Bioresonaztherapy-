/**
 * Spooky2 Hardware Adapter — Real Generator Anbindung via s2 CLI Bridge — Production
 * Architektur: Browser -> Control API (backend/server.js) -> s2 CLI -> /dev/ttyUSBx -> Spooky2 XM
 * Unterstützt: s2 status, s2 run, s2 control, s2 scan
 * SafetyLayer immer davor
 */
import { Generator } from '../core/generator.js';
import { spawn } from 'child_process';
import { existsSync } from 'fs';

export class Spooky2Adapter {
  constructor({s2Path='s2', simulation=true, timeoutMs=5000}={}){
    this.s2Path=s2Path;
    this.simulation=simulation;
    this.timeoutMs=timeoutMs;
    this.lastStatus=null;
    this.connected=false;
    // auto-detect s2 binary
    if(!simulation){
      if(!existsSync(s2Path)){
        const alt=['./build/s2','./s2','/usr/local/bin/s2','/usr/bin/s2'];
        for(const p of alt){ if(existsSync(p)){ this.s2Path=p; break; } }
      }
    }
  }
  async exec(args){
    if(this.simulation){
      return {code:0, stdout:`SIM ${args.join(' ')}`, stderr:'', simulated:true};
    }
    return new Promise((resolve)=>{
      const p=spawn(this.s2Path, args, {timeout:this.timeoutMs});
      let out='', err='';
      p.stdout.on('data',d=>out+=d);
      p.stderr.on('data',d=>err+=d);
      p.on('close',code=> resolve({code, stdout:out, stderr:err}));
      p.on('error',e=> resolve({code:-1, stdout:'', stderr:e.message, error:true}));
      setTimeout(()=>{ try{p.kill();}catch(_e){ /* ignore */ } resolve({code:-1, stdout:out, stderr:'timeout', timeout:true}); }, this.timeoutMs);
    });
  }
  async status(){
    if(this.simulation) return [{id:0, name:'S2-SIM', status:'Available', model:'Virtual', port:'/dev/ttySIM0'}];
    const res=await this.exec(['status']);
    this.lastStatus=res.stdout;
    this.connected=res.code===0 && res.stdout.includes('Generator');
    if(!this.connected) return [{id:0, status:'Disconnected', raw:res.stdout||res.stderr}];
    // parse s2 status output: "Generator 0 Available ..." etc.
    const gens=[];
    const lines=res.stdout.split('\n');
    for(const line of lines){
      const m=line.match(/Generator\s+(\d+).*?(Available|InUse|Disconnected)/i);
      if(m){
        const id=parseInt(m[1]); const status=m[2];
        gens.push({id, status, raw:line, port: (line.match(/\/dev\/\S+/)||[''])[0]});
      }
    }
    return gens.length? gens : [{id:0, status:'Available', raw:res.stdout}];
  }
  async scan(){
    const res=await this.exec(['scan']);
    return {ok:res.code===0, output:res.stdout, error:res.stderr};
  }
  // Erstellt Generator-Objekte für erkannte Hardware
  async discover(bus){
    const found=await this.status();
    const available=found.filter(g=>g.status==='Available');
    const created=[];
    for(const g of available){
      if(bus.get(g.id)) continue;
      const gen=new Generator({
        id:g.id, name:`S2 HW G${g.id} (${g.port||'USB'})`, manufacturer:'Spooky2', model:'XM',
        connection:'USB', protocol:'S2', sample_rate:48000, calibration_state:'unknown',
        serial:g.port||`S2-${g.id}`
      });
      gen.hardware=true; gen.port=g.port;
      bus.add(gen);
      created.push(gen);
    }
    return created;
  }
  async sendCommand(generatorId, channel, {frequency, amplitude, waveform, output, duty, offset}){
    if(this.simulation){
      console.log(`[Spooky2 SIM] G${generatorId} CH${channel} f=${frequency}Hz amp=${amplitude}V wf=${waveform} out=${output}`);
      return {ok:true, simulated:true, command:{generatorId, channel, frequency, amplitude, waveform, output}};
    }
    const args=['control', `generator=${generatorId}`, `channel=${channel}`];
    if(frequency!==undefined) args.push(`frequency=${frequency}Hz`);
    if(amplitude!==undefined) args.push(`amplitude=${amplitude}V`);
    if(waveform) args.push(`waveform=${waveform}`);
    if(duty!==undefined) args.push(`duty=${duty}%`);
    if(offset!==undefined) args.push(`offset=${offset}V`);
    args.push(`output=${output?'on':'off'}`);
    const res=await this.exec(args);
    return {ok:res.code===0, code:res.code, stdout:res.stdout, stderr:res.stderr, command:args.join(' ')};
  }
  async runProgram(generatorId, presetPath, {simulation=this.simulation}={}){
    const args=['run', `generator=${generatorId}`, `preset=${presetPath}`];
    if(simulation) args.push('simulation=on');
    const res=await this.exec(args);
    return {ok:res.code===0, stdout:res.stdout, stderr:res.stderr};
  }
  getStatus(){ return {connected:this.connected, s2Path:this.s2Path, simulation:this.simulation, lastStatus:this.lastStatus}; }
}
