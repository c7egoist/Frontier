import test from 'node:test';
import assert from 'node:assert/strict';
import { DebrisSimulation, EruptionEmitter } from '../src/debris-simulation.js';
import { createHazards, groundY } from '../src/course.js';

test('eruption throws rock chunks, sand and dust upwards from the ground anchor',()=>{
 const sim=new DebrisSimulation();sim.emit(10,groundY(300),300,1,110);
 assert.equal(sim.activeCount,110);
 for(const kind of ['rock','sand','dust'])assert.ok(sim.particles.some(p=>p.alive&&p.kind===kind));
 for(const p of sim.particles.filter(p=>p.alive)){assert.ok(p.vy>0);assert.ok(Math.hypot(p.x-10,p.z-300)<1.81);}
 const rock=sim.particles.find(p=>p.kind==='rock'),y=rock.y;sim.update(.05);assert.ok(rock.y>y);
 for(let i=0;i<180;i++)sim.update(1/60);
 assert.ok(sim.particles.some(p=>p.kind==='rock'&&p.bounces>0));
 for(let i=0;i<600;i++)sim.update(1/60);assert.equal(sim.activeCount,0);
});
test('particle pool has a fixed memory bound under extreme eruption frequency',()=>{
 const sim=new DebrisSimulation(51,200);
 for(let i=0;i<200;i++)sim.emit(0,0,0,2,110);
 assert.equal(sim.particles.length,200);assert.equal(sim.activeCount,200);assert.equal(sim.emitted,22000);
});
test('warning crossing emits exactly once, continued growth lifts soil, pause emits nothing',()=>{
 const sim=new DebrisSimulation(),emitter=new EruptionEmitter(sim),r=createHazards()[0];r.preGrown=false;r.age=0;
 emitter.update([r],0);assert.equal(sim.emitted,0);
 r.age=r.warning+.1;emitter.update([r],1);assert.equal(sim.emitted,110);
 emitter.update([r],1);assert.equal(sim.emitted,110);
 r.age+=.5;emitter.update([r],2);assert.ok(sim.emitted>110);
 const initial=sim.emitted;emitter.update([r],2);assert.equal(sim.emitted,initial);
 for(let i=0;i<150;i++){r.age+=.5;emitter.update([r],3+i*.5);}
 const late=sim.emitted;r.age+=2;emitter.update([r],80);assert.ok(sim.emitted>late);
 emitter.clear();assert.equal(sim.activeCount,0);assert.equal(emitter.history.size,0);
});
test('inspection of existing mature geometry does not invent a late birth burst',()=>{
 const sim=new DebrisSimulation(),emitter=new EruptionEmitter(sim),r=createHazards()[0];r.preGrown=false;r.age=30;
 emitter.update([r],30);assert.equal(sim.emitted,0);
});
test('late soil emission starts outside the thickening stem rather than inside the wood',()=>{
 const sim=new DebrisSimulation();sim.emit(0,0,300,.5,48,4);
 for(const p of sim.particles.filter(p=>p.alive))assert.ok(Math.hypot(p.x,p.z-300)>=4);
});
test('debris supports a caller-supplied terrain floor instead of assuming forest height',()=>{
 const sim=new DebrisSimulation(17,100,()=>0);sim.emit(900,0,2600,1,40);
 for(let i=0;i<200;i++)sim.update(.02);
 for(const p of sim.particles.filter(p=>p.alive&&p.kind==='rock'))assert.ok(p.y>=p.size*.6-.00001);
});
