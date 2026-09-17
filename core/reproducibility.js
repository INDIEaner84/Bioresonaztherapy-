/**
 * Reproduzierbarkeit — P21 Production — vollständiger Record + hash + seeds
 */
export function createReproRecord({experiment, bus, clock, env={}, seed=null}){
  const randomSeeds = {
    seed: seed||Math.floor(Math.random()*1e9),
    composer: Math.floor(Math.random()*1e9),
    virtual: Math.floor(Math.random()*1e9),
    timestamp: Date.now()
  };
  // deterministic hash of config
  const configStr=JSON.stringify({generators:bus.list().map(g=>g.toJSON()), signals:experiment.signals, programs:experiment.programs});
  let hash=0; for(let i=0;i<configStr.length;i++){ hash=((hash<<5)-hash)+configStr.charCodeAt(i); hash|=0; }
  const hashHex=Math.abs(hash).toString(16).padStart(8,'0');
  return {
    timestamp: new Date().toISOString(),
    softwareVersion: experiment.metadata?.software || 'BioRezS2 v2.1',
    hash: hashHex,
    hardware: bus.list().map(g=>({id:g.id, model:g.model, firmware:g.firmware||'1.0', calibration:g.calibration_state, serial:g.serial})),
    generatorSettings: bus.list().map(g=>g.toJSON()),
    signalDefinitions: experiment.signals,
    programs: experiment.programs,
    calibration: experiment.calibration,
    sensorConfiguration: {adc:'48k', window:'Hann', fft:2048, bits:16},
    samplingConfiguration: {rate:48000, bits:16, window:'Hann', overlap:0.75},
    environmentalMetadata: {temp:22, humidity:45, pressure:1013, ...env},
    operator: experiment.metadata?.operator || 'admin',
    randomSeeds,
    analysisConfiguration: experiment.analysis,
    clock: clock.getStatus? clock.getStatus() : clock.tick(),
    safety: experiment.safety,
    sync: experiment.sync,
    results: experiment.results,
    provenance: experiment.provenance?.slice(-20)||[],
    version: experiment.version,
    id: experiment.id,
    reproducible: true,
    instructions: `To reproduce: use seed ${randomSeeds.seed}, software ${experiment.metadata?.software||'v2.1'}, hardware ${bus.list().map(g=>g.model).join(',')}, config hash ${hashHex}`
  };
}

export function verifyReproducibility(record, {bus, experiment}){
  const currentHash=(()=>{
    const configStr=JSON.stringify({generators:bus.list().map(g=>g.toJSON()), signals:experiment.signals});
    let hash=0; for(let i=0;i<configStr.length;i++){ hash=((hash<<5)-hash)+configStr.charCodeAt(i); hash|=0; }
    return Math.abs(hash).toString(16).padStart(8,'0');
  })();
  return {
    originalHash: record.hash,
    currentHash,
    match: record.hash===currentHash,
    timestamp: new Date().toISOString(),
    diff: record.hash===currentHash? null : 'config differs'
  };
}
