/**
 * Analysis Engine — P8 Production — uses real FFT
 */
import { fftReal } from './fft-real.js';

export function hann(N){ return Array.from({length:N},(_,n)=>0.5*(1-Math.cos(2*Math.PI*n/(N-1)))); }
export function hamming(N){ return Array.from({length:N},(_,n)=>0.54-0.46*Math.cos(2*Math.PI*n/(N-1))); }
export function blackman(N){ return Array.from({length:N},(_,n)=>0.42-0.5*Math.cos(2*Math.PI*n/(N-1))+0.08*Math.cos(4*Math.PI*n/(N-1))); }
export function flatTop(N){
  return Array.from({length:N},(_,n)=>1-1.93*Math.cos(2*Math.PI*n/(N-1))+1.29*Math.cos(4*Math.PI*n/(N-1))-0.388*Math.cos(6*Math.PI*n/(N-1))+0.032*Math.cos(8*Math.PI*n/(N-1)));
}

export function windowedFFT(samples, window='hann'){
  const N=samples.length;
  let winFunc;
  if(window==='hann') winFunc=hann(N);
  else if(window==='hamming') winFunc=hamming(N);
  else if(window==='blackman') winFunc=blackman(N);
  else if(window==='flatTop') winFunc=flatTop(N);
  else winFunc=Array(N).fill(1);
  const win = samples.map((v,i)=>v*winFunc[i]);
  // use real FFT
  const {mags, freqs, re, im} = fftReal(win);
  // peak detection
  const peaks=[];
  for(let i=1;i<mags.length/2-1;i++){
    if(mags[i]>mags[i-1] && mags[i]>mags[i+1] && mags[i]>-60){
      peaks.push({bin:i, f:freqs[i], db:mags[i], mag:Math.pow(10,mags[i]/20), re:re[i], im:im[i]});
    }
  }
  peaks.sort((a,b)=>b.mag-a.mag);
  return {window, N, win, mags, freqs, re, im, peaks:peaks.slice(0,20)};
}

export function detectHarmonics(peaks, {fundamentalTol=0.02, maxHarm=5}={}){
  if(!peaks.length) return {fundamental:[], harmonics:[], im:[]};
  const sorted=[...peaks].sort((a,b)=>b.mag-a.mag);
  const fundamental=sorted[0];
  const harmonics=[];
  const im=[];
  for(let h=2;h<=maxHarm;h++){
    const expected=fundamental.f*h;
    const found=peaks.find(p=> Math.abs(p.f-expected)/expected < fundamentalTol);
    if(found) harmonics.push({...found, harmonic:h, type:'harmonic'});
  }
  // intermodulation: f1+f2, |f1-f2|
  if(peaks.length>=2){
    const f1=peaks[0].f, f2=peaks[1].f;
    const sum=f1+f2, diff=Math.abs(f1-f2);
    const sumPeak=peaks.find(p=> Math.abs(p.f-sum)/sum < 0.03);
    const diffPeak=peaks.find(p=> Math.abs(p.f-diff)/(diff||1) < 0.05);
    if(sumPeak) im.push({...sumPeak, type:'IM', formula:'f1+f2'});
    if(diffPeak) im.push({...diffPeak, type:'IM', formula:'|f1-f2|'});
  }
  return {fundamental:[{...fundamental, type:'fundamental'}], harmonics, im};
}

export function coherence(a,b){
  // normalized cross-correlation coherence 0-1
  if(a.length!==b.length || a.length===0) return 0;
  const meanA=a.reduce((s,v)=>s+v,0)/a.length;
  const meanB=b.reduce((s,v)=>s+v,0)/b.length;
  let num=0, denA=0, denB=0;
  for(let i=0;i<a.length;i++){ const da=a[i]-meanA, db=b[i]-meanB; num+=da*db; denA+=da*da; denB+=db*db; }
  const denom=Math.sqrt(denA*denB);
  return denom===0?0: Math.abs(num/denom);
}

export function spectrogram(samples, {windowSize=2048, overlap=0.75, window='hann', sampleRate=48000}={}){
  const step=Math.floor(windowSize*(1-overlap));
  const frames=[];
  for(let i=0;i+windowSize<=samples.length;i+=step){
    const slice=samples.slice(i,i+windowSize);
    const {mags, freqs, peaks}=windowedFFT(slice, window);
    frames.push({t:i/sampleRate, mags, freqs, peaks});
  }
  return frames;
}
