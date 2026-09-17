import * as THREE from 'three';
import { BuildingConfig } from '../types/generator';
import { MaterialManager } from '../materials/materialManager';

export class InteriorBuilder {
  private config: BuildingConfig;
  private matManager: MaterialManager;

  constructor(config: BuildingConfig, matManager: MaterialManager) {
    this.config = config;
    this.matManager = matManager;
  }

  /**
   * Builds the interior furniture and tatami layout for a floor
   */
  public buildInterior(
    width: number, 
    depth: number, 
    floorY: number, 
    floorIndex: number
  ): THREE.Group {
    const group = new THREE.Group();
    group.name = `Interior_Floor_${floorIndex + 1}`;

    if (!this.config.furniture.enabled) {
      return group;
    }

    const { 
      hasTatami, 
      hasChabudaiTable, 
      hasZafuCushions, 
      hasShojiScreens, 
      hasAndonLamp, 
      hasBonsai, 
      hasTeaSet 
    } = this.config.furniture;

    const interiorW = width - 0.8;
    const interiorD = depth - 0.8;
    const baseY = floorY + 0.26; // Just above floor slab

    // 1. Tatami Mat Layout
    if (hasTatami) {
      const tatamiGroup = this.buildTatamiLayout(interiorW, interiorD, baseY);
      group.add(tatamiGroup);
    }

    // 2. Chabudai Low Wooden Table
    if (hasChabudaiTable) {
      const tableGroup = this.buildChabudaiTable(0, baseY, 0.5);
      group.add(tableGroup);

      // Tea Set on Table
      if (hasTeaSet) {
        const teaGroup = this.buildTeaSet(0, baseY + 0.42, 0.5);
        group.add(teaGroup);
      }
    }

    // 3. Zafu Sitting Cushions
    if (hasZafuCushions) {
      const cushionsGroup = this.buildZafuCushions(0, baseY, 0.5);
      group.add(cushionsGroup);
    }

    // 4. Shoji Screen Room Partition
    if (hasShojiScreens) {
      const partition = this.buildShojiPartition(interiorW * 0.45, interiorD, baseY);
      group.add(partition);
    }

    // 5. Traditional Andon Paper Floor Lamp with Warm Light Glow
    if (hasAndonLamp) {
      const lampX = interiorW * 0.35;
      const lampZ = -interiorD * 0.3;
      const lamp = this.buildAndonLamp(lampX, baseY, lampZ);
      group.add(lamp);

      // Warm interior point light inside the Andon lamp
      if (this.config.lighting.enabled) {
        const andonLight = new THREE.PointLight('#ffbe0b', 0.8, 6);
        andonLight.position.set(lampX, baseY + 0.5, lampZ);
        group.add(andonLight);
      }
    }

    // 6. Bonsai Pine Tree in Ceramic Pot
    if (hasBonsai) {
      const bonsaiX = -interiorW * 0.35;
      const bonsaiZ = interiorD * 0.3;
      const bonsai = this.buildBonsaiTree(bonsaiX, baseY, bonsaiZ);
      group.add(bonsai);
    }

    return group;
  }

  /**
   * Tatami mats laid out across the floor
   */
  private buildTatamiLayout(w: number, d: number, baseY: number): THREE.Group {
    const group = new THREE.Group();
    group.name = "TatamiLayout";
    const tatamiMat = this.matManager.get('tatami');

    // Standard Tatami mat is roughly 1.8m x 0.9m
    const matL = 1.8;
    const matW = 0.9;
    const matH = 0.05;

    const rows = Math.floor(d / matL);
    const cols = Math.floor(w / matW);

    const startX = -((cols - 1) * matW) / 2;
    const startZ = -((rows - 1) * matL) / 2;

    const matGeom = new THREE.BoxGeometry(matW * 0.96, matH, matL * 0.96);

    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const mat = new THREE.Mesh(matGeom, tatamiMat);
        mat.position.set(startX + c * matW, baseY + matH / 2, startZ + r * matL);
        mat.receiveShadow = true;
        group.add(mat);
      }
    }

    return group;
  }

  /**
   * Traditional Chabudai Low Wooden Table
   */
  private buildChabudaiTable(x: number, y: number, z: number): THREE.Group {
    const group = new THREE.Group();
    group.name = "ChabudaiTable";
    const timberMat = this.matManager.get('timber');

    const tableRadius = 0.85;
    const tableHeight = 0.38;

    // Tabletop (round or soft square)
    const topGeom = new THREE.CylinderGeometry(tableRadius, tableRadius, 0.06, 24);
    const topMesh = new THREE.Mesh(topGeom, timberMat);
    topMesh.position.set(x, y + tableHeight, z);
    topMesh.castShadow = true;
    group.add(topMesh);

    // 4 curved folding legs
    const legGeom = new THREE.CylinderGeometry(0.04, 0.03, tableHeight, 8);
    for (let i = 0; i < 4; i++) {
      const angle = (i * Math.PI) / 2 + Math.PI / 4;
      const legX = x + Math.cos(angle) * (tableRadius * 0.65);
      const legZ = z + Math.sin(angle) * (tableRadius * 0.65);

      const leg = new THREE.Mesh(legGeom, timberMat);
      leg.position.set(legX, y + tableHeight / 2, legZ);
      leg.castShadow = true;
      group.add(leg);
    }

    return group;
  }

  /**
   * Zafu / Zabuton sitting cushions
   */
  private buildZafuCushions(centerX: number, y: number, centerZ: number): THREE.Group {
    const group = new THREE.Group();
    group.name = "ZafuCushions";

    const cushionMat = new THREE.MeshStandardMaterial({
      color: new THREE.Color('#3a5a40'),
      roughness: 0.85,
    });

    const cushionGeom = new THREE.CylinderGeometry(0.28, 0.3, 0.09, 16);
    const dist = 1.15;

    // 4 cushions surrounding table
    const positions = [
      [centerX, centerZ + dist],
      [centerX, centerZ - dist],
      [centerX + dist, centerZ],
      [centerX - dist, centerZ]
    ];

    positions.forEach(([cx, cz]) => {
      const cushion = new THREE.Mesh(cushionGeom, cushionMat);
      cushion.position.set(cx, y + 0.05, cz);
      cushion.castShadow = true;
      group.add(cushion);
    });

    return group;
  }

  /**
   * Traditional Shoji Sliding Screen Partition
   */
  private buildShojiPartition(x: number, maxD: number, y: number): THREE.Group {
    const group = new THREE.Group();
    group.name = "ShojiPartition";
    const shojiMat = this.matManager.get('shoji');
    const timberMat = this.matManager.get('timber');

    const partH = 2.4;
    const partD = maxD * 0.55;

    // Shoji sliding panels
    const screenGeom = new THREE.BoxGeometry(0.06, partH, partD);
    const screen = new THREE.Mesh(screenGeom, shojiMat);
    screen.position.set(x, y + partH / 2, 0);
    group.add(screen);

    // Header track beam
    const trackGeom = new THREE.BoxGeometry(0.12, 0.12, partD + 0.2);
    const track = new THREE.Mesh(trackGeom, timberMat);
    track.position.set(x, y + partH + 0.06, 0);
    group.add(track);

    return group;
  }

  /**
   * Traditional Andon Floor Paper Lamp
   */
  private buildAndonLamp(x: number, y: number, z: number): THREE.Group {
    const group = new THREE.Group();
    group.name = "AndonFloorLamp";
    const timberMat = this.matManager.get('timber');
    const shojiMat = this.matManager.get('shoji');

    const lampH = 0.75;
    const lampW = 0.32;

    // 4 wooden corner posts
    const postGeom = new THREE.BoxGeometry(0.03, lampH, 0.03);
    const halfW = lampW / 2;

    [[-halfW, -halfW], [-halfW, halfW], [halfW, -halfW], [halfW, halfW]].forEach(([px, pz]) => {
      const post = new THREE.Mesh(postGeom, timberMat);
      post.position.set(x + px, y + lampH / 2, z + pz);
      group.add(post);
    });

    // Paper shade body with warm glow
    const shadeGeom = new THREE.BoxGeometry(lampW - 0.02, lampH * 0.7, lampW - 0.02);
    const shadeMat = new THREE.MeshStandardMaterial({
      color: new THREE.Color('#fff2b2'),
      emissive: new THREE.Color('#f77f00'),
      emissiveIntensity: 0.9,
      roughness: 0.9,
    });
    const shade = new THREE.Mesh(shadeGeom, shadeMat);
    shade.position.set(x, y + lampH * 0.45, z);
    group.add(shade);

    return group;
  }

  /**
   * Bonsai miniature tree in ceramic pot
   */
  private buildBonsaiTree(x: number, y: number, z: number): THREE.Group {
    const group = new THREE.Group();
    group.name = "BonsaiPlant";

    const potMat = this.matManager.get('ceramic_pot');
    const leavesMat = this.matManager.get('bonsai_leaves');
    const timberMat = this.matManager.get('timber');

    // Oval / hexagonal ceramic bonsai pot
    const potGeom = new THREE.CylinderGeometry(0.35, 0.28, 0.16, 8);
    const pot = new THREE.Mesh(potGeom, potMat);
    pot.position.set(x, y + 0.08, z);
    group.add(pot);

    // Twisted bonsai trunk
    const trunkGeom = new THREE.CylinderGeometry(0.04, 0.07, 0.45, 6);
    const trunk = new THREE.Mesh(trunkGeom, timberMat);
    trunk.position.set(x, y + 0.35, z);
    trunk.rotation.z = 0.25;
    group.add(trunk);

    // Pine foliage clouds (Sannin-gumo)
    const foliageGeom = new THREE.SphereGeometry(0.18, 8, 8);
    const cloud1 = new THREE.Mesh(foliageGeom, leavesMat);
    cloud1.scale.set(1.4, 0.6, 1.2);
    cloud1.position.set(x + 0.12, y + 0.55, z);
    group.add(cloud1);

    const cloud2 = new THREE.Mesh(foliageGeom, leavesMat);
    cloud2.scale.set(1.1, 0.5, 1.0);
    cloud2.position.set(x - 0.15, y + 0.45, z + 0.08);
    group.add(cloud2);

    return group;
  }

  /**
   * Japanese Ceramic Tea Set (Kyusu & Ochawan)
   */
  private buildTeaSet(x: number, y: number, z: number): THREE.Group {
    const group = new THREE.Group();
    group.name = "TeaCeremonySet";
    const ceramicMat = this.matManager.get('ceramic_pot');

    // Teapot (Kyusu)
    const potGeom = new THREE.SphereGeometry(0.09, 12, 12);
    const pot = new THREE.Mesh(potGeom, ceramicMat);
    pot.position.set(x, y + 0.09, z);
    group.add(pot);

    // Teapot spout
    const spoutGeom = new THREE.CylinderGeometry(0.02, 0.03, 0.08, 6);
    const spout = new THREE.Mesh(spoutGeom, ceramicMat);
    spout.position.set(x + 0.09, y + 0.11, z);
    spout.rotation.z = -Math.PI * 0.35;
    group.add(spout);

    // 2 small ceramic tea cups
    const cupGeom = new THREE.CylinderGeometry(0.04, 0.03, 0.06, 8);
    [-0.14, 0.14].forEach(cx => {
      const cup = new THREE.Mesh(cupGeom, ceramicMat);
      cup.position.set(x + cx, y + 0.03, z + 0.12);
      group.add(cup);
    });

    return group;
  }
}
