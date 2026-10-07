export type FarmId = 'meadow' | 'pumpkin' | 'sunflower' | 'snowyberry' | 'desert';
export const FARM_ORDER: readonly FarmId[] = ['meadow', 'pumpkin', 'sunflower', 'snowyberry', 'desert'];

export type CropId =
  | 'lettuce' | 'wheat' | 'carrot' | 'corn' | 'cabbage' | 'pumpkin' | 'squash' | 'watermelon'
  | 'tomato' | 'sunflower' | 'strawberry' | 'blueberry' | 'turnip' | 'pepper' | 'cactusfruit' | 'dragonfruit';

export type UpgradeId = 'add' | 'merge' | 'speed' | 'capacity' | 'expand' | 'finish';
export type BoostId = 'incomeX2' | 'autopilot';

export interface Segment {
  id: number;
  level: number;
}

/** Closed loop resampled at uniform arc length `ds`. */
export interface PathTable {
  length: number;
  ds: number;
  n: number;
  x: Float32Array;
  z: Float32Array;
  tx: Float32Array;
  tz: Float32Array;
  barnS: number;
}

/** Struct-of-arrays crop field; one per farm, stable indices for the farm's lifetime. */
export interface CropField {
  count: number;
  key: Int32Array;
  x: Float32Array;
  z: Float32Array;
  tier: Uint8Array;
  /** Visual variety seed per crop (rotation, scale jitter). */
  seed: Float32Array;
  hp: Float32Array;
  maxHp: Float32Array;
  /** Sim time when the crop is alive again; 0 = alive. */
  regrowAt: Float64Array;
  golden: Uint8Array;
  /** 1 = covered by the current stage's path (not rendered, not harvestable). */
  paved: Uint8Array;
  /** For each stage, 1 if the crop is paved at that stage (for carve animation and validation). */
  pavedAt: Uint8Array[];
  /** Dead crop indices awaiting regrowth. */
  dead: Uint32Array;
  deadCount: number;
  /** Crops whose visual state changed since the renderer last consumed them. */
  dirty: Uint32Array;
  dirtyCount: number;
  dirtyMark: Uint8Array;
  /** Per arc-bin candidate lists (CSR). */
  bins: { binLen: number; n: number; start: Uint32Array; items: Uint32Array };
}

export interface FarmProgress {
  stage: number;
  finished: boolean;
  addCount: number;
  mergeCount: number;
  speedLevel: number;
  capacityLevel: number;
  segments: Segment[];
}

export interface Basket {
  mass: number;
  value: number;
  /** Mass per tier (0..3) and golden (index 4) — drives stack block colours. */
  massByTier: number[];
}

export interface GameState {
  simTime: number;
  rng: number;
  coins: number;
  lifetimeCoins: number;
  farmId: FarmId;
  progress: FarmProgress;
  /** Saved progress of farms you are not currently on. */
  farmsProgress: Partial<Record<FarmId, FarmProgress>>;
  unlockedFarms: FarmId[];
  completedFarms: FarmId[];
  nextSegId: number;
  headS: number;
  prevHeadS: number;
  v: number;
  /** Total distance crawled (drives leg animation; never wraps). */
  odometer: number;
  basket: Basket;
  boosts: Record<BoostId, number>;
  tornadoes: number;
  maxLevelReached: number;
  economy: {
    ema: number;
    winTime: number;
    winCoins: number;
    passive: Partial<Record<FarmId, number>>;
  };
  gift: { nextAt: number; activeUntil: number; kind: 'butterfly' | 'ladybug' };
  stats: { harvested: number; unloads: number; merges: number; tornadoesUsed: number; goldenHarvested: number };
  lastFullAt: number;
}

export interface SimInput {
  throttleHeld: boolean;
}

export type Command =
  | { c: 'buy'; id: UpgradeId; free?: boolean }
  | { c: 'useTornado' }
  | { c: 'boost'; id: BoostId; seconds: number }
  | { c: 'grantCoins'; amount: number; reason: CoinReason }
  | { c: 'grantTornado'; n: number }
  | { c: 'claimGift'; mult: number }
  | { c: 'travel'; farm: FarmId }
  | { c: 'fillBasket'; frac: number }
  | { c: 'forceGift' }
  | { c: 'forceGolden'; n: number };

export type CoinReason = 'offline' | 'gift' | 'daily' | 'farmComplete' | 'travel' | 'debug';

export type SimEvent =
  | { t: 'chunk'; crop: number; body: number; value: number; golden: boolean; wasted: boolean; tier: number }
  | { t: 'kill'; crop: number; body: number; golden: boolean }
  | { t: 'regrow'; crop: number; golden: boolean }
  | { t: 'basketFull' }
  | { t: 'unload'; value: number; mass: number; massByTier: number[] }
  | { t: 'segAdded'; id: number; level: number }
  | { t: 'merged'; consumed: [number, number]; into: number; level: number; firstTime: boolean }
  | { t: 'upgraded'; id: 'speed' | 'capacity'; level: number }
  | { t: 'stageChanged'; stage: number; prevLength: number }
  | { t: 'farmFinished'; farm: FarmId; reward: number; next: FarmId | null }
  | { t: 'traveled'; farm: FarmId }
  | { t: 'tornado'; x: number; z: number; crops: number[]; value: number }
  | { t: 'giftSpawn'; kind: 'butterfly' | 'ladybug' }
  | { t: 'giftClaimed'; amount: number }
  | { t: 'coins'; delta: number; reason: CoinReason }
  | { t: 'boost'; id: BoostId; seconds: number }
  | { t: 'tornadoGranted'; n: number }
  | { t: 'buyFailed'; id: UpgradeId };
