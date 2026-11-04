/*==========================================================================================================================================
                                                       DRIVETRAIN MODEL — FIXED TIMESTEP PHYSICS
                                     ------------------------------------------------------------------
              Longitudinal dynamics with crank inertia, boost state and honest torque curves. Never frame-tied.
==========================================================================================================================================*/

import { torqueAt } from "./VehicleSpecifications.js";

const GRAVITY = 9.81;
const AIR_DENSITY = 1.225;

export class DrivetrainModel {
    constructor(spec){
        this.spec = spec;
        this.reset();
        // boost state
        this.boostBar = 0;          // current manifold pressure above ambient
        this.turboRpm = 18000;
        this.prevThrottle = 0;
        this.throttle = 0;
        this.brake = 0;
        this.clutch = 1;            // 1 = engaged, 0 = disengaged (for N and shifts)
        this.shiftTimer = 0;        // torque interrupt during shift
        this.shiftEvent = null;     // {from,to}
        this.limiterActive = false;
        this.limiterTimer = 0;
        this.blipTimer = 0;
        this.crackleCooldown = 0;
    }

    reset(){
        this.rpm = this.spec.idleRpm;
        this.vehicleSpeed = 0;      // m/s
        this.wheelAngVel = 0;       // rad/s
        this.gear = 1;              // 0 = N, 1..N = gears (1 is first)
        this.throttleInput = 0;     // raw pedal 0..1
        this.brakeInput = 0;
        this.engineAngVel = this.rpm * Math.PI*2/60;
        this.boostBar = 0;
        this.turboRpm = 18000;
        this.shiftTimer = 0;
        this.limiterActive = false;
        this.limiterTimer = 0;
        this.blipTimer = 0;
        this.loadFactor = 0;
        this.isElectric = this.spec.cylinders===0;
        if(this.isElectric){
            this.rpm = 0;
            this.gear = 1;
        }
    }

    setSpec(spec){
        const speed = this.vehicleSpeed;
        const gear = this.gear;
        this.spec = spec;
        this.isElectric = spec.cylinders===0;
        // try keep speed, recalc rpm to match new ratios
        this.vehicleSpeed = speed;
        if(this.isElectric){
            this.rpm = Math.max(0, this.wheelAngVel * spec.gearRatios[0]*spec.finalDrive*60/(2*Math.PI));
            this.gear = Math.min(spec.gearRatios.length, Math.max(1, gear));
        } else {
            // place rpm near idle if moving from electric
            if(this.rpm===0) this.rpm = spec.idleRpm + 200;
        }
        this.boostBar = 0;
        this.turboRpm = 18000;
    }

    // Pedals smoothed outside; these are targets 0..1
    setInputs({throttle, brake}){
        this.throttleInput = Math.max(0, Math.min(1, throttle));
        this.brakeInput = Math.max(0, Math.min(1, brake));
    }

    shiftUp(){
        if(this.gear >= this.spec.gearRatios.length) return false;
        if(this.shiftTimer>0) return false;
        this.shiftTimer = 0.22; // 220 ms torque cut
        this.shiftEvent = {from:this.gear, to:this.gear+1, t:0.22};
        this.gear++;
        // cut ignition blip
        this.blipTimer = 0.12;
        return true;
    }
    shiftDown(){
        if(this.gear <= 0) return false;
        if(this.shiftTimer>0) return false;
        if(this.gear===1){ this.gear=0; return true; }
        this.shiftTimer = 0.20;
        this.shiftEvent = {from:this.gear, to:this.gear-1, t:0.20};
        this.gear--;
        this.blipTimer = 0.14;
        return true;
    }
    toggleNeutral(){
        if(this.gear===0){ this.gear=1; }
        else { this.gear=0; }
    }

    // Fixed step advances simulation — call at 240 Hz irrespective of render.
    step(dt){
        const s = this.spec;
        const prevRpm = this.rpm;

        // smooth pedal approach (physical pedal rates handled outside, here just throttle filtering)
        const throttleRateUp = 7.0, throttleRateDown = 6.5;
        let td = this.throttleInput - this.throttle;
        let maxDelta = (td>0? throttleRateUp : throttleRateDown)*dt;
        if(Math.abs(td)>maxDelta) td = Math.sign(td)*maxDelta;
        this.throttle += td;

        let bd = this.brakeInput - this.brake;
        let bRate=9.0;
        let bMax = bRate*dt;
        if(Math.abs(bd)>bMax) bd = Math.sign(bd)*bMax;
        this.brake += bd;

        // shift timer
        if(this.shiftTimer>0){
            this.shiftTimer-=dt;
            if(this.shiftTimer<0) this.shiftTimer=0;
        }
        if(this.blipTimer>0){ this.blipTimer-=dt; if(this.blipTimer<0) this.blipTimer=0; }
        if(this.crackleCooldown>0) this.crackleCooldown-=dt;

        // Forced induction state
        this._updateBoost(dt);

        // Effective engine torque
        let engTorque = 0;
        if(this.isElectric){
            // electric: torque depends on rpm (motor rpm = rpm) directly
            const base = torqueAt(s, this.rpm);
            // throttle maps to torque request; regen on brake/ lift
            const regen = this.brake>0.05 ? -0.18*base*this.brake : (this.throttle<0.08 && this.vehicleSpeed>2? -0.08*base : 0);
            engTorque = base*this.throttle + regen;
            // Two-speed logic for Taycan
            if(s.electricDrive && !this.isShifting()){
                const upRpm = s.electricDrive.twoSpeedShiftRpm;
                if(this.gear===1 && this.rpm > upRpm+300 && this.throttle>0.35) this.shiftUp();
                else if(this.gear===2 && this.rpm < upRpm-800 && (this.throttle<0.5 || this.brake>0.2)) this.shiftDown();
            }
        } else {
            const baseTq = torqueAt(s, this.rpm);
            // boost multiplier: 1 + boostBar * ~0.68 (thermal efficiency 0.68-0.85)
            let boostGain = 1;
            if(s.induction.type==="turbo"){ boostGain = 1 + this.boostBar*0.74; }
            else if(s.induction.type==="supercharger"){ boostGain = 1 + this.boostBar*0.68; }
            else if(s.induction.type==="twincharged"){ boostGain = 1 + this.boostBar*0.70; }
            // supercharger parasitic loss
            let scLoss = 0;
            if(s.induction.type==="supercharger"||s.induction.type==="twincharged"){
                scLoss = s.induction.scDriveLossNm * (this.rpm / s.redlineRpm);
            }
            // hybrid assist
            let hyAssist = 0;
            if(s.hybrid){
                const fade = Math.max(0, 1 - this.rpm/Math.max(1,s.hybrid.assistFadeRpm));
                hyAssist = s.hybrid.electricAssistNm * fade * (this.throttle>0.15?1:0.2);
            }
            // throttle shaping: at low RPM, half throttle still yields 60% torque (volumetric efficiency curve)
            const throttleEff = Math.pow(this.throttle, 0.88) * (0.22 + 0.78*this.throttle) + (this.rpm<2200? 0.08*this.throttle:0);
            const rawThrottleEff = Math.min(1, throttleEff + (this.throttle>0.9?0.06:0));
            engTorque = (baseTq * boostGain * rawThrottleEff - scLoss + hyAssist);

            // engine braking when throttle lifted: negative torque proportional to displacement and rpm
            if(this.throttle < 0.06){
                const pumpLoss = (s.displacementCc/1000) * 8.5 * (this.rpm/1000) * 0.55; // Nm
                const friction = 18 + 0.006*this.rpm;
                engTorque = - (pumpLoss + friction);
                // exhaust pops candidate: will be consumed by audio
            }
            // torque interrupt during shift
            if(this.isShifting()){
                const cut = 0.92 + 0.08*Math.sin(this.shiftTimer*58); // brief flutter
                engTorque *= 0.08 * cut;
            }
            // rev limiter: hard cut with hysteresis
            if(this.rpm >= s.limiterRpm){
                this.limiterActive = true; this.limiterTimer = 0.08;
            } else if(this.rpm < s.redlineRpm - 180){
                if(this.limiterTimer<=0) this.limiterActive = false;
            }
            if(this.limiterTimer>0){ this.limiterTimer-=dt; }
            if(this.limiterActive){
                // random cut ~ 35-55% of cycles
                const cut = (Math.floor(this.rpm/71) % 2===0) ? 0 : 1;
                if(cut===0) engTorque *= 0.06;
                else engTorque *= 0.32;
            }
        }

        // Drivetrain kinematics
        if(this.gear===0){
            // Neutral: engine free, vehicle coasts
            const engInertia = s.engineInertia;
            let alphaE = engTorque / Math.max(0.08, engInertia);
            // add internal damping
            alphaE -= this.engineAngVel*0.18;
            this.engineAngVel += alphaE*dt;
            this.engineAngVel = Math.max(0, this.engineAngVel);
            this.rpm = this.engineAngVel*60/(2*Math.PI);
            // idle governor
            if(this.throttle<0.04 && this.rpm < s.idleRpm){
                const idleErr = s.idleRpm - this.rpm;
                const idleTq = 38 + idleErr*0.14;
                alphaE = idleTq/engInertia;
                this.engineAngVel += alphaE*dt*0.35;
                this.rpm = this.engineAngVel*60/(2*Math.PI);
            }
            // limiter apply
            if(!this.isElectric && this.rpm > s.limiterRpm){
                this.rpm = s.limiterRpm - Math.random()*90;
                this.engineAngVel = this.rpm*2*Math.PI/60;
            }
            // vehicle coast: decelerate via drag and brake
            this._integrateVehicle(dt, 0); // no drive force
        } else {
            const gearRatio = s.gearRatios[this.gear-1];
            const G = gearRatio * s.finalDrive;
            const R = s.wheelRadiusM;
            const Ieng = s.engineInertia;
            const Iwheel = 1.35; // per wheel approximation

            // compute wheel drive force if engaged
            let driveForce = 0;
            if(!this.isShifting()){
                // Need to reconcile engine and wheel speeds: impose kinematic constraint with slip
                // Target engine speed for current vehicle speed
                const wheelAng = this.vehicleSpeed / Math.max(0.1,R);
                const targetEngAng = wheelAng * G;
                // clutch slip model: engage quickly via sync; add slip during shift/limiter
                let slipFactor = this.isShifting()? 0.55 : 0.0;
                // gentle sync: drive engine toward target with stiffness
                const syncStiff = this.throttle>0.2 ? 55 : 18;
                const sync = (targetEngAng - this.engineAngVel)*syncStiff;
                // engine torque contributes to sync + direct
                const netTorque = engTorque + sync*Ieng*0.12;
                driveForce = (netTorque * G * 0.94)/R;
                // apply slip reduction
                driveForce *= (1 - slipFactor*0.42);
            } else {
                // during shift, coast
                driveForce = 0;
            }

            // Traction limit: Pacejka simplified - mu*Fz = max longitudinal
            const weightN = s.massKg * GRAVITY;
            const muPeak = 1.25 + (this.boostBar>0.8?0.06:0); // slight warm tyre bonus
            const maxDrive = muPeak * weightN * 0.52; // rear-biased approx 52% on drive axle average
            const slipRatio = maxDrive>0? (driveForce/maxDrive) : 0;
            if(Math.abs(driveForce) > maxDrive){
                const limited = Math.sign(driveForce)*maxDrive*(0.92 + 0.06*Math.sin(prevRpm*0.008));
                driveForce = limited;
                this.loadFactor = 0.82;
            } else {
                this.loadFactor = Math.min(1, Math.abs(slipRatio)*0.72 + this.throttle*0.58);
            }

            // Auto shift logic (only if not recently shifted)
            if(!this.isShifting() && !this.isElectric){
                if(this.throttle>0.45 && this.rpm > s.shiftUpRpm && this.gear < s.gearRatios.length){
                    this.shiftUp();
                } else if(((this.throttle<0.28 && this.rpm < s.shiftDownRpm && this.vehicleSpeed>4)|| (this.brake>0.4 && this.rpm < 1700 && this.gear>1)) && this.gear>1){
                    this.shiftDown();
                }
            } else if(!this.isShifting() && this.isElectric){
                // handled above
            }

            // Integrate vehicle longitudinal
            this._integrateVehicle(dt, driveForce);

            // Now enforce engine RPM from vehicle speed via gear (with inertia lag)
            const wheelAngNow = this.vehicleSpeed / Math.max(0.12, R);
            const targetRpm = wheelAngNow * G *60/(2*Math.PI);
            if(!this.isElectric){
                // blend inertia: engine cannot instant jump, but gear forces it
                const rpmBlend = this.isShifting()? 0.018 : 0.28;
                this.rpm = this.rpm*(1-rpmBlend) + targetRpm*rpmBlend;
                // if vehicle stopped, idle
                if(this.vehicleSpeed < 0.6 && this.throttle<0.08){
                    this.rpm = Math.max(s.idleRpm + (Math.random()-0.5)*18 + this.throttle*340, targetRpm);
                    this.rpm = Math.max(s.idleRpm*0.92, this.rpm);
                    // avoid stall
                    if(this.rpm < 520) this.rpm = s.idleRpm;
                }
                // when throttle stabbed at low speed, allow free rev overrun via slip
                if(this.throttle>0.72 && this.vehicleSpeed < 6 && this.rpm < s.redlineRpm*0.62){
                    const freeRevBoost = (this.throttle-0.72)*2800;
                    this.rpm = Math.max(this.rpm, targetRpm + freeRevBoost*(1- this.vehicleSpeed/6));
                }
                // clamp
                if(this.rpm > s.limiterRpm){
                    if(this.limiterActive){
                        this.rpm = s.limiterRpm - Math.random()*140;
                    } else {
                        this.rpm = Math.min(this.rpm, s.limiterRpm);
                    }
                }
                if(this.rpm < s.idleRpm*0.75 && this.vehicleSpeed>1.2){
                    // engine stall simulation: drop torque? for demo keep idle
                    this.rpm = s.idleRpm*0.85;
                }
                this.engineAngVel = this.rpm*2*Math.PI/60;
            } else {
                // electric motor rpm tied 1:1
                this.rpm = Math.max(0, wheelAngNow * G *60/(2*Math.PI));
                if(this.vehicleSpeed<0.2 && this.throttle<0.02) this.rpm=0;
                this.engineAngVel = this.rpm*2*Math.PI/60;
            }
            this.wheelAngVel = wheelAngNow;
        }

        // update load factor for NA etc
        if(!this.isElectric && this.gear!==0){
            const tAtMax = torqueAt(s, this.rpm);
            this.loadFactor = this.throttle* (engTorque/Math.max(1,tAtMax))*0.85 + this.brake*0.15 + 0.12;
            this.loadFactor = Math.max(0, Math.min(1.15, this.loadFactor));
        } else if(this.isElectric){
            this.loadFactor = Math.min(1, Math.abs(engTorque)/800);
        }

        this.prevThrottle = this.throttle;

        // return events for audio: shift, limiter, pops
        let events = [];
        if(this.shiftEvent && this.shiftTimer<=0.02){
            events.push({type:"shift", gear:this.gear});
            this.shiftEvent=null;
        }
        if(this.limiterActive && Math.random()<0.22){
            events.push({type:"limiter"});
        }
        if(!this.isElectric && this.throttle<0.12 && this.throttleInput<0.08 && prevRpm>3200 && this.rpm>2800 && Math.random()<0.022 && this.crackleCooldown<=0){
            events.push({type:"pop", intensity: Math.min(1, (this.rpm-2800)/4000)});
            this.crackleCooldown = 0.09 + Math.random()*0.11;
        }
        // BOV / chirp — detect intentional lift (target vs filtered) so slow pedal slew still triggers
        const lifting = (this.prevThrottle>0.45 && this.throttle<0.30) || (this.throttleInput<0.12 && this.prevThrottle>0.40 && (this.throttleInput - this.throttle)< -0.18);
        if(lifting){
            if((this.spec.induction.type==="turbo"||this.spec.induction.type==="twincharged") && this.boostBar>0.28){
                events.push({type:"bov", boost:this.boostBar});
            } else if(this.spec.induction.type==="supercharger" && this.boostBar>0.22){
                events.push({type:"scChirp"});
            }
        }

        return { engTorque, driveForce:0, events };
    }

    isShifting(){ return this.shiftTimer>0; }

    _integrateVehicle(dt, driveForce){
        const s=this.spec;
        const v = this.vehicleSpeed;
        const drag = 0.5*AIR_DENSITY*s.dragCd*s.frontalAreaM2*v*v;
        const rolling = s.cRoll * s.massKg * GRAVITY * (1 + v*0.006);
        const brakeForce = this.brake * 13500; // N peak
        const grade = 0; // flat proving grounds
        const net = driveForce - drag - rolling - brakeForce - grade;
        // effective mass includes rotational inertia
        let effMass = s.massKg;
        if(this.gear!==0){
            const G = s.gearRatios[Math.max(0,this.gear-1)]*s.finalDrive;
            effMass += s.engineInertia*G*G/(s.wheelRadiusM*s.wheelRadiusM) *0.55;
            effMass += 4*1.35/(s.wheelRadiusM*s.wheelRadiusM)*0.22;
        }
        let a = net / Math.max(420, effMass);
        // limit reverse?
        if(v<0.2 && driveForce<0 && this.brake>0.5){
            // allow reverse creep via negative drive when brake + throttle logic not modeled; just brake to stop
            a = Math.max(a, -4.5);
        }
        this.vehicleSpeed += a*dt;
        if(this.vehicleSpeed<0) this.vehicleSpeed=0;
        if(this.vehicleSpeed>105) this.vehicleSpeed=105; // ~378 km/h cap (Agera territory, limited for demo)
        this.wheelAngVel = this.vehicleSpeed / Math.max(0.12, s.wheelRadiusM);
    }

    _updateBoost(dt){
        const s=this.spec;
        const ind = s.induction;
        if(ind.type==="NA" || ind.type==="electric"){
            this.boostBar = 0;
            this.turboRpm = 18000;
            return;
        }
        if(ind.type==="supercharger"){
            // mechanically driven: boost ~ rpm/redline * peak * throttle - with bleed at low rpm
            const rpmFrac = Math.max(0, (this.rpm - 1100)/(s.redlineRpm-1100));
            const target = ind.peakBoostBar * Math.pow(rpmFrac,0.82) * Math.pow(this.throttle,0.92);
            const tau = 0.085; // slight belt slack
            this.boostBar += (target - this.boostBar)*(1 - Math.exp(-dt/tau));
            // sc rpm for whine
            this.turboRpm = 12000 + this.rpm*ind.scRatio*ind.rotorLobes*1.15;
            return;
        }
        if(ind.type==="turbo" || ind.type==="twincharged"){
            const rpmNorm = Math.max(0, (this.rpm - 1900)/(s.redlineRpm-1900));
            // compressor map: volumetric efficiency rises to ~0.95 at mid rpm then tapers
            const mapEff = 0.40 + 0.60*Math.sin(Math.min(1,rpmNorm)*Math.PI*0.55);
            // exhaust enthalpy ~ rpm * throttle * (1 + boost*0.18)
            const exhFlow = (this.rpm/1000)* Math.pow(this.throttle,0.95) * (1 + this.boostBar*0.20) * mapEff;
            let target = 0;
            if(this.throttle>0.08 && this.rpm>1700){
                const loadFac = Math.min(1, exhFlow/14);
                target = ind.peakBoostBar * loadFac * Math.pow(this.throttle,0.88);
                // twincharged: supercharger fills low end
                if(ind.type==="twincharged"){
                    const scPart = 0.55* ind.peakBoostBar* Math.pow(Math.max(0,(this.rpm-900)/(4300-900)),0.9) * this.throttle;
                    const turboPart = target * 0.82;
                    // compound: combined boost is not sum, but sequential efficiency
                    target = Math.min(ind.peakBoostBar, scPart*0.55 + turboPart*0.95);
                }
            } else {
                target = 0;
            }
            // lag dynamics: spool up slower than blowoff
            const tauUp = ind.turboTau || 0.42;
            const tauDown = 0.11;
            const tau = (target > this.boostBar)? tauUp : tauDown;
            this.boostBar += (target - this.boostBar)*(1 - Math.exp(-dt/tau));
            // add hysteresis and anti-lag pop
            if(ind.antiLag && this.throttle<0.06 && this.rpm>4200){
                this.boostBar = Math.max(this.boostBar, 0.38*ind.peakBoostBar*Math.min(1,(this.rpm-4200)/2500));
            }
            // turbo shaft rpm derived
            const boostNorm = this.boostBar/Math.max(0.15, ind.peakBoostBar);
            this.turboRpm = 22000 + boostNorm* (ind.maxTurboRpm -22000) + (this.rpm/1000)*420;
            this.turboRpm = Math.max(18000, Math.min(ind.maxTurboRpm, this.turboRpm));
            return;
        }
    }

    // snapshot for UI/audio
    snapshot(){
        return {
            rpm: this.rpm,
            vehicleSpeed: this.vehicleSpeed,
            speedKmh: this.vehicleSpeed*3.6,
            speedMph: this.vehicleSpeed*2.23694,
            gear: this.gear,
            gearLabel: this.gear===0?"N":String(this.gear),
            throttle: this.throttle,
            brake: this.brake,
            boostBar: this.boostBar,
            boostPsi: this.boostBar*14.5038,
            turboRpm: this.turboRpm,
            load: this.loadFactor,
            shifting: this.isShifting(),
            limiter: this.limiterActive,
            spec: this.spec
        };
    }
}
