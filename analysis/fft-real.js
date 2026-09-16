/**
 * Real FFT — P8 Production — Cooley-Tukey iterative + windowing + sampleRate param
 */
export function fftReal(samples, {sampleRate=48000}={}){
  const N=samples.length;
  if((N & (N-1))!==0) throw new Error(`FFT size must be power of 2, got ${N}`);
  let j=0;
  const re=[...samples], im=new Array(N).fill(0);
  for(let i=1;i<N;i++){
    let bit=N>>1;
    for(; j&bit; bit>>=1) j^=bit;
    j^=bit;
    if(i<j){ [re[i],re[j]]=[re[j],re[i]]; [im[i],im[j]]=[im[j],im[i]]; }
  }
  for(let len=2; len<=N; len<<=1){
    const ang=2*Math.PI/len * -1;
    const wlenRe=Math.cos(ang), wlenIm=Math.sin(ang);
    for(let i=0;i<N;i+=len){
      let wRe=1,wIm=0;
      for(let k=0;k<len/2;k++){
        const uRe=re[i+k], uIm=im[i+k];
        const vRe=re[i+k+len/2]*wRe - im[i+k+len/2]*wIm;
        const vIm=re[i+k+len/2]*wIm + im[i+k+len/2]*wRe;
        re[i+k]=uRe+vRe; im[i+k]=uIm+vIm;
        re[i+k+len/2]=uRe-vRe; im[i+k+len/2]=uIm-vIm;
        const tRe=wRe*wlenRe - wIm*wlenIm;
        const tIm=wRe*wlenIm + wIm*wlenRe;
        wRe=tRe; wIm=tIm;
      }
    }
  }
  const mags=re.map((r,i)=> 20*Math.log10(Math.hypot(r,im[i])/N + 1e-12));
  const freqs=re.map((_,i)=> i*sampleRate/N);
  const phases=re.map((r,i)=> Math.atan2(im[i], r));
  return {re,im,mags,freqs,phases,N,sampleRate};
}

export function applyWindow(samples, type='hann'){
  const N=samples.length;
  if(N<2) return [...samples];
  const win = type==='hann'? samples.map((v,i)=> v*0.5*(1-Math.cos(2*Math.PI*i/(N-1))))
    : type==='hamming'? samples.map((v,i)=> v*(0.54-0.46*Math.cos(2*Math.PI*i/(N-1))))
    : type==='blackman'? samples.map((v,i)=> v*(0.42-0.5*Math.cos(2*Math.PI*i/(N-1))+0.08*Math.cos(4*Math.PI*i/(N-1))))
    : type==='flatTop'? samples.map((v,i)=> v*(1-1.93*Math.cos(2*Math.PI*i/(N-1))+1.29*Math.cos(4*Math.PI*i/(N-1))-0.388*Math.cos(6*Math.PI*i/(N-1))+0.032*Math.cos(8*Math.PI*i/(N-1))))
    : samples;
  return win;
}

export function zeroPad(samples, targetN){
  if(samples.length>=targetN) return samples.slice(0,targetN);
  return [...samples, ...new Array(targetN-samples.length).fill(0)];
}
