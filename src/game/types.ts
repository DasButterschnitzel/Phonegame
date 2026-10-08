/** The five hand-made farms of the Starter Tour. Their ids are also their farm keys (old saves stay valid). */
export type StarterFarmId = 'meadow' | 'pumpkin' | 'sunflower' | 'snowyberry' | 'desert';
export const STARTER_FARMS: readonly StarterFarmId[] = ['meadow', 'pumpkin', 'sunflower', 'snowyberry', 'desert'];
export const isStarterFarm = (key: string): key is StarterFarmId => (STARTER_FARMS as readonly string[]).includes(key);

/** A farm's identity: a starter id, or `w<ordinal>-<biome>-<seed hex>` for a World Tour farm. */
export type FarmKey = string;

/** Biome families: the art direction, crops, layouts and names a farm is made from. Starter biomes share their farm's id. */
export type BiomeId =
  | StarterFarmId
  | 'orchard' | 'rice' | 'vineyard' | 'tropical' | 'evergreen' | 'alien' | 'lunar' | 'marsh' | 'blossom'
  | 'citrus' | 'highland' | 'nordic' | 'lavender' | 'volcanic' | 'polder' | 'giant' | 'cloud' | 'cyber';

/** How big a World Tour farm is (and so how long it takes). */
export type SizeClass = 'quick' | 'standard' | 'grand';

/** At most one light twist per farm — an opportunity, never a handicap. */
export type ModifierId = 'golden' | 'bumper' | 'fasttrack' | 'giant' | 'rich';

/**
 * Everything needed to rebuild a World Tour farm exactly: its place in the journey, the biome and seed it was made
 * from, and the generated plot map. Stored with the farm's progress while the farm is live, so a later generator
 * change can never move the ground under a half-cleared farm.
 */
export interface FarmBlueprint {
  /** Generator version that drew `map`. */
  gen: number;
  key: FarmKey;
  /** Farm number over the whole journey (the Starter Tour is #1–#5). */
  ordinal: number;
  /** World Tour number (1, 2, …). */
  tour: number;
  /** Position in the Tour (0 … WORLD.FARMS_PER_TOUR − 1; the last is the showcase finale). */
  slot: number;
  biome: BiomeId;
  seed: number;
  archetype: string;
  size: SizeClass;
  modifier: ModifierId | null;
  showcase: boolean;
  /** Index into the biome's list of names. */
  name: number;
  crops: [CropId, CropId, CropId, CropId];
  map: string[];
  /** Visual variant (light, palette shift) of the biome. */
  variant: number;
}

/** What is kept of a completed farm once the journey has moved on (a few bytes, not its field). */
export interface FarmStamp {
  key: FarmKey;
  ordinal: number;
  biome: BiomeId;
  name: number;
  /** Seconds of play from arrival to FINISH. */
  seconds: number;
  showcase?: boolean;
}

/** The long journey: bounded however many farms have been played. */
export interface Journey {
  /** World Tour seed: 0 until the Starter Tour is done. */
  seed: number;
  /** Highest farm number reached (the frontier). */
  ordinal: number;
  /** Tours completed (the Starter Tour counts): this is the Core Rank. */
  tours: number;
  /** Farms completed in total. */
  completed: number;
  /** Biome families arrived at at least once. */
  biomes: BiomeId[];
  /** The last few completed farms, oldest first. */
  recent: FarmStamp[];
  /** Personal records. */
  best: { fastestS: number };
}

/** @deprecated use FarmKey (kept so older call sites read naturally). */
export type FarmId = FarmKey;
/** The Starter Tour, in order. */
export const FARM_ORDER = STARTER_FARMS;

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
  /** World Tour farms: the blueprint the farm was generated from. */
  bp?: FarmBlueprint;
  /** Sim time of the first arrival (for the completion time). */
  arrivedAt?: number;
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
  /** Key of the farm you are on. */
  farmId: FarmKey;
  progress: FarmProgress;
  /** Saved progress of live farms you are not currently on (bounded: the Starter Tour's, or none). */
  farmsProgress: Partial<Record<FarmKey, FarmProgress>>;
  /** Starter Tour farms you can travel to / have finished (the World Tour is tracked by `journey`). */
  unlockedFarms: FarmKey[];
  completedFarms: FarmKey[];
  journey: Journey;
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
    /** Passive income of finished farms of the current Tour (cleared when a new Tour starts). */
    passive: Partial<Record<FarmKey, number>>;
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
  | { c: 'travel'; farm: FarmKey }
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
  /**
   * `tourDone`: the Tour this farm closed (0 = the Starter Tour) — Core Rank went up. `next` is the next destination
   * (null never happens in the World Tour; the journey has no end).
   */
  | { t: 'farmFinished'; farm: FarmKey; ordinal: number; reward: number; next: FarmKey | null; tourDone: number | null; seconds: number }
  /** `newTour`: arriving opened a new World Tour (coins recalibrated). `newBiome`: first farm of this biome family. */
  | { t: 'traveled'; farm: FarmKey; newTour: boolean; newBiome: boolean }
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
