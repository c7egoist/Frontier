// Quality tiers: the single scalability table from the research doc, encoded.
export interface Tier {
  name: string;
  gpu: string;
  renderScale: number;
  mid: CascadeCfg;
  far: CascadeCfg | null; // null = disabled
  amr: boolean;
  maxFineBlocks: number;  // of 64 near-cascade blocks
  sprayBudget: number;
  sprayEnabled: boolean;
  microOctaves: number;   // fragment normal-detail octaves
  specPower: number;
}

export interface CascadeCfg {
  size: number;   // window edge length in meters
  res: number;    // grid resolution (square)
  depthEff: number; // effective water depth -> wave speed c = sqrt(g*d)
  damping: number;
  diffusion: number;
}

const G = 9.81;
export const waveSpeed = (d: number) => Math.sqrt(G * d);

export const NEAR: CascadeCfg = {
  size: 96, res: 128, depthEff: 12, damping: 0.015, diffusion: 0.012,
};
export const NEAR_FINE_RES = 256;

const MID_LOW: CascadeCfg = { size: 640, res: 128, depthEff: 40, damping: 0.01, diffusion: 0.012 };
const MID_HIGH: CascadeCfg = { size: 640, res: 256, depthEff: 40, damping: 0.01, diffusion: 0.012 };
const FAR_LOW: CascadeCfg = { size: 4096, res: 128, depthEff: 160, damping: 0.008, diffusion: 0.01 };
const FAR_HIGH: CascadeCfg = { size: 4096, res: 256, depthEff: 160, damping: 0.008, diffusion: 0.01 };

export const TIERS: Record<string, Tier> = {
  low: {
    name: 'low', gpu: 'GTX 1050', renderScale: 0.8,
    mid: MID_LOW, far: null,
    amr: false, maxFineBlocks: 0,
    sprayBudget: 8192, sprayEnabled: true,
    microOctaves: 1, specPower: 180,
  },
  mid: {
    name: 'mid', gpu: 'GTX 1660', renderScale: 1.0,
    mid: MID_LOW, far: FAR_LOW,
    amr: true, maxFineBlocks: 16,
    sprayBudget: 32768, sprayEnabled: true,
    microOctaves: 2, specPower: 260,
  },
  high: {
    name: 'high', gpu: 'RTX 3060', renderScale: 1.0,
    mid: MID_HIGH, far: FAR_HIGH,
    amr: true, maxFineBlocks: 36,
    sprayBudget: 100352, sprayEnabled: true,
    microOctaves: 2, specPower: 380,
  },
  ultra: {
    name: 'ultra', gpu: 'RTX 4090', renderScale: 1.0,
    mid: MID_HIGH, far: FAR_HIGH,
    amr: true, maxFineBlocks: 64,
    sprayBudget: 200704, sprayEnabled: true,
    microOctaves: 3, specPower: 520,
  },
};

// Near cascade AMR geometry (fixed across tiers so block metrics stay stable)
export const NEAR_BLOCKS = 8;             // 8x8 blocks
export const NEAR_BLOCK_CELLS = 16;       // L0 cells per block edge -> block = 16x16 coarse = 32x32 fine
export const NEAR_BLOCK_COUNT = NEAR_BLOCKS * NEAR_BLOCKS;
