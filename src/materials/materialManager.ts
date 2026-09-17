import * as THREE from 'three';
import { BuildingConfig } from '../types/generator';
import {
  createRoofTileTexture,
  createWoodTexture,
  createTatamiTexture,
  createShojiTexture,
  createSignboardTexture,
  createNeonBladeTexture,
  createLanternTexture,
  createNorenTexture,
  createVendingMachineTexture,
  createPosterTexture
} from './textureGenerators';

export class MaterialManager {
  private config: BuildingConfig;
  public materials: Map<string, THREE.Material> = new Map();

  constructor(config: BuildingConfig) {
    this.config = config;
    this.initMaterials();
  }

  public updateConfig(newConfig: BuildingConfig) {
    this.config = newConfig;
    this.initMaterials();
  }

  private initMaterials() {
    // 1. Roof Material
    const roofTex = createRoofTileTexture(this.config.roof.tileType, this.config.roof.color);
    const roofMat = new THREE.MeshStandardMaterial({
      color: new THREE.Color(this.config.roof.color),
      map: this.config.roof.hasTiles ? roofTex : null,
      roughness: this.config.roof.tileType === 'glazed_imperial' ? 0.25 : 0.6,
      metalness: this.config.roof.tileType === 'copper_standing_seam' ? 0.75 : 0.08,
      bumpMap: this.config.roof.hasTiles ? roofTex : null,
      bumpScale: 0.04,
      side: THREE.DoubleSide,
    });
    this.materials.set('roof', roofMat);

    // 2. Timber / Wood Structural Material
    const woodTex = createWoodTexture(this.config.timber.woodType);
    const timberMat = new THREE.MeshStandardMaterial({
      map: woodTex,
      roughness: this.config.timber.woodType === 'vermilion_lacquer' ? 0.35 : 0.75,
      metalness: this.config.timber.woodType === 'cyber_carbon' ? 0.3 : 0.02,
      bumpMap: woodTex,
      bumpScale: 0.02,
    });
    this.materials.set('timber', timberMat);

    // 3. Wall Material
    let wallColor = '#f5f5f5';
    let wallRoughness = 0.85;
    let wallMetalness = 0.0;

    switch (this.config.walls.finish) {
      case 'shikkui_white':
        wallColor = '#fbfbfa';
        wallRoughness = 0.9;
        break;
      case 'clay_earthen':
        wallColor = '#b59d79';
        wallRoughness = 0.95;
        break;
      case 'concrete_modern':
        wallColor = '#8d99ae';
        wallRoughness = 0.7;
        wallMetalness = 0.1;
        break;
      case 'weathered_plank':
        wallColor = '#4a443c';
        wallRoughness = 0.85;
        break;
      case 'dark_shou_sugi':
        wallColor = '#1a1816';
        wallRoughness = 0.8;
        break;
    }

    const wallMat = new THREE.MeshStandardMaterial({
      color: new THREE.Color(wallColor),
      roughness: wallRoughness,
      metalness: wallMetalness,
    });
    this.materials.set('wall', wallMat);

    // 4. Shoji Screens Material
    const shojiTex = createShojiTexture(this.config.walls.windowGridDensity);
    const shojiMat = new THREE.MeshStandardMaterial({
      map: shojiTex,
      roughness: 0.9,
      metalness: 0.0,
      transparent: true,
      opacity: 0.95,
      side: THREE.DoubleSide,
      emissive: new THREE.Color('#ffe8cc'),
      emissiveIntensity: this.config.lighting.enabled ? 0.25 : 0.02,
    });
    this.materials.set('shoji', shojiMat);

    // 5. Modern Architectural Retrofit Glass
    const glassMat = new THREE.MeshPhysicalMaterial({
      color: new THREE.Color('#8ecae6'),
      roughness: 0.05,
      transmission: 0.75,
      thickness: 0.5,
      transparent: true,
      opacity: 0.5,
      reflectivity: 0.9,
      ior: 1.52,
    });
    this.materials.set('glass', glassMat);

    // 6. Tatami Mat
    const tatamiTex = createTatamiTexture();
    const tatamiMat = new THREE.MeshStandardMaterial({
      map: tatamiTex,
      roughness: 0.85,
      metalness: 0.0,
    });
    this.materials.set('tatami', tatamiMat);

    // 7. Metal & Utility Hardware (Transformers, Poles, AC compressors)
    const steelMat = new THREE.MeshStandardMaterial({
      color: new THREE.Color('#3d444d'),
      roughness: 0.35,
      metalness: 0.85,
    });
    this.materials.set('steel', steelMat);

    const darkMetalMat = new THREE.MeshStandardMaterial({
      color: new THREE.Color('#1c2025'),
      roughness: 0.5,
      metalness: 0.7,
    });
    this.materials.set('dark_metal', darkMetalMat);

    const copperPipeMat = new THREE.MeshStandardMaterial({
      color: new THREE.Color('#b87333'),
      roughness: 0.3,
      metalness: 0.9,
    });
    this.materials.set('copper_pipe', copperPipeMat);

    const wireMat = new THREE.MeshBasicMaterial({
      color: new THREE.Color('#0f1115'),
    });
    this.materials.set('wire', wireMat);

    const poleConcreteMat = new THREE.MeshStandardMaterial({
      color: new THREE.Color('#6c757d'),
      roughness: 0.9,
      metalness: 0.05,
    });
    this.materials.set('pole_concrete', poleConcreteMat);

    const ceramicInsulatorMat = new THREE.MeshStandardMaterial({
      color: new THREE.Color('#f8f9fa'),
      roughness: 0.15,
      metalness: 0.1,
    });
    this.materials.set('ceramic_insulator', ceramicInsulatorMat);

    // 8. Signboard & Typography Materials
    const signTex = createSignboardTexture(
      this.config.signage.mainSignText,
      this.config.signage.mainSignSubtext,
      this.config.signage.mainSignStyle
    );
    const isLightbox = this.config.signage.mainSignStyle === 'neon_lightbox' || 
                       this.config.signage.mainSignStyle === 'cyber_hologram';
    const signMat = new THREE.MeshStandardMaterial({
      map: signTex,
      roughness: isLightbox ? 0.2 : 0.6,
      metalness: this.config.signage.mainSignStyle === 'brass_plate' ? 0.85 : 0.1,
      emissive: isLightbox ? new THREE.Color('#ffffff') : new THREE.Color('#000000'),
      emissiveMap: isLightbox ? signTex : null,
      emissiveIntensity: isLightbox && this.config.lighting.enabled ? 1.2 : 0.0,
    });
    this.materials.set('main_sign', signMat);

    // 9. Neon Blade Sign
    const neonBladeTex = createNeonBladeTexture(
      this.config.signage.neonVerticalText,
      this.config.lighting.neonColorPrimary
    );
    const neonBladeMat = new THREE.MeshStandardMaterial({
      map: neonBladeTex,
      roughness: 0.2,
      metalness: 0.3,
      emissive: new THREE.Color(this.config.lighting.neonColorPrimary),
      emissiveMap: neonBladeTex,
      emissiveIntensity: this.config.lighting.enabled ? 1.8 : 0.1,
    });
    this.materials.set('neon_blade', neonBladeMat);

    // 10. Chōchin Paper Lantern
    const lanternTex = createLanternTexture(this.config.signage.lanternText);
    const lanternMat = new THREE.MeshStandardMaterial({
      map: lanternTex,
      roughness: 0.6,
      metalness: 0.0,
      emissive: new THREE.Color('#ff5964'),
      emissiveMap: lanternTex,
      emissiveIntensity: this.config.lighting.enabled ? 1.4 : 0.1,
    });
    this.materials.set('lantern', lanternMat);

    // 11. Noren Door Curtain
    const norenTex = createNorenTexture(this.config.signage.norenText);
    const norenMat = new THREE.MeshStandardMaterial({
      map: norenTex,
      roughness: 0.9,
      metalness: 0.0,
      side: THREE.DoubleSide,
    });
    this.materials.set('noren', norenMat);

    // 12. Vending Machine
    const vendingTex = createVendingMachineTexture();
    const vendingMat = new THREE.MeshStandardMaterial({
      map: vendingTex,
      roughness: 0.3,
      metalness: 0.3,
      emissive: new THREE.Color('#ffffff'),
      emissiveMap: vendingTex,
      emissiveIntensity: this.config.lighting.enabled ? 0.7 : 0.05,
    });
    this.materials.set('vending_front', vendingMat);

    // 13. Street Posters
    const posterTex = createPosterTexture(
      this.config.signage.posterType,
      this.config.signage.posterTitle
    );
    const posterMat = new THREE.MeshStandardMaterial({
      map: posterTex,
      roughness: 0.7,
      metalness: 0.0,
      emissive: this.config.signage.posterType === 'cyber_ad' ? new THREE.Color('#00f5d4') : new THREE.Color('#000000'),
      emissiveIntensity: this.config.signage.posterType === 'cyber_ad' && this.config.lighting.enabled ? 0.6 : 0.0,
    });
    this.materials.set('poster', posterMat);

    // 14. Ground Street / Sidewalk
    const streetMat = new THREE.MeshStandardMaterial({
      color: new THREE.Color('#191c21'),
      roughness: 0.5,
      metalness: 0.15,
    });
    this.materials.set('street_asphalt', streetMat);

    const sidewalkMat = new THREE.MeshStandardMaterial({
      color: new THREE.Color('#495057'),
      roughness: 0.75,
      metalness: 0.05,
    });
    this.materials.set('sidewalk', sidewalkMat);

    // 15. Eaves LED Strip Emissive
    const ledMat = new THREE.MeshBasicMaterial({
      color: new THREE.Color('#ffbe0b'),
    });
    this.materials.set('led_strip', ledMat);

    // 16. Bonsai foliage & pot
    const bonsaiLeavesMat = new THREE.MeshStandardMaterial({
      color: new THREE.Color('#2d6a4f'),
      roughness: 0.8,
      metalness: 0.0,
    });
    this.materials.set('bonsai_leaves', bonsaiLeavesMat);

    const ceramicPotMat = new THREE.MeshStandardMaterial({
      color: new THREE.Color('#0d1b2a'),
      roughness: 0.3,
      metalness: 0.2,
    });
    this.materials.set('ceramic_pot', ceramicPotMat);

    // 17. Gold / Bronze Ridge Ornaments (Onigawara / Shibi)
    const goldOrnamentMat = new THREE.MeshStandardMaterial({
      color: new THREE.Color(this.config.roof.tileType === 'glazed_imperial' ? '#f4a261' : '#333740'),
      roughness: 0.4,
      metalness: this.config.roof.tileType === 'glazed_imperial' ? 0.8 : 0.3,
    });
    this.materials.set('ridge_ornament', goldOrnamentMat);
  }

  public get(name: string): THREE.Material {
    return this.materials.get(name) || this.materials.get('timber')!;
  }
}
