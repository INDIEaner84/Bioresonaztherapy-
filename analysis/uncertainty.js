/**
 * Uncertainty Modell — P24 Production — GUM, confidence, error bars, propagation
 */
export function uncertaintyFor({type='estimated', calibration='calibrated', snrDb=38, coverageFactor=2}={}){
  const map={
    calibrated: {confidence:0.95, label:'CALIBRATED', color:'#00f0ff', k:2, std:0.02},
    estimated: {confidence:0.82, label:'ESTIMATED', color:'#ffc857', k:1.5, std:0.05},
    simulated: {confidence:0.65, label:'SIMULATED', color:'#ff2e93', k:1, std:0.1},
    derived: {confidence:0.75, label:'DERIVED', color:'#7a00ff', k:1.2, std:0.08},
    measurement: {confidence:0.92, label:'MEASUREMENT', color:'#00ff9d', k:2, std:0.03}
  };
  const base=map[type]||map.estimated;
  // SNR adjustment: higher SNR -> higher confidence
  const adj = Math.min(0.99, base.confidence + (snrDb-30)*0.005);
  // calibration penalty
  let calPenalty=0;
  if(calibration==='expired') calPenalty=0.15;
  if(calibration==='uncalibrated') calPenalty=0.25;
  if(calibration==='unknown') calPenalty=0.35;
  const finalConf=Math.max(0.1, adj - calPenalty);
  return {
    ...base,
    confidence:finalConf,
    snrDb,
    calibration,
    coverageFactor: coverageFactor||base.k,
    uncertainty: `±${((1-finalConf)*100).toFixed(1)}%`,
    method:'GUM',
    traceability: calibration==='calibrated'?'PTB 10MHz':'none'
  };
}

export function errorBar(value, confidence){
  const err = value*(1-confidence)*0.5;
  return {value, lower:value-err, upper:value+err, confidence, error:err, rel: err/(value||1)};
}

export function propagateUncertainty(values, uncertainties){
  // root sum square
  if(values.length!==uncertainties.length) throw new Error('values and uncertainties length mismatch');
  const sumSq=uncertainties.reduce((a,u)=>a+u*u,0);
  return Math.sqrt(sumSq);
}

export function confidenceInterval(samples, confidence=0.95){
  const n=samples.length;
  const mean=samples.reduce((a,b)=>a+b,0)/n;
  const std=Math.sqrt(samples.reduce((a,b)=>a+(b-mean)**2,0)/n);
  // t-factor approx 2 for 95%
  const t= confidence>=0.95? 2 : confidence>=0.9? 1.645 : 1;
  const margin=t*std/Math.sqrt(n);
  return {mean, std, margin, lower:mean-margin, upper:mean+margin, confidence, n};
}
