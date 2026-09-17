import * as THREE from 'three';

// Grounded roof system — all geometry LOCAL, y=0 at building top, eaves at 0.15
// group.position.y = floorY (top of building) set by caller
export function createRoof(params, width, depth, floorY, rng, materials){
  const group = new THREE.Group();
  group.name='RoofSystem';
  group.position.y = floorY; // CRITICAL: ground the roof to building top

  const type = params.roofType;
  const height = params.roofHeight;
  const overhang = params.roofOverhang;
  const curve = params.roofCurve;

  // local y: eave at 0.12, ridge at height
  const eaveY = 0.12;
  const ridgeY = height;

  if(type==='kirizuma'){
    const roofW = width + overhang*2;
    const roofD = depth + overhang*2;
    const segs = 28;

    // Build two slopes
    for(let side of [-1,1]){
      const geom = new THREE.BufferGeometry();
      const v=[], uv=[], ind=[];
      const halfD = roofD/2;

      for(let iz=0; iz<=segs; iz++){
        const t = iz/segs; // 0 ridge, 1 eave
        const z = side * (t*halfD);
        // y along slope
        const ySlope = THREE.MathUtils.lerp(ridgeY, eaveY, t);

        for(let ix=0; ix<=segs; ix++){
          const tx = ix/segs;
          const x = (tx-0.5)*roofW;

          // SORI: lift at eaves + corners
          const distFromCenterX = Math.abs(tx-0.5)*2; // 0 center,1 edge
          const tPow = Math.pow(t, 1.35);
          let lift = tPow * curve * 0.35; // general eave lift
          lift += distFromCenterX * tPow * curve * 0.65; // corner stronger
          // extreme corner upturn
          if(t>0.78 && distFromCenterX>0.72){
            const cornerFactor = (t-0.78)/0.22 * (distFromCenterX-0.72)/0.28;
            lift += cornerFactor * curve * 0.85;
          }
          const ly = ySlope + lift;
          // slight outward flare at corners
          const flare = (t>0.85 && distFromCenterX>0.8) ? 1 + curve*0.03 : 1;
          v.push(x*flare, ly, z*flare);
          uv.push(tx, t);
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
      geom.setAttribute('position', new THREE.Float32BufferAttribute(v,3));
      geom.setAttribute('uv', new THREE.Float32BufferAttribute(uv,2));
      geom.setIndex(ind);
      geom.computeVertexNormals();

      const mesh = new THREE.Mesh(geom, materials.roofMat);
      mesh.castShadow=true;
      mesh.receiveShadow=true;
      mesh.name=`Kirizuma_${side>0?'front':'back'}`;
      group.add(mesh);

      // Underside / ceiling to avoid see-through
      const underGeom = geom.clone();
      const underMat = new THREE.MeshStandardMaterial({color:'#2b1d12', roughness:0.9});
      const under = new THREE.Mesh(underGeom, underMat);
      under.position.y = -0.04;
      under.scale.set(0.995,1,0.995);
      group.add(under);

      // Fascia board at eave
      if(params.hasKawaraDetail || true){
        const fasciaGeom = new THREE.BoxGeometry(roofW+0.1, 0.12, 0.06);
        const fascia = new THREE.Mesh(fasciaGeom, materials.woodMat);
        fascia.position.set(0, eaveY+0.02 + (side>0?0:0), side*halfD);
        group.add(fascia);
      }

      // 3D tiles - grounded to roof surface
      if(params.has3DTiles){
        const tiles = createTilesOnSlope(roofW, halfD, ridgeY, eaveY, side, curve, params, rng, materials);
        group.add(tiles);
      }
    }

    // Ridge cap - grounded at ridge
    const ridgeGeom = new THREE.BoxGeometry(roofW+0.22, 0.16, 0.34);
    const ridge = new THREE.Mesh(ridgeGeom, materials.ridgeMat);
    ridge.position.set(0, ridgeY+0.08, 0);
    ridge.castShadow=true;
    group.add(ridge);

    // Munafuda / hafu gable boards at sides
    const gableMat = materials.wallMat;
    const gableShape = new THREE.Shape();
    gableShape.moveTo(-roofW/2, eaveY);
    gableShape.lineTo(roofW/2, eaveY);
    gableShape.lineTo(0, ridgeY);
    gableShape.lineTo(-roofW/2, eaveY);
    const gableGeom = new THREE.ShapeGeometry(gableShape);
    const gableFront = new THREE.Mesh(gableGeom, gableMat);
    gableFront.position.set(0,0, depth/2+0.02);
    gableFront.rotation.y=0;
    // only show for gable ends? Actually kirizuma gables are at X ends, not Z
    // So place at left/right
    const gableLeft = new THREE.Mesh(gableGeom, gableMat);
    gableLeft.position.set(-width/2-0.02,0,0);
    gableLeft.rotation.y = Math.PI/2;
    gableLeft.scale.set(depth/roofW,1,1);
    // adjust shape for side gable: need depth based
    // For simplicity, use triangle for side
    group.add(gableLeft);
    const gableRight = gableLeft.clone();
    gableRight.position.set(width/2+0.02,0,0);
    gableRight.rotation.y = -Math.PI/2;
    group.add(gableRight);
  }
  else if(type==='yosemune'){
    const roofW = width + overhang*2;
    const roofD = depth + overhang*2;
    const ridgeLen = Math.max(0.6, roofW - roofD + 0.6); // ensure some ridge
    const halfW = roofW/2;
    const halfD = roofD/2;
    const halfRidge = ridgeLen/2;
    const segs = 20;

    // front & back hips
    for(let side of [-1,1]){
      const g = new THREE.BufferGeometry();
      const v=[], uv=[], ind=[];
      for(let iz=0; iz<=segs; iz++){
        const t = iz/segs;
        const z = THREE.MathUtils.lerp(0, side*halfD, t);
        const y = THREE.MathUtils.lerp(ridgeY, eaveY, t);
        const w = THREE.MathUtils.lerp(halfRidge, halfW, t);
        for(let ix=0; ix<=segs; ix++){
          const tx = ix/segs;
          const x = THREE.MathUtils.lerp(-w,w,tx);
          const distX = Math.abs(tx-0.5)*2;
          let ly = y + Math.pow(t,1.2)*curve*0.3 + distX*t*curve*0.5;
          if(t>0.8 && distX>0.6) ly+= (t-0.8)*curve*1.2;
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
        const tiles = createTilesOnSlope(halfW*2, halfD, ridgeY, eaveY, side, curve, params, rng, materials, halfRidge);
        group.add(tiles);
      }
    }
    // left/right hip triangles
    for(let sideX of [-1,1]){
      const g=new THREE.BufferGeometry();
      const v=[], uv=[], ind=[];
      for(let iz=0; iz<=segs; iz++){
        const t=iz/segs;
        const x = THREE.MathUtils.lerp(sideX*halfRidge, sideX*halfW, t);
        const w = THREE.MathUtils.lerp(0, halfD, t);
        const y = THREE.MathUtils.lerp(ridgeY, eaveY, t);
        for(let ix=0; ix<=segs; ix++){
          const tx=ix/segs;
          const z = THREE.MathUtils.lerp(-w,w,tx);
          const distZ = Math.abs(tx-0.5)*2;
          let ly = y + Math.pow(t,1.2)*curve*0.3 + distZ*t*curve*0.5;
          if(t>0.8 && distZ>0.6) ly+= (t-0.8)*curve*1.2;
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
    // ridge
    const ridgeGeom=new THREE.BoxGeometry(ridgeLen+0.2,0.15,0.3);
    const ridge=new THREE.Mesh(ridgeGeom, materials.ridgeMat);
    ridge.position.set(0, ridgeY+0.07,0);
    group.add(ridge);
  }
  else if(type==='irimoya'){
    const lowerH = height*0.58;
    const upperH = height*0.42;
    // lower hip
    const lower = createRoof({...params, roofType:'yosemune', roofHeight:lowerH, roofOverhang:overhang}, width, depth, 0, rng, materials);
    group.add(lower);
    // upper gable
    const upperW = width*0.62;
    const upperD = depth*0.58;
    const upper = createRoof({...params, roofType:'kirizuma', roofHeight:upperH, roofOverhang:overhang*0.55}, upperW, upperD, lowerH-0.08, rng, materials);
    group.add(upper);
    // hafu boards under upper gable
    const hafuMat = materials.wallMat;
    const hafuGeom = new THREE.BufferGeometry();
    const hw = upperW/2;
    const hd = upperD/2;
    const hv = [
      -hw, 0, hd,
      hw, 0, hd,
      0, upperH*0.92, hd
    ];
    hafuGeom.setAttribute('position', new THREE.Float32BufferAttribute(hv,3));
    hafuGeom.setIndex([0,1,2]);
    hafuGeom.computeVertexNormals();
    const hafu = new THREE.Mesh(hafuGeom, hafuMat);
    hafu.position.set(0, lowerH-0.08, 0);
    group.add(hafu);
    const hafu2 = hafu.clone();
    hafu2.rotation.y=Math.PI;
    group.add(hafu2);
  }
  else if(type==='karahafu' || type==='nokikarahafu'){
    const roofW = width + overhang*2;
    const roofD = depth + overhang*2;
    const segs=28;
    const halfD = roofD/2;

    function karahafuCurve(t){
      return Math.sin(t*Math.PI*0.9)*0.65 + Math.sin(t*Math.PI*2.4)*0.12;
    }

    for(let side of [-1,1]){
      const g=new THREE.BufferGeometry();
      const v=[], uv=[], ind=[];
      for(let iz=0; iz<=segs; iz++){
        const t=iz/segs;
        const z = side * t*halfD;
        const yBase = THREE.MathUtils.lerp(ridgeY, eaveY, t);
        for(let ix=0; ix<=segs; ix++){
          const tx=ix/segs;
          const x = (tx-0.5)*roofW;
          let y=yBase;
          const xNorm = Math.abs(tx-0.5)*2;
          // karahafu cusped bulge at front
          const bulge = karahafuCurve(1-xNorm) * height*0.38 * (1-t*0.35);
          y+= bulge;
          // sori
          y+= Math.pow(t,1.2)*curve*0.25 + xNorm*t*curve*0.45;
          if(t>0.82 && xNorm>0.65) y+= (t-0.82)*curve*0.9;
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
    // karahafu gable board
    const gableShape = new THREE.Shape();
    gableShape.moveTo(-roofW/2, eaveY);
    gableShape.bezierCurveTo(-roofW/2*0.68, eaveY+height*0.32, -roofW/2*0.38, eaveY+height*0.72, 0, eaveY+height*0.92);
    gableShape.bezierCurveTo(roofW/2*0.38, eaveY+height*0.72, roofW/2*0.68, eaveY+height*0.32, roofW/2, eaveY);
    gableShape.lineTo(-roofW/2, eaveY);
    const gableGeom=new THREE.ShapeGeometry(gableShape);
    const gable=new THREE.Mesh(gableGeom, materials.wallMat);
    gable.position.set(0,0, depth/2+0.04);
    group.add(gable);
    const gable2=gable.clone();
    gable2.position.set(0,0, -depth/2-0.04);
    gable2.rotation.y=Math.PI;
    group.add(gable2);

    // ridge
    const ridge=new THREE.Mesh(new THREE.BoxGeometry(roofW+0.2,0.14,0.28), materials.ridgeMat);
    ridge.position.set(0, ridgeY+0.07,0);
    group.add(ridge);
  }
  else if(type==='pagoda'){
    let curY=0;
    let curW=width;
    let curD=depth;
    const tiers = 2 + Math.floor(rng.next()*2);
    for(let i=0;i<tiers;i++){
      const h = height * (1 - i*0.14) / tiers * 2.1;
      const over = overhang * (1 + i*0.12);
      const tier = createRoof({...params, roofType:'yosemune', roofHeight:h, roofOverhang:over}, curW, curD, curY, rng, materials);
      group.add(tier);
      curY += h*0.52 + 0.75;
      curW *= 0.72;
      curD *= 0.72;
      const floorGeom=new THREE.BoxGeometry(curW,0.22,curD);
      const floorMesh=new THREE.Mesh(floorGeom, materials.woodMat);
      floorMesh.position.set(0, curY-0.38,0);
      floorMesh.receiveShadow=true;
      floorMesh.castShadow=true;
      group.add(floorMesh);
    }
  }

  // Onigawara - grounded at eaves
  if(params.hasOnigawara){
    const corners = [
      [width/2+overhang, depth/2+overhang],
      [-width/2-overhang, depth/2+overhang],
      [width/2+overhang, -depth/2-overhang],
      [-width/2-overhang, -depth/2-overhang],
    ];
    corners.forEach(([x,z])=>{
      const lift = curve*0.55;
      const y = eaveY + lift + 0.08;
      const oniGeom = new THREE.SphereGeometry(0.16, 12, 10, 0, Math.PI*2, 0, Math.PI*0.68);
      const oni = new THREE.Mesh(oniGeom, materials.ridgeMat);
      oni.position.set(x, y, z);
      oni.scale.set(1,0.85,1);
      // orient outward
      oni.lookAt(x*1.15, y+0.5, z*1.15);
      oni.castShadow=true;
      group.add(oni);
      const base = new THREE.Mesh(new THREE.BoxGeometry(0.26,0.16,0.26), materials.ridgeMat);
      base.position.set(x, eaveY+0.02, z);
      base.castShadow=true;
      group.add(base);
    });
    if(type==='kirizuma' || type==='irimoya' || type==='karahafu' || type==='nokikarahafu'){
      const ends = [width/2+overhang*0.5, -width/2-overhang*0.5];
      ends.forEach(x=>{
        const oni = new THREE.Mesh(new THREE.CylinderGeometry(0.13,0.15,0.20,10), materials.ridgeMat);
        oni.position.set(x, ridgeY+0.10, 0);
        oni.rotation.z=Math.PI/2;
        oni.castShadow=true;
        group.add(oni);
      });
    }
  }

  return group;
}

function createTilesOnSlope(roofW, halfD, ridgeY, eaveY, side, curve, params, rng, materials, halfRidgeOverride=null){
  const group=new THREE.Group();
  if(!params.has3DTiles) return group;

  const tileScale=params.tileScale;
  const tileW=0.26*tileScale;
  const tileH=0.30*tileScale;
  const rows = Math.max(4, Math.floor(halfD / tileH * 1.1));
  const cols = Math.max(6, Math.floor(roofW / tileW));

  // Use small box for tile to avoid floating artifacts, but with slight curve
  const tileGeom = createKawaraTileGeom(tileW, tileH);

  const mat = materials.roofTileInstMat || materials.roofMat;
  const count = Math.min(rows*cols, 900);
  const inst = new THREE.InstancedMesh(tileGeom, mat, count);
  inst.castShadow=true;
  inst.receiveShadow=true;

  let idx=0;
  const dummy=new THREE.Object3D();
  const slopeAngle = Math.atan2(ridgeY - eaveY, halfD);

  for(let r=0; r<rows && idx<count; r++){
    const t = r/rows; // 0 ridge, 1 eave
    const zLocal = side * (t*halfD);
    const yLocal = THREE.MathUtils.lerp(ridgeY, eaveY, t);
    // sori lift for tile row
    const liftBase = Math.pow(t,1.3)*curve*0.32;

    // width at this t if hip (trapezoid)
    let curW = roofW;
    if(halfRidgeOverride!==null){
      const halfRidge = halfRidgeOverride;
      const halfW = roofW/2;
      curW = THREE.MathUtils.lerp(halfRidge*2, halfW*2, t);
    }

    for(let c=0; c<cols && idx<count; c++){
      if(rng.next()<0.015) continue; // missing tile
      const tx = c/cols;
      const x = (tx-0.5)*curW + (r%2===0? tileW*0.2:0);
      const distX = Math.abs(tx-0.5)*2;
      let y = yLocal + liftBase + distX*t*curve*0.45;
      if(t>0.78 && distX>0.7) y+= (t-0.78)*curve*0.75;

      dummy.position.set(x, y+0.035, zLocal);
      // rotate to follow slope
      dummy.rotation.set(-side*slopeAngle, 0, (rng.next()-0.5)*0.02);
      // slight random
      dummy.scale.set(1,1,1);
      dummy.updateMatrix();
      inst.setMatrixAt(idx, dummy.matrix);
      idx++;
    }
  }
  inst.count=idx;
  inst.instanceMatrix.needsUpdate=true;
  group.add(inst);
  return group;
}

function createKawaraTileGeom(w,h){
  // flat tile with slight arch - not full half cylinder to avoid floating
  // Use box with top rounded via small bevel, but keep bottom flat to sit on roof
  const geom = new THREE.BoxGeometry(w*0.88, 0.045, h*0.88);
  // add slight arch by displacing top vertices
  const pos = geom.attributes.position;
  for(let i=0;i<pos.count;i++){
    const y = pos.getY(i);
    if(y>0){
      const x = pos.getX(i);
      const arch = Math.cos((x/(w*0.44))*Math.PI*0.45)*0.02;
      pos.setY(i, y+arch);
    }
  }
  pos.needsUpdate=true;
  geom.computeVertexNormals();
  return geom;
}
