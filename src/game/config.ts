/**
 * Every balance number lives here. Change, then run `npm run balance -- --profile all`.
 * Units: world units (≈ one crop cell), seconds, coins.
 */
export const SIM = { HZ: 30, DT: 1 / 30, MAX_STEPS: 10 } as const;

export const MOVE = {
  V_BASE: 3.0,
  V_PER_LVL: 0.1,
  IDLE_FRAC: 0.2,
  TAU_UP: 0.35,
  TAU_DOWN: 0.45,
  LOAD_K: 0.8,
  MAX_LVL: 25,
} as const;

export const BODY = {
  HEAD_GAP: 1.25,
  SEG_SPACING: 1.1,
  REACH: 1.6,
  HEAD_POWER: 2,
  MAX_LVL: 30,
} as const;

export const FIELD = {
  CELL: 1.0,
  JITTER: 0.16,
  PAVED: 0.75,
  CHUNKS: 3,
  BIN_LEN: 0.5,
  CORNER_R: 2.5,
} as const;

/** HP removed per world unit travelled while a crop is within reach. */
export const power = (level: number): number => 4 * 2.4 ** (level - 1);
export const vMax = (speedLevel: number): number => MOVE.V_BASE * (1 + MOVE.V_PER_LVL * (speedLevel - 1));
/** Each body segment carries its own basket; CAPACITY upgrades every basket. */
export const capacityPerSegment = (capLevel: number): number => Math.round(25 * 1.3 ** (capLevel - 1));
export const capacity = (capLevel: number, segments: number): number => capacityPerSegment(capLevel) * Math.max(1, segments);
export const capacityOf = (st: { progress: { capacityLevel: number; segments: readonly unknown[] } }): number =>
  capacity(st.progress.capacityLevel, st.progress.segments.length);
/** Stack height (blocks per segment) when the basket is 100% full. */
export const maxBlocks = (capLevel: number): number => Math.min(5 + Math.floor(capLevel / 2), 14);

/** Upgrade cost curves; multiplied by the farm's costMult. */
export const cost = {
  /** Priced by how many segments you have now (merging makes refilling cheaper) plus a mild lifetime climb. */
  add: (segments: number, addCount: number): number => 6 * 1.3 ** (segments - 1) * 1.02 ** addCount,
  /** Priced by the level of the pair being merged (fair ROI: power grows 2.4×/level) plus a mild per-merge climb. */
  merge: (pairLevel: number, m: number): number => 25 * 2.7 ** (pairLevel - 1) * 1.03 ** m,
  speed: (level: number): number => 30 * 1.6 ** (level - 1),
  capacity: (level: number): number => 20 * 1.5 ** (level - 1),
};

export const crop = {
  /** HP per yield chunk (a crop drops CHUNKS chunks as it is chomped down). */
  hpPerChunk: (tier: number): number => 15 * 3.2 ** tier,
  chunkValue: (tier: number): number => 4 ** tier,
  regrowSec: (tier: number): number => 14 + 4 * tier,
};

export interface FarmEco {
  hpMult: number;
  valueMult: number;
  costMult: number;
}
/** Each farm plays like a fresh farm with bigger numbers; later farms get a little slower to finish. */
export const farmEco = (index: number): FarmEco => ({
  hpMult: 1,
  valueMult: 25 ** index,
  costMult: 25 ** index * 1.2 ** index,
});

export const MISC = {
  GOLDEN_P: 0.01,
  GOLDEN_MULT: 10,
  TORNADO_R: 6,
  TORNADO_OVERFLOW: 2,
  TORNADO_DROP_P: 0.05,
  OFFLINE_EFF: 0.5,
  OFFLINE_CAP_S: 7200,
  OFFLINE_MIN_S: 60,
  PASSIVE_FRAC: 0.03,
  BOOST_ADD_S: 180,
  BOOST_CAP_S: 900,
  GIFT_MIN_S: 120,
  GIFT_MAX_S: 200,
  GIFT_LIFETIME_S: 9,
  GIFT_INCOME_S: 20,
  FINISH_INCOME_S: 120,
  EMA_WINDOW_S: 10,
  EMA_HORIZON_S: 180,
  START_SEGMENTS: 1,
  FULL_EVENT_COOLDOWN_S: 1.5,
} as const;
