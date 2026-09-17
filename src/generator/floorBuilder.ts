import * as THREE from 'three';
import { BuildingConfig } from '../types/generator';
import { MaterialManager } from '../materials/materialManager';

export class FloorBuilder {
  private config: BuildingConfig;
  private matManager: MaterialManager;

  constructor(config: BuildingConfig, matManager: MaterialManager) {
    this.config = config;
    this.matManager = matManager;
  }

  /**
   * Builds an individual floor tier
   */
  public buildFloor(
    floorIndex: number, 
    width: number, 
    depth: number, 
    baseY: number
  ): THREE.Group {
    const floorGroup = new THREE.Group();
    floorGroup.name = `Floor_${floorIndex + 1}`;

    const { floorHeight } = this.config;
    const isGround = floorIndex === 0;
    const timberMat = this.matManager.get('timber');
    const wallMat = this.matManager.get('wall');
    const shojiMat = this.matManager.get('shoji');
    const glassMat = this.matManager.get('glass');
    const steelMat = this.matManager.get('steel');

    const halfW = width / 2;
    const halfD = depth / 2;

    // 1. Foundation Slab / Floor Deck
    const deckThickness = 0.25;
    const deckGeom = new THREE.BoxGeometry(width, deckThickness, depth);
    const deckMesh = new THREE.Mesh(deckGeom, isGround ? this.matManager.get('sidewalk') : timberMat);
    deckMesh.position.set(0, baseY + deckThickness / 2, 0);
    deckMesh.receiveShadow = true;
    floorGroup.add(deckMesh);

    // 2. Timber Post & Beam Structural Grid (Hashira & Nuki)
    const postThick = 0.22;
    const postHeight = floorHeight - deckThickness;
    const postGeom = new THREE.BoxGeometry(postThick, postHeight, postThick);

    const bayWidth = 3.0;
    const colsX = Math.max(2, Math.round(width / bayWidth));
    const colsZ = Math.max(2, Math.round(depth / bayWidth));
    const stepX = width / colsX;
    const stepZ = depth / colsZ;

    for (let ix = 0; ix <= colsX; ix++) {
      const x = -halfW + ix * stepX;
      for (let iz = 0; iz <= colsZ; iz++) {
        // Only outer perimeter posts and key interior columns
        if (ix === 0 || ix === colsX || iz === 0 || iz === colsZ) {
          const post = new THREE.Mesh(postGeom, timberMat);
          post.position.set(x, baseY + deckThickness + postHeight / 2, z);
          post.castShadow = true;
          post.receiveShadow = true;
          floorGroup.add(post);

          // Foundation stone plinth (Souseki) at ground floor
          if (isGround) {
            const stoneGeom = new THREE.CylinderGeometry(0.18, 0.2, 0.15, 8);
            const stone = new THREE.Mesh(stoneGeom, this.matManager.get('sidewalk'));
            stone.position.set(x, baseY + 0.08, z);
            floorGroup.add(stone);
          }
        }
      }
    }

    // Top horizontal crossbeams (Kamoi / Nuki)
    const beamThick = 0.2;
    const beamY = baseY + floorHeight - beamThick / 2;

    const beamXGeom = new THREE.BoxGeometry(width, beamThick, beamThick);
    const beamFront = new THREE.Mesh(beamXGeom, timberMat);
    beamFront.position.set(0, beamY, halfD);
    floorGroup.add(beamFront);

    const beamBack = new THREE.Mesh(beamXGeom, timberMat);
    beamBack.position.set(0, beamY, -halfD);
    floorGroup.add(beamBack);

    const beamZGeom = new THREE.BoxGeometry(beamThick, beamThick, depth);
    const beamLeft = new THREE.Mesh(beamZGeom, timberMat);
    beamLeft.position.set(-halfW, beamY, 0);
    floorGroup.add(beamLeft);

    const beamRight = new THREE.Mesh(beamZGeom, timberMat);
    beamRight.position.set(halfW, beamY, 0);
    floorGroup.add(beamRight);

    // 3. Facade Walls & Screens
    const wallHeight = postHeight - 0.2;
    const wallY = baseY + deckThickness + wallHeight / 2;

    if (isGround) {
      // Ground floor facade style
      this.buildGroundFacade(floorGroup, width, depth, baseY + deckThickness, postHeight);
    } else {
      // Upper floor facades
      this.buildUpperFacade(floorGroup, width, depth, baseY + deckThickness, postHeight);
    }

    // 4. Perimeter Engawa Veranda & Balcony Railing (Kōran)
    if (this.config.timber.hasEngawaBalcony && (!isGround || this.config.archetype === 'tea_house')) {
      const balcony = this.buildBalcony(width, depth, baseY, floorHeight, isGround);
      floorGroup.add(balcony);
    }

    return floorGroup;
  }

  /**
   * Ground Floor Facade (Shop front, glass showroom, or traditional shoji)
   */
  private buildGroundFacade(
    parent: THREE.Group, 
    width: number, 
    depth: number, 
    baseY: number, 
    height: number
  ) {
    const { groundFloorStyle } = this.config.walls;
    const timberMat = this.matManager.get('timber');
    const wallMat = this.matManager.get('wall');
    const shojiMat = this.matManager.get('shoji');
    const glassMat = this.matManager.get('glass');
    const steelMat = this.matManager.get('steel');

    const halfW = width / 2;
    const halfD = depth / 2;

    // Back & Side walls (Solid plaster / wood infill with small windows)
    const sideWallGeom = new THREE.BoxGeometry(0.12, height, depth - 0.4);
    const wallLeft = new THREE.Mesh(sideWallGeom, wallMat);
    wallLeft.position.set(-halfW, baseY + height / 2, 0);
    parent.add(wallLeft);

    const wallRight = new THREE.Mesh(sideWallGeom, wallMat);
    wallRight.position.set(halfW, baseY + height / 2, 0);
    parent.add(wallRight);

    const backWallGeom = new THREE.BoxGeometry(width - 0.4, height, 0.12);
    const wallBack = new THREE.Mesh(backWallGeom, wallMat);
    wallBack.position.set(0, baseY + height / 2, -halfD);
    parent.add(wallBack);

    // Front facade based on style
    if (groundFloorStyle === 'glass_modern') {
      // Contemporary frameless structural glass retrofitted into ancient timber
      const glassGeom = new THREE.BoxGeometry(width - 0.4, height, 0.05);
      const glass = new THREE.Mesh(glassGeom, glassMat);
      glass.position.set(0, baseY + height / 2, halfD);
      parent.add(glass);

      // Steel architectural mullions
      const mullionGeom = new THREE.BoxGeometry(0.06, height, 0.1);
      [-halfW * 0.5, 0, halfW * 0.5].forEach(mx => {
        const mullion = new THREE.Mesh(mullionGeom, steelMat);
        mullion.position.set(mx, baseY + height / 2, halfD);
        parent.add(mullion);
      });
    } else if (groundFloorStyle === 'shop_noren' || groundFloorStyle === 'tatami_shoji') {
      // Traditional Japanese sliding screen frontage with doorway opening
      const doorW = width * 0.4;
      const flankW = (width - doorW) / 2;

      // Left Shoji / Koushi panel
      const shojiGeomL = new THREE.BoxGeometry(flankW, height, 0.06);
      const shojiL = new THREE.Mesh(shojiGeomL, shojiMat);
      shojiL.position.set(-halfW + flankW / 2, baseY + height / 2, halfD);
      parent.add(shojiL);

      // Right Shoji / Koushi panel
      const shojiGeomR = new THREE.BoxGeometry(flankW, height, 0.06);
      const shojiR = new THREE.Mesh(shojiGeomR, shojiMat);
      shojiR.position.set(halfW - flankW / 2, baseY + height / 2, halfD);
      parent.add(shojiR);

      // Sliding door frame
      const doorFrameGeom = new THREE.BoxGeometry(doorW, height, 0.04);
      const doorFrame = new THREE.Mesh(doorFrameGeom, shojiMat);
      doorFrame.position.set(0, baseY + height / 2, halfD - 0.05);
      parent.add(doorFrame);

      // Wooden display counter / ledge (Koushi counter)
      const counterGeom = new THREE.BoxGeometry(flankW * 0.8, 0.85, 0.4);
      const counter = new THREE.Mesh(counterGeom, timberMat);
      counter.position.set(-halfW + flankW / 2, baseY + 0.42, halfD + 0.15);
      parent.add(counter);
    } else {
      // Garage / roll-up security shutter
      const shutterGeom = new THREE.BoxGeometry(width - 0.6, height, 0.08);
      const shutter = new THREE.Mesh(shutterGeom, steelMat);
      shutter.position.set(0, baseY + height / 2, halfD);
      parent.add(shutter);
    }
  }

  /**
   * Upper Floor Facade (Traditional Koushi lattice, plaster, or sliding windows)
   */
  private buildUpperFacade(
    parent: THREE.Group, 
    width: number, 
    depth: number, 
    baseY: number, 
    height: number
  ) {
    const wallMat = this.matManager.get('wall');
    const shojiMat = this.matManager.get('shoji');
    const timberMat = this.matManager.get('timber');

    const halfW = width / 2;
    const halfD = depth / 2;

    // Solid side & back walls
    const sideGeom = new THREE.BoxGeometry(0.12, height, depth - 0.4);
    const wallL = new THREE.Mesh(sideGeom, wallMat);
    wallL.position.set(-halfW, baseY + height / 2, 0);
    parent.add(wallL);

    const wallR = new THREE.Mesh(sideGeom, wallMat);
    wallR.position.set(halfW, baseY + height / 2, 0);
    parent.add(wallR);

    const backGeom = new THREE.BoxGeometry(width - 0.4, height, 0.12);
    const wallB = new THREE.Mesh(backGeom, wallMat);
    wallB.position.set(0, baseY + height / 2, -halfD);
    parent.add(wallB);

    // Front facade: lower plaster wainscot + upper Shoji / lattice window row
    const wainscotH = height * 0.35;
    const windowH = height * 0.65;

    const wainscotGeom = new THREE.BoxGeometry(width - 0.4, wainscotH, 0.12);
    const wainscot = new THREE.Mesh(wainscotGeom, wallMat);
    wainscot.position.set(0, baseY + wainscotH / 2, halfD);
    parent.add(wainscot);

    const windowGeom = new THREE.BoxGeometry(width - 0.4, windowH, 0.06);
    const windows = new THREE.Mesh(windowGeom, shojiMat);
    windows.position.set(0, baseY + wainscotH + windowH / 2, halfD);
    parent.add(windows);

    // Wooden window sill & lintel trim
    const trimGeom = new THREE.BoxGeometry(width - 0.2, 0.12, 0.16);
    const sill = new THREE.Mesh(trimGeom, timberMat);
    sill.position.set(0, baseY + wainscotH, halfD);
    parent.add(sill);
  }

  /**
   * Perimeter Engawa Veranda & Balcony Railing (Kōran)
   */
  private buildBalcony(
    width: number, 
    depth: number, 
    baseY: number, 
    floorH: number, 
    isGround: boolean
  ): THREE.Group {
    const balconyGroup = new THREE.Group();
    balconyGroup.name = "EngawaBalcony";

    const timberMat = this.matManager.get('timber');
    const balconyDepth = 1.0;
    const totalW = width + balconyDepth * 2;
    const halfW = width / 2;
    const halfD = depth / 2;

    // Front balcony plank deck
    const deckGeom = new THREE.BoxGeometry(width + balconyDepth * 1.5, 0.12, balconyDepth);
    const deck = new THREE.Mesh(deckGeom, timberMat);
    deck.position.set(0, baseY + 0.1, halfD + balconyDepth / 2);
    deck.castShadow = true;
    deck.receiveShadow = true;
    balconyGroup.add(deck);

    // Balcony Railing (Kōran)
    if (this.config.timber.balconyRailing) {
      const railH = 0.85;
      const topRailGeom = new THREE.BoxGeometry(width + balconyDepth * 1.5, 0.08, 0.12);
      const topRail = new THREE.Mesh(topRailGeom, timberMat);
      topRail.position.set(0, baseY + railH, halfD + balconyDepth - 0.06);
      balconyGroup.add(topRail);

      // Balusters / vertical slats
      const balusterGeom = new THREE.BoxGeometry(0.06, railH - 0.1, 0.06);
      const balusterCount = Math.round((width + balconyDepth * 1.5) / 0.35);
      const step = (width + balconyDepth * 1.5) / balusterCount;

      for (let i = 0; i <= balusterCount; i++) {
        const bx = -(width + balconyDepth * 1.5) / 2 + i * step;
        const baluster = new THREE.Mesh(balusterGeom, timberMat);
        baluster.position.set(bx, baseY + railH / 2, halfD + balconyDepth - 0.06);
        balconyGroup.add(baluster);
      }
    }

    return balconyGroup;
  }
}
