import * as THREE from 'three';
import { BuildingConfig } from '../types/generator';
import { MaterialManager } from '../materials/materialManager';

export class RoofBuilder {
  private config: BuildingConfig;
  private matManager: MaterialManager;

  constructor(config: BuildingConfig, matManager: MaterialManager) {
    this.config = config;
    this.matManager = matManager;
  }

  /**
   * Builds the main roof structure at the given height
   */
  public buildRoof(
    width: number, 
    depth: number, 
    baseY: number, 
    isIntermediate = false
  ): THREE.Group {
    const roofGroup = new THREE.Group();
    roofGroup.name = isIntermediate ? "IntermediateEaves" : "MainRoof";

    const { type, overhang, curvature, hasTiles } = this.config.roof;
    const roofMat = this.matManager.get('roof');
    const timberMat = this.matManager.get('timber');
    const ornamentMat = this.matManager.get('ridge_ornament');

    const totalW = width + overhang * 2;
    const totalD = depth + overhang * 2;
    const halfW = totalW / 2;
    const halfD = totalD / 2;
    const roofHeight = isIntermediate ? 1.4 : Math.min(4.5, Math.max(2.4, Math.min(width, depth) * 0.38));

    // 1. Build Brackets (Dougong / Tokkyo) underneath the eaves
    if (this.config.timber.bracketStyle !== 'none') {
      const brackets = this.buildBracketSystem(width, depth, baseY);
      roofGroup.add(brackets);
    }

    // 2. Build Eaves Rafters (Taruki)
    const rafters = this.buildRafters(width, depth, baseY, overhang);
    roofGroup.add(rafters);

    // 3. Build Roof geometry based on type
    let roofMesh: THREE.Object3D;
    switch (type) {
      case 'irimoya':
        roofMesh = this.createIrimoyaRoof(totalW, totalD, roofHeight, curvature, roofMat, timberMat);
        break;
      case 'kirizuma':
        roofMesh = this.createKirizumaRoof(totalW, totalD, roofHeight, curvature, roofMat, timberMat);
        break;
      case 'yosemune':
        roofMesh = this.createYosemuneRoof(totalW, totalD, roofHeight, curvature, roofMat);
        break;
      case 'pagoda_stepped':
        roofMesh = this.createPagodaRoof(totalW, totalD, roofHeight, curvature, roofMat, timberMat);
        break;
      case 'chinese_dian':
      default:
        roofMesh = this.createDianRoof(totalW, totalD, roofHeight, curvature, roofMat, timberMat);
        break;
    }

    roofMesh.position.y = baseY;
    roofGroup.add(roofMesh);

    // 4. Ridge Capping (Mune) & 3D Ridge End Ornaments (Onigawara / Shibi)
    if (!isIntermediate) {
      const ridge = this.buildRidgeStructure(totalW, totalD, baseY + roofHeight, type, ornamentMat, timberMat);
      roofGroup.add(ridge);
    }

    // 5. LED Strip Under-Eaves (Modern styling retrofit)
    if (this.config.lighting.enabled && this.config.lighting.hasEavesLED) {
      const ledStrips = this.buildEavesLED(width, depth, baseY - 0.05, overhang);
      roofGroup.add(ledStrips);
    }

    return roofGroup;
  }

  /**
   * Irimoya Roof (Authentic Japanese Hip-and-Gable with Gable pediment + Hipped lower eaves)
   */
  private createIrimoyaRoof(
    w: number, 
    d: number, 
    h: number, 
    curvature: number, 
    roofMat: THREE.Material,
    timberMat: THREE.Material
  ): THREE.Group {
    const group = new THREE.Group();

    // Hipped lower skirt (Shikoro)
    const geom = new THREE.BufferGeometry();
    const vertices: number[] = [];
    const uvs: number[] = [];
    const indices: number[] = [];

    const segmentsX = 14;
    const segmentsZ = 14;
    const halfW = w / 2;
    const halfD = d / 2;
    const hipH = h * 0.65;
    const ridgeH = h;
    const ridgeLenX = w * 0.45;

    // Grid of curved vertices
    for (let iz = 0; iz <= segmentsZ; iz++) {
      const v = iz / segmentsZ;
      const z = (v - 0.5) * d;
      const absZNorm = Math.abs(z) / halfD;

      for (let ix = 0; ix <= segmentsX; ix++) {
        const u = ix / segmentsX;
        const x = (u - 0.5) * w;
        const absXNorm = Math.abs(x) / halfW;

        // Base height slope
        const distFromEdge = 1.0 - Math.max(absXNorm, absZNorm);
        let y = distFromEdge * ridgeH;

        // Upward curve (Sori) towards edges & corners
        const cornerFactor = Math.pow(Math.max(absXNorm, absZNorm), 2.2);
        const curveOffset = cornerFactor * curvature;
        y += curveOffset;

        vertices.push(x, y, z);
        uvs.push(u * 4, v * 4);
      }
    }

    // Generate indices for grid
    for (let iz = 0; iz < segmentsZ; iz++) {
      for (let ix = 0; ix < segmentsX; ix++) {
        const a = iz * (segmentsX + 1) + ix;
        const b = a + 1;
        const c = (iz + 1) * (segmentsX + 1) + ix;
        const d_idx = c + 1;

        indices.push(a, c, b);
        indices.push(b, c, d_idx);
      }
    }

    geom.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
    geom.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    geom.setIndex(indices);
    geom.computeVertexNormals();

    const mainRoofMesh = new THREE.Mesh(geom, roofMat);
    mainRoofMesh.castShadow = true;
    mainRoofMesh.receiveShadow = true;
    group.add(mainRoofMesh);

    // Decorative triangular gable ends (Tsuma) on left and right
    const gableGeom = new THREE.BufferGeometry();
    const gH = h * 0.45;
    const gW = d * 0.45;
    const gableVerts = [
      -ridgeLenX, hipH, -gW/2,
      -ridgeLenX, hipH, gW/2,
      -ridgeLenX, ridgeH, 0,

      ridgeLenX, hipH, -gW/2,
      ridgeLenX, hipH, gW/2,
      ridgeLenX, ridgeH, 0
    ];
    gableGeom.setAttribute('position', new THREE.Float32BufferAttribute(gableVerts, 3));
    gableGeom.computeVertexNormals();
    const gableMesh = new THREE.Mesh(gableGeom, timberMat);
    group.add(gableMesh);

    // Bargeboards (Hafu) running along gable incline
    const hafuThick = 0.15;
    const hafuWidth = 0.22;
    const hafuGeom = new THREE.BoxGeometry(hafuThick, hafuWidth, gW * 0.65);
    [-ridgeLenX, ridgeLenX].forEach(xPos => {
      const hafuL = new THREE.Mesh(hafuGeom, timberMat);
      hafuL.position.set(xPos, hipH + gH * 0.5, -gW * 0.25);
      hafuL.rotation.x = Math.PI * 0.18;
      group.add(hafuL);

      const hafuR = new THREE.Mesh(hafuGeom, timberMat);
      hafuR.position.set(xPos, hipH + gH * 0.5, gW * 0.25);
      hafuR.rotation.x = -Math.PI * 0.18;
      group.add(hafuR);
    });

    return group;
  }

  /**
   * Kirizuma Roof (Japanese Pure Gable Roof)
   */
  private createKirizumaRoof(
    w: number, 
    d: number, 
    h: number, 
    curvature: number, 
    roofMat: THREE.Material,
    timberMat: THREE.Material
  ): THREE.Group {
    const group = new THREE.Group();
    const geom = new THREE.BufferGeometry();
    const vertices: number[] = [];
    const uvs: number[] = [];
    const indices: number[] = [];

    const segmentsX = 14;
    const segmentsZ = 10;
    const halfW = w / 2;
    const halfD = d / 2;

    for (let iz = 0; iz <= segmentsZ; iz++) {
      const v = iz / segmentsZ;
      const z = (v - 0.5) * d;
      const absZNorm = Math.abs(z) / halfD;
      const slope = (1.0 - absZNorm) * h;

      for (let ix = 0; ix <= segmentsX; ix++) {
        const u = ix / segmentsX;
        const x = (u - 0.5) * w;
        
        // Gentle curve flare towards eaves
        const flare = Math.pow(absZNorm, 2.0) * curvature;
        const y = slope + flare;

        vertices.push(x, y, z);
        uvs.push(u * 5, v * 5);
      }
    }

    for (let iz = 0; iz < segmentsZ; iz++) {
      for (let ix = 0; ix < segmentsX; ix++) {
        const a = iz * (segmentsX + 1) + ix;
        const b = a + 1;
        const c = (iz + 1) * (segmentsX + 1) + ix;
        const d_idx = c + 1;

        indices.push(a, c, b);
        indices.push(b, c, d_idx);
      }
    }

    geom.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
    geom.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    geom.setIndex(indices);
    geom.computeVertexNormals();

    const mesh = new THREE.Mesh(geom, roofMat);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);

    // Side gable walls (triangular infill)
    const sideGableGeom = new THREE.BufferGeometry();
    const sideVerts = [
      -halfW, 0, -halfD,
      -halfW, 0, halfD,
      -halfW, h, 0,

      halfW, 0, halfD,
      halfW, 0, -halfD,
      halfW, h, 0
    ];
    sideGableGeom.setAttribute('position', new THREE.Float32BufferAttribute(sideVerts, 3));
    sideGableGeom.computeVertexNormals();
    const sideGable = new THREE.Mesh(sideGableGeom, timberMat);
    group.add(sideGable);

    return group;
  }

  /**
   * Yosemune Roof (Japanese Pure Hip Roof sloping 4 ways)
   */
  private createYosemuneRoof(
    w: number, 
    d: number, 
    h: number, 
    curvature: number, 
    roofMat: THREE.Material
  ): THREE.Group {
    const group = new THREE.Group();
    const geom = new THREE.BufferGeometry();
    const vertices: number[] = [];
    const uvs: number[] = [];
    const indices: number[] = [];

    const segmentsX = 14;
    const segmentsZ = 14;
    const halfW = w / 2;
    const halfD = d / 2;

    for (let iz = 0; iz <= segmentsZ; iz++) {
      const v = iz / segmentsZ;
      const z = (v - 0.5) * d;
      const normZ = Math.abs(z) / halfD;

      for (let ix = 0; ix <= segmentsX; ix++) {
        const u = ix / segmentsX;
        const x = (u - 0.5) * w;
        const normX = Math.abs(x) / halfW;

        const distFromEdge = 1.0 - Math.max(normX, normZ);
        const y = distFromEdge * h + Math.pow(Math.max(normX, normZ), 2.2) * curvature;

        vertices.push(x, y, z);
        uvs.push(u * 4, v * 4);
      }
    }

    for (let iz = 0; iz < segmentsZ; iz++) {
      for (let ix = 0; ix < segmentsX; ix++) {
        const a = iz * (segmentsX + 1) + ix;
        const b = a + 1;
        const c = (iz + 1) * (segmentsX + 1) + ix;
        const d_idx = c + 1;

        indices.push(a, c, b);
        indices.push(b, c, d_idx);
      }
    }

    geom.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
    geom.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    geom.setIndex(indices);
    geom.computeVertexNormals();

    const mesh = new THREE.Mesh(geom, roofMat);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);

    return group;
  }

  /**
   * Chinese Dian / Flared Eaves Roof (Han-Tang dramatic curved corners)
   */
  private createDianRoof(
    w: number, 
    d: number, 
    h: number, 
    curvature: number, 
    roofMat: THREE.Material,
    timberMat: THREE.Material
  ): THREE.Group {
    const group = new THREE.Group();
    const geom = new THREE.BufferGeometry();
    const vertices: number[] = [];
    const uvs: number[] = [];
    const indices: number[] = [];

    const segments = 16;
    const halfW = w / 2;
    const halfD = d / 2;

    for (let iz = 0; iz <= segments; iz++) {
      const v = iz / segments;
      const z = (v - 0.5) * d;
      const normZ = Math.abs(z) / halfD;

      for (let ix = 0; ix <= segments; ix++) {
        const u = ix / segments;
        const x = (u - 0.5) * w;
        const normX = Math.abs(x) / halfW;

        // Radial corner flare formula for dramatic upturned wings
        const distFromEdge = 1.0 - Math.max(normX, normZ);
        const cornerFactor = Math.pow(normX * normZ, 1.4) * 2.8 + Math.pow(Math.max(normX, normZ), 3.0) * 0.8;
        const y = distFromEdge * h + cornerFactor * curvature * 1.5;

        vertices.push(x, y, z);
        uvs.push(u * 5, v * 5);
      }
    }

    for (let iz = 0; iz < segments; iz++) {
      for (let ix = 0; ix < segments; ix++) {
        const a = iz * (segments + 1) + ix;
        const b = a + 1;
        const c = (iz + 1) * (segments + 1) + ix;
        const d_idx = c + 1;

        indices.push(a, c, b);
        indices.push(b, c, d_idx);
      }
    }

    geom.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
    geom.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    geom.setIndex(indices);
    geom.computeVertexNormals();

    const mesh = new THREE.Mesh(geom, roofMat);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);

    return group;
  }

  /**
   * Pagoda Stepped Roof
   */
  private createPagodaRoof(
    w: number, 
    d: number, 
    h: number, 
    curvature: number, 
    roofMat: THREE.Material,
    timberMat: THREE.Material
  ): THREE.Group {
    const group = this.createDianRoof(w, d, h * 0.85, curvature * 1.3, roofMat, timberMat);

    // Decorative bronze corner wind bells (Futaku)
    const bellGeom = new THREE.ConeGeometry(0.12, 0.25, 8);
    const bellMat = this.matManager.get('steel');
    const corners = [
      [w/2, 0, d/2],
      [-w/2, 0, d/2],
      [w/2, 0, -d/2],
      [-w/2, 0, -d/2],
    ];

    corners.forEach(([cx, cy, cz]) => {
      const bell = new THREE.Mesh(bellGeom, bellMat);
      bell.position.set(cx * 0.98, cy + curvature * 0.8 - 0.2, cz * 0.98);
      group.add(bell);
    });

    return group;
  }

  /**
   * Bracket complexes (Dougong / Tokkyo) supporting the eaves overhang
   */
  private buildBracketSystem(width: number, depth: number, baseY: number): THREE.Group {
    const group = new THREE.Group();
    group.name = "DougongBracketComplex";
    const timberMat = this.matManager.get('timber');
    const { bracketStyle, bracketDensity } = this.config.timber;

    // Cantilever bracket arm geometry (Hijiki)
    const armGeom = new THREE.BoxGeometry(0.18, 0.16, 0.7);
    const blockGeom = new THREE.BoxGeometry(0.24, 0.16, 0.24); // Bearing block (Daito)

    const spacing = 2.0 / bracketDensity;
    const halfW = width / 2;
    const halfD = depth / 2;

    // Place brackets along front, back, left, right facades under the roof
    const placeBracket = (x: number, z: number, rotY: number) => {
      const bGroup = new THREE.Group();
      bGroup.position.set(x, baseY - 0.2, z);
      bGroup.rotation.y = rotY;

      // Tier 1 (Base block + arm)
      const baseBlock = new THREE.Mesh(blockGeom, timberMat);
      bGroup.add(baseBlock);

      const arm1 = new THREE.Mesh(armGeom, timberMat);
      arm1.position.set(0, 0.08, 0.2);
      bGroup.add(arm1);

      // Tier 2 (Step outward)
      if (bracketStyle === 'dougong_triple') {
        const arm2 = new THREE.Mesh(armGeom, timberMat);
        arm2.position.set(0, 0.22, 0.4);
        bGroup.add(arm2);

        // Cross arm perpendicular
        const crossArmGeom = new THREE.BoxGeometry(0.65, 0.14, 0.16);
        const crossArm = new THREE.Mesh(crossArmGeom, timberMat);
        crossArm.position.set(0, 0.22, 0.4);
        bGroup.add(crossArm);
      }

      group.add(bGroup);
    };

    // Front & Back
    for (let x = -halfW + 0.6; x <= halfW - 0.6; x += spacing) {
      placeBracket(x, halfD, 0);
      placeBracket(x, -halfD, Math.PI);
    }

    // Left & Right
    for (let z = -halfD + 0.6; z <= halfD - 0.6; z += spacing) {
      placeBracket(halfW, z, Math.PI * 0.5);
      placeBracket(-halfW, z, -Math.PI * 0.5);
    }

    return group;
  }

  /**
   * Exposed Rafters (Taruki) lining the underside of the deep eaves
   */
  private buildRafters(width: number, depth: number, baseY: number, overhang: number): THREE.Group {
    const group = new THREE.Group();
    group.name = "ExposedTarukiRafters";
    const timberMat = this.matManager.get('timber');

    const rafterGeom = new THREE.BoxGeometry(0.08, 0.08, overhang * 1.1);
    const spacing = 0.45;
    const halfW = width / 2;
    const halfD = depth / 2;

    // Front & Back rafters
    for (let x = -halfW - overhang * 0.7; x <= halfW + overhang * 0.7; x += spacing) {
      const rFront = new THREE.Mesh(rafterGeom, timberMat);
      rFront.position.set(x, baseY - 0.08, halfD + overhang * 0.5);
      rFront.rotation.x = -Math.PI * 0.06;
      group.add(rFront);

      const rBack = new THREE.Mesh(rafterGeom, timberMat);
      rBack.position.set(x, baseY - 0.08, -halfD - overhang * 0.5);
      rBack.rotation.x = Math.PI * 0.06;
      group.add(rBack);
    }

    return group;
  }

  /**
   * Ridge Structure (Mune) & Ridge End Ornaments (Onigawara / Shibi dragon)
   */
  private buildRidgeStructure(
    w: number, 
    d: number, 
    ridgeY: number, 
    type: string, 
    ornamentMat: THREE.Material,
    timberMat: THREE.Material
  ): THREE.Group {
    const group = new THREE.Group();
    group.name = "RidgeStructureAndOrnaments";

    const ridgeLen = type === 'kirizuma' ? w * 0.98 : (type === 'yosemune' ? w * 0.5 : w * 0.6);
    
    // Multi-stepped ridge tile beam (Mune-kawara)
    const muneGeom = new THREE.BoxGeometry(ridgeLen, 0.35, 0.4);
    const mune = new THREE.Mesh(muneGeom, ornamentMat);
    mune.position.set(0, ridgeY + 0.15, 0);
    mune.castShadow = true;
    group.add(mune);

    // Decorative Onigawara (Demon-face ridge cap) or Shibi (Dolphin/Dragon finials)
    const { ridgeOrnament } = this.config.roof;
    if (ridgeOrnament === 'onigawara' || ridgeOrnament === 'shibi_dragon') {
      const halfL = ridgeLen / 2;
      [-halfL, halfL].forEach((xPos, idx) => {
        if (ridgeOrnament === 'onigawara') {
          // Onigawara plaque end-tile
          const plaqueGeom = new THREE.BoxGeometry(0.2, 0.65, 0.5);
          const plaque = new THREE.Mesh(plaqueGeom, ornamentMat);
          plaque.position.set(xPos, ridgeY + 0.35, 0);
          plaque.rotation.y = idx === 0 ? -Math.PI * 0.5 : Math.PI * 0.5;
          group.add(plaque);

          // Horn crest
          const hornGeom = new THREE.ConeGeometry(0.1, 0.3, 6);
          const hornL = new THREE.Mesh(hornGeom, ornamentMat);
          hornL.position.set(xPos, ridgeY + 0.7, -0.15);
          hornL.rotation.z = idx === 0 ? 0.3 : -0.3;
          group.add(hornL);

          const hornR = new THREE.Mesh(hornGeom, ornamentMat);
          hornR.position.set(xPos, ridgeY + 0.7, 0.15);
          hornR.rotation.z = idx === 0 ? 0.3 : -0.3;
          group.add(hornR);
        } else {
          // Shibi Dragon / Fish curved tail finial
          const shibiGeom = new THREE.TorusGeometry(0.35, 0.12, 8, 16, Math.PI * 0.85);
          const shibi = new THREE.Mesh(shibiGeom, ornamentMat);
          shibi.position.set(xPos, ridgeY + 0.45, 0);
          shibi.rotation.y = Math.PI * 0.5;
          shibi.rotation.z = idx === 0 ? 0.4 : -0.4;
          group.add(shibi);
        }
      });
    }

    // Top Pagoda Spire (Sorin) if archetype is pagoda
    if (this.config.archetype === 'pagoda_tower' || type === 'pagoda_stepped') {
      const sorinGroup = new THREE.Group();
      sorinGroup.position.set(0, ridgeY + 0.35, 0);

      // Central bronze mast
      const mastGeom = new THREE.CylinderGeometry(0.08, 0.14, 3.2, 8);
      const mast = new THREE.Mesh(mastGeom, ornamentMat);
      mast.position.y = 1.6;
      sorinGroup.add(mast);

      // 9 Sacred bronze rings (Kuruma)
      const ringGeom = new THREE.TorusGeometry(0.32, 0.06, 8, 16);
      for (let r = 0; r < 9; r++) {
        const ring = new THREE.Mesh(ringGeom, ornamentMat);
        ring.position.y = 0.8 + r * 0.22;
        ring.rotation.x = Math.PI * 0.5;
        sorinGroup.add(ring);
      }

      // Suien flame finial & jewel (Hoju) at top
      const jewelGeom = new THREE.SphereGeometry(0.18, 12, 12);
      const jewel = new THREE.Mesh(jewelGeom, ornamentMat);
      jewel.position.y = 3.3;
      sorinGroup.add(jewel);

      group.add(sorinGroup);
    }

    return group;
  }

  /**
   * Modern Architectural Eaves LED Linear Strip Lighting
   */
  private buildEavesLED(width: number, depth: number, baseY: number, overhang: number): THREE.Group {
    const group = new THREE.Group();
    group.name = "EavesLEDStrips";
    const ledMat = this.matManager.get('led_strip');

    const totalW = width + overhang * 1.6;
    const totalD = depth + overhang * 1.6;
    const halfW = totalW / 2;
    const halfD = totalD / 2;

    const ledGeomX = new THREE.BoxGeometry(totalW, 0.04, 0.04);
    const ledGeomZ = new THREE.BoxGeometry(0.04, 0.04, totalD);

    const stripFront = new THREE.Mesh(ledGeomX, ledMat);
    stripFront.position.set(0, baseY, halfD);
    group.add(stripFront);

    const stripBack = new THREE.Mesh(ledGeomX, ledMat);
    stripBack.position.set(0, baseY, -halfD);
    group.add(stripBack);

    const stripLeft = new THREE.Mesh(ledGeomZ, ledMat);
    stripLeft.position.set(-halfW, baseY, 0);
    group.add(stripLeft);

    const stripRight = new THREE.Mesh(ledGeomZ, ledMat);
    stripRight.position.set(halfW, baseY, 0);
    group.add(stripRight);

    return group;
  }
}
