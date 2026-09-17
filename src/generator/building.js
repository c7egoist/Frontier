import * as THREE from 'three';
import { SeededRandom, createWoodTexture, createWallTexture, createRoofTileTexture, createKanbanTexture, createNorenTexture, canvasToTexture, hexToRgb } from './utils.js';
import { createRoof } from './roof.js';

export function generateBuilding(params, scene, THREEContext=THREE){
  const rng = new SeededRandom(params.seed);
  const group = new THREE.Group();
  group.name='BuildingRoot';

  // Materials
  const woodCanvas = createWoodTexture(params.woodColor, params.woodType, params.woodAge);
  const wallCanvas = createWallTexture(params.wallColor, params.wallType, params.wallTexScale);
  const roofCanvas = createRoofTileTexture(params.roofTileType, params.roofColor, params.tileScale);

  const woodTex = canvasToTexture(woodCanvas, THREE);
  const wallTex = canvasToTexture(wallCanvas, THREE);
  const roofTex = canvasToTexture(roofCanvas, THREE);
  roofTex.repeat.set(2,2);

  const woodMat = new THREE.MeshStandardMaterial({ map: woodTex, color: params.woodColor, roughness: params.woodType==='yakisugi'?0.9:0.7, metalness:0.05 });
  const wallMat = new THREE.MeshStandardMaterial({ map: wallTex, color: params.wallColor, roughness:0.9, metalness:0 });
  const roofMat = new THREE.MeshStandardMaterial({ map: roofTex, color: params.roofColor, roughness:0.8, metalness: params.roofTileType==='copper'?0.3:0.05 });
  const ridgeMat = new THREE.MeshStandardMaterial({ color: params.roofTileType==='kawara_red' ? '#6b1515' : '#3a3a3a', roughness:0.6 });
  const roofTileInstMat = new THREE.MeshStandardMaterial({ color: params.roofColor, roughness:0.75 });

  const materials = { woodMat, wallMat, roofMat, ridgeMat, roofTileInstMat };

  // Floors count
  const floors = [params.floor1?1:0, params.floor2?1:0, params.floor3?1:0, params.floor4?1:0].filter(Boolean).length || 1;
  const actualFloors = (params.floor1?1:0)+(params.floor2?1:0)+(params.floor3?1:0)+(params.floor4?1:0);
  // We'll treat boolean floors as stacked, so if floor2 disabled but floor3 enabled, we still have 2 floors
  let floorCount = 1;
  if(params.floor2) floorCount=2;
  if(params.floor3) floorCount=3;
  if(params.floor4) floorCount=4;

  const width=params.width;
  const depth=params.depth;
  const floorHeight=params.floorHeight;

  let totalStats={polys:0, tiles:0, lights:0};

  // Foundation / base
  const baseGeom=new THREE.BoxGeometry(width+0.4, 0.35, depth+0.4);
  const baseMat=new THREE.MeshStandardMaterial({color:'#2b2b2b', roughness:0.9});
  const base=new THREE.Mesh(baseGeom, baseMat);
  base.position.y=0.175;
  base.receiveShadow=true;
  group.add(base);

  // Build each floor
  let currentY=0.35;
  for(let f=0; f<floorCount; f++){
    const isTop = f===floorCount-1;
    const isGround = f===0;
    const floorGroup=new THREE.Group();
    floorGroup.name=`Floor_${f+1}`;
    floorGroup.position.y=currentY;

    // Floor slab
    const slabGeom=new THREE.BoxGeometry(width,0.12,depth);
    const slab=new THREE.Mesh(slabGeom, woodMat);
    slab.position.y=0;
    slab.receiveShadow=true;
    floorGroup.add(slab);

    // Pillars - hashira
    const pillarSize=0.14 + rng.range(-0.01,0.02);
    const pillarH=floorHeight;
    const density=params.pillarDensity;
    // perimeter pillars
    const stepX = width / density;
    const stepZ = depth / density;
    for(let ix=0; ix<=density; ix++){
      for(let iz=0; iz<=density; iz++){
        if(ix>0 && ix<density && iz>0 && iz<density) continue; // only perimeter for outer
        // interior pillars occasionally
        if(ix>0 && ix<density && iz>0 && iz<density && rng.bool(0.3)) {}
        else if(!(ix===0||ix===density||iz===0||iz===density)) continue;
        const x = -width/2 + ix*stepX;
        const z = -depth/2 + iz*stepZ;
        // skip genkan area on ground floor front
        if(isGround && params.hasGenkan && iz===density && Math.abs(x)<1.2) continue;
        const pillarGeom=new THREE.BoxGeometry(pillarSize,pillarH,pillarSize);
        const pillar=new THREE.Mesh(pillarGeom, woodMat);
        pillar.position.set(x, pillarH/2, z);
        pillar.castShadow=true;
        floorGroup.add(pillar);
        totalStats.polys+=12;
      }
    }

    // Beams - nuki, etc
    const beamH=0.14;
    // horizontal beams around
    const beamGeomX=new THREE.BoxGeometry(width+0.1,beamH,0.12);
    const beamFront=new THREE.Mesh(beamGeomX, woodMat);
    beamFront.position.set(0, pillarH-0.2, depth/2);
    floorGroup.add(beamFront);
    const beamBack=beamFront.clone();
    beamBack.position.z=-depth/2;
    floorGroup.add(beamBack);
    const beamGeomZ=new THREE.BoxGeometry(0.12,beamH,depth);
    const beamLeft=new THREE.Mesh(beamGeomZ, woodMat);
    beamLeft.position.set(-width/2, pillarH-0.2,0);
    floorGroup.add(beamLeft);
    const beamRight=beamLeft.clone();
    beamRight.position.x=width/2;
    floorGroup.add(beamRight);

    // Walls - with openings
    const wallThickness=0.08;
    // For each side, create wall segments with shoji
    const sides=[
      {axis:'x', pos:depth/2, rot:0, len:width},
      {axis:'x', pos:-depth/2, rot:Math.PI, len:width},
      {axis:'z', pos:-width/2, rot:-Math.PI/2, len:depth},
      {axis:'z', pos:width/2, rot:Math.PI/2, len:depth},
    ];
    sides.forEach((side, idx)=>{
      const isFront = idx===0;
      const wallGroup=new THREE.Group();
      // decide wall type per floor
      const hasShoji = isFront ? true : rng.bool(0.7);
      const segments = Math.max(2, Math.floor(side.len / 1.2));
      for(let s=0; s<segments; s++){
        const segLen = side.len/segments;
        const xLocal = -side.len/2 + segLen/2 + s*segLen;
        // random opening
        let isOpening = false;
        if(isFront && isGround){
          isOpening = s>=1 && s<segments-1; // front is mostly open
        } else {
          isOpening = hasShoji && rng.bool(0.6);
        }
        // genkan exception
        if(isGround && isFront && s===Math.floor(segments/2)) isOpening=true;

        if(isOpening){
          // shoji frame
          const frameThick=0.04;
          const frameGeom=new THREE.BoxGeometry(segLen-0.02, pillarH*0.85, frameThick);
          const frameMat=new THREE.MeshStandardMaterial({color:'#f5f1e8', transparent:true, opacity:0.92, roughness:0.9});
          const frame=new THREE.Mesh(frameGeom, frameMat);
          // position
          if(side.axis==='x'){
            frame.position.set(xLocal, pillarH*0.45, 0);
          } else {
            frame.position.set(0, pillarH*0.45, xLocal);
          }
          // add kumiko grid
          const kumikoV=new THREE.Group();
          for(let k=1;k<3;k++){
            const bar=new THREE.Mesh(new THREE.BoxGeometry(segLen*0.9,0.02,0.01), woodMat);
            bar.position.set(0, (k/3-0.5)*pillarH*0.7, 0.03);
            kumikoV.add(bar);
          }
          for(let k=1;k<4;k++){
            const bar=new THREE.Mesh(new THREE.BoxGeometry(0.02,pillarH*0.7,0.01), woodMat);
            bar.position.set((k/4-0.5)*segLen*0.8,0,0.03);
            kumikoV.add(bar);
          }
          frame.add(kumikoV);
          wallGroup.add(frame);
        } else {
          // solid wall
          const wallGeom=new THREE.BoxGeometry(side.axis==='x'?segLen-0.02:wallThickness, pillarH*0.85, side.axis==='x'?wallThickness:segLen-0.02);
          const wMesh=new THREE.Mesh(wallGeom, wallMat);
          if(side.axis==='x'){
            wMesh.position.set(xLocal, pillarH*0.45,0);
          } else {
            wMesh.position.set(0,pillarH*0.45,xLocal);
          }
          wMesh.castShadow=true;
          wallGroup.add(wMesh);
        }
      }
      // place wallGroup at side position
      if(side.axis==='x'){
        wallGroup.position.z=side.pos;
      } else {
        wallGroup.position.x=side.pos;
      }
      floorGroup.add(wallGroup);
    });

    // Engawa veranda on ground floor
    if(isGround && params.hasEngawa){
      const engawaDepth=0.9;
      const engawaGeom=new THREE.BoxGeometry(width+0.6,0.12,engawaDepth);
      const engawa=new THREE.Mesh(engawaGeom, woodMat);
      engawa.position.set(0,0.06, depth/2+engawaDepth/2);
      engawa.receiveShadow=true;
      floorGroup.add(engawa);
      // engawa pillars
      for(let i=0;i<=Math.floor(width/1.2);i++){
        const x=-width/2 + i*(width/Math.floor(width/1.2));
        const p=new THREE.Mesh(new THREE.BoxGeometry(0.08,0.6,0.08), woodMat);
        p.position.set(x,0.3, depth/2+engawaDepth-0.05);
        floorGroup.add(p);
      }
    }

    // Second floor setback (sangai? actually lower roof)
    if(f===1 && params.hasSecondFloorSetback){
      // add small hisashi roof around first floor
      const hisashiGroup=new THREE.Group();
      const hisashiOver=0.8;
      const hisashiGeom=new THREE.BoxGeometry(width+hisashiOver*2,0.08,depth+hisashiOver*2);
      const hisashi=new THREE.Mesh(hisashiGeom, woodMat);
      hisashi.position.set(0,-0.2,0);
      hisashiGroup.add(hisashi);
      // supports
      floorGroup.add(hisashiGroup);
    }

    group.add(floorGroup);
    currentY+=floorHeight;
    totalStats.polys+=120;
  }

  // Roof
  const roofY = currentY - floorHeight + 0.35; // top of last floor slab? Actually currentY after loop is total height
  // Actually we want roof at currentY
  const roofBaseY = currentY -0.2;
  const roofGroup = createRoof(params, width, depth, roofBaseY, rng, materials);
  group.add(roofGroup);
  totalStats.polys+=500;
  totalStats.tiles+= Math.floor((width*depth)*4 * params.tileScale);

  // Details: Kanban signs
  if(params.hasKanban){
    const kanbanCanvas=createKanbanTexture(params.kanbanText, params.kanbanTextEn, params.kanbanStyle);
    const kanbanTex=canvasToTexture(kanbanCanvas, THREE);
    const kanbanMat=new THREE.MeshStandardMaterial({map:kanbanTex, roughness:0.7});
    const isVertical = params.kanbanStyle==='wood_vertical';
    const kanbanW = isVertical?0.6:1.8;
    const kanbanH = isVertical?2.0:0.7;
    const kanbanGeom=new THREE.BoxGeometry(kanbanW,kanbanH,0.06);
    const kanban=new THREE.Mesh(kanbanGeom, kanbanMat);
    // position front
    kanban.position.set(width/2+0.15, roofBaseY - floorHeight*0.6, 0.4);
    if(isVertical){
      kanban.rotation.y=-Math.PI/2;
    } else {
      kanban.position.set(0, roofBaseY -0.3, depth/2+0.2);
    }
    kanban.castShadow=true;
    group.add(kanban);

    // Small hanging sign under eaves
    if(params.hasSmallSigns){
      const smallCanvas=createKanbanTexture(params.kanbanTextEn, ' ', 'wood_horizontal');
      const smallTex=canvasToTexture(smallCanvas, THREE);
      const smallMat=new THREE.MeshStandardMaterial({map:smallTex});
      const small=new THREE.Mesh(new THREE.BoxGeometry(0.9,0.35,0.04), smallMat);
      small.position.set(0.2, roofBaseY-1.2, depth/2+0.35);
      group.add(small);
    }
  }

  // Noren
  if(params.hasNoren){
    const norenCanvas=createNorenTexture(params.norenText);
    const norenTex=canvasToTexture(norenCanvas, THREE);
    norenTex.transparent=true;
    const norenMat=new THREE.MeshStandardMaterial({map:norenTex, transparent:true, alphaTest:0.1, side:THREE.DoubleSide});
    const norenGeom=new THREE.PlaneGeometry(1.6,0.9,4,2);
    // add slight wave
    const pos=norenGeom.attributes.position;
    for(let i=0;i<pos.count;i++){
      const x=pos.getX(i);
      const y=pos.getY(i);
      pos.setZ(i, Math.sin(x*3)*0.02 + Math.sin(y*5)*0.01);
    }
    pos.needsUpdate=true;
    const noren=new THREE.Mesh(norenGeom, norenMat);
    noren.position.set(0, roofBaseY - floorHeight + 1.1, depth/2+0.25);
    group.add(noren);
  }

  // Lighting - chochin lanterns
  const lightsGroup=new THREE.Group();
  if(params.hasChochin && params.chochinCount>0){
    for(let i=0;i<params.chochinCount;i++){
      const x = rng.range(-width/2+0.3, width/2-0.3);
      const z = depth/2+0.35 + rng.range(-0.1,0.2);
      const y = roofBaseY - rng.range(0.8, floorHeight*0.6+0.5);
      const chochinGeom=new THREE.SphereGeometry(0.22,16,12);
      chochinGeom.scale(1,1.25,1);
      const chochinCanvas=document.createElement('canvas');
      chochinCanvas.width=256; chochinCanvas.height=512;
      const ctx=chochinCanvas.getContext('2d');
      ctx.fillStyle='#fff3e0';
      ctx.fillRect(0,0,256,512);
      ctx.fillStyle='#222';
      ctx.font='bold 60px Noto Serif JP';
      ctx.textAlign='center';
      ctx.fillText(rng.pick(['酒','居','食','飲','屋','田','山']),128,200);
      // stripes
      ctx.fillStyle='rgba(0,0,0,0.08)';
      for(let yy=0; yy<512; yy+=28){
        ctx.fillRect(0,yy,256,6);
      }
      const choTex=canvasToTexture(chochinCanvas, THREE);
      const choMat=new THREE.MeshStandardMaterial({map:choTex, emissive: hexToRgb(params.lightColor), emissiveIntensity: params.lightIntensity*0.25, roughness:0.8});
      const cho=new THREE.Mesh(chochinGeom, choMat);
      cho.position.set(x,y,z);
      lightsGroup.add(cho);
      // point light
      const pl=new THREE.PointLight(params.lightColor, params.lightIntensity*1.2, 6);
      pl.position.set(x,y,z);
      pl.userData.isChochin=true;
      lightsGroup.add(pl);
      totalStats.lights++;
      // wire
      const wireGeom=new THREE.CylinderGeometry(0.008,0.008, roofBaseY - y +0.5,4);
      const wire=new THREE.Mesh(wireGeom, new THREE.MeshStandardMaterial({color:'#111'}));
      wire.position.set(x, y + (roofBaseY - y)/2, z);
      lightsGroup.add(wire);
    }
  }
  if(params.hasAndon || params.lightType==='andon' || params.lightType==='modern_mixed'){
    const andonGeom=new THREE.BoxGeometry(0.28,0.42,0.28);
    const andonMat=new THREE.MeshStandardMaterial({color:'#f5f1e8', emissive:params.lightColor, emissiveIntensity:params.lightIntensity*0.2, transparent:true, opacity:0.9});
    for(let i=0;i<2;i++){
      const andon=new THREE.Mesh(andonGeom, andonMat);
      andon.position.set(rng.range(-width/2+0.5,width/2-0.5), 1.0, depth/2+0.15);
      lightsGroup.add(andon);
      const pl=new THREE.PointLight(params.lightColor, params.lightIntensity*0.8,5);
      pl.position.copy(andon.position);
      lightsGroup.add(pl);
      totalStats.lights++;
    }
  }
  if(params.hasInteriorLights){
    for(let f=0; f<floorCount; f++){
      const pl=new THREE.PointLight(params.lightColor, params.lightIntensity*0.5, 8);
      pl.position.set(rng.range(-width/3,width/3), f*floorHeight+1.5, rng.range(-depth/3,depth/3));
      lightsGroup.add(pl);
      totalStats.lights++;
    }
  }
  if(params.lightType==='neon' || params.lightType==='modern_mixed'){
    // neon strip
    const neonGeom=new THREE.BoxGeometry(width*0.8,0.04,0.04);
    const neonMat=new THREE.MeshStandardMaterial({color:params.lightColor, emissive:params.lightColor, emissiveIntensity:params.lightIntensity});
    const neon=new THREE.Mesh(neonGeom, neonMat);
    neon.position.set(0, roofBaseY-0.6, depth/2+0.18);
    lightsGroup.add(neon);
    const nl=new THREE.PointLight(params.lightColor, params.lightIntensity*1.5, 7);
    nl.position.copy(neon.position);
    lightsGroup.add(nl);
    totalStats.lights++;
  }
  group.add(lightsGroup);

  // Electric pole & phone lines - modern mix
  if(params.hasElectricPole){
    const poleGroup=new THREE.Group();
    const poleH=6.5;
    const poleGeom=new THREE.CylinderGeometry(0.08,0.1,poleH,8);
    const poleMat=new THREE.MeshStandardMaterial({color:'#5a4a3a', roughness:0.9});
    const pole=new THREE.Mesh(poleGeom, poleMat);
    pole.position.set(width/2+2.2, poleH/2, depth/2+0.5);
    poleGroup.add(pole);
    // cross arms
    const armGeom=new THREE.BoxGeometry(0.9,0.08,0.08);
    const arm1=new THREE.Mesh(armGeom, poleMat);
    arm1.position.set(width/2+2.2, poleH-0.6, depth/2+0.5);
    poleGroup.add(arm1);
    const arm2=arm1.clone();
    arm2.position.y=poleH-1.0;
    poleGroup.add(arm2);
    // insulators
    for(let i=0;i<3;i++){
      const ins=new THREE.Mesh(new THREE.CylinderGeometry(0.05,0.05,0.12,8), new THREE.MeshStandardMaterial({color:'#ddd'}));
      ins.position.set(width/2+2.2-0.3+i*0.3, poleH-0.6+0.1, depth/2+0.5);
      poleGroup.add(ins);
    }
    // wires to building
    if(params.hasPhoneLines){
      const points=[];
      points.push(new THREE.Vector3(width/2+2.2, poleH-0.6, depth/2+0.5));
      points.push(new THREE.Vector3(width/2+0.3, roofBaseY+0.2, depth/2+0.1));
      const curve=new THREE.CatmullRomCurve3(points);
      curve.curveType='catmullrom';
      // sag
      const wireGeom=new THREE.TubeGeometry(curve, 12, 0.012, 4, false);
      const wireMat=new THREE.MeshStandardMaterial({color:'#111'});
      const wire=new THREE.Mesh(wireGeom, wireMat);
      poleGroup.add(wire);
      // second wire
      const points2=[new THREE.Vector3(width/2+2.2, poleH-1.0, depth/2+0.5), new THREE.Vector3(width/2+0.2, roofBaseY-0.3, depth/2+0.2)];
      const curve2=new THREE.CatmullRomCurve3(points2);
      const wire2=new THREE.Mesh(new THREE.TubeGeometry(curve2,12,0.01,4,false), wireMat);
      poleGroup.add(wire2);
    }
    // meter box
    if(params.hasMeterBox){
      const meter=new THREE.Mesh(new THREE.BoxGeometry(0.22,0.32,0.12), new THREE.MeshStandardMaterial({color:'#ccc'}));
      meter.position.set(width/2+0.06, 1.2, depth/2+0.06);
      poleGroup.add(meter);
    }
    group.add(poleGroup);
  }

  // Aircon units - modern
  if(params.hasAircon){
    for(let i=0;i<floorCount;i++){
      if(rng.bool(0.7)){
        const ac=new THREE.Mesh(new THREE.BoxGeometry(0.6,0.4,0.22), new THREE.MeshStandardMaterial({color:'#e0e0e0'}));
        ac.position.set(width/2+0.15, i*floorHeight+1.0, rng.range(-depth/2+0.5, depth/2-0.5));
        ac.rotation.y=Math.PI/2;
        group.add(ac);
        // pipes
        const pipe=new THREE.Mesh(new THREE.CylinderGeometry(0.02,0.02,0.6,6), new THREE.MeshStandardMaterial({color:'#aaa'}));
        pipe.position.set(ac.position.x, ac.position.y+0.2, ac.position.z);
        pipe.rotation.z=Math.PI/2;
        group.add(pipe);
      }
    }
  }

  // Gutter - amadoi
  if(params.hasGutter){
    const gutterMat=new THREE.MeshStandardMaterial({color:'#6b5a4a', metalness:0.4, roughness:0.6});
    // simple line along eaves
    const gutterGeom=new THREE.TorusGeometry(0.06,0.015,6,24, Math.PI);
    // front gutter
    const gutterFront=new THREE.Mesh(new THREE.BoxGeometry(width+1.8,0.04,0.06), gutterMat);
    gutterFront.position.set(0, roofBaseY+0.05, depth/2+params.roofOverhang-0.05);
    group.add(gutterFront);
    // downspout
    const downspout=new THREE.Mesh(new THREE.CylinderGeometry(0.03,0.03, roofBaseY,8), gutterMat);
    downspout.position.set(width/2+0.4, roofBaseY/2, depth/2+params.roofOverhang-0.05);
    group.add(downspout);
  }

  // Posters
  if(params.hasPosters){
    const posterLines=params.posterTexts.split('\n').filter(Boolean);
    posterLines.forEach((line, idx)=>{
      const c=document.createElement('canvas');
      c.width=256; c.height=360;
      const ctx=c.getContext('2d');
      ctx.fillStyle= rng.pick(['#fff','#ffeb3b','#ffccbc','#c8e6c9']);
      ctx.fillRect(0,0,256,360);
      ctx.fillStyle='#111';
      ctx.font='bold 32px Noto Serif JP';
      ctx.textAlign='center';
      ctx.fillText(line.substring(0,12),128,180);
      ctx.strokeStyle='#111';
      ctx.lineWidth=3;
      ctx.strokeRect(4,4,248,352);
      const tex=canvasToTexture(c, THREE);
      const mat=new THREE.MeshStandardMaterial({map:tex, roughness:0.9});
      const mesh=new THREE.Mesh(new THREE.PlaneGeometry(0.6,0.84), mat);
      mesh.position.set(width/2+0.04, 1.2+idx*0.5, -depth/2+0.6+idx*0.35);
      mesh.rotation.y=-Math.PI/2;
      group.add(mesh);
    });
  }

  // Props - furniture
  if(params.hasFurniture){
    const propGroup=new THREE.Group();
    const density=params.furnitureDensity;
    if(params.hasZabuton){
      for(let i=0;i<Math.floor(density*6)+1;i++){
        const zabu=new THREE.Mesh(new THREE.BoxGeometry(0.5,0.08,0.5), new THREE.MeshStandardMaterial({color: rng.pick(['#c62828','#2e7d32','#1565c0','#6a1b9a']) }));
        zabu.position.set(rng.range(-width/2+0.6,width/2-0.6), 0.5, rng.range(-depth/2+0.6, depth/2-0.6));
        propGroup.add(zabu);
        // low table
        if(rng.bool(0.6)){
          const table=new THREE.Mesh(new THREE.BoxGeometry(0.9,0.28,0.6), woodMat);
          table.position.set(zabu.position.x+0.6, 0.65, zabu.position.z);
          propGroup.add(table);
        }
      }
    }
    if(params.hasChairsTables){
      for(let i=0;i<Math.floor(density*4);i++){
        const table=new THREE.Mesh(new THREE.BoxGeometry(0.8,0.7,0.8), woodMat);
        table.position.set(rng.range(-width/2+1,width/2-1), 0.8, rng.range(-depth/2+1, depth/2-1));
        propGroup.add(table);
        const chair=new THREE.Mesh(new THREE.BoxGeometry(0.4,0.8,0.4), woodMat);
        chair.position.set(table.position.x+0.6, 0.6, table.position.z);
        propGroup.add(chair);
      }
    }
    if(params.hasTansu){
      const tansu=new THREE.Mesh(new THREE.BoxGeometry(0.9,1.2,0.45), new THREE.MeshStandardMaterial({color:'#3e2723', roughness:0.8}));
      tansu.position.set(-width/2+0.6, 1.0, -depth/2+0.6);
      propGroup.add(tansu);
    }
    if(params.hasKitchen && (params.buildingUse==='izakaya' || params.buildingUse==='store')){
      const counter=new THREE.Mesh(new THREE.BoxGeometry(width*0.6,0.9,0.6), woodMat);
      counter.position.set(0,0.8, -depth/2+0.8);
      propGroup.add(counter);
      // bottles
      for(let b=0;b<5;b++){
        const bottle=new THREE.Mesh(new THREE.CylinderGeometry(0.05,0.05,0.3,8), new THREE.MeshStandardMaterial({color: rng.pick(['#2e7d32','#1565c0','#c62828']) }));
        bottle.position.set(counter.position.x + (b-2)*0.15, 1.4, counter.position.z);
        propGroup.add(bottle);
      }
    }
    group.add(propGroup);
  }

  // Plants / bonsai
  if(params.hasPlants){
    for(let i=0;i<3;i++){
      if(!rng.bool(0.7)) continue;
      const pot=new THREE.Mesh(new THREE.CylinderGeometry(0.18,0.15,0.22,8), new THREE.MeshStandardMaterial({color:'#5d4037'}));
      pot.position.set(rng.range(-width/2-0.3,width/2+0.3), 0.35, depth/2+0.7+rng.range(0,0.4));
      group.add(pot);
      const foliage=new THREE.Mesh(new THREE.SphereGeometry(0.28,10,8), new THREE.MeshStandardMaterial({color:'#2e7d32'}));
      foliage.position.set(pot.position.x, pot.position.y+0.3, pot.position.z);
      group.add(foliage);
    }
  }

  // Center group
  group.position.y=0;
  // Compute stats
  group.traverse(obj=>{
    if(obj.isMesh){
      if(obj.geometry){
        const polys=obj.geometry.index ? obj.geometry.index.count/3 : obj.geometry.attributes.position.count/3;
        totalStats.polys+=polys;
      }
    }
  });

  return {group, materials, stats: totalStats, rng};
}
