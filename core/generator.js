/**
 * Generator Abstraction — P3 Hardware Abstraction — Production Grade
 * Unified Interface für alle Generator-Typen + Capability Negotiation + Provenance
 */
export const Waveforms = ['sine','square','triangle','sawtooth','pulse','arbitrary','dc','noise','sweep'];
export const CalibrationStates = ['uncalibrated','calibrated','expired','unknown'];
export const ConnectionTypes = ['virtual','usb','serial','tcp','audio','daq','scpi'];
export const Protocols = ['sim','s2','scpi','midi','artnet'];

export class Generator {
  constructor({
    id, name, manufacturer='S2', model='Virtual', connection='virtual', protocol='sim',
    capabilities={}, sample_rate=48000, clock_source='internal', output_channels=2,
    amplitude_range=[0,20], frequency_range=[0.01, 1e6], phase_resolution=0.1,
    waveform_types=Waveforms, modulation_capabilities=['AM','FM','PM','BURST','SWEEP'],
    calibration_state='calibrated', safety_limits={amp:20, freq:[0.01,1e6], duty:[1,99], dc:[-1,1]},
    firmware='1.0', serial=null
  }={}){
    if(id==null) throw new Error('Generator id required');
    this.id=id; this.name=name||`G${id}`; this.manufacturer=manufacturer; this.model=model;
    this.connection=connection; this.protocol=protocol; this.capabilities=capabilities;
    this.sample_rate=sample_rate; this.clock_source=clock_source; this.output_channels=output_channels;
    this.amplitude_range=amplitude_range; this.frequency_range=frequency_range;
    this.phase_resolution=phase_resolution; this.waveform_types=waveform_types;
    this.modulation_capabilities=modulation_capabilities;
    this.calibration_state=calibration_state; this.safety_limits=safety_limits;
    this.firmware=firmware; this.serial=serial||`SN-${id}-${Date.now().toString(36)}`;
    this.createdAt=new Date().toISOString();
    this.channels = Array.from({length:output_channels},(_,i)=>({
      channel:i, output:false, frequency:10*(i+1), amplitude:5, waveform:'sine', phase:0, duty:50, offset:0,
      lastUpdate: new Date().toISOString()
    }));
    this.sync=false; this.phaseLock=false; this.group=null;
    this.stats={uptime:0, commands:0, errors:0};
  }
  setChannel(ch, patch){
    const c=this.channels[ch]; if(!c) throw new Error(`channel ${ch} not found on G${this.id}`);
    const before={...c};
    // validate ranges
    if(patch.frequency!==undefined){
      const [fmin,fmax]=this.frequency_range;
      if(patch.frequency < fmin || patch.frequency > fmax) throw new Error(`frequency ${patch.frequency} out of range [${fmin},${fmax}]`);
    }
    if(patch.amplitude!==undefined){
      const [amin,amax]=this.amplitude_range;
      if(patch.amplitude < amin || patch.amplitude > amax) throw new Error(`amplitude ${patch.amplitude} out of range`);
    }
    if(patch.duty!==undefined && (patch.duty < 1 || patch.duty > 99)) throw new Error('duty 1-99');
    if(patch.waveform!==undefined && !this.waveform_types.includes(patch.waveform)) throw new Error(`waveform ${patch.waveform} not supported`);
    Object.assign(c, patch, {lastUpdate:new Date().toISOString()});
    this.stats.commands++;
    return {before, after:c};
  }
  setAllChannels(patch){ return this.channels.map((_,i)=>this.setChannel(i,patch)); }
  outputOn(ch=0){ return this.setChannel(ch,{output:true}); }
  outputOff(ch=0){ return this.setChannel(ch,{output:false}); }
  outputOffAll(){ this.channels.forEach(c=>c.output=false); }
  toJSON(){
    return {
      id:this.id, name:this.name, manufacturer:this.manufacturer, model:this.model,
      connection:this.connection, protocol:this.protocol, capabilities:this.capabilities,
      sample_rate:this.sample_rate, clock_source:this.clock_source, output_channels:this.output_channels,
      amplitude_range:this.amplitude_range, frequency_range:this.frequency_range,
      phase_resolution:this.phase_resolution, waveform_types:this.waveform_types,
      modulation_capabilities:this.modulation_capabilities, calibration_state:this.calibration_state,
      safety_limits:this.safety_limits, channels:this.channels, sync:this.sync, phaseLock:this.phaseLock,
      firmware:this.firmware, serial:this.serial, createdAt:this.createdAt, stats:this.stats
    };
  }
  static fromJSON(j){
    const g=new Generator(j);
    g.channels=j.channels||g.channels;
    g.sync=j.sync; g.phaseLock=j.phaseLock;
    return g;
  }
}

export class GeneratorBus {
  constructor({maxGenerators=64}={}){
    this.generators=new Map();
    this.groups=new Map();
    this.listeners=[];
    this.maxGenerators=maxGenerators;
    this.audit=[];
  }
  add(gen){
    if(this.generators.size>=this.maxGenerators) throw new Error(`max generators ${this.maxGenerators} exceeded`);
    if(!(gen instanceof Generator)) throw new Error('must be Generator instance');
    if(this.generators.has(gen.id)) throw new Error(`generator id ${gen.id} already exists`);
    this.generators.set(gen.id, gen);
    this.audit.push({ts:new Date().toISOString(), type:'add', id:gen.id, name:gen.name});
    this.emit('add',gen);
    return gen;
  }
  remove(id){
    const g=this.generators.get(id);
    if(!g) throw new Error(`generator ${id} not found`);
    this.generators.delete(id);
    // remove from groups
    for(const [gname, ids] of this.groups){ this.groups.set(gname, ids.filter(i=>i!==id)); }
    this.audit.push({ts:new Date().toISOString(), type:'remove', id});
    this.emit('remove',g);
    return g;
  }
  get(id){ return this.generators.get(id); }
  list(){ return [...this.generators.values()]; }
  listActive(){ return this.list().filter(g=>g.channels.some(c=>c.output)); }
  createGroup(name, ids){
    if(!name) throw new Error('group name required');
    const invalid=ids.filter(i=>!this.generators.has(i));
    if(invalid.length) throw new Error(`invalid generator ids ${invalid}`);
    this.groups.set(name, [...ids]);
    this.audit.push({ts:new Date().toISOString(), type:'group', name, ids});
    this.emit('group', {name,ids});
    return {name, ids};
  }
  getGroup(name){ return this.groups.get(name); }
  groupsList(){ return [...this.groups.entries()].map(([name,ids])=>({name, ids})); }
  syncAll(phase=0){
    for(const g of this.generators.values()){
      g.channels.forEach(c=>c.phase=phase);
      g.sync=true; g.phaseLock=true;
    }
    this.emit('sync',{phase});
  }
  emergencyOff(){
    for(const g of this.generators.values()) g.outputOffAll();
    this.emit('emergency',{ts:new Date().toISOString()});
  }
  on(cb){ this.listeners.push(cb); return ()=>{ this.listeners=this.listeners.filter(l=>l!==cb); }; }
  emit(type, data){ this.listeners.forEach(cb=>{ try{cb(type,data);}catch(_e){ /* ignore */ } }); }
  toJSON(){ return {generators:this.list().map(g=>g.toJSON()), groups:this.groupsList(), audit:this.audit.slice(-100)}; }
}
