/**
 * App Bootstrap — P9 Dashboard + P10 Experiment — Production
 * Uses real core modules, API client, plots, safety, clock
 */
import { Generator, GeneratorBus } from '../../core/generator.js';
import { SafetyLayer } from '../../core/safety.js';
import { ClockArchitecture } from '../../core/clock.js';
import { VirtualGenerator } from '../../hardware/virtual.js';
import { SignalComposer } from '../../core/signal-composer.js';
import { Experiment, Sequencer, SweepEngine } from '../../core/experiment.js';
import { Calibration, CalibrationManager } from '../../core/calibration.js';
import { StorageManager } from '../../core/storage.js';
import { SystemHealth } from '../../core/health.js';
import { Logger } from '../../core/logging.js';
import { APIClient } from './api.js';
import { PlotEngine } from './plots.js';
import { ADCSensor } from '../../hardware/sensors/adc.js';

export function bootstrap({useAPI=true}={}){
  const bus=new GeneratorBus({maxGenerators:32});
  [
    {id:1,name:'G1 HELIOS',freq:10,color:'#00f0ff'},
    {id:2,name:'G2 AETHER',freq:17,color:'#ff2e93'},
    {id:3,name:'G3 NYX',freq:23,color:'#ffc857'},
    {id:4,name:'G4 ORION',freq:40,color:'#7a00ff'},
    {id:5,name:'G5 VEGA',freq:100,color:'#00ff9d'},
    {id:6,name:'G6 NEBULA',freq:1000,color:'#ff9f1c'}
  ].forEach(c=>{
    const g=new Generator({id:c.id, name:c.name, manufacturer:'S2', model:'Virtual'});
    g.channels[0].frequency=c.freq; g.channels[0].output=c.id!==6; g.color=c.color;
    bus.add(g);
  });
  const safety=new SafetyLayer();
  const clock=new ClockArchitecture();
  const composer=new SignalComposer();
  composer.addSignal({wave:'sine', freq:10, amp:8});
  composer.addSignal({wave:'square', freq:17, amp:5.5});
  composer.addSignal({wave:'triangle', freq:23, amp:4});
  const exp=new Experiment({id:`EXP-${new Date().toISOString().slice(0,10)}-01`, generators:bus.list(), signals:composer.signals});
  const vg=new VirtualGenerator({id:1});
  const adc=new ADCSensor('adc0');
  const storage=new StorageManager();
  const health=new SystemHealth();
  const logger=new Logger();
  const calManager=new CalibrationManager();
  bus.list().forEach(g=> calManager.set(g.id, new Calibration({})));
  const sequencer=new Sequencer([
    {at:0, duration:10, action:'G1 10Hz', type:'freq', generatorId:1},
    {at:10, duration:10, action:'G2 20Hz', type:'freq', generatorId:2},
    {at:20, duration:30, action:'SWEEP 10→1000', type:'sweep'}
  ]);
  const sweep=new SweepEngine({start:10, stop:1000, duration:30, mode:'log'});
  const api=useAPI? new APIClient({bus}) : null;
  const plots=new PlotEngine({bus, vg});

  console.log('[BioRez S2] Boot Production', {
    generators:bus.list().length,
    clock:clock.getStatus(),
    exp:exp.id,
    safety:safety.getStatus(),
    storage:storage.getStats()
  });

  // connect API WS if available
  if(api){
    try{ api.connectWS({onData:(_d)=>{ /* live data */ }}); }catch(_e){ /* ignore */ }
  }

  return {
    bus, safety, clock, composer, exp, vg, adc, storage, health, logger,
    calManager, sequencer, sweep, api, plots,
    version:'2.1.0'
  };
}

// Auto-bootstrap for legacy dashboard compatibility
if(typeof window!=='undefined'){
  window.BioRezBootstrap=bootstrap;
}
