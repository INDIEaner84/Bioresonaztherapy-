/**
 * Statistics — P8 Production — mean, var, std, rms, peak, pp, crest, kurtosis, skewness, thd, snr
 */
export function calcStats(samples){
  if(!samples || samples.length===0) throw new Error('samples required');
  const n=samples.length;
  const mean = samples.reduce((a,b)=>a+b,0)/n;
  const variance = samples.reduce((a,b)=>a+(b-mean)**2,0)/n;
  const std = Math.sqrt(variance);
  const rms = Math.sqrt(samples.reduce((a,b)=>a+b*b,0)/n);
  const absVals=samples.map(v=>Math.abs(v));
  const peak = Math.max(...absVals);
  const max=Math.max(...samples), min=Math.min(...samples);
  const pp = max-min;
  const crest = peak / (rms||1);
  const sum3 = samples.reduce((a,b)=>a+Math.pow((b-mean)/ (std||1),3),0)/n;
  const sum4 = samples.reduce((a,b)=>a+Math.pow((b-mean)/ (std||1),4),0)/n;
  // SNR estimation: signal power vs noise (assume noise floor from min variance)
  const signalPower = rms*rms;
  const noisePower = variance*0.1; // heuristic
  const snr = 10*Math.log10(signalPower/(noisePower||1e-12));
  return {mean, variance, std, rms, peak, pp, crest, kurtosis:sum4, skewness:sum3, min, max, snr, n};
}

export function thd(fundamentalDb, harmonicDbs){
  if(!harmonicDbs || harmonicDbs.length===0) return 0;
  const fund = Math.pow(10, fundamentalDb/20);
  const harm = Math.sqrt(harmonicDbs.reduce((a,db)=>a+Math.pow(10, db/10),0));
  return (harm/(fund||1))*100;
}

export function thdFromPeaks(peaks){
  if(!peaks || peaks.length<2) return 0;
  const fund=peaks[0];
  const harms=peaks.slice(1).filter(p=> p.f % fund.f < fund.f*0.02 || Math.abs(p.f/fund.f - Math.round(p.f/fund.f))<0.02);
  const fundMag=Math.pow(10, fund.db/20);
  const harmPower=harms.reduce((a,p)=>a+Math.pow(10, p.db/10),0);
  return Math.sqrt(harmPower)/(fundMag||1)*100;
}

export function snrFromFFT(mags, peakBin, noiseBins=100){
  const signal=mags[peakBin]||-999;
  const noiseAvg = mags.slice(0, noiseBins).reduce((a,b)=>a+b,0)/noiseBins;
  return signal - noiseAvg;
}
