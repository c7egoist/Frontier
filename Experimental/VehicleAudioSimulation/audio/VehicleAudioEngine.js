/*==========================================================================================================================================
                                                  VEHICLE AUDIO ENGINE — ENGINEERING GRADE SYNTHESIS
                                     ------------------------------------------------------------------
   Sample-accurate additive engine, forced-induction and secondary layers. Time-based, never frame-tied.
   Audio thread (Worklet or native nodes) runs off AudioContext clock; physics at 240 Hz drives params via
   AudioParam automation. Low FPS cannot starve samples.
==========================================================================================================================================*/

export class VehicleAudioEngine {
    constructor(){
        this.ctx = null;
        this.masterGain = null;
        this.compressor = null;
        this.spec = null;
        this.snap = null;
        this.running = false;
        this.exhaustNodes = [];
        this.intakeNoise = null; this.intakeGain=null; this.intakeFilter=null;
        this.turboOsc=null; this.turboGain=null; this.turboNoise=null; this.turboNoiseGain=null; this.turboNoiseFilter=null;
        this.scOsc=null; this.scOsc2=null; this.scGain=null;
        this.transGain=null; this.transOsc=null;
        this.electricOsc=null; this.electricGain=null; this.electricMod=null;
        this.windGain=null; this.windFilter=null; this.windSource=null;
        this.rumbleGain=null; this.rumbleOsc=null;
        this.workletNode=null; this.useWorklet=false;
        this._phaseAccum = 0;
        this._clickBuffer=null;
        this._log = null; // optional external logger
    }

    setLogger(fn){ this._log = fn; }
    _logMsg(m){ if(this._log) try{ this._log(m);}catch{} console.log("[VehicleAudio] "+m); }

    async start(){
        if(this.running && this.ctx) {
            if(this.ctx.state==="suspended") await this.ctx.resume();
            return;
        }
        const Ctx = window.AudioContext || window.webkitAudioContext;
        if(!Ctx){ this._logMsg("Web Audio not supported"); throw new Error("Web Audio not supported"); }
        try{
            // Do not force sampleRate — let the device choose (many devices reject 48000)
            this.ctx = new Ctx({latencyHint:"interactive"});
        }catch(e){
            this._logMsg("AudioContext creation failed: "+e.message);
            throw e;
        }
        this._logMsg("AudioContext created sr="+this.ctx.sampleRate+" state="+this.ctx.state);
        if(this.ctx.state==="suspended"){
            try{ await this.ctx.resume(); this._logMsg("resume ok state="+this.ctx.state);}catch(e){ this._logMsg("resume failed "+e.message);}
        }
        try{
            this._buildGraph();
            this._logMsg("graph built");
        }catch(e){ this._logMsg("buildGraph failed "+e.message+" "+e.stack); throw e; }
        // worklet is optional, don't block
        this._tryWorklet();
        this.running = true;
        this._buildImpulseBuffers();
        this._logMsg("ctx running sr="+this.ctx.sampleRate+" state="+this.ctx.state);
        // immediate audible proof — short 180 Hz thump so user knows graph is alive even at idle
        try{ this.playTestTone(0.18, 180, 0.22); }catch{}
    }

    async resume(){
        if(!this.ctx) await this.start();
        if(this.ctx.state==="suspended") {
            try{ await this.ctx.resume(); this._logMsg("resume -> "+this.ctx.state);}catch(e){this._logMsg("resume err "+e.message);}
        }
    }

    stop(){
        this.running=false;
        if(this.ctx){
            try{ this.ctx.close(); }catch{}
            this.ctx=null;
        }
        this._clearGraph();
        this._logMsg("stopped");
    }

    setSpec(spec){
        this.spec = spec;
        if(!this.ctx) return;
        try{ this._rebuildForSpec(); this._logMsg("spec -> "+spec.name);}catch(e){this._logMsg("rebuild failed "+e.message);}
    }

    // simple beep bypassing the whole mix — proves device is audible
    playTestTone(dur=0.35, freq=440, gain=0.28){
        if(!this.ctx) return;
        const t=this.ctx.currentTime;
        const o=this.ctx.createOscillator(); o.type="sine"; o.frequency.setValueAtTime(freq, t);
        // gentle chirp so it's obviously the engine graph vs a pure tone
        o.frequency.linearRampToValueAtTime(freq*0.92, t+dur);
        const g=this.ctx.createGain(); g.gain.setValueAtTime(0, t);
        g.gain.linearRampToValueAtTime(gain, t+0.02);
        g.gain.exponentialRampToValueAtTime(0.0001, t+dur);
        o.connect(g); g.connect(this.ctx.destination);
        o.start(t); o.stop(t+dur+0.05);
        this._logMsg("test tone "+freq+"Hz "+dur+"s");
    }

    // louder idle proof — called after start
    playIdleProof(){
        this.playTestTone(0.45, 92, 0.32);
        setTimeout(()=>{ try{ this.playTestTone(0.32, 135, 0.22);}catch{}}, 180);
    }

    pushState(snap, events=[]){
        this.snap = snap;
        if(!this.ctx || !this.running) return;
        // auto-resume if suspended (e.g. tab throttling)
        if(this.ctx.state==="suspended"){ this.ctx.resume().catch(()=>{}); }
        const t = this.ctx.currentTime;
        const lerpTime = 0.045;
        const spec = snap.spec;
        const rpm = snap.rpm;
        const isElectric = spec.cylinders===0;

        if(isElectric){
            this._pushElectric(snap, t, lerpTime);
            for(const ev of events){ if(ev.type==="shift") this._triggerShiftThump(t, ev.gear, true); }
            this._pushWind(snap, t, lerpTime);
            return;
        }

        const crankHz = Math.max(4, rpm/60);

        for(const node of this.exhaustNodes){
            const order = node.order;
            const weight = node.baseWeight;
            const freq = crankHz * order;
            const loadShape = 0.55 + 0.45*Math.min(1.15,snap.load);
            const thrShape = 0.62 + 0.38*snap.throttle + (snap.throttle>0.82?0.12:0);
            // Idle gets a floor so you always hear something even with foot off
            const idleFloor = (rpm<1400 && snap.throttle<0.04) ? 0.16 : 0;
            const scMask = (spec.induction.type==="turbo"? (1 - Math.min(0.26, snap.boostBar*0.14)) : 1);
            const limiterDuck = snap.limiter? (0.42 + 0.20*Math.random()) : 1;
            const base = weight * loadShape * thrShape * scMask * limiterDuck * spec.character.exhaust;
            const targetGain = Math.max(idleFloor*weight*0.55, base * this._exhaustGlobalGain(snap));
            // clamp to avoid runaway sum
            const clamped = Math.min(0.55, Math.max(0.0001, targetGain));
            try{
                node.osc.frequency.cancelScheduledValues(t);
                node.osc.frequency.setValueAtTime(node.osc.frequency.value, t);
                node.osc.frequency.linearRampToValueAtTime(Math.max(11, freq), t+lerpTime*0.6);
                node.gain.gain.cancelScheduledValues(t);
                node.gain.gain.setValueAtTime(node.gain.gain.value, t);
                node.gain.gain.linearRampToValueAtTime(clamped, t+lerpTime);
            }catch(e){}
        }
        if(this.exhaustLowpass && this.exhaustHighpass){
            const cutoff = 1550 + rpm*0.24 + snap.throttle*650 + snap.load*380;
            const q = 0.72 + snap.load*0.22;
            try{
                this.exhaustLowpass.frequency.linearRampToValueAtTime(Math.min(7200, cutoff), t+0.08);
                this.exhaustHighpass.frequency.linearRampToValueAtTime(58 + snap.boostBar*7, t+0.08);
                this.exhaustLowpass.Q.linearRampToValueAtTime(q, t+0.08);
            }catch{}
        }
        if(this.intakeGain){
            const intakeTarget = (0.06 + 0.42*snap.throttle + 0.16*snap.load)* spec.character.intake * (0.45 + rpm/spec.redlineRpm*0.55);
            try{
                this.intakeGain.gain.linearRampToValueAtTime(Math.max(0.0001, intakeTarget*0.085), t+lerpTime);
                this.intakeFilter.frequency.linearRampToValueAtTime(620 + rpm*0.18 + snap.throttle*1100, t+0.08);
                this.intakeFilter.Q.linearRampToValueAtTime(1.2 + snap.throttle*0.9, t+0.08);
            }catch{}
        }
        if(this.rumbleGain){
            const rum = spec.character.lowRumble * (0.32 + 0.68*(rpm<3200?1: Math.max(0,1-(rpm-3200)/5000))) * (0.35 + 0.65*snap.load);
            try{ this.rumbleGain.gain.linearRampToValueAtTime(Math.max(0.0001, rum*0.12), t+lerpTime);}catch{}
            if(this.rumbleOsc){
                try{ this.rumbleOsc.frequency.linearRampToValueAtTime(18 + rpm*0.009, t+0.08);}catch{}
            }
        }

        if(spec.induction.type==="turbo" || spec.induction.type==="twincharged"){
            const turboNorm = Math.min(1, snap.turboRpm/ spec.induction.maxTurboRpm);
            const whistleFreq = 620 + turboNorm* 7600 + snap.boostBar*420;
            const whistleGain = (0.06 + 0.72*turboNorm* snap.throttle + 0.14*snap.load) * (spec.character.turboHiss||0.9) * 0.13;
            if(this.turboOsc){
                try{
                    this.turboOsc.frequency.linearRampToValueAtTime(Math.min(11200, whistleFreq), t+0.06);
                    this.turboGain.gain.linearRampToValueAtTime(Math.max(0.0001, whistleGain), t+0.08);
                }catch{}
            }
            if(this.turboNoiseGain){
                const hissGain = (0.07 + 0.52*turboNorm* snap.throttle)* (spec.character.turboHiss||0.7)*0.11;
                try{
                    this.turboNoiseGain.gain.linearRampToValueAtTime(Math.max(0.0001, hissGain), t+0.08);
                    this.turboNoiseFilter.frequency.linearRampToValueAtTime(2100 + turboNorm*5200, t+0.07);
                }catch{}
            }
        }
        if(spec.induction.type==="supercharger" || spec.induction.type==="twincharged"){
            const scInd = spec.induction;
            const lobeFreq = rpm/60 * scInd.scRatio * scInd.rotorLobes;
            const scTarget = Math.min(13800, lobeFreq);
            const scGain = (0.08 + 0.68*(rpm/5000) + 0.18*snap.boostBar) * (spec.character.scWhine||1.0) *0.13 * (snap.throttle*0.72 + 0.28);
            if(this.scOsc){
                try{
                    this.scOsc.frequency.linearRampToValueAtTime(scTarget, t+0.05);
                    this.scGain.gain.linearRampToValueAtTime(Math.max(0.0001, scGain), t+0.06);
                    if(this.scOsc2) this.scOsc2.frequency.linearRampToValueAtTime(scTarget*2.007, t+0.05);
                }catch{}
            }
            if(this.scOsc && snap.boostBar>0.6){
                try{ this.scOsc.detune.linearRampToValueAtTime( (Math.random()-0.5)*6, t+0.04);}catch{}
            }
        } else {
            if(this.scGain){ try{ this.scGain.gain.linearRampToValueAtTime(0.0001, t+0.12);}catch{} }
        }

        if(this.transOsc){
            const wheelHz = snap.vehicleSpeed * 3 * (snap.gear||1);
            const tg = Math.min(0.07, snap.vehicleSpeed*0.006) * (0.18 + snap.load*0.22);
            try{
                this.transOsc.frequency.linearRampToValueAtTime(85 + wheelHz*15, t+0.09);
                this.transGain.gain.linearRampToValueAtTime(Math.max(0.0001, tg), t+0.10);
            }catch{}
        }

        this._pushWind(snap, t, lerpTime);

        for(const ev of events){
            if(ev.type==="shift") this._triggerShiftThump(t, ev.gear);
            else if(ev.type==="limiter") this._triggerLimiterCut(t);
            else if(ev.type==="pop") this._triggerPop(t, ev.intensity, snap);
            else if(ev.type==="bov") this._triggerBov(t, ev.boost);
            else if(ev.type==="scChirp") this._triggerScChirp(t);
        }

        if(this.workletNode){
            this.workletNode.port.postMessage({
                type:"state",
                rpm: snap.rpm, throttle: snap.throttle, load: snap.load,
                boost: snap.boostBar, turboRpm: snap.turboRpm,
                shifting: snap.shifting?1:0, limiter: snap.limiter?1:0
            });
        }
    }

    _pushElectric(snap, t, lerp){
        const spec = snap.spec;
        if(this.electricOsc){
            const rotorHz = Math.max(0, snap.rpm/60);
            const elecHz = rotorHz * (spec.electricDrive?.polePairs||6);
            const carrier = (spec.electricDrive?.baseCarrierHz||8200) + elecHz*0.35;
            const gain = (0.03 + 0.55*snap.throttle + 0.18*snap.load) * 0.14 + snap.vehicleSpeed*0.0015;
            const regenGain = snap.brake>0.15 ? 0.06 + snap.brake*0.07 : 0;
            const total = Math.max(0.0001, gain + regenGain);
            // Idle silence for electric — but give a faint carrier at throttle 0 so user knows it's alive
            const idleCarrier = (snap.throttle<0.02 && snap.vehicleSpeed<0.5) ? 0.015 : total;
            try{
                this.electricOsc.frequency.linearRampToValueAtTime(Math.min(14000, 180 + elecHz*1.0), t+0.06);
                this.electricGain.gain.linearRampToValueAtTime(idleCarrier, t+0.07);
                if(this.electricMod) this.electricMod.frequency.linearRampToValueAtTime(Math.min(13000, carrier), t+0.08);
            }catch{}
        }
        if(this.transOsc){
            try{
                this.transOsc.frequency.linearRampToValueAtTime(120 + snap.rpm*0.32, t+0.07);
                this.transGain.gain.linearRampToValueAtTime(Math.max(0.0001, 0.04 + snap.load*0.05), t+0.07);
            }catch{}
        }
    }

    _pushWind(snap, t, lerp){
        if(!this.windGain) return;
        const v=snap.vehicleSpeed;
        const windLevel = Math.pow(Math.min(1, v/42), 1.45) * 0.13;
        try{
            this.windGain.gain.linearRampToValueAtTime(Math.max(0.0001, windLevel), t+0.16);
            this.windFilter.frequency.linearRampToValueAtTime(420 + v*34, t+0.16);
        }catch{}
    }

    _exhaustGlobalGain(snap){
        let g=0.99;
        if(snap.spec.hybrid && snap.rpm<2700 && snap.throttle<0.22) g*=0.82;
        if(snap.shifting) g*=0.26;
        return g;
    }

    _triggerShiftThump(t, gear, isElectric=false){
        if(!this.ctx) return;
        const dur=0.14;
        const o = this.ctx.createOscillator();
        const g = this.ctx.createGain();
        o.type="triangle"; o.frequency.setValueAtTime(isElectric? 95: 52, t);
        o.frequency.exponentialRampToValueAtTime(isElectric? 42: 28, t+dur);
        g.gain.setValueAtTime(0, t);
        g.gain.linearRampToValueAtTime(isElectric?0.28:0.34, t+0.012);
        g.gain.exponentialRampToValueAtTime(0.0001, t+dur);
        o.connect(g); g.connect(this.compressor||this.ctx.destination);
        o.start(t); o.stop(t+dur+0.02);
        const b = this.ctx.createBufferSource(); b.buffer=this._clickBuffer||this._makeClickBuffer();
        const bg=this.ctx.createGain(); bg.gain.setValueAtTime(0,t); bg.gain.linearRampToValueAtTime(0.12,t+0.006); bg.gain.exponentialRampToValueAtTime(0.0001,t+0.10);
        b.connect(bg); bg.connect(this.compressor||this.ctx.destination);
        try{ b.start(t+0.018);}catch{}
    }
    _triggerLimiterCut(t){
        if(!this.ctx) return;
        const nlen = Math.floor(this.ctx.sampleRate*0.012);
        const buf=this.ctx.createBuffer(1,nlen,this.ctx.sampleRate);
        const d=buf.getChannelData(0);
        for(let i=0;i<nlen;i++) d[i]=(Math.random()*2-1)*Math.pow(1-i/nlen, 2.8)*0.35;
        const src=this.ctx.createBufferSource(); src.buffer=buf;
        const hp=this.ctx.createBiquadFilter(); hp.type="highpass"; hp.frequency.value=2200;
        const g=this.ctx.createGain(); g.gain.value=0.06;
        src.connect(hp); hp.connect(g); g.connect(this.compressor||this.ctx.destination);
        src.start(t);
    }
    _triggerPop(t, intensity, snap){
        if(!this.ctx) return;
        const now=t + Math.random()*0.02;
        const nlen=Math.floor(this.ctx.sampleRate*0.09);
        const buf=this.ctx.createBuffer(1,nlen,this.ctx.sampleRate);
        const d=buf.getChannelData(0);
        for(let i=0;i<nlen;i++){
            const env=Math.exp(-i*0.00095* (48000/this.ctx.sampleRate)) * Math.pow(1-i/nlen,1.7);
            d[i]=(Math.random()*2-1)*env* (0.28 + intensity*0.28);
            if(i<28) d[i]*= (i/28);
        }
        const src=this.ctx.createBufferSource(); src.buffer=buf;
        const bp=this.ctx.createBiquadFilter(); bp.type="bandpass"; bp.frequency.value= 950 + Math.random()*900; bp.Q.value=0.9;
        const hp=this.ctx.createBiquadFilter(); hp.type="highpass"; hp.frequency.value=110;
        const g=this.ctx.createGain(); g.gain.value= 0.14 + intensity*0.14;
        src.playbackRate.value= 0.78 + snap.rpm/8000;
        src.connect(bp); bp.connect(hp); hp.connect(g); g.connect(this.compressor||this.ctx.destination);
        src.start(now);
        if(intensity>0.55 && Math.random()<0.45){
            const src2=this.ctx.createBufferSource(); src2.buffer=buf;
            const g2=this.ctx.createGain(); g2.gain.value=0.08*intensity;
            src2.playbackRate.value=0.62;
            const bp2=this.ctx.createBiquadFilter(); bp2.type="bandpass"; bp2.frequency.value=620; bp2.Q.value=0.7;
            src2.connect(bp2); bp2.connect(g2); g2.connect(this.compressor||this.ctx.destination);
            src2.start(now+0.038);
        }
    }
    _triggerBov(t, boost){
        if(!this.ctx) return;
        const nlen=Math.floor(this.ctx.sampleRate*0.32);
        const buf=this.ctx.createBuffer(1,nlen,this.ctx.sampleRate);
        const d=buf.getChannelData(0);
        for(let i=0;i<nlen;i++){
            const f = i/this.ctx.sampleRate;
            const env=Math.exp(-f*12)*Math.pow(1-i/nlen,1.1);
            const chirp = Math.sin(2*Math.PI*(5200 - f*6200)*f*0.5 + Math.sin(f*3400)*0.4);
            d[i]=(Math.random()*2-1)*0.28*env + chirp*0.14*env;
        }
        const src=this.ctx.createBufferSource(); src.buffer=buf;
        const bp=this.ctx.createBiquadFilter(); bp.type="bandpass"; bp.frequency.value= 2800 + boost*1200; bp.Q.value=1.1;
        const g=this.ctx.createGain(); g.gain.value= 0.11 + boost*0.07;
        g.gain.linearRampToValueAtTime(0.0001, this.ctx.currentTime+0.42);
        src.connect(bp); bp.connect(g); g.connect(this.compressor||this.ctx.destination);
        src.start(t);
        if(boost>0.75){
            const flutLen=Math.floor(this.ctx.sampleRate*0.22);
            const fb=this.ctx.createBuffer(1,flutLen,this.ctx.sampleRate);
            const fd=fb.getChannelData(0);
            for(let i=0;i<flutLen;i++){
                const e=Math.exp(-i*0.00085);
                fd[i]= Math.sin(2*Math.PI*42*i/this.ctx.sampleRate)*0.18*e + (Math.random()*2-1)*0.06*e;
            }
            const s2=this.ctx.createBufferSource(); s2.buffer=fb;
            const g2=this.ctx.createGain(); g2.gain.value=0.08;
            s2.connect(g2); g2.connect(this.compressor||this.ctx.destination);
            s2.start(t+0.02);
        }
    }
    _triggerScChirp(t){
        if(!this.ctx) return;
        const o=this.ctx.createOscillator(); const g=this.ctx.createGain();
        o.type="sine"; o.frequency.setValueAtTime(4200, t); o.frequency.exponentialRampToValueAtTime(1600, t+0.18);
        g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.13, t+0.012); g.gain.exponentialRampToValueAtTime(0.0001,t+0.22);
        o.connect(g); g.connect(this.compressor||this.ctx.destination);
        o.start(t); o.stop(t+0.24);
    }

    _makeClickBuffer(){
        const len=Math.floor(this.ctx.sampleRate*0.014);
        const b=this.ctx.createBuffer(1,len,this.ctx.sampleRate);
        const d=b.getChannelData(0);
        for(let i=0;i<len;i++){
            const e=Math.exp(-i*0.0045);
            d[i]= (Math.random()*2-1)*0.18*e;
            if(i< 4) d[i]*= i/4;
        }
        this._clickBuffer=b; return b;
    }

    _buildImpulseBuffers(){}

    _buildGraph(){
        const ctx=this.ctx;
        this.compressor = ctx.createDynamicsCompressor();
        this.compressor.threshold.value=-14;
        this.compressor.knee.value=18;
        this.compressor.ratio.value=3.0;
        this.compressor.attack.value=0.004;
        this.compressor.release.value=0.22;
        this.masterGain = ctx.createGain(); this.masterGain.gain.value=0.92;
        this.compressor.connect(this.masterGain);
        this.masterGain.connect(ctx.destination);

        this.exhaustBusGain = ctx.createGain(); this.exhaustBusGain.gain.value=0.98;
        this.exhaustLowpass = ctx.createBiquadFilter(); this.exhaustLowpass.type="lowpass"; this.exhaustLowpass.frequency.value=4200; this.exhaustLowpass.Q.value=0.8;
        this.exhaustHighpass = ctx.createBiquadFilter(); this.exhaustHighpass.type="highpass"; this.exhaustHighpass.frequency.value=48;
        // Musical drive without Waveshaper for now — keep it loud and reliable; shaper can be toggled later
        // this.exhaustShaper = ctx.createWaveShaper(); ...
        // For now direct
        this.exhaustBusGain.connect(this.exhaustHighpass);
        this.exhaustHighpass.connect(this.exhaustLowpass);
        this.exhaustLowpass.connect(this.compressor);

        {
            const buf = this._makeNoiseBuffer(2);
            const src=ctx.createBufferSource(); src.buffer=buf; src.loop=true;
            this.intakeFilter=ctx.createBiquadFilter(); this.intakeFilter.type="bandpass"; this.intakeFilter.frequency.value=1100; this.intakeFilter.Q.value=1.1;
            this.intakeGain=ctx.createGain(); this.intakeGain.gain.value=0.0001;
            src.connect(this.intakeFilter); this.intakeFilter.connect(this.intakeGain); this.intakeGain.connect(this.compressor);
            try{ src.start(); }catch(e){ this._logMsg("intake start err "+e.message); }
            this.intakeNoise=src;
        }
        {
            this.rumbleOsc=ctx.createOscillator(); this.rumbleOsc.type="sine"; this.rumbleOsc.frequency.value=28;
            const fm=ctx.createOscillator(); fm.type="sine"; fm.frequency.value=7.2;
            const fmGain=ctx.createGain(); fmGain.gain.value=6;
            fm.connect(fmGain); fmGain.connect(this.rumbleOsc.frequency);
            try{ fm.start(); }catch{}
            this.rumbleGain=ctx.createGain(); this.rumbleGain.gain.value=0.0001;
            this.rumbleOsc.connect(this.rumbleGain); this.rumbleGain.connect(this.compressor);
            try{ this.rumbleOsc.start(); }catch(e){this._logMsg("rumble start "+e.message);}
        }
        {
            this.turboOsc=ctx.createOscillator(); this.turboOsc.type="sawtooth"; this.turboOsc.frequency.value=720;
            this.turboGain=ctx.createGain(); this.turboGain.gain.value=0.0001;
            const hp=ctx.createBiquadFilter(); hp.type="highpass"; hp.frequency.value=1400;
            this.turboOsc.connect(hp); hp.connect(this.turboGain); this.turboGain.connect(this.compressor);
            try{ this.turboOsc.start(); }catch(e){this._logMsg("turbo start "+e.message);}
            const b=this._makeNoiseBuffer(1.5);
            const n=ctx.createBufferSource(); n.buffer=b; n.loop=true;
            this.turboNoiseFilter=ctx.createBiquadFilter(); this.turboNoiseFilter.type="bandpass"; this.turboNoiseFilter.frequency.value=3000; this.turboNoiseFilter.Q.value=0.9;
            this.turboNoiseGain=ctx.createGain(); this.turboNoiseGain.gain.value=0.0001;
            n.connect(this.turboNoiseFilter); this.turboNoiseFilter.connect(this.turboNoiseGain); this.turboNoiseGain.connect(this.compressor);
            try{ n.start(); }catch{}
            this.turboNoise=n;
        }
        {
            this.scOsc=ctx.createOscillator(); this.scOsc.type="square"; this.scOsc.frequency.value=600;
            this.scOsc2=ctx.createOscillator(); this.scOsc2.type="sine"; this.scOsc2.frequency.value=1200;
            this.scGain=ctx.createGain(); this.scGain.gain.value=0.0001;
            const hp=ctx.createBiquadFilter(); hp.type="highpass"; hp.frequency.value=280;
            const bp=ctx.createBiquadFilter(); bp.type="bandpass"; bp.frequency.value=2400; bp.Q.value=1.3;
            this.scOsc.connect(hp); hp.connect(this.scGain);
            this.scOsc2.connect(bp); bp.connect(this.scGain);
            this.scGain.connect(this.compressor);
            try{ this.scOsc.start(); this.scOsc2.start(); }catch(e){this._logMsg("sc start "+e.message);}
        }
        {
            this.transOsc=ctx.createOscillator(); this.transOsc.type="sine"; this.transOsc.frequency.value=180;
            this.transGain=ctx.createGain(); this.transGain.gain.value=0.0001;
            const bp=ctx.createBiquadFilter(); bp.type="bandpass"; bp.frequency.value=1400; bp.Q.value=2.2;
            this.transOsc.connect(bp); bp.connect(this.transGain); this.transGain.connect(this.compressor);
            try{ this.transOsc.start(); }catch{}
        }
        {
            this.electricOsc=ctx.createOscillator(); this.electricOsc.type="sawtooth"; this.electricOsc.frequency.value=420;
            this.electricMod=ctx.createOscillator(); this.electricMod.type="sine"; this.electricMod.frequency.value=8200;
            const modGain=ctx.createGain(); modGain.gain.value=180;
            this.electricMod.connect(modGain); modGain.connect(this.electricOsc.frequency);
            this.electricGain=ctx.createGain(); this.electricGain.gain.value=0.0001;
            const lp=ctx.createBiquadFilter(); lp.type="lowpass"; lp.frequency.value=9200;
            this.electricOsc.connect(lp); lp.connect(this.electricGain); this.electricGain.connect(this.compressor);
            try{ this.electricOsc.start(); this.electricMod.start(); }catch{}
        }
        {
            const b=this._makeNoiseBuffer(2);
            const src=ctx.createBufferSource(); src.buffer=b; src.loop=true;
            this.windFilter=ctx.createBiquadFilter(); this.windFilter.type="bandpass"; this.windFilter.frequency.value=720; this.windFilter.Q.value=0.55;
            this.windGain=ctx.createGain(); this.windGain.gain.value=0.0001;
            src.connect(this.windFilter); this.windFilter.connect(this.windGain); this.windGain.connect(this.compressor);
            try{ src.start(); }catch{}
            this.windSource=src;
        }
        this._makeClickBuffer();
    }

    _clearGraph(){ this.exhaustNodes=[]; }

    _rebuildForSpec(){
        const ctx=this.ctx; const spec=this.spec;
        for(const n of this.exhaustNodes){
            try{ n.osc.stop(); n.osc.disconnect(); n.gain.disconnect(); }catch{}
        }
        this.exhaustNodes=[];
        if(spec.cylinders===0){
            return;
        }
        const orders = Object.keys(spec.harmonics).map(s=>parseFloat(s)).sort((a,b)=>a-b);
        for(const order of orders){
            const w = spec.harmonics[order];
            const copies = (w>0.62 && order>=2) ? 2 : 1;
            for(let c=0;c<copies;c++){
                const osc=ctx.createOscillator();
                osc.type = (order>=6? "square" : (order%1===0? "sawtooth":"sine"));
                if(copies===2) osc.detune.value = (c===0? -5.8: 6.4);
                osc.frequency.value= 80 * order;
                const gain=ctx.createGain(); gain.gain.value=0.0001;
                if(order===3 || order===4){
                    const peq=ctx.createBiquadFilter(); peq.type="peaking"; peq.frequency.value=180 + order*42; peq.Q.value=1.6; peq.gain.value=1.8;
                    gain.connect(peq); peq.connect(this.exhaustBusGain);
                } else {
                    gain.connect(this.exhaustBusGain);
                }
                osc.connect(gain);
                try{ osc.start(); }catch(e){ this._logMsg("voice start err "+e.message); }
                this.exhaustNodes.push({osc,gain, order, baseWeight: w * (copies===2?0.58:1.0)});
            }
        }
    }

    _makeNoiseBuffer(secs){
        const len=Math.floor(this.ctx.sampleRate*secs);
        const b=this.ctx.createBuffer(1,len,this.ctx.sampleRate);
        const d=b.getChannelData(0);
        for(let i=0;i<len;i++) d[i]=Math.random()*2-1;
        return b;
    }

    async _tryWorklet(){
        if(!this.ctx || !this.ctx.audioWorklet) return;
        const workletCode = `
        class VehiclePulseProcessor extends AudioWorkletProcessor{
            constructor(){
                super();
                this.phase=0; this.rpm=900;
                this.port.onmessage = e=>{ if(e.data.type==="state") this.rpm=e.data.rpm; };
            }
            process(inputs, outputs){
                const out=outputs[0][0]; if(!out) return true;
                const sr=sampleRate; const crankHz=Math.max(4, this.rpm/60);
                for(let i=0;i<out.length;i++){
                    this.phase += 2*Math.PI*crankHz/sr;
                    if(this.phase> 6.283185) this.phase-=6.283185;
                    out[i]=0;
                }
                return true;
            }
        }
        registerProcessor("vehicle-pulse", VehiclePulseProcessor);
        `;
        try{
            const blob=new Blob([workletCode],{type:"application/javascript"});
            const url=URL.createObjectURL(blob);
            await this.ctx.audioWorklet.addModule(url);
            this.workletNode=new AudioWorkletNode(this.ctx,"vehicle-pulse");
            // keep it silent — just phase guard
            this.workletNode.connect(this.compressor);
            // immediately reduce gain to 0 so it doesn't even add silence overhead? keep connected
            URL.revokeObjectURL(url);
            this.useWorklet=true;
            this._logMsg("worklet armed");
        }catch(e){
            this._logMsg("worklet not available "+e.message);
            this.useWorklet=false;
        }
    }
}
