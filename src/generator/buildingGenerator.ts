import * as THREE from 'three';
import { BuildingConfig } from '../types/generator';
import { MaterialManager } from '../materials/materialManager';
import { RoofBuilder } from './roofBuilder';
import { FloorBuilder } from './floorBuilder';
import { InteriorBuilder } from './interiorBuilder';
import { UtilityBuilder } from './utilityBuilder';
import { SignageBuilder } from './signageBuilder';

export interface GenerationStats {
  triangleCount: number;
  vertexCount: number;
  meshCount: number;
  totalHeight: number;
  boundingWidth: number;
  boundingDepth: number;
}

export class BuildingGenerator {
  private config: BuildingConfig;
  private matManager: MaterialManager;
  private roofBuilder: RoofBuilder;
  private floorBuilder: FloorBuilder;
  private interiorBuilder: InteriorBuilder;
  private utilityBuilder: UtilityBuilder;
  private signageBuilder: SignageBuilder;

  constructor(config: BuildingConfig) {
    this.config = config;
    this.matManager = new MaterialManager(config);
    this.roofBuilder = new RoofBuilder(config, this.matManager);
    this.floorBuilder = new FloorBuilder(config, this.matManager);
    this.interiorBuilder = new InteriorBuilder(config, this.matManager);
    this.utilityBuilder = new UtilityBuilder(config, this.matManager);
    this.signageBuilder = new SignageBuilder(config, this.matManager);
  }

  public updateConfig(config: BuildingConfig) {
    this.config = config;
    this.matManager.updateConfig(config);
    this.roofBuilder = new RoofBuilder(config, this.matManager);
    this.floorBuilder = new FloorBuilder(config, this.matManager);
    this.interiorBuilder = new InteriorBuilder(config, this.matManager);
    this.utilityBuilder = new UtilityBuilder(config, this.matManager);
    this.signageBuilder = new SignageBuilder(config, this.matManager);
  }

  /**
   * Generates the entire building hierarchy and returns root Group + Stats
   */
  public generate(): { root: THREE.Group; stats: GenerationStats } {
    const root = new THREE.Group();
    root.name = `ProceduralAsianBuilding_${this.config.archetype}`;

    const { floors, width, depth, floorHeight, terraceSetback } = this.config;

    // 1. Street Environment Base (Asphalt, sidewalk, curb, manhole)
    const streetBase = this.buildStreetBase(width, depth);
    root.add(streetBase);

    let currentY = 0;
    let currentW = width;
    let currentD = depth;

    // 2. Procedural Floor Stacking
    for (let f = 0; f < floors; f++) {
      const isTopFloor = (f === floors - 1);

      // Progressive upper-floor setback / terrace
      if (f > 0 && terraceSetback > 0) {
        currentW = Math.max(4.0, width * (1.0 - f * terraceSetback * 0.4));
        currentD = Math.max(4.0, depth * (1.0 - f * terraceSetback * 0.4));
      }

      // Build Floor structure
      const floorGroup = this.floorBuilder.buildFloor(f, currentW, currentD, currentY);
      root.add(floorGroup);

      // Build Interior furniture (Tatami, table, cushions, andon lamp, bonsai)
      const interiorGroup = this.interiorBuilder.buildInterior(currentW, currentD, currentY, f);
      root.add(interiorGroup);

      // Intermediate Eaves / Awning between floors
      if (!isTopFloor && this.config.roof.hasTieredEavesBetweenFloors) {
        const intermediateEaves = this.roofBuilder.buildRoof(
          currentW, 
          currentD, 
          currentY + floorHeight, 
          true
        );
        root.add(intermediateEaves);
      }

      currentY += floorHeight;
    }

    // 3. Main Top Roof Structure
    const mainRoof = this.roofBuilder.buildRoof(currentW, currentD, currentY, false);
    root.add(mainRoof);

    // Estimate total building height
    const totalHeight = currentY + Math.min(width, depth) * 0.38 + 1.2;

    // 4. Modern Retrofit Utilities (Telephone Pole, Catenary Wires, AC units, Vending Machine)
    const utilities = this.utilityBuilder.buildUtilities(width, depth, totalHeight);
    root.add(utilities);

    // 5. Signboards, Vertical Neon, Lanterns, Noren, Posters
    const signage = this.signageBuilder.buildSignage(width, depth, floorHeight);
    root.add(signage);

    // 6. Calculate Polygon / Vertex / Mesh Statistics
    const stats = this.computeStats(root, totalHeight, width, depth);

    return { root, stats };
  }

  /**
   * Street pavement base with sidewalk, curb, and asphalt road
   */
  private buildStreetBase(width: number, depth: number): THREE.Group {
    const group = new THREE.Group();
    group.name = "StreetEnvironmentBase";

    const asphaltMat = this.matManager.get('street_asphalt');
    const sidewalkMat = this.matManager.get('sidewalk');
    const steelMat = this.matManager.get('steel');

    const totalBaseW = width + 14.0;
    const totalBaseD = depth + 14.0;

    // Road Asphalt
    const roadGeom = new THREE.BoxGeometry(totalBaseW, 0.2, totalBaseD);
    const road = new THREE.Mesh(roadGeom, asphaltMat);
    road.position.set(0, -0.1, 0);
    road.receiveShadow = true;
    group.add(road);

    // Sidewalk Stone Platform directly under building
    const walkW = width + 3.0;
    const walkD = depth + 3.5;
    const sidewalkGeom = new THREE.BoxGeometry(walkW, 0.15, walkD);
    const sidewalk = new THREE.Mesh(sidewalkGeom, sidewalkMat);
    sidewalk.position.set(0, 0.075, 0.5);
    sidewalk.receiveShadow = true;
    group.add(sidewalk);

    // Sidewalk Curb Stone Trim
    const curbGeom = new THREE.BoxGeometry(walkW + 0.1, 0.18, 0.15);
    const curbFront = new THREE.Mesh(curbGeom, steelMat);
    curbFront.position.set(0, 0.09, 0.5 + walkD / 2);
    group.add(curbFront);

    // Metal Road Manhole Cover (Classic Japanese art manhole)
    const manholeGeom = new THREE.CylinderGeometry(0.45, 0.45, 0.02, 20);
    const manhole = new THREE.Mesh(manholeGeom, steelMat);
    manhole.position.set(-width * 0.45, 0.01, depth * 0.5 + 3.0);
    group.add(manhole);

    // Road White Line Marking
    const lineGeom = new THREE.BoxGeometry(0.2, 0.01, walkD * 1.5);
    const lineMat = new THREE.MeshBasicMaterial({ color: '#ffffff' });
    const line = new THREE.Mesh(lineGeom, lineMat);
    line.position.set(width * 0.65, 0.01, 0);
    group.add(line);

    return group;
  }

  /**
   * Computes mesh statistics for AAA game inspector
   */
  private computeStats(
    root: THREE.Group, 
    height: number, 
    width: number, 
    depth: number
  ): GenerationStats {
    let triangleCount = 0;
    let vertexCount = 0;
    let meshCount = 0;

    root.traverse((obj) => {
      if ((obj as THREE.Mesh).isMesh) {
        meshCount++;
        const mesh = obj as THREE.Mesh;
        const geom = mesh.geometry;
        if (geom.index) {
          triangleCount += geom.index.count / 3;
        } else if (geom.attributes.position) {
          triangleCount += geom.attributes.position.count / 3;
        }
        if (geom.attributes.position) {
          vertexCount += geom.attributes.position.count;
        }
      }
    });

    return {
      triangleCount: Math.round(triangleCount),
      vertexCount,
      meshCount,
      totalHeight: Math.round(height * 10) / 10,
      boundingWidth: Math.round(width * 10) / 10,
      boundingDepth: Math.round(depth * 10) / 10,
    };
  }
}
