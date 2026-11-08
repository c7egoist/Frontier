import {test,expect} from '@playwright/test';
import {GLACIER,glacierY} from '../../src/glacier.js';

test('Scene 3 glacier driving, real ice failure, avalanche opening, random crystal showers and same-map portal',async({page})=>{
 test.setTimeout(180000);const errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
 await page.goto('/?scene=glacier&seed=711');await page.waitForFunction(()=>window.deadwood);
 await expect(page.locator('h1')).toHaveText('ICEBOUND.');expect((await page.evaluate(()=>window.deadwood.snapshot())).worldIndex).toBe(2);
 await page.screenshot({path:'test-results/glacier-intro.png'});
 await page.click('#start-button');await page.keyboard.down('w');await page.waitForFunction(()=>window.deadwood.snapshot().car.z>3304,{},{timeout:30000});await page.keyboard.up('w');
 expect((await page.evaluate(()=>window.deadwood.snapshot())).glacier.time).toBeGreaterThan(0);
 await page.keyboard.press('p');const frozen=await page.evaluate(()=>window.deadwood.snapshot().glacier.time);await page.waitForTimeout(350);expect(await page.evaluate(()=>window.deadwood.snapshot().glacier.time)).toBe(frozen);
 await page.keyboard.press('v');await expect(page.locator('#glacier-lab')).toBeVisible();await expect(page.locator('#garden-lab')).toBeHidden();expect((await page.evaluate(()=>window.deadwood.snapshot())).glacier.roofVisible).toBe(false);
 await page.click('#ice-break-demo');await page.waitForFunction(()=>window.deadwood.snapshot().glacier.fallAge>.35,{},{timeout:30000});
 let snap=await page.evaluate(()=>window.deadwood.snapshot());expect(snap.glacier.holes).toBe(1);expect(snap.glacier.brokenPlates).toBeGreaterThan(0);expect(snap.glacier.fractures).toBeGreaterThan(0);expect(snap.glacier.failed).toMatch(/broke/);expect(snap.pose.y).toBeLessThan(glacierY(snap.car.z-GLACIER.z)-.9);
 await page.screenshot({path:'test-results/glacier-breakthrough.png'});
 await page.click('#avalanche-demo');await page.waitForFunction(()=>window.deadwood.snapshot().glacier.avalanches[0]==='open',{},{timeout:30000});
 await page.screenshot({path:'test-results/glacier-avalanche-cut.png'});
 await page.click('#collapse-demo');await page.waitForFunction(()=>window.deadwood.snapshot().glacier.failed?.includes('collapse'),{},{timeout:30000});snap=await page.evaluate(()=>window.deadwood.snapshot());expect(snap.glacier.collapsedTiles).toBeGreaterThan(0);expect(snap.glacier.failed).toMatch(/collapse/);
 await page.screenshot({path:'test-results/glacier-collapse.png'});
 await page.click('#crystal-demo');await page.waitForFunction(()=>window.deadwood.snapshot().glacier.fallingCrystals>=12,{},{timeout:40000});const shower=await page.evaluate(()=>window.deadwood.snapshot().glacier);expect(shower.spawnedCrystals).toBeGreaterThanOrEqual(18);expect(shower.snowIslands).toBeGreaterThan(100);expect(shower.ridges).toBeGreaterThan(40);await page.screenshot({path:'test-results/glacier-crystal.png'});
 await page.locator('#beat-list button').nth(2).click();await page.click('#return-drive');await page.screenshot({path:'test-results/glacier-fleet.png'});
 await page.keyboard.press('v');await page.locator('#beat-list button').nth(4).click();await page.click('#return-drive');
 await page.keyboard.down('w');await page.waitForFunction(()=>window.deadwood.snapshot().worldIndex===3,{},{timeout:30000});await page.keyboard.up('w');
 snap=await page.evaluate(()=>window.deadwood.snapshot());expect(snap.complete).toBe(false);expect(snap.yard.hull).toBe(100);expect(snap.car.x).toBe(2700);expect(snap.car.z).toBe(5600);expect(snap.glacier.complete).toBe(true);
 await page.click('#study-glacier');await page.click('#start-button');snap=await page.evaluate(()=>window.deadwood.snapshot());expect(snap.worldIndex).toBe(2);expect(snap.car.z).toBe(3300);expect(snap.glacier.roofVisible).toBe(true);expect(snap.failed).toBe(false);expect(snap.glacier.hull).toBe(100);
 expect(errors).toEqual([]);
});

 test('restart scatters a fresh field and shower seed rather than repeating the route',async({page})=>{
  test.setTimeout(60000);await page.goto('/?scene=glacier');await page.waitForFunction(()=>window.deadwood);const intro=await page.evaluate(()=>window.deadwood.snapshot().glacier.seed);await page.click('#start-button');const started=await page.evaluate(()=>window.deadwood.snapshot().glacier.seed);expect(started).not.toBe(intro);await page.keyboard.press('r');const retry=await page.evaluate(()=>window.deadwood.snapshot().glacier);expect(retry.seed).not.toBe(started);expect(retry.spawnedCrystals).toBe(0);expect(retry.hull).toBe(100);
 });
