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

/**
 * OVERDRIVE: a second finger on the field pushes harder — a burst on top of the current top speed (it multiplies
 * SPEED upgrades, never replaces them). The motor heats up while it lasts and the boost fades out as it gets hot;
 * let go and it cools down. Holding two fingers all the time therefore buys nothing: it is a burst, not a mode.
 */
export const OVERDRIVE = {
  MULT: 1.3,
  /** Seconds of overdrive from cold until the motor is hot (no boost left). */
  HEAT_S: 6,
  /** Seconds to cool down from hot (as long as it heats: at best half the time is spent pushing). */
  COOL_S: 6,
  /** Heat above which the boost fades out (full boost below it). */
  FADE_AT: 0.6,
} as const;

/** Boost share (0..1) left at motor heat h: full while cool, fading to nothing as it gets hot. */
export const overdriveShare = (heat: number): number => Math.max(0, Math.min(1, (1 - heat) / (1 - OVERDRIVE.FADE_AT)));

export const BODY = {
  HEAD_GAP: 1.25,
  SEG_SPACING: 1.1,
  REACH: 2.0,
  HEAD_POWER: 7,
  MAX_LVL: 30,
} as const;

export const FIELD = {
  /** Plot edge (world units); each plot holds PLOT_CROPS × PLOT_CROPS crops. */
  PLOT: 3.6,
  PLOT_CROPS: 3,
  CROP_SPACING: 1.05,
  JITTER: 0.1,
  CHUNKS: 3,
  BIN_LEN: 0.5,
  CORNER_R: 1.6,
  /** A crop blocks its plot's claim when it is this close to the route (a little under REACH: fillets, sampling). */
  CLAIM_REACH: 1.88,
} as const;

/** Route growth: when cleared plots join the territory and the route bulges out around them. */
export const TERRITORY = {
  /** Beat between a plot being cleared and the route growing into it (anticipation). */
  CLAIM_DELAY_S: 0.6,
  CHECK_S: 0.25,
  /** The tidy-route rules are waived for a plot that has been ready this long (seconds, plus laps at full speed). */
  TIDY_GRACE_S: 20,
  TIDY_GRACE_LAPS: 1.5,
  /** Growth waits for the caterpillar's body to leave the area, but never longer than this. */
  MAX_DEFER_S: 3,
  BODY_PAD: 2.2,
  /** A zone's fence opens for free once the open area is this cleared. */
  ZONE_FREE_AT: 0.85,
  /** FINISH unlocks at this cleared share of the whole farm. */
  FINISH_AT: 0.9,
} as const;

export const DEPOT = {
  /** Speed factor while cargo rolls off into the chute (a gentle magnetic drag). */
  SLOW: 0.85,
  /** The first segment's cargo lands this long after the head crosses the chute (its short hop into the hopper). */
  FIRST_S: 0.36,
  /** The unload wave runs head → tail; its length grows with the chain but is capped so long crawlers never wait. */
  WAVE_BASE_S: 0.45,
  WAVE_PER_SEG_S: 0.035,
  WAVE_MAX_S: 1.3,
  /** Stagger between neighbouring segments never exceeds this (short chains stay snappy). */
  GAP_MAX_S: 0.08,
} as const;

/** Seconds after the head crosses the chute at which segment k (0 = first) of an n-segment unload pays out. */
export const unloadAt = (k: number, n: number): number => {
  if (n <= 1) return DEPOT.FIRST_S;
  const total = Math.min(DEPOT.WAVE_MAX_S, DEPOT.WAVE_BASE_S + DEPOT.WAVE_PER_SEG_S * n);
  return DEPOT.FIRST_S + k * Math.min(DEPOT.GAP_MAX_S, (total - DEPOT.FIRST_S) / (n - 1));
};

/** HP removed per world unit travelled while a crop is within reach. */
export const power = (level: number): number => 4 * 2.4 ** (level - 1);
export const vMax = (speedLevel: number): number => MOVE.V_BASE * (1 + MOVE.V_PER_LVL * (speedLevel - 1));
/** Each body segment carries its own basket; CAPACITY upgrades every basket. */
export const capacityPerSegment = (capLevel: number): number => Math.round(10 * 1.35 ** (capLevel - 1));
export const capacity = (capLevel: number, segments: number): number => capacityPerSegment(capLevel) * Math.max(1, segments);
export const capacityOf = (st: { progress: { capacityLevel: number; segments: readonly unknown[] } }): number =>
  capacity(st.progress.capacityLevel, st.progress.segments.length);
/** Stack height (blocks per segment) when the basket is 100% full. */
export const maxBlocks = (capLevel: number): number => Math.min(8 + capLevel, 18);

/** Upgrade cost curves; multiplied by the farm's costMult. */
export const cost = {
  /** Priced by how many segments you have now (merging makes refilling cheaper) plus a mild lifetime climb. */
  add: (segments: number, addCount: number): number => 15 * 1.32 ** (segments - 1) * 1.025 ** addCount,
  /** Priced by the level of the pair being merged (fair ROI: power grows 2.4×/level) plus a mild per-merge climb. */
  merge: (pairLevel: number, m: number): number => 50 * 2.9 ** (pairLevel - 1) * 1.03 ** m,
  speed: (level: number): number => 60 * 1.65 ** (level - 1),
  capacity: (level: number): number => 35 * 1.55 ** (level - 1),
};

export const crop = {
  /** HP per yield chunk (a crop drops CHUNKS chunks as it is chomped down). */
  hpPerChunk: (tier: number): number => 36 * 3.5 ** tier,
  chunkValue: (tier: number): number => 4 ** tier,
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
  GOLDEN_P: 0.015,
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
