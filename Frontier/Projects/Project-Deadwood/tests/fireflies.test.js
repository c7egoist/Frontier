import test from 'node:test';
import assert from 'node:assert/strict';
import { createMaze } from '../src/garden.js';
import { createFireflies,advanceFireflies,FIREFLY } from '../src/fireflies.js';
import { createHull,applyHullDamage } from '../src/garden-combat.js';

test('seeded firefly clusters occupy tunnel and open passages, not a single repeated line',()=>{
 const m=createMaze(),a=createFireflies(m);assert.equal(a.length,80);assert.deepEqual(a,createFireflies(m));assert.notDeepEqual(a,createFireflies(m,17));
 assert.ok(new Set(a.map(f=>Math.floor(f.anchorZ))).size>30);
});
test('proximity arms a brief fuse; no immediate invisible explosion or damage',()=>{
 const fly=createFireflies(createMaze())[0],car={x:fly.x,z:fly.z};
 const first=advanceFireflies([fly],car,.01,0);assert.ok(first.some(e=>e.kind==='firefly-arm'));assert.ok(!first.some(e=>e.kind==='firefly-explode'));
 let events=[];for(let t=0;t<.6;t+=.01)events.push(...advanceFireflies([fly],car,.01,t));
 assert.equal(events.filter(e=>e.kind==='firefly-explode').length,1);assert.ok(events.find(e=>e.kind==='firefly-explode').damage>0);
 assert.equal(fly.state,'spent');assert.equal(advanceFireflies([fly],car,5,8).length,0);
});
test('leaving the blast radius before the fuse ends avoids damage',()=>{
 const fly=createFireflies(createMaze())[0],car={x:fly.x,z:fly.z};advanceFireflies([fly],car,.01,0);car.x+=30;
 let events=[];for(let t=0;t<1;t+=.01)events.push(...advanceFireflies([fly],car,.01,t));
 assert.equal(events.find(e=>e.kind==='firefly-explode').damage,0);
});
test('local chain reactions prime neighbours, not every insect in the level',()=>{
 const flies=createFireflies(createMaze()),first=flies[0];first.state='armed';first.timer=FIREFLY.fuse;
 const events=advanceFireflies(flies,{x:first.x+100,z:first.z},.01,0);
 assert.ok(events.some(e=>e.kind==='firefly-chain'));assert.ok(flies.some(f=>f.state==='idle'));
});
test('blast damage persists, short hit protection prevents same-frame swarm deletion, later blasts wreck',()=>{
 const hull=createHull();assert.ok(applyHullDamage(hull,48,0));assert.equal(hull.value,52);
 assert.equal(applyHullDamage(hull,48,.1),false);assert.equal(hull.value,52);
 assert.ok(applyHullDamage(hull,48,.7));assert.equal(hull.value,4);assert.ok(applyHullDamage(hull,10,1.4));assert.equal(hull.value,0);
 assert.equal(createHull().value,100);
});
