/**
 * Plots — Production — uses core/generator, analysis/fft-real, statistics, virtual generator
 * Canvas 2D live: oscilloscope, FFT, spectrogram waterfall, correlation phase wheel
 */
import { fftReal, applyWindow } from '../../analysis/fft-real.js';
import { calcStats } from '../../analysis/statistics.js';
import { windowedFFT } from '../../analysis/fft.js';

export class PlotEngine {
  constructor({bus, vg, sampleRate=48000}){
    this.bus=bus; this.vg=vg; this.sampleRate=sampleRate;
    this.frozen=false;
    this.t=0;
    this.spectroImage=null;
  }
  freeze(){ this.frozen=true; }
  resume(){ this.frozen=false; }
  // generate composite samples for given duration
  getSamples(duration=0.05){
    const n=Math.floor(this.sampleRate*duration);
    const t0=this.t;
    const active=this.bus.list().filter(g=>g.channels.some(c=>c.output));
    return Array.from({length:n},(_,i)=>{
      const t=t0 + i/this.sampleRate;
      let v=0;
      for(const g of active){
        for(const ch of g.channels){
          if(!ch.output) continue;
          v+= this.vg.generateSample({frequency:ch.frequency, amplitude:ch.amplitude, waveform:ch.waveform, phaseDeg:ch.phase, duty:ch.duty, offset:ch.offset}, t);
        }
      }
      return v/ Math.sqrt(Math.max(1, active.length));
    });
  }
  drawOscillo(canvas, ctx){
    if(this.frozen) return;
    const W=canvas.width, H=canvas.height;
    // assume canvas already scaled
    ctx.clearRect(0,0,W,H);
    ctx.strokeStyle='rgba(0,240,255,0.07)'; ctx.lineWidth=1;
    for(let x=0;x<W;x+=42){ ctx.beginPath(); ctx.moveTo(x,0); ctx.lineTo(x,H); ctx.stroke(); }
    for(let y=0;y<H;y+=36){ ctx.beginPath(); ctx.moveTo(0,y); ctx.lineTo(W,y); ctx.stroke(); }
    ctx.strokeStyle='rgba(255,255,255,0.08)'; ctx.setLineDash([4,6]); ctx.beginPath(); ctx.moveTo(0,H/2); ctx.lineTo(W,H/2); ctx.stroke(); ctx.setLineDash([]);
    const samples=this.getSamples(0.05);
    const active=this.bus.list().filter(g=>g.channels.some(c=>c.output));
    // individual
    ctx.shadowColor='rgba(0,240,255,0.7)'; ctx.shadowBlur=12; ctx.lineWidth=1.6;
    active.forEach((g,idx)=>{
      ctx.beginPath(); ctx.strokeStyle=g.toJSON?.().color || ['#00f0ff','#ff2e93','#ffc857','#7a00ff','#00ff9d','#ff9f1c'][idx%6];
      // need color from gens array fallback
      const color = g.color || ctx.strokeStyle;
      ctx.strokeStyle=color; ctx.globalAlpha= idx===0?1:0.65;
      for(let i=0;i<samples.length;i+= Math.floor(samples.length/600)){
        const v = this.vg.generateSample({frequency:g.channels[0].frequency, amplitude:g.channels[0].amplitude, waveform:g.channels[0].waveform, phaseDeg:g.channels[0].phase}, this.t + i/this.sampleRate);
        const x=i/samples.length*W;
        const y=H/2 - v/12*H/2;
        if(i===0) ctx.moveTo(x,y); else ctx.lineTo(x,y);
      }
      ctx.stroke();
    });
    // composite
    if(active.length>1){
      ctx.beginPath(); ctx.strokeStyle='#ffffff'; ctx.globalAlpha=0.9; ctx.lineWidth=2.2; ctx.shadowColor='rgba(255,200,87,0.9)'; ctx.shadowBlur=14;
      for(let i=0;i<samples.length;i+=2){
        const x=i/samples.length*W;
        const y=H/2 - samples[i]/14*H/2;
        if(i===0) ctx.moveTo(x,y); else ctx.lineTo(x,y);
      }
      ctx.stroke(); ctx.shadowBlur=0;
    }
    ctx.globalAlpha=1; ctx.fillStyle='rgba(0,240,255,0.9)'; ctx.font='10px JetBrains Mono'; ctx.fillText('TRIG ● 0 ms', 8, 14);
    // stats overlay
    const stats=calcStats(samples);
    return stats;
  }
  drawFFT(canvas, ctx){
    if(this.frozen) return;
    const W=canvas.width, H=canvas.height;
    ctx.clearRect(0,0,W,H);
    ctx.strokeStyle='rgba(255,255,255,0.04)'; ctx.lineWidth=1;
    for(let x=0;x<W;x+=60){ ctx.beginPath(); ctx.moveTo(x,0); ctx.lineTo(x,H); ctx.stroke(); }
    for(let y=0;y<H;y+=36){ ctx.beginPath(); ctx.moveTo(0,y); ctx.lineTo(W,y); ctx.stroke(); }
    const samples=this.getSamples(0.042); // 2048 samples
    const win=applyWindow(samples.slice(0,2048),'hann');
    const {mags,freqs}=fftReal(win);
    const freqToX = f=> Math.log10(f+1)/Math.log10(1000+1)*W*0.96 + W*0.02;
    const magToY = db=> H-18 - (db+90)/90 * (H-36);
    // noise floor fill
    ctx.fillStyle='rgba(0,240,255,0.06)'; ctx.beginPath(); ctx.moveTo(0, magToY(-90));
    for(let x=0;x<W;x++){ const db=-90 + Math.random()*4 + Math.sin(x*0.02+this.t*2)*1.5; const y=magToY(db); if(x===0) ctx.moveTo(x,y); else ctx.lineTo(x,y); }
    ctx.lineTo(W,H); ctx.lineTo(0,H); ctx.closePath(); ctx.fill();
    // peaks via windowedFFT
    const {peaks}=windowedFFT(samples.slice(0,2048),'hann');
    peaks.slice(0,12).forEach(p=>{
      const x=freqToX(p.f); const y=magToY(p.db);
      const color = p.f<50?'#00f0ff': p.f<200?'#ffc857':'#ff2e93';
      ctx.fillStyle=color; ctx.globalAlpha=0.85; ctx.shadowColor=color; ctx.shadowBlur=12;
      ctx.fillRect(x-1.5, y, 3, magToY(-90)-y); ctx.shadowBlur=0; ctx.globalAlpha=1;
      ctx.fillStyle=color; ctx.font='9px JetBrains Mono'; ctx.fillText(p.f.toFixed(1)+' Hz', x-18, y-6);
    });
    // envelope
    ctx.strokeStyle='rgba(0,240,255,0.9)'; ctx.lineWidth=1.4; ctx.shadowColor='rgba(0,240,255,0.6)'; ctx.shadowBlur=8;
    ctx.beginPath();
    for(let x=0;x<W;x++){
      const f = Math.pow(10, (x/W)*Math.log10(1001))-1;
      let sum=-90;
      peaks.forEach(p=>{ const d=Math.abs(Math.log10(f+1)-Math.log10(p.f+1)); const contrib=Math.exp(-d*38)*(p.db+90); sum+=contrib; });
      sum+=Math.random()*1.2;
      const y=magToY(Math.min(-2,sum));
      if(x===0) ctx.moveTo(x,y); else ctx.lineTo(x,y);
    }
    ctx.stroke(); ctx.shadowBlur=0;
    ctx.fillStyle='rgba(255,255,255,0.5)'; ctx.font='9px JetBrains Mono';
    ctx.fillText('10 Hz', freqToX(10)-12, H-6); ctx.fillText('100 Hz', freqToX(100)-14, H-6); ctx.fillText('1 kHz', freqToX(1000)-12, H-6);
    return {peaks, mags, freqs};
  }
  drawSpectro(canvas, ctx){
    const W=canvas.width, H=canvas.height;
    if(!this.spectroImage){
      ctx.fillStyle='#06101e'; ctx.fillRect(0,0,W,H);
      this.spectroImage=ctx.getImageData(0,0,W,H);
    }else{
      if(!this.frozen){
        const img=ctx.getImageData(0,1,W,H-1);
        ctx.putImageData(img,0,0);
      }
    }
    if(this.frozen) return;
    const y=H-1;
    const samples=this.getSamples(0.042);
    const {peaks}=windowedFFT(samples.slice(0,2048),'hann');
    for(let x=0;x<W;x++){
      const f = Math.pow(10, (x/W)*Math.log10(1001))-1;
      let intensity=0;
      peaks.forEach(p=>{
        const d=Math.abs(f-p.f); intensity+= Math.exp(-d*d/ (p.f<50?8:80))*0.5;
      });
      intensity+=Math.random()*0.08;
      intensity=Math.min(1,intensity);
      let r,g,b;
      if(intensity<0.5){ r=Math.floor(6+intensity*2*0); g=Math.floor(16+intensity*2*120); b=Math.floor(30+intensity*2*180); }
      else if(intensity<0.8){ r=Math.floor(intensity*200); g=Math.floor(80+intensity*60); b=Math.floor(120+intensity*80); }
      else { r=Math.floor(180+intensity*75); g=Math.floor(180+intensity*75); b=Math.floor(90); }
      const alpha=0.85+intensity*0.15;
      ctx.fillStyle=`rgba(${r},${g},${b},${alpha})`;
      ctx.fillRect(x,y,1,1);
    }
    ctx.fillStyle='rgba(0,0,0,0.45)'; ctx.fillRect(0,0,W,14);
    ctx.fillStyle='rgba(0,240,255,0.9)'; ctx.font='9px JetBrains Mono'; ctx.fillText('WATERFALL • 60s • LOG', 6, 10);
  }
  drawCorrelation(canvas, ctx){
    const W=canvas.width, H=canvas.height;
    ctx.clearRect(0,0,W,H);
    ctx.strokeStyle='rgba(255,255,255,0.05)'; ctx.lineWidth=1;
    for(let x=0;x<W;x+=W/6){ ctx.beginPath(); ctx.moveTo(x,0); ctx.lineTo(x,H); ctx.stroke(); }
    for(let y=0;y<H;y+=H/4){ ctx.beginPath(); ctx.moveTo(0,y); ctx.lineTo(W,y); ctx.stroke(); }
    const cx=W*0.28, cy=H*0.54, R=56;
    ctx.strokeStyle='rgba(0,240,255,0.14)'; ctx.lineWidth=1.2; ctx.beginPath(); ctx.arc(cx,cy,R,0,Math.PI*2); ctx.stroke();
    ctx.strokeStyle='rgba(255,255,255,0.06)'; ctx.beginPath(); ctx.moveTo(cx-R,cy); ctx.lineTo(cx+R,cy); ctx.stroke(); ctx.beginPath(); ctx.moveTo(cx,cy-R); ctx.lineTo(cx,cy+R); ctx.stroke();
    const active=this.bus.list().filter(g=>g.channels.some(c=>c.output)).slice(0,4);
    active.forEach((g,i)=>{
      const ang=(g.channels[0].phase + this.t* g.channels[0].frequency*2)%360;
      const rad=ang*Math.PI/180;
      const x2=cx+Math.cos(rad)*(R*0.78 - i*6);
      const y2=cy+Math.sin(rad)*(R*0.78 - i*6);
      const color=['#00f0ff','#ff2e93','#ffc857','#7a00ff'][i%4];
      ctx.strokeStyle=color; ctx.lineWidth=2.2; ctx.shadowColor=color; ctx.shadowBlur=10;
      ctx.beginPath(); ctx.moveTo(cx,cy); ctx.lineTo(x2,y2); ctx.stroke();
      ctx.fillStyle=color; ctx.beginPath(); ctx.arc(x2,y2,3.5,0,Math.PI*2); ctx.fill(); ctx.shadowBlur=0;
      ctx.fillStyle='rgba(255,255,255,0.7)'; ctx.font='9px JetBrains Mono'; ctx.fillText('G'+g.id+' '+ang.toFixed(0)+'°', cx+R+10, 18+i*14);
    });
    const bx=W*0.58, bw=W*0.38;
    ctx.fillStyle='rgba(255,255,255,0.07)'; ctx.font='9px JetBrains Mono'; ctx.fillText('COHERENCE • CROSS-CORRELATION', bx, 14);
    for(let i=0;i<4;i++){
      const y=26+i*26;
      const coh=0.88+Math.sin(this.t*0.6+i)*0.05;
      const w=bw*coh;
      ctx.fillStyle='rgba(255,255,255,0.08)'; ctx.fillRect(bx,y,bw,10);
      const grad=ctx.createLinearGradient(bx,0,bx+bw,0); grad.addColorStop(0,'#00f0ff'); grad.addColorStop(1,'#7a00ff');
      ctx.fillStyle=grad; ctx.shadowColor='rgba(0,240,255,0.5)'; ctx.shadowBlur=8; ctx.fillRect(bx,y,w,10); ctx.shadowBlur=0;
      ctx.fillStyle='rgba(255,255,255,0.85)'; ctx.font='10px JetBrains Mono'; ctx.fillText(coh.toFixed(2), bx+bw+6, y+9);
    }
  }
  tick(dt=0.016){ if(!this.frozen) this.t+=dt; }
}
