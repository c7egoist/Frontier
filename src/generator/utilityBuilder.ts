import * as THREE from 'three';
import { BuildingConfig } from '../types/generator';
import { MaterialManager } from '../materials/materialManager';

export class UtilityBuilder {
  private config: BuildingConfig;
  private matManager: MaterialManager;

  constructor(config: BuildingConfig, matManager: MaterialManager) {
    this.config = config;
    this.matManager = matManager;
  }

  /**
   * Builds utility pole, catenary powerlines, AC units, vending machine, and meters
   */
  public buildUtilities(
    buildingWidth: number, 
    buildingDepth: number, 
    totalHeight: number
  ): THREE.Group {
    const group = new THREE.Group();
    group.name = "ModernUtilitiesAndInfrastructure";

    const { 
      hasPhonePole, 
      poleDistance, 
      sagFactor, 
      wireCount, 
      hasTransformers, 
      hasStreetMirror,
      hasACUnits, 
      acCount, 
      hasVendingMachine, 
      hasUtilityMeters 
    } = this.config.electricity;

    const halfW = buildingWidth / 2;
    const halfD = buildingDepth / 2;

    // Pole Position in Alley / Street
    const poleX = halfW + poleDistance;
    const poleZ = halfD + 2.0;
    const poleHeight = Math.max(9.5, totalHeight * 0.95);

    // 1. Telephone / Utility Pole System
    if (hasPhonePole) {
      const poleGroup = this.buildTelephonePole(poleX, poleZ, poleHeight, hasTransformers, hasStreetMirror);
      group.add(poleGroup);

      // Building Rooftop Weatherhead Service Mast (where wires attach)
      const mastX = halfW - 0.4;
      const mastY = totalHeight * 0.85;
      const mastZ = halfD - 0.2;
      const mast = this.buildServiceMast(mastX, mastY, mastZ);
      group.add(mast);

      // Catenary Sagging Powerlines connecting Pole to Building
      const powerlines = this.buildCatenaryWires(
        new THREE.Vector3(poleX, poleHeight - 1.2, poleZ),
        new THREE.Vector3(mastX, mastY + 0.6, mastZ),
        wireCount,
        sagFactor
      );
      group.add(powerlines);
    }

    // 2. Modern Outdoor AC Split-Unit Compressors
    if (hasACUnits && acCount > 0) {
      for (let i = 0; i < acCount; i++) {
        // Distribute AC units on side facade or upper balcony
        const floorLevel = Math.min(this.config.floors - 1, i);
        const acY = floorLevel * this.config.floorHeight + 0.8;
        const acX = halfW + 0.35;
        const acZ = -halfD * 0.4 + i * 2.2;

        const acUnit = this.buildACUnit(acX, acY, acZ);
        group.add(acUnit);
      }
    }

    // 3. Japanese Beverage Vending Machine
    if (hasVendingMachine) {
      const vmX = -halfW * 0.65;
      const vmY = 0;
      const vmZ = halfD + 0.85;
      const vendingMachine = this.buildVendingMachine(vmX, vmY, vmZ);
      group.add(vendingMachine);
    }

    // 4. Electric Utility Meters & Conduit Pipes
    if (hasUtilityMeters) {
      const meterX = halfW + 0.08;
      const meterY = 1.6;
      const meterZ = halfD - 1.2;
      const meterBox = this.buildUtilityMeter(meterX, meterY, meterZ, totalHeight * 0.8);
      group.add(meterBox);
    }

    return group;
  }

  /**
   * Authentic Japanese Concrete Utility Pole
   */
  private buildTelephonePole(
    x: number, 
    z: number, 
    height: number, 
    hasTransformer: boolean, 
    hasMirror: boolean
  ): THREE.Group {
    const poleGroup = new THREE.Group();
    poleGroup.name = "JapaneseUtilityPole";

    const concreteMat = this.matManager.get('pole_concrete');
    const steelMat = this.matManager.get('steel');
    const insulatorMat = this.matManager.get('ceramic_insulator');

    // Tapered Concrete Column
    const poleGeom = new THREE.CylinderGeometry(0.2, 0.28, height, 16);
    const pole = new THREE.Mesh(poleGeom, concreteMat);
    pole.position.set(x, height / 2, z);
    pole.castShadow = true;
    poleGroup.add(pole);

    // Hazard Zebra Warning Stripes near base (Japanese yellow/black wrap)
    const stripeCanvas = document.createElement('canvas');
    stripeCanvas.width = 256;
    stripeCanvas.height = 256;
    const sCtx = stripeCanvas.getContext('2d')!;
    sCtx.fillStyle = '#ffbe0b';
    sCtx.fillRect(0, 0, 256, 256);
    sCtx.fillStyle = '#111111';
    for (let i = -256; i < 512; i += 40) {
      sCtx.beginPath();
      sCtx.moveTo(i, 0);
      sCtx.lineTo(i + 30, 0);
      sCtx.lineTo(i - 30, 256);
      sCtx.lineTo(i - 60, 256);
      sCtx.fill();
    }
    const stripeTex = new THREE.CanvasTexture(stripeCanvas);
    stripeTex.wrapS = THREE.RepeatWrapping;
    stripeTex.repeat.set(2, 1);
    const stripeMat = new THREE.MeshStandardMaterial({ map: stripeTex, roughness: 0.8 });
    const stripeGeom = new THREE.CylinderGeometry(0.285, 0.29, 1.8, 16);
    const stripeMesh = new THREE.Mesh(stripeGeom, stripeMat);
    stripeMesh.position.set(x, 1.6, z);
    poleGroup.add(stripeMesh);

    // Steel Climbing Rungs / Pegs staggered up the pole
    const rungGeom = new THREE.CylinderGeometry(0.015, 0.015, 0.45, 6);
    for (let h = 2.4; h < height - 1.5; h += 0.6) {
      const rung = new THREE.Mesh(rungGeom, steelMat);
      rung.rotation.z = Math.PI * 0.5;
      const angle = (h % 1.2 === 0) ? 0 : Math.PI;
      rung.position.set(x + (angle === 0 ? 0.25 : -0.25), h, z);
      poleGroup.add(rung);
    }

    // Steel Crossarms (2 tiers)
    const crossarmGeom = new THREE.BoxGeometry(2.4, 0.1, 0.1);
    const armHeights = [height - 0.8, height - 1.8];

    armHeights.forEach(armY => {
      const arm = new THREE.Mesh(crossarmGeom, steelMat);
      arm.position.set(x, armY, z);
      poleGroup.add(arm);

      // Steel diagonal support braces
      const braceGeom = new THREE.CylinderGeometry(0.02, 0.02, 1.1, 6);
      const braceL = new THREE.Mesh(braceGeom, steelMat);
      braceL.position.set(x - 0.5, armY - 0.4, z);
      braceL.rotation.z = 0.5;
      poleGroup.add(braceL);

      const braceR = new THREE.Mesh(braceGeom, steelMat);
      braceR.position.set(x + 0.5, armY - 0.4, z);
      braceR.rotation.z = -0.5;
      poleGroup.add(braceR);

      // Ceramic Bell Insulators (4 per crossarm)
      const insGeom = new THREE.CylinderGeometry(0.06, 0.08, 0.22, 8);
      [-1.0, -0.4, 0.4, 1.0].forEach(ix => {
        const ins = new THREE.Mesh(insGeom, insulatorMat);
        ins.position.set(x + ix, armY + 0.14, z);
        poleGroup.add(ins);
      });
    });

    // Step-Down Distribution Transformer Drum
    if (hasTransformer) {
      const transY = height - 3.2;
      const transGeom = new THREE.CylinderGeometry(0.42, 0.42, 1.2, 16);
      const trans = new THREE.Mesh(transGeom, steelMat);
      trans.position.set(x + 0.48, transY, z);
      trans.castShadow = true;
      poleGroup.add(trans);

      // Cooling fins on transformer
      const finGeom = new THREE.BoxGeometry(0.08, 0.9, 0.02);
      for (let f = 0; f < 8; f++) {
        const finAngle = (f / 8) * Math.PI * 2;
        const fin = new THREE.Mesh(finGeom, steelMat);
        fin.position.set(
          x + 0.48 + Math.cos(finAngle) * 0.44,
          transY,
          z + Math.sin(finAngle) * 0.44
        );
        fin.rotation.y = -finAngle;
        poleGroup.add(fin);
      }

      // Bushings on top of transformer
      const bushGeom = new THREE.CylinderGeometry(0.04, 0.06, 0.3, 8);
      [-0.15, 0, 0.15].forEach(bx => {
        const bush = new THREE.Mesh(bushGeom, insulatorMat);
        bush.position.set(x + 0.48 + bx, transY + 0.72, z);
        poleGroup.add(bush);
      });
    }

    // Convex Street Safety Mirror (Classic Japanese round orange mirror)
    if (hasMirror) {
      const mirrorY = 3.6;
      const mirrorArmGeom = new THREE.CylinderGeometry(0.025, 0.025, 0.7, 8);
      const mirrorArm = new THREE.Mesh(mirrorArmGeom, steelMat);
      mirrorArm.position.set(x - 0.3, mirrorY, z + 0.3);
      mirrorArm.rotation.z = Math.PI * 0.35;
      poleGroup.add(mirrorArm);

      // Orange casing
      const casingGeom = new THREE.CylinderGeometry(0.4, 0.4, 0.08, 20);
      const casingMat = new THREE.MeshStandardMaterial({ color: '#f77f00', roughness: 0.5 });
      const casing = new THREE.Mesh(casingGeom, casingMat);
      casing.position.set(x - 0.55, mirrorY + 0.25, z + 0.45);
      casing.rotation.x = Math.PI * 0.5;
      poleGroup.add(casing);

      // Reflective mirror face
      const mirrorFaceGeom = new THREE.CylinderGeometry(0.36, 0.36, 0.02, 20);
      const mirrorMat = new THREE.MeshStandardMaterial({
        color: '#e2e8f0',
        metalness: 0.95,
        roughness: 0.1,
      });
      const mirrorFace = new THREE.Mesh(mirrorFaceGeom, mirrorMat);
      mirrorFace.position.set(x - 0.55, mirrorY + 0.25, z + 0.5);
      mirrorFace.rotation.x = Math.PI * 0.5;
      poleGroup.add(mirrorFace);
    }

    // Street Lamp luminaire on the pole
    if (this.config.lighting.enabled && this.config.lighting.hasStreetLamp) {
      const lampY = height - 4.2;
      const armCurve = new THREE.CubicBezierCurve3(
        new THREE.Vector3(x, lampY, z),
        new THREE.Vector3(x - 0.6, lampY + 0.2, z),
        new THREE.Vector3(x - 1.2, lampY + 0.1, z),
        new THREE.Vector3(x - 1.4, lampY - 0.3, z)
      );
      const armTubeGeom = new THREE.TubeGeometry(armCurve, 12, 0.03, 8, false);
      const lampArm = new THREE.Mesh(armTubeGeom, steelMat);
      poleGroup.add(lampArm);

      // Fixture hood
      const hoodGeom = new THREE.ConeGeometry(0.24, 0.2, 12);
      const hood = new THREE.Mesh(hoodGeom, steelMat);
      hood.position.set(x - 1.4, lampY - 0.35, z);
      poleGroup.add(hood);

      // Glowing bulb
      const bulbGeom = new THREE.SphereGeometry(0.1, 10, 10);
      const bulbMat = new THREE.MeshBasicMaterial({ color: '#ffbe0b' });
      const bulb = new THREE.Mesh(bulbGeom, bulbMat);
      bulb.position.set(x - 1.4, lampY - 0.45, z);
      poleGroup.add(bulb);

      // Street lamp spotlight pointing down to road
      const spot = new THREE.SpotLight('#ffbe0b', 2.5, 14, Math.PI * 0.32, 0.6, 1.2);
      spot.position.set(x - 1.4, lampY - 0.5, z);
      spot.target.position.set(x - 1.4, 0, z);
      poleGroup.add(spot);
      poleGroup.add(spot.target);
    }

    return poleGroup;
  }

  /**
   * Rooftop Service Mast (Weatherhead pipe where power enters building)
   */
  private buildServiceMast(x: number, y: number, z: number): THREE.Group {
    const group = new THREE.Group();
    group.name = "ServiceMast";
    const steelMat = this.matManager.get('steel');
    const insulatorMat = this.matManager.get('ceramic_insulator');

    // Steel vertical pipe
    const pipeGeom = new THREE.CylinderGeometry(0.04, 0.04, 1.4, 8);
    const pipe = new THREE.Mesh(pipeGeom, steelMat);
    pipe.position.set(x, y + 0.7, z);
    group.add(pipe);

    // Weatherhead goose-neck cap
    const capGeom = new THREE.SphereGeometry(0.09, 8, 8);
    const cap = new THREE.Mesh(capGeom, steelMat);
    cap.position.set(x, y + 1.4, z);
    group.add(cap);

    // Ceramic rack insulators
    const rackGeom = new THREE.BoxGeometry(0.04, 0.4, 0.06);
    const rack = new THREE.Mesh(rackGeom, steelMat);
    rack.position.set(x, y + 1.0, z);
    group.add(rack);

    for (let i = 0; i < 3; i++) {
      const insGeom = new THREE.CylinderGeometry(0.03, 0.03, 0.08, 6);
      const ins = new THREE.Mesh(insGeom, insulatorMat);
      ins.position.set(x + 0.04, y + 0.85 + i * 0.14, z);
      ins.rotation.z = Math.PI * 0.5;
      group.add(ins);
    }

    return group;
  }

  /**
   * Procedural Catenary Sagging Powerlines
   * Connects the telephone pole to the building service mast with realistic physical droop
   */
  private buildCatenaryWires(
    start: THREE.Vector3, 
    end: THREE.Vector3, 
    wireCount: number, 
    sagFactor: number
  ): THREE.Group {
    const group = new THREE.Group();
    group.name = "CatenaryPowerlines";
    const wireMat = this.matManager.get('wire');

    const segments = 24;

    for (let w = 0; w < wireCount; w++) {
      const offsetSpread = (w - (wireCount - 1) / 2) * 0.28;
      const wireStart = start.clone().add(new THREE.Vector3(0, offsetSpread * 0.5, offsetSpread));
      const wireEnd = end.clone().add(new THREE.Vector3(0, offsetSpread * 0.3, offsetSpread * 0.5));

      // Calculate catenary curve points
      const points: THREE.Vector3[] = [];
      const sag = sagFactor * (0.8 + (w % 3) * 0.25);

      for (let i = 0; i <= segments; i++) {
        const t = i / segments;
        // Linear interpolation
        const pt = new THREE.Vector3().lerpVectors(wireStart, wireEnd, t);
        // Parabolic catenary sag: 4 * sag * t * (1 - t)
        pt.y -= 4 * sag * t * (1 - t);
        points.push(pt);
      }

      const curve = new THREE.CatmullRomCurve3(points);
      const tubeGeom = new THREE.TubeGeometry(curve, 32, 0.014, 5, false);
      const wireMesh = new THREE.Mesh(tubeGeom, wireMat);
      group.add(wireMesh);
    }

    // Additional bundle wires extending down the street for atmospheric realism
    const streetWireEnd = start.clone().add(new THREE.Vector3(0, -1.0, 15.0));
    for (let w = 0; w < 3; w++) {
      const sOffset = (w - 1) * 0.4;
      const wS = start.clone().add(new THREE.Vector3(sOffset, 0, 0));
      const wE = streetWireEnd.clone().add(new THREE.Vector3(sOffset, 0, 0));

      const sPoints: THREE.Vector3[] = [];
      for (let i = 0; i <= segments; i++) {
        const t = i / segments;
        const pt = new THREE.Vector3().lerpVectors(wS, wE, t);
        pt.y -= 4 * (sagFactor * 1.2) * t * (1 - t);
        sPoints.push(pt);
      }
      const sCurve = new THREE.CatmullRomCurve3(sPoints);
      const sTube = new THREE.TubeGeometry(sCurve, 32, 0.016, 5, false);
      const sMesh = new THREE.Mesh(sTube, wireMat);
      group.add(sMesh);
    }

    return group;
  }

  /**
   * Modern Outdoor AC Split-Unit Compressor
   */
  private buildACUnit(x: number, y: number, z: number): THREE.Group {
    const group = new THREE.Group();
    group.name = "ACSplitCompressor";

    const steelMat = this.matManager.get('steel');
    const darkMat = this.matManager.get('dark_metal');
    const copperMat = this.matManager.get('copper_pipe');

    const acW = 0.85;
    const acH = 0.65;
    const acD = 0.38;

    // Outer compressor body
    const bodyGeom = new THREE.BoxGeometry(acD, acH, acW);
    const body = new THREE.Mesh(bodyGeom, steelMat);
    body.position.set(x, y + acH / 2, z);
    body.castShadow = true;
    group.add(body);

    // Front radial fan exhaust grille
    const grilleGeom = new THREE.CylinderGeometry(0.24, 0.24, 0.04, 16);
    const grille = new THREE.Mesh(grilleGeom, darkMat);
    grille.position.set(x + acD / 2 + 0.02, y + acH / 2, z - 0.08);
    grille.rotation.z = Math.PI * 0.5;
    group.add(grille);

    // Wall mounting bracket
    const bracketGeom = new THREE.BoxGeometry(acD * 1.2, 0.06, 0.06);
    [-acW * 0.35, acW * 0.35].forEach(bz => {
      const bracket = new THREE.Mesh(bracketGeom, darkMat);
      bracket.position.set(x - 0.04, y, z + bz);
      group.add(bracket);
    });

    // Insulated copper refrigerant pipe bundle running into the wall
    const pipePoints = [
      new THREE.Vector3(x, y + 0.15, z + acW * 0.4),
      new THREE.Vector3(x - 0.25, y + 0.2, z + acW * 0.45),
      new THREE.Vector3(x - 0.45, y + 0.25, z + acW * 0.45),
    ];
    const pipeCurve = new THREE.CatmullRomCurve3(pipePoints);
    const pipeGeom = new THREE.TubeGeometry(pipeCurve, 8, 0.035, 6, false);
    const pipeMesh = new THREE.Mesh(pipeGeom, copperMat);
    group.add(pipeMesh);

    return group;
  }

  /**
   * Japanese Beverage Vending Machine
   */
  private buildVendingMachine(x: number, y: number, z: number): THREE.Group {
    const group = new THREE.Group();
    group.name = "JapaneseVendingMachine";

    const bodyMat = new THREE.MeshStandardMaterial({
      color: new THREE.Color('#c1121f'),
      roughness: 0.3,
      metalness: 0.2,
    });
    const frontMat = this.matManager.get('vending_front');
    const steelMat = this.matManager.get('steel');

    const vmW = 1.1;
    const vmH = 1.95;
    const vmD = 0.85;

    // Machine Main Cabinet
    const bodyGeom = new THREE.BoxGeometry(vmW, vmH, vmD);
    const body = new THREE.Mesh(bodyGeom, bodyMat);
    body.position.set(x, y + vmH / 2, z);
    body.castShadow = true;
    group.add(body);

    // Front Illuminated Panel
    const frontGeom = new THREE.PlaneGeometry(vmW * 0.92, vmH * 0.94);
    const front = new THREE.Mesh(frontGeom, frontMat);
    front.position.set(x, y + vmH / 2, z + vmD / 2 + 0.01);
    group.add(front);

    // Side Can/Bottle Recycling Bin Box
    const binW = 0.45;
    const binH = 0.95;
    const binD = 0.55;
    const binGeom = new THREE.BoxGeometry(binW, binH, binD);
    const binMat = new THREE.MeshStandardMaterial({ color: '#2b2d42', roughness: 0.6 });
    const bin = new THREE.Mesh(binGeom, binMat);
    bin.position.set(x + vmW / 2 + binW / 2 + 0.05, y + binH / 2, z);
    group.add(bin);

    // Recycling dual slot holes
    const holeGeom = new THREE.CylinderGeometry(0.06, 0.06, 0.02, 12);
    [-0.1, 0.1].forEach(hx => {
      const hole = new THREE.Mesh(holeGeom, steelMat);
      hole.position.set(x + vmW / 2 + binW / 2 + 0.05 + hx, y + binH - 0.15, z + binD / 2 + 0.01);
      hole.rotation.x = Math.PI * 0.5;
      group.add(hole);
    });

    // Subtle vending light glow
    if (this.config.lighting.enabled) {
      const vmLight = new THREE.PointLight('#ffffff', 0.8, 4);
      vmLight.position.set(x, y + vmH * 0.6, z + vmD / 2 + 0.5);
      group.add(vmLight);
    }

    return group;
  }

  /**
   * Electric Utility Meter Box & Conduits
   */
  private buildUtilityMeter(x: number, y: number, z: number, topMastY: number): THREE.Group {
    const group = new THREE.Group();
    group.name = "UtilityMeterAndConduit";

    const steelMat = this.matManager.get('steel');
    const glassMat = this.matManager.get('glass');

    // Weatherproof metal meter enclosure
    const boxGeom = new THREE.BoxGeometry(0.18, 0.5, 0.35);
    const box = new THREE.Mesh(boxGeom, steelMat);
    box.position.set(x, y, z);
    group.add(box);

    // Glass round dial window
    const dialGeom = new THREE.CylinderGeometry(0.1, 0.1, 0.05, 16);
    const dial = new THREE.Mesh(dialGeom, glassMat);
    dial.position.set(x + 0.1, y + 0.05, z);
    dial.rotation.z = Math.PI * 0.5;
    group.add(dial);

    // Metal conduit pipe running up the wall to the roof
    const conduitH = topMastY - y;
    const conduitGeom = new THREE.CylinderGeometry(0.025, 0.025, conduitH, 8);
    const conduit = new THREE.Mesh(conduitGeom, steelMat);
    conduit.position.set(x - 0.02, y + conduitH / 2, z);
    group.add(conduit);

    return group;
  }
}
