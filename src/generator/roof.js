import * as THREE from 'three';

// Generate roof geometry with authentic Japanese Sori (反り) curve
export function createRoof(params, width, depth, floorY, rng, materials){
  const group = new THREE.Group();
  group.name='RoofSystem';
  const type = params.roofType;
  const height = params.roofHeight;
  const overhang = params.roofOverhang;
  const curve = params.roofCurve; // 0 flat, 1 strong sori
  const tileType = params.roofTileType;

  // common helper to apply sori to a plane geometry
  function applySori(geom, isXAxis, overhangX, overhangZ){
    const pos = geom.attributes.position;
    const v = new THREE.Vector3();
    for(let i=0;i<pos.count;i++){
      v.fromBufferAttribute(pos,i);
      // compute normalized distance from center for eaves lift
      // For gable roofs, sori affects corners more
      let nx = Math.abs(v.x) / (width/2 + overhang);
      let nz = Math.abs(v.z) / (depth/2 + overhang);
      // corner lift factor
      let corner = nx * nz;
      // edge lift
      let edge = Math.max(nx, nz);
      // sori lift is quadratic
      let lift = (corner*0.8 + edge*0.2) * curve * 0.9;
      // also raise along eaves edge
      lift = Math.pow(lift, 0.9) * height * 0.35;
      // Only lift if near eaves (outside building footprint)
      const insideX = Math.abs(v.x) < width/2*0.9;
      const insideZ = Math.abs(v.z) < depth/2*0.9;
      if(!insideX || !insideZ){
        v.y += lift;
      }
      // additional upturn at extreme corners
      if(nx>0.85 && nz>0.85){
        v.y += curve * 0.6;
        // pull out slightly
        v.x *= 1 + curve*0.04;
        v.z *= 1 + curve*0.04;
      }
      pos.setXYZ(i, v.x, v.y, v.z);
    }
    pos.needsUpdate=true;
    geom.computeVertexNormals();
    return geom;
  }

  if(type==='kirizuma'){
    // Simple gable
    const roofW = width + overhang*2;
    const roofD = depth + overhang*2;
    const geom = new THREE.BufferGeometry();
    const verts=[];
    const uvs=[];
    const indices=[];
    // two slopes meeting at ridge along X axis
    // left slope, right slope
    const segmentsX=12, segmentsZ=12;
    // Build as two planes with sori
    function buildSlope(side){
      const g = new THREE.PlaneGeometry(roofW, Math.sqrt(roofD*roofD/4 + height*height), segmentsX, segmentsZ);
      // rotate to slope
      // For gable, ridge at z=0, slopes go down in +z and -z
      const angle = Math.atan2(height, roofD/2);
      g.rotateX(side * angle - (side>0? Math.PI/2 : -Math.PI/2 + Math.PI)); // tricky, easier to manually set verts
      // We'll create manually instead
    }
    // Manual gable with sori
    const segs = 24;
    const ridgeY = floorY + height;
    const eaveY = floorY + 0.15;
    // Create roof as indexed grid for each side
    for(let s=-1; s<=1; s+=2){
      const geomSide = new THREE.BufferGeometry();
      const v=[];
      const uv=[];
      const ind=[];
      for(let iz=0; iz<=segs; iz++){
        const t = iz/segs; // 0 at ridge, 1 at eave
        const z = (s * (t*roofD/2));
        const y = ridgeY * (1-t) + eaveY * t;
        // add sori lift
        const liftFactor = Math.pow(t, 1.2) * curve * 0.8;
        for(let ix=0; ix<=segs; ix++){
          const tx = ix/segs;
          const x = (tx-0.5)*roofW;
          // corner lift: more at ends
          const cornerLift = Math.abs(tx-0.5)*2; // 0 center,1 edge
          let ly = y + liftFactor * (0.2 + cornerLift*0.8);
          // extreme corner upturn
          if(t>0.8 && cornerLift>0.7){
            ly += curve * 0.5 * (t-0.8)*5 * cornerLift;
          }
          v.push(x, ly, z);
          uv.push(tx, t);
        }
      }
      for(let iz=0; iz<segs; iz++){
        for(let ix=0; ix<segs; ix++){
          const a = iz*(segs+1)+ix;
          const b = a+1;
          const c = (iz+1)*(segs+1)+ix;
          const d = c+1;
          ind.push(a,c,b);
          ind.push(b,c,d);
        }
      }
      geomSide.setAttribute('position', new THREE.Float32BufferAttribute(v,3));
      geomSide.setAttribute('uv', new THREE.Float32BufferAttribute(uv,2));
      geomSide.setIndex(ind);
      geomSide.computeVertexNormals();
      const mesh = new THREE.Mesh(geomSide, materials.roofMat);
      mesh.castShadow=true;
      mesh.receiveShadow=true;
      group.add(mesh);

      // 3D tiles if enabled
      if(params.has3DTiles){
        const tiles = createTileInstancesForSlope(roofW, roofD/2, height, s, ridgeY, eaveY, params, rng, materials);
        group.add(tiles);
      }
    }
    // ridge cap
    if(params.hasRidgeOrnament || params.hasKawaraDetail){
      const ridgeGeom = new THREE.BoxGeometry(roofW+0.2, 0.18, 0.35);
      const ridge = new THREE.Mesh(ridgeGeom, materials.ridgeMat);
      ridge.position.set(0, ridgeY+0.1, 0);
      group.add(ridge);
    }
  } else if(type==='yosemune'){
    // Hip roof - 4 sides
    const roofW = width + overhang*2;
    const roofD = depth + overhang*2;
    const ridgeLen = Math.max(0.5, roofW - roofD);
    const ridgeY = floorY + height;
    const eaveY = floorY + 0.15;
    // hip roof built from 4 trapezoids
    // We'll build each side
    const sides = [
      {dir:'front', axis:'z', sign:1},
      {dir:'back', axis:'z', sign:-1},
      {dir:'left', axis:'x', sign:-1},
      {dir:'right', axis:'x', sign:1},
    ];
    // Use a pyramid with ridge
    const geom = new THREE.BufferGeometry();
    // Simplify: create roof via shape extrusion with sori
    const segs=16;
    // Front and back trapezoids
    for(let side of [-1,1]){
      const g = new THREE.BufferGeometry();
      const v=[], uv=[], ind=[];
      const halfW = roofW/2;
      const halfD = roofD/2;
      const halfRidge = ridgeLen/2;
      // quad from ridge ends to eave corners
      // We'll do grid
      for(let iz=0; iz<=segs; iz++){
        const t = iz/segs;
        const zTop = 0; // at ridge line
        const zBot = side*halfD;
        const z = THREE.MathUtils.lerp(zTop, zBot, t);
        const y = THREE.MathUtils.lerp(ridgeY, eaveY, t);
        const wTop = halfRidge;
        const wBot = halfW;
        const w = THREE.MathUtils.lerp(wTop, wBot, t);
        for(let ix=0; ix<=segs; ix++){
          const tx = ix/segs;
          const x = THREE.MathUtils.lerp(-w,w,tx);
          let ly = y;
          // sori lift
          const edgeT = t;
          const corner = Math.abs(tx-0.5)*2 * edgeT;
          ly += edgeT*curve*0.3 + corner*curve*0.6;
          if(edgeT>0.8 && Math.abs(tx-0.5)>0.35){
            ly+= curve*0.5;
          }
          v.push(x,ly,z);
          uv.push(tx,t);
        }
      }
      for(let iz=0; iz<segs; iz++){
        for(let ix=0; ix<segs; ix++){
          const a=iz*(segs+1)+ix;
          const b=a+1;
          const c=(iz+1)*(segs+1)+ix;
          const d=c+1;
          ind.push(a,c,b);
          ind.push(b,c,d);
        }
      }
      g.setAttribute('position', new THREE.Float32BufferAttribute(v,3));
      g.setAttribute('uv', new THREE.Float32BufferAttribute(uv,2));
      g.setIndex(ind);
      g.computeVertexNormals();
      const mesh=new THREE.Mesh(g, materials.roofMat);
      mesh.castShadow=true; mesh.receiveShadow=true;
      group.add(mesh);
      if(params.has3DTiles){
        // tiles for hip sides omitted for brevity, but we can instance simplified
      }
    }
    // Left/right triangles for hip ends
    for(let sideX of [-1,1]){
      const g=new THREE.BufferGeometry();
      const v=[], uv=[], ind=[];
      const halfD = roofD/2;
      const halfW = roofW/2;
      const halfRidge = ridgeLen/2;
      // triangle from ridge end to side eave
      for(let iz=0; iz<=segs; iz++){
        const t=iz/segs;
        const xTop = sideX*halfRidge;
        const xBot = sideX*halfW;
        const x = THREE.MathUtils.lerp(xTop,xBot,t);
        const w = THREE.MathUtils.lerp(0, halfD, t); // half depth at eave
        const y = THREE.MathUtils.lerp(ridgeY, eaveY, t);
        for(let ix=0; ix<=segs; ix++){
          const tx=ix/segs;
          const z = THREE.MathUtils.lerp(-w,w,tx);
          let ly=y;
          const corner = Math.abs(tx-0.5)*2 * t;
          ly+= t*curve*0.3 + corner*curve*0.5;
          if(t>0.8 && Math.abs(tx-0.5)>0.35) ly+=curve*0.5;
          v.push(x,ly,z);
          uv.push(tx,t);
        }
      }
      for(let iz=0; iz<segs; iz++){
        for(let ix=0; ix<segs; ix++){
          const a=iz*(segs+1)+ix;
          const b=a+1;
          const c=(iz+1)*(segs+1)+ix;
          const d=c+1;
          ind.push(a,c,b);
          ind.push(b,c,d);
        }
      }
      g.setAttribute('position', new THREE.Float32BufferAttribute(v,3));
      g.setAttribute('uv', new THREE.Float32BufferAttribute(uv,2));
      g.setIndex(ind);
      g.computeVertexNormals();
      const mesh=new THREE.Mesh(g, materials.roofMat);
      mesh.castShadow=true; mesh.receiveShadow=true;
      group.add(mesh);
    }
  } else if(type==='irimoya'){
    // Irimoya = yosemune lower + kirizuma upper gable
    // lower hip part
    const lowerHeight = height*0.6;
    const upperHeight = height*0.4;
    const lowerGroup = createRoof({...params, roofType:'yosemune', roofHeight:lowerHeight}, width, depth, floorY, rng, materials);
    group.add(lowerGroup);
    // upper gable on top
    const upperWidth = width*0.65;
    const upperDepth = depth*0.55;
    const upperFloorY = floorY + lowerHeight;
    const upperGroup = createRoof({...params, roofType:'kirizuma', roofHeight:upperHeight, roofOverhang: overhang*0.6}, upperWidth, upperDepth, upperFloorY, rng, materials);
    group.add(upperGroup);
    // add decorative board (hafu) for irimoya front
    const hafuGeom = new THREE.BufferGeometry();
    const hafuV=[];
    // simple triangular wall under upper gable
    hafuV.push(
      -upperWidth/2, upperFloorY, 0,
      upperWidth/2, upperFloorY, 0,
      0, upperFloorY+upperHeight*0.9, 0
    );
    hafuGeom.setAttribute('position', new THREE.Float32BufferAttribute(hafuV,3));
    hafuGeom.setIndex([0,1,2]);
    hafuGeom.computeVertexNormals();
    const hafuMesh=new THREE.Mesh(hafuGeom, materials.wallMat);
    hafuMesh.position.z = depth*0.28;
    group.add(hafuMesh);
    const hafuMesh2=hafuMesh.clone();
    hafuMesh2.position.z = -depth*0.28;
    hafuMesh2.rotation.y=Math.PI;
    group.add(hafuMesh2);
  } else if(type==='karahafu' || type==='nokikarahafu'){
    // Karahafu - cusped gable with undulating curve
    const roofW = width + overhang*2;
    const roofD = depth + overhang*2;
    const ridgeY = floorY + height;
    const eaveY = floorY + 0.15;
    const segs=32;
    // create curved front profile for karahafu
    // karahafu curve: S shape
    function karahafuCurve(t){
      // t 0..1 from bottom to top, returns x offset factor for curve
      // classic karahafu has outward bulge then inward
      return Math.sin(t*Math.PI*0.85)*0.6 + Math.sin(t*Math.PI*2.2)*0.15;
    }
    for(let side of [-1,1]){
      const g=new THREE.BufferGeometry();
      const v=[], uv=[], ind=[];
      for(let iz=0; iz<=segs; iz++){
        const t=iz/segs;
        const z = side * (t*roofD/2);
        const yBase = THREE.MathUtils.lerp(ridgeY, eaveY, t);
        for(let ix=0; ix<=segs; ix++){
          const tx=ix/segs;
          const x = (tx-0.5)*roofW;
          let y=yBase;
          if(type==='karahafu'){
            // apply karahafu front curve if near front/back edge and x near center?
            // Actually karahafu is on gable ends (x axis). So we need to distort y based on x
            const xNorm = Math.abs(tx-0.5)*2; // 0 center 1 edge
            if(side!==0){
              // for front/back sides, curve is in y vs x
              const curveFactor = karahafuCurve(1-xNorm) * height*0.4;
              y += curveFactor * (1-t*0.3);
            }
          }
          // sori
          const corner = Math.abs(tx-0.5)*2 * t;
          y+= t*curve*0.25 + corner*curve*0.5;
          if(t>0.85 && Math.abs(tx-0.5)>0.4) y+=curve*0.6;
          v.push(x,y,z);
          uv.push(tx,t);
        }
      }
      for(let iz=0; iz<segs; iz++){
        for(let ix=0; ix<segs; ix++){
          const a=iz*(segs+1)+ix;
          const b=a+1;
          const c=(iz+1)*(segs+1)+ix;
          const d=c+1;
          ind.push(a,c,b);
          ind.push(b,c,d);
        }
      }
      g.setAttribute('position', new THREE.Float32BufferAttribute(v,3));
      g.setAttribute('uv', new THREE.Float32BufferAttribute(uv,2));
      g.setIndex(ind);
      g.computeVertexNormals();
      const mesh=new THREE.Mesh(g, materials.roofMat);
      mesh.castShadow=true; mesh.receiveShadow=true;
      group.add(mesh);
    }
    // Add karahafu gable board with distinctive cusped shape
    const gableShape = new THREE.Shape();
    gableShape.moveTo(-roofW/2,0);
    // create cusped curve
    gableShape.bezierCurveTo(-roofW/2*0.7, height*0.3, -roofW/2*0.4, height*0.7, 0, height*0.9);
    gableShape.bezierCurveTo(roofW/2*0.4, height*0.7, roofW/2*0.7, height*0.3, roofW/2,0);
    gableShape.lineTo(-roofW/2,0);
    const gableGeom=new THREE.ShapeGeometry(gableShape);
    const gableMesh=new THREE.Mesh(gableGeom, materials.wallMat);
    gableMesh.position.set(0,floorY, depth/2+0.05);
    gableMesh.rotation.y=0;
    group.add(gableMesh);
    const gableMesh2=gableMesh.clone();
    gableMesh2.position.set(0,floorY, -depth/2-0.05);
    gableMesh2.rotation.y=Math.PI;
    group.add(gableMesh2);
  } else if(type==='pagoda'){
    // Multi-tier
    const tiers = 2 + Math.floor(rng.next()*2);
    let curY = floorY;
    let curW = width;
    let curD = depth;
    for(let i=0;i<tiers;i++){
      const h = height * (1 - i*0.15) / tiers * 2.2;
      const over = overhang * (1 + i*0.15);
      const tierRoof = createRoof({...params, roofType:'yosemune', roofHeight:h, roofOverhang:over}, curW, curD, curY, rng, materials);
      group.add(tierRoof);
      curY += h*0.55 + 0.8;
      curW *= 0.75;
      curD *= 0.75;
      // add floor for tier
      const floorGeom=new THREE.BoxGeometry(curW,0.25,curD);
      const floorMesh=new THREE.Mesh(floorGeom, materials.woodMat);
      floorMesh.position.set(0,curY-0.4,0);
      group.add(floorMesh);
    }
  }

  // Onigawara - demon tiles at corners and ends
  if(params.hasOnigawara){
    const corners = [
      [width/2+overhang, depth/2+overhang],
      [-width/2-overhang, depth/2+overhang],
      [width/2+overhang, -depth/2-overhang],
      [-width/2-overhang, -depth/2-overhang],
    ];
    corners.forEach(([x,z])=>{
      const oniGeom = new THREE.SphereGeometry(0.18, 12, 10, 0, Math.PI*2, 0, Math.PI*0.7);
      const oni = new THREE.Mesh(oniGeom, materials.ridgeMat);
      oni.position.set(x, floorY+0.25 + curve*0.5, z);
      oni.scale.set(1,0.8,1);
      // tilt outward
      oni.lookAt(x*1.2, floorY+1, z*1.2);
      group.add(oni);
      // small box under
      const base = new THREE.Mesh(new THREE.BoxGeometry(0.28,0.18,0.28), materials.ridgeMat);
      base.position.set(x, floorY+0.15, z);
      group.add(base);
    });
    // ridge end onigawara
    const ridgeEnds = [
      [width/2+overhang*0.5, 0],
      [-width/2-overhang*0.5, 0]
    ];
    if(type==='kirizuma' || type==='irimoya' || type==='karahafu'){
      ridgeEnds.forEach(([x])=>{
        const oni = new THREE.Mesh(new THREE.CylinderGeometry(0.14,0.16,0.22,10), materials.ridgeMat);
        oni.position.set(x, floorY+height+0.12, 0);
        oni.rotation.z=Math.PI/2;
        group.add(oni);
      });
    }
  }

  return group;
}

function createTileInstancesForSlope(roofW, roofDhalf, height, side, ridgeY, eaveY, params, rng, materials){
  const group=new THREE.Group();
  if(!params.has3DTiles) return group;
  const tileScale=params.tileScale;
  const tileW=0.28*tileScale;
  const tileH=0.32*tileScale;
  const rows = Math.floor(roofDhalf / tileH * 1.2);
  const cols = Math.floor(roofW / tileW);
  // simplified: use InstancedMesh for performance
  const tileGeom = new THREE.CapsuleGeometry ? createKawaraGeometry(tileW,tileH) : new THREE.BoxGeometry(tileW,0.05,tileH);
  const mat = materials.roofTileInstMat || materials.roofMat;
  let count = rows*cols;
  count=Math.min(count, 800); // limit
  const inst = new THREE.InstancedMesh(tileGeom, mat, count);
  let idx=0;
  const dummy=new THREE.Object3D();
  const angle = Math.atan2(height, roofDhalf);
  for(let r=0;r<rows && idx<count;r++){
    const t=r/rows;
    const z = side * (t*roofDhalf);
    const y = THREE.MathUtils.lerp(ridgeY, eaveY, t);
    for(let c=0;c<cols && idx<count;c++){
      if(rng.next()<0.02) continue; // occasional missing tile for age
      const x = (c/cols -0.5)*roofW + (r%2===0? tileW*0.25:0);
      dummy.position.set(x, y+0.06, z);
      dummy.rotation.x = -side*angle;
      dummy.rotation.y=0;
      dummy.rotation.z = (rng.next()-0.5)*0.03;
      dummy.scale.set(1,1,1);
      dummy.updateMatrix();
      inst.setMatrixAt(idx, dummy.matrix);
      idx++;
    }
  }
  inst.count=idx;
  inst.instanceMatrix.needsUpdate=true;
  inst.castShadow=true;
  group.add(inst);
  return group;
}

function createKawaraGeometry(w,h){
  // half cylinder tile
  const geom = new THREE.CylinderGeometry(w*0.45, w*0.45, h*0.9, 8,1,false,0,Math.PI);
  geom.rotateZ(Math.PI/2);
  geom.rotateX(Math.PI/2);
  return geom;
}
