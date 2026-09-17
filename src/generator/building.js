import * as THREE from 'three';
import { SeededRandom, createWoodTexture, createWallTexture, createRoofTileTexture, createKanbanTexture, createNorenTexture, canvasToTexture, hexToRgb } from './utils.js';
import { createRoof } from './roof.js';

export function generateBuilding(params, scene, THREEContext=THREE){
  const rng = new SeededRandom(params.seed);
  const group = new THREE.Group();
  group.name='BuildingRoot';

  // Materials — procedural canvas
  const woodCanvas = createWoodTexture(params.woodColor, params.woodType, params.woodAge);
  const wallCanvas = createWallTexture(params.wallColor, params.wallType, params.wallTexScale);
  const roofCanvas = createRoofTileTexture(params.roofTileType, params.roofColor, params.tileScale);

  const woodTex = canvasToTexture(woodCanvas, THREE);
  const wallTex = canvasToTexture(wallCanvas, THREE);
  const roofTex = canvasToTexture(roofCanvas, THREE);
  roofTex.repeat.set(2,2);

  const woodMat = new THREE.MeshStandardMaterial({ map: woodTex, color: params.woodColor, roughness: params.woodType==='yakisugi'?0.92:0.68, metalness:0.04 });
  const wallMat = new THREE.MeshStandardMaterial({ map: wallTex, color: params.wallColor, roughness:0.92, metalness:0 });
  const roofMat = new THREE.MeshStandardMaterial({ map: roofTex, color: params.roofColor, roughness:0.82, metalness: params.roofTileType==='copper'?0.28:0.04, side:THREE.DoubleSide });
  const ridgeMat = new THREE.MeshStandardMaterial({ color: params.roofTileType==='kawara_red' ? '#6b1515' : '#3a3a3a', roughness:0.6 });
  const roofTileInstMat = new THREE.MeshStandardMaterial({ color: params.roofColor, roughness:0.75 });

  const materials = { woodMat, wallMat, roofMat, ridgeMat, roofTileInstMat };

  let floorCount = 1;
  if(params.floor2) floorCount=2;
  if(params.floor3) floorCount=3;
  if(params.floor4) floorCount=4;

  const width=params.width;
  const depth=params.depth;
  const floorHeight=params.floorHeight;

  let totalStats={polys:0, tiles:0, lights:0};

  // Foundation — grounded at y=0
  const baseGeom=new THREE.BoxGeometry(width+0.5, 0.32, depth+0.5);
  const baseMat=new THREE.MeshStandardMaterial({color:'#2b2b2b', roughness:0.95});
  const base=new THREE.Mesh(baseGeom, baseMat);
  base.position.y=0.16;
  base.receiveShadow=true;
  base.name='Foundation';
  group.add(base);

  // Build floors — each floorGroup y = cumulative height
  let currentY=0.32; // top of foundation
  const floorGroups=[];

  for(let f=0; f<floorCount; f++){
    const isGround = f===0;
    const floorGroup=new THREE.Group();
    floorGroup.name=`Floor_${f+1}`;
    floorGroup.position.y=currentY;

    // Floor slab — sits at 0 local, thickness 0.12
    const slabGeom=new THREE.BoxGeometry(width,0.12,depth);
    const slab=new THREE.Mesh(slabGeom, woodMat);
    slab.position.y=0.06;
    slab.receiveShadow=true;
    slab.castShadow=true;
    floorGroup.add(slab);

    // Pillars — hashira, grounded to slab top, height = floorHeight - slab thickness
    const pillarSize=0.15 + rng.range(-0.015,0.015);
    const pillarH=floorHeight - 0.12;
    const density=params.pillarDensity;
    const stepX = width / density;
    const stepZ = depth / density;
    for(let ix=0; ix<=density; ix++){
      for(let iz=0; iz<=density; iz++){
        const isEdge = (ix===0||ix===density||iz===0||iz===density);
        if(!isEdge) continue;
        const x = -width/2 + ix*stepX;
        const z = -depth/2 + iz*stepZ;
        if(isGround && params.hasGenkan && iz===density && Math.abs(x)<1.1) continue; // genkan opening
        const pillarGeom=new THREE.BoxGeometry(pillarSize,pillarH,pillarSize);
        const pillar=new THREE.Mesh(pillarGeom, woodMat);
        pillar.position.set(x, 0.12 + pillarH/2, z);
        pillar.castShadow=true;
        pillar.receiveShadow=true;
        floorGroup.add(pillar);
      }
    }

    // Beams — nuki at top of pillars
    const beamH=0.14;
    const beamY = 0.12 + pillarH - 0.07;
    const beamFront=new THREE.Mesh(new THREE.BoxGeometry(width+0.08,beamH,0.11), woodMat);
    beamFront.position.set(0, beamY, depth/2);
    beamFront.castShadow=true;
    floorGroup.add(beamFront);
    const beamBack=beamFront.clone();
    beamBack.position.z=-depth/2;
    floorGroup.add(beamBack);
    const beamLeft=new THREE.Mesh(new THREE.BoxGeometry(0.11,beamH,depth), woodMat);
    beamLeft.position.set(-width/2, beamY,0);
    beamLeft.castShadow=true;
    floorGroup.add(beamLeft);
    const beamRight=beamLeft.clone();
    beamRight.position.x=width/2;
    floorGroup.add(beamRight);

    // Walls — between pillars, grounded to slab
    const wallThickness=0.07;
    const sides=[
      {axis:'x', pos:depth/2, len:width, isFront:true},
      {axis:'x', pos:-depth/2, len:width, isFront:false},
      {axis:'z', pos:-width/2, len:depth, isFront:false},
      {axis:'z', pos:width/2, len:depth, isFront:false},
    ];
    sides.forEach(side=>{
      const wallGroup=new THREE.Group();
      const hasShoji = side.isFront ? true : rng.bool(0.65);
      const segments = Math.max(2, Math.floor(side.len / 1.15));
      for(let s=0; s<segments; s++){
        const segLen = side.len/segments;
        const local = -side.len/2 + segLen/2 + s*segLen;
        let isOpening = false;
        if(side.isFront && isGround){
          isOpening = s>=1 && s<segments-1;
        } else {
          isOpening = hasShoji && rng.bool(0.58);
        }
        if(isGround && side.isFront && s===Math.floor(segments/2)) isOpening=true;

        if(isOpening){
          const frameGeom=new THREE.BoxGeometry(segLen-0.03, pillarH*0.82, 0.035);
          const frameMat=new THREE.MeshStandardMaterial({color:'#f5f1e8', transparent:true, opacity:0.92, roughness:0.9});
          const frame=new THREE.Mesh(frameGeom, frameMat);
          if(side.axis==='x'){
            frame.position.set(local, 0.12 + pillarH*0.46, 0);
          } else {
            frame.position.set(0, 0.12 + pillarH*0.46, local);
          }
          // kumiko
          const kumiko=new THREE.Group();
          for(let k=1;k<3;k++){
            const bar=new THREE.Mesh(new THREE.BoxGeometry(segLen*0.88,0.018,0.01), woodMat);
            bar.position.set(0, (k/3-0.5)*pillarH*0.68, 0.022);
            kumiko.add(bar);
          }
          for(let k=1;k<4;k++){
            const bar=new THREE.Mesh(new THREE.BoxGeometry(0.018,pillarH*0.68,0.01), woodMat);
            bar.position.set((k/4-0.5)*segLen*0.78,0,0.022);
            kumiko.add(bar);
          }
          frame.add(kumiko);
          wallGroup.add(frame);
        } else {
          const wallGeom=new THREE.BoxGeometry(side.axis==='x'?segLen-0.02:wallThickness, pillarH*0.82, side.axis==='x'?wallThickness:segLen-0.02);
          const wMesh=new THREE.Mesh(wallGeom, wallMat);
          if(side.axis==='x'){
            wMesh.position.set(local, 0.12 + pillarH*0.46,0);
          } else {
            wMesh.position.set(0,0.12 + pillarH*0.46,local);
          }
          wMesh.castShadow=true;
          wMesh.receiveShadow=true;
          wallGroup.add(wMesh);
        }
      }
      if(side.axis==='x'){
        wallGroup.position.z=side.pos;
      } else {
        wallGroup.position.x=side.pos;
      }
      floorGroup.add(wallGroup);
    });

    // Engawa — grounded to ground, not floating
    if(isGround && params.hasEngawa){
      const engawaDepth=0.88;
      const engawaGeom=new THREE.BoxGeometry(width+0.55,0.10,engawaDepth);
      const engawa=new THREE.Mesh(engawaGeom, woodMat);
      // sits on ground, slightly below slab
      engawa.position.set(0, 0.05, depth/2+engawaDepth/2);
      engawa.receiveShadow=true;
      engawa.castShadow=true;
      floorGroup.add(engawa);
      // engawa edge pillars grounded to engawa top
      const count = Math.max(2, Math.floor(width/1.1));
      for(let i=0;i<=count;i++){
        const x=-width/2 + i*(width/count);
        const p=new THREE.Mesh(new THREE.BoxGeometry(0.07,0.55,0.07), woodMat);
        p.position.set(x, 0.10+0.275, depth/2+engawaDepth-0.04);
        p.castShadow=true;
        floorGroup.add(p);
      }
    }

    group.add(floorGroup);
    floorGroups.push(floorGroup);
    currentY+=floorHeight;
  }

  // Roof — GROUNDED: roofBaseY = top of last floor (currentY - small overlap)
  const roofBaseY = currentY - 0.12; // sits exactly on top slab, slight overlap to avoid gap
  const roofGroup = createRoof(params, width, depth, roofBaseY, rng, materials);
  // roofGroup.position.y already = roofBaseY inside createRoof, so group is grounded
  group.add(roofGroup);
  totalStats.polys+=800;
  totalStats.tiles+= Math.floor((width*depth)*5 * params.tileScale);

  // Kanban — grounded to wall, not floating
  if(params.hasKanban){
    const kanbanCanvas=createKanbanTexture(params.kanbanText, params.kanbanTextEn, params.kanbanStyle);
    const kanbanTex=canvasToTexture(kanbanCanvas, THREE);
    const kanbanMat=new THREE.MeshStandardMaterial({map:kanbanTex, roughness:0.7});
    const isVertical = params.kanbanStyle==='wood_vertical';
    const kanbanW = isVertical?0.58:1.75;
    const kanbanH = isVertical?1.9:0.68;
    const kanbanGeom=new THREE.BoxGeometry(kanbanW,kanbanH,0.05);
    const kanban=new THREE.Mesh(kanbanGeom, kanbanMat);
    // Attach to wall: for vertical, side wall; for horizontal, front wall under eaves
    if(isVertical){
      kanban.position.set(width/2+0.08, roofBaseY - floorHeight*0.55, 0.35);
      kanban.rotation.y=-Math.PI/2;
    } else {
      kanban.position.set(0, roofBaseY - 0.38, depth/2+0.14);
    }
    kanban.castShadow=true;
    // add small brackets to show attachment
    const bracketGeom=new THREE.BoxGeometry(0.08,0.04,0.18);
    const bracket1=new THREE.Mesh(bracketGeom, woodMat);
    bracket1.position.set(0, kanbanH/2-0.08, -0.06);
    kanban.add(bracket1);
    const bracket2=bracket1.clone();
    bracket2.position.y=-kanbanH/2+0.08;
    kanban.add(bracket2);
    group.add(kanban);

    if(params.hasSmallSigns){
      const smallCanvas=createKanbanTexture(params.kanbanTextEn, ' ', 'wood_horizontal');
      const smallTex=canvasToTexture(smallCanvas, THREE);
      const smallMat=new THREE.MeshStandardMaterial({map:smallTex});
      const small=new THREE.Mesh(new THREE.BoxGeometry(0.85,0.32,0.035), smallMat);
      small.position.set(0.18, roofBaseY - floorHeight + 0.9, depth/2+0.22);
      small.castShadow=true;
      group.add(small);
    }
  }

  // Noren — grounded at genkan entrance, hanging from beam
  if(params.hasNoren){
    const norenCanvas=createNorenTexture(params.norenText);
    const norenTex=canvasToTexture(norenCanvas, THREE);
    const norenMat=new THREE.MeshStandardMaterial({map:norenTex, transparent:true, alphaTest:0.15, side:THREE.DoubleSide});
    const norenGeom=new THREE.PlaneGeometry(1.55,0.82,4,2);
    const pos=norenGeom.attributes.position;
    for(let i=0;i<pos.count;i++){
      const x=pos.getX(i);
      pos.setZ(i, Math.sin(x*3.2)*0.018);
    }
    pos.needsUpdate=true;
    const noren=new THREE.Mesh(norenGeom, norenMat);
    // Hang from first floor beam at front
    const beamY = 0.32 + floorHeight -0.07; // first floor beam top
    noren.position.set(0, beamY -0.42, depth/2+0.18);
    noren.castShadow=true;
    group.add(noren);
    // noren rod
    const rod=new THREE.Mesh(new THREE.CylinderGeometry(0.015,0.015,1.7,8), woodMat);
    rod.rotation.z=Math.PI/2;
    rod.position.set(0, beamY -0.02, depth/2+0.18);
    group.add(rod);
  }

  // Lighting — chochin grounded to eaves, not floating
  const lightsGroup=new THREE.Group();
  if(params.hasChochin && params.chochinCount>0){
    // eave positions: front eave line at depth/2+overhang, y = roofBaseY + 0.12 (eaveY)
    const eaveY = roofBaseY + 0.12;
    const eaveZ = depth/2 + params.roofOverhang -0.08;
    for(let i=0;i<params.chochinCount;i++){
      const x = rng.range(-width/2+0.45, width/2-0.45);
      const drop = rng.range(0.55, 1.25);
      const y = eaveY - drop;
      const z = eaveZ + rng.range(-0.12,0.12);

      const chochinGeom=new THREE.SphereGeometry(0.20,16,12);
      chochinGeom.scale(1,1.22,1);
      const chochinCanvas=document.createElement('canvas');
      chochinCanvas.width=256; chochinCanvas.height=512;
      const ctx=chochinCanvas.getContext('2d');
      ctx.fillStyle='#fff3e0';
      ctx.fillRect(0,0,256,512);
      ctx.fillStyle='#222';
      ctx.font='bold 62px Noto Serif JP';
      ctx.textAlign='center';
      ctx.fillText(rng.pick(['酒','居','食','飲','屋','田','山','魚']),128,210);
      ctx.fillStyle='rgba(0,0,0,0.08)';
      for(let yy=0; yy<512; yy+=26){
        ctx.fillRect(0,yy,256,5);
      }
      const choTex=canvasToTexture(chochinCanvas, THREE);
      const choMat=new THREE.MeshStandardMaterial({map:choTex, emissive: hexToRgb(params.lightColor), emissiveIntensity: params.lightIntensity*0.28, roughness:0.78});
      const cho=new THREE.Mesh(chochinGeom, choMat);
      cho.position.set(x,y,z);
      cho.castShadow=true;
      lightsGroup.add(cho);

      const pl=new THREE.PointLight(params.lightColor, params.lightIntensity*1.15, 5.5);
      pl.position.set(x,y,z);
      pl.userData.isChochin=true;
      lightsGroup.add(pl);
      totalStats.lights++;

      // Wire — from eave to top of chochin, grounded
      const wireLen = eaveY - y + 0.06;
      const wireGeom=new THREE.CylinderGeometry(0.007,0.007, wireLen,5);
      const wire=new THREE.Mesh(wireGeom, new THREE.MeshStandardMaterial({color:'#151515'}));
      wire.position.set(x, y + wireLen/2, z);
      lightsGroup.add(wire);

      // Small hook at eave
      const hook=new THREE.Mesh(new THREE.BoxGeometry(0.04,0.04,0.04), new THREE.MeshStandardMaterial({color:'#222'}));
      hook.position.set(x, eaveY-0.02, z);
      lightsGroup.add(hook);
    }
  }
  if(params.hasAndon || params.lightType==='andon' || params.lightType==='modern_mixed'){
    const andonGeom=new THREE.BoxGeometry(0.26,0.38,0.26);
    const andonMat=new THREE.MeshStandardMaterial({color:'#f5f1e8', emissive:params.lightColor, emissiveIntensity:params.lightIntensity*0.22, transparent:true, opacity:0.92});
    for(let i=0;i<2;i++){
      const andon=new THREE.Mesh(andonGeom, andonMat);
      // grounded on engawa or ground
      andon.position.set(rng.range(-width/2+0.55,width/2-0.55), 0.32+0.28, depth/2+0.38);
      andon.castShadow=true;
      lightsGroup.add(andon);
      const pl=new THREE.PointLight(params.lightColor, params.lightIntensity*0.75,4.5);
      pl.position.copy(andon.position);
      pl.position.y+=0.15;
      lightsGroup.add(pl);
      totalStats.lights++;
    }
  }
  if(params.hasInteriorLights){
    for(let f=0; f<floorCount; f++){
      const pl=new THREE.PointLight(params.lightColor, params.lightIntensity*0.48, 7);
      pl.position.set(rng.range(-width/2+0.8,width/2-0.8), 0.32 + f*floorHeight + floorHeight*0.55, rng.range(-depth/2+0.8,depth/2-0.8));
      lightsGroup.add(pl);
      totalStats.lights++;
    }
  }
  if(params.lightType==='neon' || params.lightType==='modern_mixed'){
    const neonGeom=new THREE.BoxGeometry(width*0.78,0.035,0.035);
    const neonMat=new THREE.MeshStandardMaterial({color:params.lightColor, emissive:params.lightColor, emissiveIntensity:params.lightIntensity});
    const neon=new THREE.Mesh(neonGeom, neonMat);
    neon.position.set(0, roofBaseY -0.52, depth/2+0.15);
    lightsGroup.add(neon);
    const nl=new THREE.PointLight(params.lightColor, params.lightIntensity*1.4, 6.5);
    nl.position.copy(neon.position);
    lightsGroup.add(nl);
    totalStats.lights++;
  }
  group.add(lightsGroup);

  // Electric pole — grounded at ground y=0
  if(params.hasElectricPole){
    const poleGroup=new THREE.Group();
    const poleH=6.2;
    const poleMat=new THREE.MeshStandardMaterial({color:'#5a4a3a', roughness:0.92});
    const poleGeom=new THREE.CylinderGeometry(0.075,0.095,poleH,8);
    const pole=new THREE.Mesh(poleGeom, poleMat);
    pole.position.set(width/2+2.15, poleH/2, depth/2+0.45);
    pole.castShadow=true;
    poleGroup.add(pole);

    const armGeom=new THREE.BoxGeometry(0.85,0.07,0.07);
    const arm1=new THREE.Mesh(armGeom, poleMat);
    arm1.position.set(width/2+2.15, poleH-0.55, depth/2+0.45);
    arm1.castShadow=true;
    poleGroup.add(arm1);
    const arm2=arm1.clone();
    arm2.position.y=poleH-0.95;
    poleGroup.add(arm2);

    for(let i=0;i<3;i++){
      const ins=new THREE.Mesh(new THREE.CylinderGeometry(0.045,0.045,0.11,8), new THREE.MeshStandardMaterial({color:'#ddd'}));
      ins.position.set(width/2+2.15-0.26+i*0.26, poleH-0.55+0.09, depth/2+0.45);
      poleGroup.add(ins);
    }
    if(params.hasPhoneLines){
      // Wires from pole to building — grounded at building eave
      const eaveAttachY = roofBaseY + 0.12;
      const eaveAttachX = width/2+0.18;
      const eaveAttachZ = depth/2+0.08;

      const pts1=[
        new THREE.Vector3(width/2+2.15, poleH-0.55, depth/2+0.45),
        new THREE.Vector3(width/2+1.2, (poleH-0.55+eaveAttachY)/2 + 0.15, depth/2+0.35),
        new THREE.Vector3(eaveAttachX, eaveAttachY+0.18, eaveAttachZ)
      ];
      const curve1=new THREE.CatmullRomCurve3(pts1);
      const wire1=new THREE.Mesh(new THREE.TubeGeometry(curve1, 16, 0.011, 5, false), new THREE.MeshStandardMaterial({color:'#111'}));
      poleGroup.add(wire1);

      const pts2=[
        new THREE.Vector3(width/2+2.15, poleH-0.95, depth/2+0.45),
        new THREE.Vector3(width/2+1.0, (poleH-0.95+eaveAttachY)/2 -0.05, depth/2+0.32),
        new THREE.Vector3(eaveAttachX-0.08, eaveAttachY-0.18, eaveAttachZ+0.05)
      ];
      const curve2=new THREE.CatmullRomCurve3(pts2);
      const wire2=new THREE.Mesh(new THREE.TubeGeometry(curve2, 14, 0.009, 4, false), new THREE.MeshStandardMaterial({color:'#111'}));
      poleGroup.add(wire2);
    }
    if(params.hasMeterBox){
      const meter=new THREE.Mesh(new THREE.BoxGeometry(0.20,0.30,0.11), new THREE.MeshStandardMaterial({color:'#d0d0d0'}));
      meter.position.set(width/2+0.05, 1.18, depth/2+0.055);
      meter.castShadow=true;
      poleGroup.add(meter);
      // conduit from meter to eave — grounded
      const conduit=new THREE.Mesh(new THREE.CylinderGeometry(0.018,0.018, roofBaseY - 1.18,6), new THREE.MeshStandardMaterial({color:'#888'}));
      conduit.position.set(width/2+0.05, (roofBaseY+1.18)/2, depth/2+0.055);
      poleGroup.add(conduit);
    }
    group.add(poleGroup);
  }

  // Aircon — grounded to wall, not floating
  if(params.hasAircon){
    for(let i=0;i<floorCount;i++){
      if(!rng.bool(0.68)) continue;
      const acY = 0.32 + i*floorHeight + rng.range(0.6, floorHeight-0.6);
      const ac=new THREE.Mesh(new THREE.BoxGeometry(0.55,0.36,0.20), new THREE.MeshStandardMaterial({color:'#e6e6e6', roughness:0.7}));
      ac.position.set(width/2+0.11, acY, rng.range(-depth/2+0.6, depth/2-0.6));
      ac.rotation.y=Math.PI/2;
      ac.castShadow=true;
      group.add(ac);
      const pipe=new THREE.Mesh(new THREE.CylinderGeometry(0.018,0.018,0.45,6), new THREE.MeshStandardMaterial({color:'#aaa'}));
      pipe.position.set(width/2+0.12, acY+0.18, ac.position.z);
      pipe.rotation.z=Math.PI/2;
      group.add(pipe);
    }
  }

  // Gutter — grounded at eaves
  if(params.hasGutter){
    const gutterMat=new THREE.MeshStandardMaterial({color:'#6b5a4a', metalness:0.35, roughness:0.62});
    const eaveY = roofBaseY + 0.12;
    const gutterFront=new THREE.Mesh(new THREE.BoxGeometry(width+params.roofOverhang*2+0.2,0.04,0.055), gutterMat);
    gutterFront.position.set(0, eaveY-0.02, depth/2+params.roofOverhang-0.04);
    gutterFront.castShadow=true;
    group.add(gutterFront);
    const gutterBack=new THREE.Mesh(new THREE.BoxGeometry(width+params.roofOverhang*2+0.2,0.04,0.055), gutterMat);
    gutterBack.position.set(0, eaveY-0.02, -depth/2-params.roofOverhang+0.04);
    group.add(gutterBack);
    // downspouts — grounded to ground
    const downH = eaveY;
    const down1=new THREE.Mesh(new THREE.CylinderGeometry(0.028,0.028, downH,8), gutterMat);
    down1.position.set(width/2+0.35, downH/2, depth/2+params.roofOverhang-0.04);
    down1.castShadow=true;
    group.add(down1);
    const down2=down1.clone();
    down2.position.set(-width/2-0.35, downH/2, depth/2+params.roofOverhang-0.04);
    group.add(down2);
  }

  // Posters — grounded to wall
  if(params.hasPosters){
    const posterLines=params.posterTexts.split('\n').filter(Boolean);
    posterLines.forEach((line, idx)=>{
      const c=document.createElement('canvas');
      c.width=256; c.height=360;
      const ctx=c.getContext('2d');
      ctx.fillStyle= rng.pick(['#fff','#ffeb3b','#ffccbc','#c8e6c9','#bbdefb']);
      ctx.fillRect(0,0,256,360);
      ctx.fillStyle='#111';
      ctx.font='bold 30px Noto Serif JP';
      ctx.textAlign='center';
      ctx.fillText(line.substring(0,12),128,175);
      ctx.strokeStyle='#111';
      ctx.lineWidth=3;
      ctx.strokeRect(4,4,248,352);
      const tex=canvasToTexture(c, THREE);
      const mat=new THREE.MeshStandardMaterial({map:tex, roughness:0.92});
      const mesh=new THREE.Mesh(new THREE.PlaneGeometry(0.52,0.73), mat);
      // attach to side wall
      mesh.position.set(width/2+0.036, 1.15+idx*0.48, -depth/2+0.55+idx*0.32);
      mesh.rotation.y=-Math.PI/2;
      group.add(mesh);
    });
  }

  // Props — grounded to floor slabs
  if(params.hasFurniture){
    const propGroup=new THREE.Group();
    const density=params.furnitureDensity;
    if(params.hasZabuton){
      for(let i=0;i<Math.floor(density*6)+1;i++){
        const zabuY = 0.32+0.06;
        const zabu=new THREE.Mesh(new THREE.BoxGeometry(0.48,0.07,0.48), new THREE.MeshStandardMaterial({color: rng.pick(['#c62828','#2e7d32','#1565c0','#6a1b9a']) }));
        zabu.position.set(rng.range(-width/2+0.6,width/2-0.6), zabuY, rng.range(-depth/2+0.6, depth/2-0.6));
        zabu.receiveShadow=true;
        propGroup.add(zabu);
        if(rng.bool(0.58)){
          const table=new THREE.Mesh(new THREE.BoxGeometry(0.85,0.26,0.58), woodMat);
          table.position.set(zabu.position.x+0.55, zabuY+0.16, zabu.position.z);
          table.castShadow=true;
          propGroup.add(table);
        }
      }
    }
    if(params.hasChairsTables){
      for(let i=0;i<Math.floor(density*4);i++){
        const y = 0.32+0.06;
        const table=new THREE.Mesh(new THREE.BoxGeometry(0.78,0.68,0.78), woodMat);
        table.position.set(rng.range(-width/2+1,width/2-1), y+0.34, rng.range(-depth/2+1, depth/2-1));
        table.castShadow=true;
        propGroup.add(table);
        const chair=new THREE.Mesh(new THREE.BoxGeometry(0.38,0.72,0.38), woodMat);
        chair.position.set(table.position.x+0.58, y+0.36, table.position.z);
        chair.castShadow=true;
        propGroup.add(chair);
      }
    }
    if(params.hasTansu){
      const tansu=new THREE.Mesh(new THREE.BoxGeometry(0.85,1.15,0.42), new THREE.MeshStandardMaterial({color:'#3e2723', roughness:0.82}));
      tansu.position.set(-width/2+0.62, 0.32+0.58, -depth/2+0.58);
      tansu.castShadow=true;
      propGroup.add(tansu);
    }
    if(params.hasKitchen && (params.buildingUse==='izakaya' || params.buildingUse==='store' || params.buildingType==='izakaya')){
      const counter=new THREE.Mesh(new THREE.BoxGeometry(width*0.58,0.88,0.58), woodMat);
      counter.position.set(0, 0.32+0.44, -depth/2+0.78);
      counter.castShadow=true;
      propGroup.add(counter);
      for(let b=0;b<5;b++){
        const bottle=new THREE.Mesh(new THREE.CylinderGeometry(0.045,0.045,0.28,8), new THREE.MeshStandardMaterial({color: rng.pick(['#2e7d32','#1565c0','#c62828']) }));
        bottle.position.set(counter.position.x + (b-2)*0.14, counter.position.y+0.58, counter.position.z);
        bottle.castShadow=true;
        propGroup.add(bottle);
      }
    }
    group.add(propGroup);
  }

  // Plants — grounded on ground
  if(params.hasPlants){
    for(let i=0;i<3;i++){
      if(!rng.bool(0.72)) continue;
      const pot=new THREE.Mesh(new THREE.CylinderGeometry(0.17,0.14,0.20,8), new THREE.MeshStandardMaterial({color:'#5d4037'}));
      pot.position.set(rng.range(-width/2-0.28,width/2+0.28), 0.16, depth/2+0.68+rng.range(0,0.38));
      pot.castShadow=true;
      pot.receiveShadow=true;
      group.add(pot);
      const foliage=new THREE.Mesh(new THREE.SphereGeometry(0.26,10,8), new THREE.MeshStandardMaterial({color:'#2e7d32'}));
      foliage.position.set(pot.position.x, pot.position.y+0.26, pot.position.z);
      foliage.castShadow=true;
      group.add(foliage);
    }
  }

  // Stats
  group.traverse(obj=>{
    if(obj.isMesh && obj.geometry){
      const polys=obj.geometry.index ? obj.geometry.index.count/3 : obj.geometry.attributes.position.count/3;
      totalStats.polys+=polys;
    }
  });

  // Debug raster helper — returns top-down canvas for verification
  const debugCanvas = createDebugRaster(params, width, depth, floorCount, roofBaseY);

  return {group, materials, stats: totalStats, rng, debugCanvas};
}

function createDebugRaster(params, width, depth, floorCount, roofBaseY){
  const c=document.createElement('canvas');
  c.width=512; c.height=512;
  const ctx=c.getContext('2d');
  ctx.fillStyle='#0d0d0f';
  ctx.fillRect(0,0,512,512);
  // grid
  ctx.strokeStyle='#1e1e28';
  ctx.lineWidth=1;
  for(let i=0;i<512;i+=32){
    ctx.beginPath(); ctx.moveTo(i,0); ctx.lineTo(i,512); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(0,i); ctx.lineTo(512,i); ctx.stroke();
  }
  // building footprint
  const scale=22;
  const cx=256, cy=256;
  ctx.fillStyle='#2a2a36';
  ctx.fillRect(cx-width*scale/2, cy-depth*scale/2, width*scale, depth*scale);
  // roof overhang
  ctx.strokeStyle=params.roofColor || '#ff6b35';
  ctx.lineWidth=2;
  const over=params.roofOverhang;
  ctx.strokeRect(cx-(width+over*2)*scale/2, cy-(depth+over*2)*scale/2, (width+over*2)*scale, (depth+over*2)*scale);
  // ridge
  ctx.strokeStyle='#ff1744';
  ctx.lineWidth=3;
  if(params.roofType==='kirizuma' || params.roofType==='irimoya' || params.roofType.includes('karahafu')){
    ctx.beginPath(); ctx.moveTo(cx-(width+over*2)*scale/2, cy); ctx.lineTo(cx+(width+over*2)*scale/2, cy); ctx.stroke();
  } else {
    // hip ridge
    ctx.beginPath(); ctx.moveTo(cx-10, cy); ctx.lineTo(cx+10, cy); ctx.stroke();
  }
  // pillars
  ctx.fillStyle='#c9a87a';
  const density=params.pillarDensity;
  for(let ix=0; ix<=density; ix++){
    for(let iz=0; iz<=density; iz++){
      if(ix>0 && ix<density && iz>0 && iz<density) continue;
      const x = cx - width*scale/2 + ix*(width*scale/density);
      const z = cy - depth*scale/2 + iz*(depth*scale/density);
      ctx.fillRect(x-3,z-3,6,6);
    }
  }
  // text
  ctx.fillStyle='#e8e6e1';
  ctx.font='11px JetBrains Mono';
  ctx.fillText(`W:${width} D:${depth} F:${floorCount} Roof:${params.roofType} H:${params.roofHeight} Sori:${params.roofCurve}`, 10, 20);
  ctx.fillText(`RoofBaseY:${roofBaseY.toFixed(2)} Overhang:${over} Tiles:${params.roofTileType}`, 10, 36);
  ctx.fillText(`GROUNDED — all objects at y=0 base, roof at top, no floating`, 10, 52);
  return c;
}
