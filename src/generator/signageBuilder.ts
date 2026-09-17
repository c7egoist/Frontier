import * as THREE from 'three';
import { BuildingConfig } from '../types/generator';
import { MaterialManager } from '../materials/materialManager';

export class SignageBuilder {
  private config: BuildingConfig;
  private matManager: MaterialManager;

  constructor(config: BuildingConfig, matManager: MaterialManager) {
    this.config = config;
    this.matManager = matManager;
  }

  /**
   * Builds all signboards, neon signs, lanterns, noren, and posters
   */
  public buildSignage(
    width: number, 
    depth: number, 
    groundFloorHeight: number
  ): THREE.Group {
    const group = new THREE.Group();
    group.name = "SignageAndDecorations";

    const halfW = width / 2;
    const halfD = depth / 2;

    // 1. Main Horizontal Signboard (above ground floor storefront)
    if (this.config.signage.mainSignText) {
      const mainSign = this.buildMainSignboard(0, groundFloorHeight + 0.1, halfD + 0.35);
      group.add(mainSign);
    }

    // 2. Vertical Protruding Neon Blade Sign (Upper floor corner)
    if (this.config.lighting.hasNeonSigns && this.config.signage.neonVerticalText) {
      const neonX = halfW + 0.15;
      const neonY = groundFloorHeight + 1.8;
      const neonZ = halfD - 0.5;
      const neonSign = this.buildVerticalNeonBlade(neonX, neonY, neonZ);
      group.add(neonSign);
    }

    // 3. Hanging Japanese Chōchin Paper Lanterns
    if (this.config.lighting.hasLanterns && this.config.lighting.lanternCount > 0) {
      const lanterns = this.buildLanterns(width, depth, groundFloorHeight);
      group.add(lanterns);
    }

    // 4. Traditional Noren Fabric Door Curtain
    if (this.config.furniture.hasNorenCurtain && this.config.walls.groundFloorStyle === 'shop_noren') {
      const noren = this.buildNorenCurtain(0, groundFloorHeight * 0.72, halfD + 0.05);
      group.add(noren);
    }

    // 5. Street Posters / Advertisements on the Facade
    if (this.config.signage.hasPosters) {
      const posterX = -halfW * 0.75;
      const posterY = 1.4;
      const posterZ = halfD + 0.08;
      const poster = this.buildStreetPoster(posterX, posterY, posterZ);
      group.add(poster);
    }

    return group;
  }

  /**
   * Main Storefront Horizontal Signboard
   */
  private buildMainSignboard(x: number, y: number, z: number): THREE.Group {
    const group = new THREE.Group();
    group.name = "MainSignboard";

    const signMat = this.matManager.get('main_sign');
    const timberMat = this.matManager.get('timber');
    const steelMat = this.matManager.get('steel');

    const signW = 3.8;
    const signH = 0.95;
    const signD = 0.14;

    // Signboard back frame
    const frameGeom = new THREE.BoxGeometry(signW, signH, signD);
    const frame = new THREE.Mesh(frameGeom, signMat);
    frame.position.set(x, y, z);
    frame.castShadow = true;
    group.add(frame);

    // Cantilever steel mounting brackets
    const bracketGeom = new THREE.BoxGeometry(0.08, 0.08, 0.45);
    [-signW * 0.35, signW * 0.35].forEach(bx => {
      const bracket = new THREE.Mesh(bracketGeom, steelMat);
      bracket.position.set(x + bx, y, z - signD / 2 - 0.2);
      group.add(bracket);
    });

    // Dedicated brass spotlights pointing at the sign
    if (this.config.lighting.enabled && this.config.lighting.hasSpotlights) {
      [-signW * 0.4, signW * 0.4].forEach(sx => {
        // Spotlight arm
        const armGeom = new THREE.CylinderGeometry(0.02, 0.02, 0.45, 6);
        const arm = new THREE.Mesh(armGeom, steelMat);
        arm.position.set(x + sx, y + signH / 2 + 0.2, z + 0.2);
        arm.rotation.x = Math.PI * 0.3;
        group.add(arm);

        // Light fixture
        const fixtureGeom = new THREE.ConeGeometry(0.09, 0.14, 8);
        const fixture = new THREE.Mesh(fixtureGeom, steelMat);
        fixture.position.set(x + sx, y + signH / 2 + 0.35, z + 0.35);
        fixture.rotation.x = -Math.PI * 0.4;
        group.add(fixture);

        // Spot light source
        const spot = new THREE.SpotLight('#ffe8a3', 1.8, 6, Math.PI * 0.4, 0.5);
        spot.position.set(x + sx, y + signH / 2 + 0.35, z + 0.35);
        spot.target.position.set(x + sx, y, z);
        group.add(spot);
        group.add(spot.target);
      });
    }

    return group;
  }

  /**
   * Vertical Cantilevered Neon Blade Sign
   */
  private buildVerticalNeonBlade(x: number, y: number, z: number): THREE.Group {
    const group = new THREE.Group();
    group.name = "VerticalNeonBlade";

    const neonMat = this.matManager.get('neon_blade');
    const steelMat = this.matManager.get('steel');

    const bladeW = 0.55;
    const bladeH = 2.4;
    const bladeThick = 0.12;

    // Sign Box projecting perpendicular to building
    const bladeGeom = new THREE.BoxGeometry(bladeW, bladeH, bladeThick);
    const blade = new THREE.Mesh(bladeGeom, neonMat);
    blade.position.set(x + bladeW / 2, y, z);
    blade.rotation.y = Math.PI * 0.5; // Project outward
    group.add(blade);

    // Steel mounting truss arms attaching to wall
    const trussGeom = new THREE.CylinderGeometry(0.025, 0.025, 0.5, 6);
    [-bladeH * 0.35, bladeH * 0.35].forEach(ty => {
      const truss = new THREE.Mesh(trussGeom, steelMat);
      truss.position.set(x + 0.2, y + ty, z);
      truss.rotation.z = Math.PI * 0.5;
      group.add(truss);
    });

    // Intense neon point light casting colored glow onto facade
    if (this.config.lighting.enabled) {
      const neonLight = new THREE.PointLight(this.config.lighting.neonColorPrimary, 2.2, 8);
      neonLight.position.set(x + bladeW / 2, y, z);
      group.add(neonLight);
    }

    return group;
  }

  /**
   * Hanging Chōchin Paper Lanterns
   */
  private buildLanterns(width: number, depth: number, groundH: number): THREE.Group {
    const group = new THREE.Group();
    group.name = "HangingLanterns";

    const lanternMat = this.matManager.get('lantern');
    const steelMat = this.matManager.get('steel');
    const { lanternCount } = this.config.lighting;

    const count = lanternCount;
    const halfD = depth / 2;
    const startX = -width * 0.38;
    const endX = width * 0.38;
    const stepX = (endX - startX) / (count > 1 ? count - 1 : 1);

    for (let i = 0; i < count; i++) {
      const lx = count === 1 ? 0 : startX + i * stepX;
      const ly = groundH + 0.05;
      const lz = halfD + 0.55;

      const lGroup = new THREE.Group();
      lGroup.position.set(lx, ly, lz);

      // Hanging iron chain / wire
      const chainGeom = new THREE.CylinderGeometry(0.01, 0.01, 0.45, 4);
      const chain = new THREE.Mesh(chainGeom, steelMat);
      chain.position.y = 0.22;
      lGroup.add(chain);

      // Ovoid / barrel-shaped paper lantern body
      const lanternGeom = new THREE.CylinderGeometry(0.24, 0.22, 0.65, 16);
      const lanternMesh = new THREE.Mesh(lanternGeom, lanternMat);
      lanternMesh.scale.set(1.1, 1.0, 1.1);
      lGroup.add(lanternMesh);

      // Warm interior point light
      if (this.config.lighting.enabled) {
        const warmLight = new THREE.PointLight('#ff70a6', 1.4, 5);
        warmLight.position.set(0, 0, 0);
        lGroup.add(warmLight);
      }

      group.add(lGroup);
    }

    return group;
  }

  /**
   * Traditional Noren Door Curtain
   */
  private buildNorenCurtain(x: number, y: number, z: number): THREE.Group {
    const group = new THREE.Group();
    group.name = "NorenCurtain";

    const norenMat = this.matManager.get('noren');
    const timberMat = this.matManager.get('timber');

    const curtainW = 1.8;
    const curtainH = 1.1;

    // Horizontal bamboo suspension rod
    const rodGeom = new THREE.CylinderGeometry(0.025, 0.025, curtainW + 0.2, 8);
    const rod = new THREE.Mesh(rodGeom, timberMat);
    rod.rotation.z = Math.PI * 0.5;
    rod.position.set(x, y + curtainH / 2 + 0.04, z);
    group.add(rod);

    // Fabric curtain plane
    const fabricGeom = new THREE.PlaneGeometry(curtainW, curtainH);
    const fabric = new THREE.Mesh(fabricGeom, norenMat);
    fabric.position.set(x, y, z);
    group.add(fabric);

    return group;
  }

  /**
   * Street Poster / Advertisement
   */
  private buildStreetPoster(x: number, y: number, z: number): THREE.Group {
    const group = new THREE.Group();
    group.name = "StreetPoster";

    const posterMat = this.matManager.get('poster');
    const timberMat = this.matManager.get('timber');

    const posterW = 0.9;
    const posterH = 1.35;

    // Poster sheet slightly offset from wall
    const sheetGeom = new THREE.PlaneGeometry(posterW, posterH);
    const sheet = new THREE.Mesh(sheetGeom, posterMat);
    sheet.position.set(x, y, z);
    group.add(sheet);

    // Wooden border trim frame
    const frameGeom = new THREE.BoxGeometry(posterW + 0.08, posterH + 0.08, 0.03);
    const frame = new THREE.Mesh(frameGeom, timberMat);
    frame.position.set(x, y, z - 0.02);
    group.add(frame);

    return group;
  }
}
