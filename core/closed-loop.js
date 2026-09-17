/**
 * Closed Loop — P15 sicher begrenzt — Production PID + Watchdog + E-Stop + Rate Limit
 */
export class ClosedLoopController {
  constructor({target=0, kp=0.5, ki=0.1, kd=0.05, maxOutput=5, minOutput=-5, rateLimit=1, timeoutMs=30000, watchdogMs=5000, integralLimit=10}={}){
    this.target=target; this.kp=kp; this.ki=ki; this.kd=kd;
    this.maxOutput=maxOutput; this.minOutput=minOutput;
    this.rateLimit=rateLimit; // max change per second
    this.timeoutMs=timeoutMs; this.watchdogMs=watchdogMs;
    this.integralLimit=integralLimit;
    this.enabled=false; this.emergency=false;
    this.lastUpdate=Date.now(); this.start=0;
    this.integral=0; this.lastError=0; this.lastOutput=0;
    this.history=[];
  }
  enable(){ this.enabled=true; this.start=Date.now(); this.lastUpdate=Date.now(); this.integral=0; this.lastError=0; this.emergency=false; }
  disable(){ this.enabled=false; }
  emergencyStop(){ this.emergency=true; this.enabled=false; this.lastOutput=0; }
  setTarget(t){ this.target=t; }
  // Simple PID with limits, anti-windup, rate limit
  update(measured){
    const now=Date.now();
    if(!this.enabled || this.emergency) return {output:0, error:0, limited:true, reason:this.emergency?'emergency':'disabled'};
    if(now-this.start > this.timeoutMs) { this.disable(); return {output:0, error:0, limited:true, reason:'timeout'}; }
    if(now-this.lastUpdate > this.watchdogMs) { this.disable(); return {output:0, error:0, limited:true, reason:'watchdog'}; }
    const dt=(now-this.lastUpdate)/1000;
    if(dt<=0) return {output:this.lastOutput, error:this.target-measured, limited:false};
    const error=this.target - measured;
    // P
    const p=this.kp*error;
    // I with anti-windup
    this.integral+=error*dt;
    this.integral=Math.max(-this.integralLimit, Math.min(this.integralLimit, this.integral));
    const i=this.ki*this.integral;
    // D
    const derivative=(error-this.lastError)/dt;
    const d=this.kd*derivative;
    let out=p+i+d;
    // clamp
    out=Math.max(this.minOutput, Math.min(this.maxOutput, out));
    // rate limit
    const maxDelta=this.rateLimit*dt;
    const delta=out-this.lastOutput;
    if(Math.abs(delta)>maxDelta) out=this.lastOutput + Math.sign(delta)*maxDelta;
    this.lastError=error; this.lastOutput=out; this.lastUpdate=now;
    this.history.push({ts:now, measured, error, output:out});
    if(this.history.length>500) this.history.shift();
    return {output:out, error, p,i,d, limited:false, integral:this.integral};
  }
  getStatus(){
    return {enabled:this.enabled, emergency:this.emergency, target:this.target, lastOutput:this.lastOutput, integral:this.integral, history:this.history.slice(-20)};
  }
}
