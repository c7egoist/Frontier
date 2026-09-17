export type BuildingArchetype = 
  | 'machiya_shop' 
  | 'izakaya_ramen' 
  | 'cyber_office' 
  | 'shrine_residence' 
  | 'pagoda_tower' 
  | 'tea_house';

export type RoofType = 
  | 'irimoya'       // Japanese Hip-and-Gable
  | 'kirizuma'      // Japanese Pure Gable
  | 'yosemune'      // Japanese Pure Hip
  | 'pagoda_stepped'// Tiered upturned pagoda eaves
  | 'chinese_dian'; // Dramatic curved swooping Dian eaves

export type RoofTileType = 
  | 'kawara_honga'       // Traditional Japanese Hongawara (semi-cylindrical + flat)
  | 'glazed_imperial'    // Chinese / Japanese imperial glazed pantile
  | 'bamboo_split'       // Rustic split bamboo
  | 'copper_standing_seam'; // Modern oxidized copper / titanium zinc

export type WoodType = 
  | 'hinoki'             // Pale Japanese cypress
  | 'keyaki'             // Dark aged zelkova / cedar
  | 'yakisugi'           // Charred Shou Sugi Ban burnt cedar
  | 'vermilion_lacquer'  // Sacred Shinto shrine vermilion red
  | 'weathered_timber'   // Ancient grey weathered wood
  | 'cyber_carbon';      // Matte titanium-reinforced black timber

export type WallFinish = 
  | 'shikkui_white'      // Traditional Japanese white lime plaster
  | 'clay_earthen'       // Juraku-kabe natural earthen clay
  | 'concrete_modern'    // Contemporary architectural exposed concrete
  | 'weathered_plank'    // Horizontal cedar siding planks
  | 'dark_shou_sugi';    // Burnt black cedar planks

export type GroundFloorStyle = 
  | 'shop_noren'         // Open storefront with fabric noren & display
  | 'glass_modern'       // Retrofitted seamless floor-to-ceiling glass
  | 'tatami_shoji'       // Traditional lattice shoji sliding screens
  | 'garage_shutter';    // Weathered Japanese roll-up steel security shutter

export type BracketStyle = 
  | 'dougong_triple'     // Intricate multi-tier cantilevered timber bracket complex
  | 'tokkyo_simple'      // Classic Japanese clean timber bracket
  | 'minimal_modern'     // Steel-flitched timber hybrid
  | 'none';

export type MainSignStyle = 
  | 'carved_wood'        // Traditional engraved gold-on-black timber
  | 'neon_lightbox'      // Illuminated modern acrylic lightbox
  | 'brass_plate'        // Weathered architectural brass
  | 'cyber_hologram';    // High-tech glowing neon blade

export type EnvironmentMode = 
  | 'cyberpunk_night'    // Dark blue night with rich neon reflections & fog
  | 'dusk_golden'        // Warm sunset with long shadows and lantern glow
  | 'kyoto_day'          // Crisp bright daylight, natural architectural lighting
  | 'clay_studio'        // 3D artist clay matcap inspection
  | 'wireframe';         // Topology & geometric flow inspection

export interface BuildingConfig {
  seed: number;
  archetype: BuildingArchetype;
  
  // Dimensions & Floors
  floors: number;            // 1 to 5
  width: number;             // 6 to 18 meters
  depth: number;             // 6 to 16 meters
  floorHeight: number;       // 2.8 to 4.2 meters
  terraceSetback: number;    // 0 to 0.4 (upper floors stepping back)

  // Roof Configuration
  roof: {
    type: RoofType;
    overhang: number;        // Cantilever depth (1.0 to 2.8m)
    curvature: number;       // Upward flare / Sori (0.0 to 1.5m)
    hasTiles: boolean;       // Toggle 3D procedural roof tiles
    tileType: RoofTileType;
    color: string;           // Hex color
    tileScale: number;       // Tile density
    ridgeOrnament: 'onigawara' | 'shibi_dragon' | 'simple_ridge' | 'none';
    hasTieredEavesBetweenFloors: boolean; // Eaves awning over lower stories
  };

  // Structural Timber
  timber: {
    woodType: WoodType;
    bracketStyle: BracketStyle;
    bracketDensity: number;  // 1 to 4 brackets per bay
    hasEngawaBalcony: boolean; // Wrap-around wooden veranda
    balconyRailing: boolean;
  };

  // Walls & Facades
  walls: {
    finish: WallFinish;
    groundFloorStyle: GroundFloorStyle;
    windowGridDensity: number; // 2 to 6 divisions
  };

  // Modern Retrofit & Utility System
  electricity: {
    hasPhonePole: boolean;
    poleDistance: number;    // Distance from building
    sagFactor: number;       // Cable droop / catenary gravity
    wireCount: number;       // Number of powerlines (2 to 6)
    hasTransformers: boolean;
    hasStreetMirror: boolean;
    hasACUnits: boolean;
    acCount: number;         // Outdoor split units
    hasVendingMachine: boolean;
    hasUtilityMeters: boolean;
  };

  // Lighting System
  lighting: {
    enabled: boolean;
    hasLanterns: boolean;
    lanternCount: number;
    hasNeonSigns: boolean;
    hasEavesLED: boolean;
    hasSpotlights: boolean;
    hasStreetLamp: boolean;
    lightWarmth: number;     // Warm (2200K) to cool (5000K)
    neonColorPrimary: string;
    neonColorSecondary: string;
    flickerEffect: boolean;
  };

  // Asian Interior & Props
  furniture: {
    enabled: boolean;
    hasTatami: boolean;
    hasChabudaiTable: boolean;
    hasZafuCushions: boolean;
    hasShojiScreens: boolean;
    hasAndonLamp: boolean;
    hasBonsai: boolean;
    hasTeaSet: boolean;
    hasNorenCurtain: boolean;
  };

  // Custom Signage & Typography
  signage: {
    mainSignText: string;
    mainSignSubtext: string;
    mainSignStyle: MainSignStyle;
    neonVerticalText: string;
    lanternText: string;
    norenText: string;
    hasPosters: boolean;
    posterType: 'cyber_ad' | 'ukiyo_e' | 'ramen_menu';
    posterTitle: string;
  };

  // Render & Scene
  rendering: {
    environment: EnvironmentMode;
    bloom: boolean;
    shadows: boolean;
    fog: boolean;
    rain: boolean;
    autoRotate: boolean;
  };
}
