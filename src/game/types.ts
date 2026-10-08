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
  /** Crop tier = zone of its plot (0..3). */
  tier: Uint8Array;
  /** Plot index (layout grid) the crop grows in. */
  plot: Int32Array;
  /** Visual variety seed per crop (rotation, scale jitter). */
  seed: Float32Array;
  hp: Float32Array;
  maxHp: Float32Array;
  golden: Uint8Array;
  /** 1 = destroyed. Permanent: crops never grow back. */
  dead: Uint8Array;
  deadCount: number;
  /** 1 = within reach of the current route (recomputed whenever the route changes). */
  reach: Uint8Array;
  /** Crops of plot p are indices plotStart[p] .. plotStart[p + 1] − 1. */
  plotStart: Uint32Array;
  /** Crops whose visual state changed since the renderer last consumed them. */
  dirty: Uint32Array;
  dirtyCount: number;
  dirtyMark: Uint8Array;
  /** Per arc-bin candidate lists (CSR) of alive crops in open zones. */
  bins: { binLen: number; n: number; start: Uint32Array; items: Uint32Array };
}

/** Persistent per-farm field state (bitsets as base64). `ver` guards against layout changes between versions. */
export interface FieldSnapshot {
  ver: number;
  claimed: string;
  dead: string;
  /** Flat [cropIndex, hp, cropIndex, hp, …] for damaged, still alive crops. */
  hp: number[];
  /** Flat [plot, readySince, …] for plots waiting to join the territory. */
  ready?: number[];
}

export interface FarmProgress {
  /** Outermost open zone (0..3). */
  zone: number;
  finished: boolean;
  addCount: number;
  mergeCount: number;
  speedLevel: number;
  capacityLevel: number;
  segments: Segment[];
  /** Cleared ground and crop damage; written on save and when leaving the farm. */
  field?: FieldSnapshot;
  /** Progress milestones (BONUS.MILESTONES) already rewarded on this farm. */
  bonusClaimed?: number;
  /** Tornadoes bought with coins on this farm (each costs more). */
  tornadoesBought?: number;
}

/** A rolling unload in progress: each segment empties its share as it passes the depot chute. */
export interface DepotPass {
  active: boolean;
  /** Seconds since the head passed the chute (segment k pays at `unloadAt(k, segs)`). */
  t: number;
  segs: number;
  mass: number;
  value: number;
  /** Segments that have already unloaded. */
  done: number;
  paidMass: number;
  paidValue: number;
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
  depot: DepotPass;
  boosts: Record<BoostId, number>;
  /** Free boost charges (milestones, daily): one tap starts the boost, no ad, no coins. */
  charges: Record<BoostId, number>;
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
  /** OVERDRIVE motor heat (0 cold … 1 hot). */
  heat: number;
}

export interface SimInput {
  throttleHeld: boolean;
  /** A second finger on the field (or Shift): OVERDRIVE while the throttle is on. */
  overdrive?: boolean;
}

export type Command =
  | { c: 'buy'; id: UpgradeId; free?: boolean }
  | { c: 'useTornado' }
  | { c: 'boost'; id: BoostId; seconds: number }
  | { c: 'grantCoins'; amount: number; reason: CoinReason }
  | { c: 'grantTornado'; n: number }
  | { c: 'grantCharge'; id: BoostId; n: number }
  /** Start a boost from a free charge. */
  | { c: 'useCharge'; id: BoostId }
  /** Pay coins for autopilot (the ad is the other way to pay). */
  | { c: 'buyBoost'; id: 'autopilot' }
  /** Pay coins for one tornado charge. */
  | { c: 'buyTornado' }
  | { c: 'claimGift'; mult: number }
  | { c: 'travel'; farm: FarmId }
  | { c: 'fillBasket'; frac: number }
  | { c: 'forceGift' }
  | { c: 'forceGolden'; n: number }
  | { c: 'clearFrontier'; n: number }
  | { c: 'clearAll' };

export type CoinReason = 'offline' | 'gift' | 'daily' | 'farmComplete' | 'travel' | 'tornado' | 'zoneBonus' | 'debug';

export type SimEvent =
  | { t: 'chunk'; crop: number; body: number; value: number; golden: boolean; tier: number }
  | { t: 'kill'; crop: number; body: number; golden: boolean; swept: boolean }
  | { t: 'basketFull' }
  | { t: 'plotReady'; plot: number }
  | { t: 'routeGrew'; plots: number[]; prevLength: number }
  | { t: 'zoneOpened'; zone: number; free: boolean }
  /** `elapsed`: seconds of the pass already gone when the event fires (the head crossed mid-step). */
  | { t: 'unloadStart'; segs: number; value: number; mass: number; massByTier: number[]; elapsed: number }
  | { t: 'unloadSeg'; seg: number; value: number; mass: number; last: boolean }
  | { t: 'unload'; value: number; mass: number }
  | { t: 'segAdded'; id: number; level: number }
  | { t: 'merged'; consumed: [number, number]; into: number; level: number; firstTime: boolean }
  | { t: 'upgraded'; id: 'speed' | 'capacity'; level: number }
  | { t: 'farmFinished'; farm: FarmId; reward: number; next: FarmId | null }
  | { t: 'traveled'; farm: FarmId }
  /** A tornado swept (x, z); it set off from the head at (fromX, fromZ). */
  | { t: 'tornado'; x: number; z: number; fromX: number; fromZ: number; crops: number[]; value: number }
  | { t: 'giftSpawn'; kind: 'butterfly' | 'ladybug' }
  | { t: 'giftClaimed'; amount: number }
  | { t: 'coins'; delta: number; reason: CoinReason }
  | { t: 'boost'; id: BoostId; seconds: number }
  | { t: 'tornadoGranted'; n: number }
  | { t: 'buyFailed'; id: UpgradeId }
  /** The farm's last stretch began (FINAL HARVEST: faster, harder bites until FINISH). */
  | { t: 'finalHarvest' }
  /** Something for free: a charge or a tornado at a progress milestone, coins for a new field, a tornado on a new farm. */
  | { t: 'freebie'; kind: BoostId | 'tornado' | 'coins'; reason: 'progress' | 'zone' | 'newFarm' | 'farmComplete'; at?: number; amount?: number }
  /** A boost or tornado paid with coins. */
  | { t: 'bought'; what: 'autopilot' | 'tornado'; cost: number };
