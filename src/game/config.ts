/**
 * Every balance number lives here. Change, then run `npm run balance -- --profile all`.
 * Units: world units (≈ one crop cell), seconds, coins.
 */
export const SIM = { HZ: 30, DT: 1 / 30, MAX_STEPS: 10 } as const;

export const MOVE = {
  V_BASE: 3.0,
  /** Every SPEED level is this much faster than the one before (compounding: each level is felt)… */
  V_STEP: 1.07,
  /** …and every MILESTONE_EVERY-th level adds a bigger jump on top (Lv 5, 10, 15). */
  V_MILESTONE: 0.08,
  MILESTONE_EVERY: 5,
  IDLE_FRAC: 0.2,
  TAU_UP: 0.35,
  TAU_DOWN: 0.45,
  LOAD_K: 0.8,
  MAX_LVL: 15,
  /** Buying SPEED gives a short surge on top (fading over SURGE_S), so the new level is felt at once. */
  SURGE: 0.25,
  SURGE_S: 1.2,
} as const;

/**
 * OVERDRIVE: a second finger on the field pushes harder — a burst on top of the current top speed (it multiplies
 * SPEED upgrades, never replaces them). The motor heats up while it lasts and the boost fades out as it gets hot;
 * let go and it cools down. Push it all the way and it burns out: the crawler sputters, and OVERDRIVE is gone until
 * the motor has cooled and the finger has been lifted. It is a burst you time, not a mode you hold.
 */
export const OVERDRIVE = {
  MULT: 1.3,
  /** Seconds of overdrive from cold until the motor is hot (no boost left) — and burns out. */
  HEAT_S: 6,
  /** Seconds to cool down from hot (as long as it heats: at best half the time is spent pushing). */
  COOL_S: 6,
  /** Heat above which the boost fades out (full boost below it). */
  FADE_AT: 0.6,
  /** A second finger that lands on a motor hotter than this is ignored until it lifts (the arc shakes red). */
  REFUSE_AT: 0.9,
  /** Burnt out: seconds without OVERDRIVE while the motor cools (from hot to ~17 % heat)… */
  BURNOUT_S: 5,
  /** …the first of them sputtering along at this share of the speed. */
  STALL_S: 1.6,
  STALL_SPEED: 0.55,
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
  /** FINISH unlocks at this cleared share of the whole farm (the rest is optional clean-up). */
  FINISH_AT: 0.85,
} as const;

/**
 * FINAL HARVEST: from this cleared share on (until FINISH), the crawler is a little faster and bites a little harder —
 * the last stretch of a farm is a climax, not a clean-up.
 */
export const FINAL = {
  AT: 0.7,
  SPEED: 1.15,
  POWER: 1.25,
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
export const vMax = (speedLevel: number): number =>
  MOVE.V_BASE * MOVE.V_STEP ** (speedLevel - 1) * (1 + MOVE.V_MILESTONE * Math.floor(speedLevel / MOVE.MILESTONE_EVERY));
/** True when buying the next SPEED level reaches a milestone (a bigger jump). */
export const speedMilestone = (nextLevel: number): boolean => nextLevel % MOVE.MILESTONE_EVERY === 0;
/** Each body segment carries its own basket; CAPACITY upgrades every basket. */
export const capacityPerSegment = (capLevel: number): number => Math.round(10 * 1.35 ** (capLevel - 1));
export const capacity = (capLevel: number, segments: number): number => capacityPerSegment(capLevel) * Math.max(1, segments);
export const capacityOf = (st: { progress: { capacityLevel: number; segments: readonly unknown[] } }): number =>
  capacity(st.progress.capacityLevel, st.progress.segments.length);
/** Stack height (blocks per segment) when the basket is 100% full. */
export const maxBlocks = (capLevel: number): number => Math.min(8 + capLevel, 18);

/**
 * Upgrade prices (multiplied by the farm's costMult). They mostly depend on what the caterpillar *is* — how many
 * segments, which level is merged, the SPEED/CAPACITY level. A gentle climb per purchase keeps ADD/MERGE from
 * turning into a tap-fest once the income is large; it used to be 1.025/1.03, which compounded to ×6–7 by the end of a
 * farm and made its last fifth a grind.
 */
export const COST = {
  ADD: 15,
  ADD_GROWTH: 1.32,
  /** Per ADD bought on this farm. */
  ADD_CLIMB: 1.01,
  MERGE: 50,
  MERGE_GROWTH: 2.9,
  MERGE_CLIMB: 1.012,
  /** ADD and MERGE per open zone (1 = none: pricing by zone brought the late-game grind straight back). */
  ZONE_GROWTH: 1,
  SPEED: 60,
  SPEED_GROWTH: 1.6,
  CAPACITY: 35,
  CAPACITY_GROWTH: 1.55,
} as const;

export const cost = {
  /** Priced by how many segments you have now (merging makes refilling cheaper). */
  add: (segments: number, adds = 0, zone = 0): number => COST.ADD * COST.ADD_GROWTH ** (segments - 1) * COST.ADD_CLIMB ** adds * COST.ZONE_GROWTH ** zone,
  /** Priced by the level of the pair being merged (power grows 2.4× per level, the price 2.9×). */
  merge: (pairLevel: number, merges = 0, zone = 0): number => COST.MERGE * COST.MERGE_GROWTH ** (pairLevel - 1) * COST.MERGE_CLIMB ** merges * COST.ZONE_GROWTH ** zone,
  speed: (level: number): number => COST.SPEED * COST.SPEED_GROWTH ** (level - 1),
  capacity: (level: number): number => COST.CAPACITY * COST.CAPACITY_GROWTH ** (level - 1),
};

const HP_PER_CHUNK = [36, 161, 637, 2230] as const;

export const crop = {
  /** HP per yield chunk (a crop drops CHUNKS chunks as it is chomped down). */
  /**
   * Roughly 36 × 3.5^tier: the opening field as it always was, the later ones tougher (×1.28, ×1.44, ×1.44) so a farm
   * isn't over before it has been enjoyed now that the late game no longer drags.
   */
  hpPerChunk: (tier: number): number => HP_PER_CHUNK[Math.max(0, Math.min(3, tier))],
  chunkValue: (tier: number): number => 4 ** tier,
};

export interface FarmEco {
  hpMult: number;
  valueMult: number;
  costMult: number;
}
/** Each farm plays like a fresh farm with bigger numbers; later farms get a little slower to finish. (Starter Tour.) */
export const farmEco = (index: number): FarmEco => ({
  hpMult: 1,
  valueMult: 25 ** index,
  costMult: 25 ** index * 1.2 ** index,
});

/**
 * World Tour economy. Every Tour is one economic arc: farm slot j has values ×VALUE_GROWTHʲ and costs a little more
 * (COST_STEPʲ on top), so the numbers climb from tens to billions over a Tour — and the next Tour starts a new region
 * at small numbers again (coins are recalibrated, Core Rank goes up). Numbers stay readable however far you travel.
 */
export const WORLD = {
  VALUE_GROWTH: 14,
  COST_STEP: 1,
  /** Coins a new Tour starts with (its first farm's prices are Meadow's). */
  START_COINS: 120,
  /** Core Rank (Tours completed): +CORE_BONUS harvest value per doubling of the rank (diminishing, never zero). */
  CORE_BONUS: 0.08,
  /**
   * Depth of the size classes. A farm's length is mostly the climb of the caterpillar, not its area (measured:
   * ~7 min + 0.03 min per plot), so bigger farms are also deeper: upgrades cost more (cost) and crops are tougher (hp).
   */
  SIZE: {
    quick: { cost: 1, hp: 1 },
    standard: { cost: 1, hp: 1.45 },
    grand: { cost: 1, hp: 1.7 },
  },
} as const;

/** Permanent harvest-value bonus of Core Rank r (0, +8 %, +13 %, +16 %, … +24 % at rank 7). */
export const coreBonus = (rank: number): number => (rank > 0 ? WORLD.CORE_BONUS * Math.log2(1 + rank) : 0);

export const worldEco = (slot: number, coreRank: number, size: 'quick' | 'standard' | 'grand' = 'standard', valueFx = 1, hpFx = 1): FarmEco => ({
  hpMult: hpFx * WORLD.SIZE[size].hp,
  valueMult: WORLD.VALUE_GROWTH ** slot * valueFx * (1 + coreBonus(coreRank)),
  costMult: WORLD.VALUE_GROWTH ** slot * WORLD.COST_STEP ** slot * WORLD.SIZE[size].cost,
});

/**
 * Bonus economy. Freebies come from understandable moments (no ad, no coins, no dice): farm progress milestones grant
 * a free charge, opening a field pays a little bonus, every new farm starts with a tornado. Autopilot and tornadoes
 * can be paid with coins *or* an ad; their prices follow the current income, so the ad is an alternative way to pay,
 * never the only sensible one. ×2 income is ad-or-free only: buying income with income would be a chore every
 * optimiser has to repeat.
 */
export const BONUS = {
  /** Farm cleared share → free charge. */
  MILESTONES: [0.25, 0.5, 0.75],
  MILESTONE_KINDS: ['incomeX2', 'tornado', 'autopilot'],
  /** Opening a field pays this many seconds of income at once. */
  ZONE_COINS_S: 15,
  /** Coin prices, in seconds of current income (autopilot is a convenience: ~all you earn while it runs). */
  AUTOPILOT_S: 180,
  TORNADO_S: 90,
  /** Each tornado bought with coins on a farm costs this much more than the one before. */
  TORNADO_CLIMB: 1.6,
  /** Price floor (× the farm's value multiplier) while the income is still tiny. */
  PRICE_FLOOR: 60,
} as const;

export const MISC = {
  GOLDEN_P: 0.015,
  GOLDEN_MULT: 10,
  TORNADO_R: 6,
  /** A tornado aims at the densest living patch within this distance of the head (about what the camera shows). */
  TORNADO_AIM: 14,
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
