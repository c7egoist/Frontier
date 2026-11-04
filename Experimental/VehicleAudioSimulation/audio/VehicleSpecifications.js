/*==========================================================================================================================================
                                                      VEHICLE SPECIFICATIONS — ENGINEERING GRADE
                                     ------------------------------------------------------------------
                 Nine acoustic identities, each derived from crank kinematics, breathing and forced induction.
==========================================================================================================================================*/

// 🧩 Vehicle specifications: nine acoustic identities parameterized for procedural synthesis and honest drivetrain dynamics.

export const VEHICLE_PRESETS = [
    {
        id: "laferrari",
        name: "Ferrari LaFerrari",
        short: "LaFerrari · 6.3 V12 NA + HY-KERS",
        cylinders: 12,
        vAngleDeg: 65,
        displacementCc: 6262,
        idleRpm: 950,
        redlineRpm: 9250,
        limiterRpm: 9500,
        firingOrder: [1,7,5,11,3,9,6,12,2,8,4,10],
        crankPlane: "even-65",                   // smooth high-order scream
        massKg: 1585,
        dragCd: 0.32, frontalAreaM2: 1.91, wheelRadiusM: 0.335, cRoll: 0.011,
        finalDrive: 3.91,
        gearRatios: [3.30, 2.19, 1.63, 1.29, 1.05, 0.86, 0.69],
        shiftUpRpm: 8900, shiftDownRpm: 4200,
        torquePoints: [                          // rpm -> Nm (crank, NA, before KERS)
            {rpm:1000, tq:420}, {rpm:2500, tq:580}, {rpm:4000, tq:660}, {rpm:5500, tq:700}, {rpm:6750, tq:700}, {rpm:8000, tq:640}, {rpm:9250, tq:560}
        ],
        engineInertia: 0.18,
        induction: { type:"NA", peakBoostBar:0, scRatio:0, turboTau:0 },
        harmonics: { 0.5:0.06, 1:0.12, 1.5:0.05, 2:0.22, 3:0.58, 4:0.32, 5:0.16, 6:1.00, 7:0.42, 8:0.28, 9:0.14, 12:0.52 },
        exhaustResHz: 92, intakeResHz: 1450,
        character: { exhaust:1.00, intake:0.55, lowRumble:0.18, topScream:1.15, hyWhine:0.28 },
        hybrid: { electricAssistNm: 120, assistFadeRpm: 8500, inverterPolePairs:6, carrierHz: 9800 }
    },
    {
        id: "gtr",
        name: "Nissan GT-R NISMO",
        short: "GT-R NISMO · 3.8 V6 Twin-Turbo",
        cylinders: 6,
        vAngleDeg: 60,
        displacementCc: 3798,
        idleRpm: 820,
        redlineRpm: 7000,
        limiterRpm: 7200,
        firingOrder: [1,2,3,4,5,6],
        crankPlane: "even-120",
        massKg: 1720,
        dragCd: 0.26, frontalAreaM2: 2.02, wheelRadiusM: 0.340, cRoll: 0.011,
        finalDrive: 3.70,
        gearRatios: [4.06, 2.30, 1.54, 1.19, 1.00, 0.80],
        shiftUpRpm: 6600, shiftDownRpm: 3100,
        torquePoints: [{rpm:1000,tq:300},{rpm:2500,tq:480},{rpm:3200,tq:652},{rpm:4500,tq:652},{rpm:6000,tq:600},{rpm:7000,tq:520}],
        engineInertia: 0.24,
        induction: { type:"turbo", peakBoostBar:1.15, scRatio:0, turboTau:0.48, maxTurboRpm:140000, bladeCount:11, wastegateBar:1.15 },
        harmonics: { 0.5:0.08, 1:0.14, 1.5:0.26, 2:0.18, 3:1.00, 4:0.22, 5:0.11, 6:0.62, 9:0.20 },
        exhaustResHz: 78, intakeResHz: 1250,
        character: { exhaust:0.92, intake:0.72, lowRumble:0.32, topScream:0.88, turboHiss:0.90 }
    },
    {
        id: "mustang",
        name: "Ford Mustang GT",
        short: "Mustang GT · 5.0 V8 Crossplane",
        cylinders: 8,
        vAngleDeg: 90,
        displacementCc: 5038,
        idleRpm: 750,
        redlineRpm: 7400,
        limiterRpm: 7600,
        firingOrder: [1,5,4,8,6,3,7,2],           // classic crossplane burble: uneven 90/270 intervals
        crankPlane: "crossplane",
        massKg: 1810,
        dragCd: 0.35, frontalAreaM2: 2.18, wheelRadiusM: 0.345, cRoll: 0.012,
        finalDrive: 3.55,
        gearRatios: [4.23, 2.53, 1.67, 1.23, 1.00, 0.85, 0.65],
        shiftUpRpm: 7100, shiftDownRpm: 2800,
        torquePoints: [{rpm:1000,tq:380},{rpm:2600,tq:480},{rpm:3800,tq:536},{rpm:4600,tq:570},{rpm:5800,tq:540},{rpm:7400,tq:470}],
        engineInertia: 0.32,
        induction: { type:"NA", peakBoostBar:0, scRatio:0, turboTau:0 },
        harmonics: { 0.5:0.34, 1:0.22, 1.5:0.36, 2:0.78, 3:0.18, 4:1.00, 5:0.14, 6:0.26, 8:0.52 },
        exhaustResHz: 68, intakeResHz: 980,
        character: { exhaust:1.05, intake:0.38, lowRumble:0.62, topScream:0.72, burble:1.0 }
    },
    {
        id: "agera",
        name: "Koenigsegg Agera RS",
        short: "Agera RS · 5.0 V8 Twin-Turbo (FPC)",
        cylinders: 8,
        vAngleDeg: 90,
        displacementCc: 5065,
        idleRpm: 880,
        redlineRpm: 8250,
        limiterRpm: 8500,
        firingOrder: [1,8,4,3,6,5,7,2],
        crankPlane: "flatplane",
        massKg: 1395,
        dragCd: 0.33, frontalAreaM2: 1.68, wheelRadiusM: 0.335, cRoll: 0.011,
        finalDrive: 3.64,
        gearRatios: [3.45, 2.09, 1.47, 1.15, 0.96, 0.82, 0.69],
        shiftUpRpm: 8000, shiftDownRpm: 3600,
        torquePoints: [{rpm:1500,tq:700},{rpm:2700,tq:1100},{rpm:4100,tq:1280},{rpm:5600,tq:1350},{rpm:7000,tq:1280},{rpm:8250,tq:1150}],
        engineInertia: 0.19,
        induction: { type:"turbo", peakBoostBar:1.42, scRatio:0, turboTau:0.35, maxTurboRpm:155000, bladeCount:12, antiLag:true },
        harmonics: { 0.5:0.04, 1:0.10, 2:0.42, 4:1.00, 6:0.18, 8:0.68, 12:0.22 },
        exhaustResHz: 74, intakeResHz: 1320,
        character: { exhaust:0.95, intake:0.82, lowRumble:0.28, topScream:1.10, turboHiss:1.05 }
    },
    {
        id: "918",
        name: "Porsche 918 Spyder",
        short: "918 Spyder · 4.6 V8 NA + Hybrid (FPC)",
        cylinders: 8,
        vAngleDeg: 90,
        displacementCc: 4593,
        idleRpm: 900,
        redlineRpm: 9150,
        limiterRpm: 9400,
        firingOrder: [1,5,2,8,4,7,3,6],
        crankPlane: "flatplane-top-exhaust",
        massKg: 1640,
        dragCd: 0.34, frontalAreaM2: 1.79, wheelRadiusM: 0.332, cRoll: 0.011,
        finalDrive: 3.75,
        gearRatios: [3.91, 2.29, 1.58, 1.26, 1.03, 0.84, 0.67],
        shiftUpRpm: 8800, shiftDownRpm: 4000,
        torquePoints: [{rpm:1200,tq:340},{rpm:3500,tq:480},{rpm:5400,tq:540},{rpm:6600,tq:540},{rpm:8000,tq:510},{rpm:9150,tq:460}],
        engineInertia: 0.15,
        induction: { type:"NA", peakBoostBar:0, scRatio:0, turboTau:0 },
        harmonics: { 0.5:0.03, 1:0.09, 2:0.38, 4:1.00, 6:0.16, 8:0.62, 10:0.18 },
        exhaustResHz: 102, intakeResHz: 1680,
        character: { exhaust:0.98, intake:0.60, lowRumble:0.12, topScream:1.25, hyWhine:0.35, topExhaust:1.1 },
        hybrid: { electricAssistNm: 150, assistFadeRpm: 7500, inverterPolePairs:5, carrierHz: 10500 }
    },
    {
        id: "taycan",
        name: "Porsche Taycan Turbo S",
        short: "Taycan Turbo S · Dual-Motor Electric",
        cylinders: 0,
        vAngleDeg: 0,
        displacementCc: 0,
        idleRpm: 0,
        redlineRpm: 16000,               // motor rpm, displayed as such
        limiterRpm: 16200,
        firingOrder: [],
        crankPlane: "electric",
        massKg: 2295,
        dragCd: 0.22, frontalAreaM2: 2.33, wheelRadiusM: 0.345, cRoll: 0.011,
        finalDrive: 8.05,                // electric single reduction + 2-speed rear
        gearRatios: [8.05, 11.1],         // simplified: 1st & 2nd rear, front fixed
        shiftUpRpm: 9000, shiftDownRpm: 3500,
        torquePoints: [{rpm:0,tq:1050},{rpm:2500,tq:1050},{rpm:6000,tq:900},{rpm:10000,tq:600},{rpm:16000,tq:380}],
        engineInertia: 0.06,
        induction: { type:"electric", peakBoostBar:0, scRatio:0, turboTau:0 },
        harmonics: {},
        exhaustResHz: 0, intakeResHz: 0,
        character: { exhaust:0.0, intake:0.0, lowRumble:0.02, topScream:0.0, electric:1.0 },
        electricDrive: {
            polePairs: 6, baseCarrierHz: 8200, carrierModHz: 11000,
            rotorSlots: 48, whineGain: 0.9, inverterRipple: 0.15,
            regenWhine: 0.28, twoSpeedShiftRpm: 8500
        }
    },
    {
        id: "demon",
        name: "Dodge Challenger SRT Demon",
        short: "Demon · 6.2 V8 Supercharged 2.7L",
        cylinders: 8,
        vAngleDeg: 90,
        displacementCc: 6166,
        idleRpm: 780,
        redlineRpm: 6500,
        limiterRpm: 6750,
        firingOrder: [1,8,4,3,6,5,7,2],
        crankPlane: "crossplane",
        massKg: 1940,
        dragCd: 0.36, frontalAreaM2: 2.35, wheelRadiusM: 0.355, cRoll: 0.013,
        finalDrive: 3.09,
        gearRatios: [4.71, 3.14, 2.10, 1.67, 1.29, 1.00, 0.84, 0.67],
        shiftUpRpm: 6200, shiftDownRpm: 2800,
        torquePoints: [{rpm:1000,tq:650},{rpm:2400,tq:950},{rpm:3500,tq:1044},{rpm:4500,tq:1044},{rpm:5900,tq:980},{rpm:6500,tq:880}],
        engineInertia: 0.36,
        induction: { type:"supercharger", peakBoostBar:1.00, scRatio: 2.36, rotorLobes:3, scWhineGain:1.25, scDriveLossNm: 38, intercoolerEff:0.82 },
        harmonics: { 0.5:0.28, 1:0.18, 1.5:0.22, 2:0.68, 3:0.16, 4:1.00, 6:0.18, 8:0.42 },
        exhaustResHz: 62, intakeResHz: 820,
        character: { exhaust:1.12, intake:0.88, lowRumble:0.68, topScream:0.78, scWhine:1.35, blowerSurge:0.45 }
    },
    {
        id: "viper",
        name: "Dodge Viper ACR",
        short: "Viper ACR · 8.4 V10 NA",
        cylinders: 10,
        vAngleDeg: 90,
        displacementCc: 8382,
        idleRpm: 720,
        redlineRpm: 6400,
        limiterRpm: 6600,
        firingOrder: [1,6,5,10,2,7,3,8,4,9],
        crankPlane: "90deg-odd",
        massKg: 1556,
        dragCd: 0.37, frontalAreaM2: 2.05, wheelRadiusM: 0.342, cRoll: 0.011,
        finalDrive: 3.55,
        gearRatios: [2.66, 1.78, 1.30, 1.00, 0.74, 0.50],
        shiftUpRpm: 6100, shiftDownRpm: 2500,
        torquePoints: [{rpm:1000,tq:520},{rpm:2200,tq:680},{rpm:3600,tq:814},{rpm:4800,tq:814},{rpm:5800,tq:740},{rpm:6400,tq:680}],
        engineInertia: 0.38,
        induction: { type:"NA", peakBoostBar:0, scRatio:0, turboTau:0 },
        harmonics: { 0.5:0.18, 1:0.16, 1.5:0.12, 2:0.28, 2.5:0.52, 3:0.14, 5:1.00, 6:0.18, 10:0.62, 15:0.22 },
        exhaustResHz: 58, intakeResHz: 880,
        character: { exhaust:1.08, intake:0.42, lowRumble:0.74, topScream:0.82, oddWarble:1.0 }
    },
    {
        id: "challenger",
        name: "Dodge Challenger Hellcat · Twincharged",
        short: "Challenger · 6.2 V8 Twincharged (SC+Turbo)",
        cylinders: 8,
        vAngleDeg: 90,
        displacementCc: 6166,
        idleRpm: 790,
        redlineRpm: 6500,
        limiterRpm: 6750,
        firingOrder: [1,8,4,3,6,5,7,2],
        crankPlane: "crossplane",
        massKg: 2010,
        dragCd: 0.38, frontalAreaM2: 2.35, wheelRadiusM: 0.355, cRoll: 0.013,
        finalDrive: 3.09,
        gearRatios: [4.71, 3.14, 2.10, 1.67, 1.29, 1.00, 0.84, 0.67],
        shiftUpRpm: 6300, shiftDownRpm: 2900,
        torquePoints: [{rpm:1000,tq:680},{rpm:2100,tq:980},{rpm:3200,tq:1180},{rpm:4000,tq:1240},{rpm:5200,tq:1180},{rpm:6500,tq:1020}],
        engineInertia: 0.35,
        induction: { type:"twincharged", peakBoostBar:1.65, scRatio:2.10, rotorLobes:3, scWhineGain:0.92, turboTau:0.42, maxTurboRpm:145000, bladeCount:11, wastegateBar:1.65, compoundBalance:0.55 },
        harmonics: { 0.5:0.30, 1:0.20, 1.5:0.20, 2:0.72, 4:1.00, 6:0.20, 8:0.48 },
        exhaustResHz: 64, intakeResHz: 910,
        character: { exhaust:1.08, intake:0.95, lowRumble:0.62, topScream:0.88, scWhine:0.95, turboHiss:0.88, compoundHowl:1.10 }
    },
];

export function torqueAt(spec, rpm){
    const pts = spec.torquePoints;
    if(rpm <= pts[0].rpm) return pts[0].tq;
    if(rpm >= pts[pts.length-1].rpm) return pts[pts.length-1].tq;
    for(let i=0;i<pts.length-1;i++){
        if(rpm >= pts[i].rpm && rpm <= pts[i+1].rpm){
            const t = (rpm - pts[i].rpm) / (pts[i+1].rpm - pts[i].rpm);
            // smoothstep interpolation for honest dyno curve
            const s = t*t*(3-2*t);
            return pts[i].tq + s*(pts[i+1].tq - pts[i].tq);
        }
    }
    return pts[pts.length-1].tq;
}

export function firingFrequencyHz(spec, rpm){
    if(spec.cylinders===0) return 0;
    return (rpm/60) * (spec.cylinders/2);
}
