/**
 * Headless players for pacing analysis (`npm run balance`, balance tests). A bot plays the real simulation with a
 * profile's habits and records what a player would feel: how long each stretch of a farm takes, how often something
 * meaningful happens, and how long the wallet stays empty. Pure and deterministic like the rest of `game/`.
 */
import { Sim, newGameState } from '../sim.ts';
import type { FarmId, SimEvent, UpgradeId } from '../types.ts';
import { MISC, capacityOf, vMax } from '../config.ts';
import { isFrontier } from '../territory.ts';
import { upgradeValues } from '../advisor.ts';

export type ProfileId = 'active' | 'casual' | 'idle' | 'noAds' | 'ads' | 'heavy' | 'speed' | 'merge' | 'twoFinger' | 'bare';

export interface Profile {
  id: ProfileId;
  label: string;
  /** Throttle pattern: is the screen held at sim time t? */
  held: (t: number) => boolean;
  /** Seconds between looks at the shop. */
  every: number;
  /** How purchases are chosen: estimated payback, cheapest first, or a favourite upgrade first. */
  pick: 'payback' | 'cheapest' | 'speed' | 'merge';
  /** Watches one rewarded ad at most this often (seconds of play); Infinity = never. */
  adEvery: number;
  /** Taps the lucky bug: every n-th one (0 = never). */
  giftEvery: number;
  /** Uses tornado charges. */
  tornadoes: boolean;
  /** Second finger down at sim time t (OVERDRIVE); absent = one finger only. */
  overdrive?: (t: number) => boolean;
  /** Pays coins for tornadoes / autopilot when the price is right (the alternative to an ad). */
  coinTornado?: boolean;
  coinAutopilot?: boolean;
  /** Uses free charges (milestone gifts). Everyone does; the purist no-extras profile doesn't. */
  charges?: boolean;
}

const activeHold = (t: number): boolean => t % 7 < 6;
const base = { held: activeHold, every: 1, pick: 'payback', adEvery: Infinity, giftEvery: 1, tornadoes: true, charges: true, coinTornado: true } as const;

export const PROFILES: Record<ProfileId, Profile> = {
  // A typical active player: holds, taps lucky bugs, uses tornadoes and free charges, now and then an ad (×2, every 10 min).
  active: { ...base, id: 'active', label: 'ACTIVE', adEvery: 600 },
  casual: { ...base, id: 'casual', label: 'CASUAL', held: (t) => t % 20 < 10, every: 10, pick: 'cheapest', giftEvery: 2, coinAutopilot: true },
  idle: { ...base, id: 'idle', label: 'IDLE', held: () => false, every: 300, pick: 'cheapest', giftEvery: 0, coinTornado: false, coinAutopilot: true },
  // The same player who never watches an ad (free things and coins only): the no-ad baseline.
  noAds: { ...base, id: 'noAds', label: 'ACTIVE_NO_ADS' },
  ads: { ...base, id: 'ads', label: 'ACTIVE_OCCASIONAL_REWARDED', adEvery: 300 },
  // The floor: ignores lucky bugs, tornadoes, free charges and every boost — upgrades only.
  bare: { ...base, id: 'bare', label: 'ACTIVE_UPGRADES_ONLY', giftEvery: 0, tornadoes: false, charges: false, coinTornado: false },
  heavy: { ...base, id: 'heavy', label: 'ACTIVE_HEAVY_UPGRADER', pick: 'cheapest' },
  speed: { ...base, id: 'speed', label: 'ACTIVE_SPEED_FOCUSED', pick: 'speed' },
  merge: { ...base, id: 'merge', label: 'ACTIVE_MERGE_FOCUSED', pick: 'merge' },
  // Pulses OVERDRIVE as well as the heat allows: 5 s pushing, 5 s cooling.
  twoFinger: { ...base, id: 'twoFinger', label: 'ACTIVE_TWO_FINGER', overdrive: (t) => t % 10 < 5 },
};

/** Farm-progress bands (cleared share) the report splits each farm into. */
export const BAND_EDGES = [0, 0.25, 0.5, 0.7, 0.8, 0.9] as const;
export const BAND_NAMES = ['0–25%', '25–50%', '50–70%', '70–80%', '80–90%', '90%+'] as const;

export interface BandStats {
  name: string;
  t0: number;
  t1: number;
  seconds: number;
  /** Core purchases (ADD / MERGE / SPEED / CAPACITY). */
  upgrades: number;
  growths: number;
  plots: number;
  /** Rolling income (coins/s) on entering and leaving the band. */
  income0: number;
  income1: number;
  /** Top speed (units/s) on entering and leaving the band. */
  speed0: number;
  speed1: number;
  /** Farm percent cleared per minute. */
  clearPerMin: number;
  chunksPerSec: number;
  fullShare: number;
  /** Share of the time nothing in the upgrade bar was affordable. */
  droughtShare: number;
  longestDrought: number;
  /** Purchases, bonus uses and fence openings per minute. */
  decisionsPerMin: number;
  /** Gaps between meaningful events (purchase, route growth, new level, bonus, fence). */
  longestEventGap: number;
  medianEventGap: number;
}

export interface FarmStats {
  farm: FarmId;
  seconds: number;
  finished: boolean;
  bands: BandStats[];
  longestDrought: number;
  longestNoGrowth: number;
  longestEventGap: number;
  avgUpgradeInterval: number;
  savingShare: number;
  purchases: Record<string, number>;
  end: { speedLevel: number; capacityLevel: number; segments: number; maxLevel: number; vMax: number; income: number };
  /** Most coins held at once on this farm (readable-number checks). */
  peakCoins: number;
}

export interface RunReport {
  profile: Profile;
  milestones: [string, number][];
  farms: FarmStats[];
  rateByMinute: number[];
  growthByMinute: number[];
  finishedAll: boolean;
  adsWatched: number;
}

export interface RunOptions {
  farms: number;
  startFarm: FarmId;
  minutes: number;
  dt: number;
  seed: number;
  /** Called once per simulated minute with a one-line status (verbose report). */
  onMinute?: (line: string) => void;
  /** Called every `sampleEvery` seconds of play with the live simulation (read-only: fork it for what-ifs). */
  sampleEvery?: number;
  onSample?: (sim: Sim) => void;
  /** Every simulation event and player action, with the sim time (ad-pressure simulation). */
  onEvent?: (e: SimEvent, t: number) => void;
  onAction?: (a: Action, t: number) => void;
  /** Called when a farm closes (finished, or the run ended on it), with the live simulation still on that farm. */
  onFarm?: (sim: Sim, f: FarmStats) => void;
}

const CORE: UpgradeId[] = ['add', 'merge', 'speed', 'capacity'];
const MAXED = new Set(['maxSegments', 'noPair', 'maxLevel']);

/** Deep copy of plain game data (numbers, strings, booleans, arrays, plain objects). */
function clone<T>(v: T): T {
  if (Array.isArray(v)) return v.map(clone) as T;
  if (v && typeof v === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, x] of Object.entries(v)) out[k] = clone(x);
    return out as T;
  }
  return v;
}

/** Forks a running simulation (deterministic copy) for what-if comparisons. */
export function fork(sim: Sim): Sim {
  sim.syncField();
  return new Sim(clone(sim.state));
}

const median = (xs: number[]): number => {
  if (!xs.length) return 0;
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)];
};

class BandAcc {
  t0: number;
  cleared0: number;
  income0: number;
  speed0: number;
  ticks = 0;
  full = 0;
  drought = 0;
  chunks = 0;
  upgrades = 0;
  growths = 0;
  plots = 0;
  decisions = 0;
  longestDrought = 0;
  gaps: number[] = [];

  constructor(t0: number, cleared0: number, income0: number, speed0: number) {
    this.t0 = t0;
    this.cleared0 = cleared0;
    this.income0 = income0;
    this.speed0 = speed0;
  }

  close(name: string, t1: number, cleared1: number, income1: number, speed1: number): BandStats {
    const seconds = Math.max(1e-9, t1 - this.t0);
    const ticks = Math.max(1, this.ticks);
    return {
      name,
      t0: this.t0,
      t1,
      seconds,
      upgrades: this.upgrades,
      growths: this.growths,
      plots: this.plots,
      income0: this.income0,
      income1,
      speed0: this.speed0,
      speed1,
      clearPerMin: ((cleared1 - this.cleared0) * 100 * 60) / seconds,
      chunksPerSec: this.chunks / seconds,
      fullShare: this.full / ticks,
      droughtShare: this.drought / ticks,
      longestDrought: this.longestDrought,
      decisionsPerMin: (this.decisions * 60) / seconds,
      longestEventGap: this.gaps.length ? Math.max(...this.gaps) : seconds,
      medianEventGap: median(this.gaps),
    };
  }
}

/** What a player just did (for the metrics). */
export type Action = { kind: 'buy'; id: UpgradeId; free: boolean } | { kind: 'tornado' | 'gift' | 'ad' | 'charge' | 'coinBuy'; id?: string };

/**
 * One player's hands and habits: holds the screen in their rhythm, looks at the shop every `profile.every` seconds,
 * taps lucky bugs, uses tornadoes and free charges, maybe pays coins or watches an ad. Drives any Sim (forks too).
 */
export class Player {
  readonly profile: Profile;
  onAction: (a: Action) => void = () => {};
  /** Recent share of time the basket was full (decides how much CAPACITY is worth). */
  fullRecent = 0;
  adsWatched = 0;
  private decideAcc = 0;
  private lastAd = -Infinity;
  private gifts = 0;
  private giftSeen = -1;
  private farmStart = 0;

  constructor(profile: Profile) {
    this.profile = profile;
  }

  /** Call when the player arrives on a farm (tornado habits and ad timing restart). */
  arrived(sim: Sim): void {
    this.farmStart = sim.state.simTime;
  }

  /** One fixed step with this player's hands, then their habits. Returns the step's events. */
  step(sim: Sim, dt: number): SimEvent[] {
    const st = sim.state;
    const pr = this.profile;
    sim.step(dt, { throttleHeld: pr.held(st.simTime), overdrive: pr.overdrive?.(st.simTime) ?? false });
    const full = st.basket.mass >= capacityOf(st) - 0.5;
    this.fullRecent = this.fullRecent * 0.995 + (full ? 0.005 : 0);
    const events = sim.drainEvents();
    this.habits(sim);
    this.decideAcc += dt;
    if (this.decideAcc >= pr.every) {
      this.decideAcc = 0;
      this.shop(sim);
    }
    return events;
  }

  /** Alive crops the route can reach right now (0 = the open area is exhausted: open the next fence). */
  private frontierLeft(sim: Sim): number {
    const t = sim.terr;
    let n = 0;
    for (let p = 0; p < t.claimed.length; p++) if (isFrontier(t, p, sim.state.progress.zone)) n += t.blockers[p];
    return n;
  }

  private habits(sim: Sim): void {
    const st = sim.state;
    const pr = this.profile;
    // A lucky bug is noticed ~3 s after it appears (each one is handled once: tapped, or left to fly away).
    if (pr.giftEvery > 0 && sim.giftActive && st.gift.nextAt !== this.giftSeen && st.gift.activeUntil - st.simTime < 6) {
      this.giftSeen = st.gift.nextAt;
      if (this.gifts++ % pr.giftEvery === 0) {
        sim.execute({ c: 'claimGift', mult: 1 });
        this.onAction({ kind: 'gift' });
      }
    }
    // Tornadoes once the game has shown them (the tutorial introduces the free one after ~100 s of play).
    if (pr.tornadoes && st.tornadoes > 0 && st.simTime > 110 && st.basket.mass < capacityOf(st) * 0.5 && this.frontierLeft(sim) > 30) {
      sim.execute({ c: 'useTornado' });
      this.onAction({ kind: 'tornado' });
    }
    if (Number.isFinite(pr.adEvery) && st.simTime - this.lastAd >= pr.adEvery && st.simTime - this.farmStart > 60 && sim.boostRoom('incomeX2')) {
      this.lastAd = st.simTime;
      this.adsWatched++;
      sim.execute({ c: 'boost', id: 'incomeX2', seconds: MISC.BOOST_ADD_S });
      this.onAction({ kind: 'ad', id: 'incomeX2' });
    }
  }

  private buy(sim: Sim, id: UpgradeId): void {
    const free = sim.check(id).cost === 0;
    sim.execute({ c: 'buy', id });
    this.onAction({ kind: 'buy', id, free });
  }

  /** A look at the shop: free charges, then fences and upgrades (and, for some, a coin-paid boost). */
  private shop(sim: Sim): void {
    const st = sim.state;
    const pr = this.profile;
    if (pr.charges !== false) {
      for (const id of ['incomeX2', 'autopilot'] as const) {
        if (st.charges[id] > 0 && sim.boostRoom(id)) {
          sim.execute({ c: 'useCharge', id });
          this.onAction({ kind: 'charge', id });
        }
      }
    }
    const income = Math.max(1, st.economy.ema);
    if (pr.coinAutopilot && st.boosts.autopilot <= 0 && st.coins >= sim.autopilotPrice) {
      sim.execute({ c: 'buyBoost', id: 'autopilot' });
      this.onAction({ kind: 'coinBuy', id: 'autopilot' });
    }
    if (pr.coinTornado && st.tornadoes === 0 && st.simTime > 110 && sim.tornadoPrice <= income * 100 && st.coins >= sim.tornadoPrice && this.frontierLeft(sim) > 30) {
      sim.execute({ c: 'buyTornado' });
      this.onAction({ kind: 'coinBuy', id: 'tornado' });
    }
    for (let k = 0; k < 8; k++) {
      if (sim.check('finish').ok) {
        this.buy(sim, 'finish');
        return;
      }
      const exp = sim.check('expand');
      // Free fences always; paid ones when the reachable field is nearly used up and we can afford it.
      if (exp.ok && (exp.cost === 0 || (this.frontierLeft(sim) < 12 && st.coins >= exp.cost))) {
        this.buy(sim, 'expand');
        continue;
      }
      const options = upgradeValues(sim, this.fullRecent).filter((o) => !o.blocked);
      if (!options.length) return;
      let pickId: UpgradeId | null = null;
      if (pr.pick === 'cheapest') {
        const ok = options.filter((o) => o.ok).sort((a, b) => a.cost - b.cost);
        pickId = ok[0]?.id ?? null;
      } else {
        const fav = pr.pick === 'speed' ? 'speed' : pr.pick === 'merge' ? 'merge' : null;
        const favOpt = fav ? options.find((o) => o.id === fav && o.ok) : undefined;
        if (favOpt) pickId = favOpt.id;
        else {
          options.sort((a, b) => a.payback - b.payback);
          const best = options[0];
          // Worth saving for the best deal when it is close; otherwise take the best affordable one.
          const target = best.ok || best.cost > st.coins + income * 45 ? options.find((o) => o.ok) : best;
          if (!target || !target.ok) return;
          // Save up only while a paid fence is the next goal and within reach; otherwise spend like a player would.
          const saving = st.progress.zone < 3 && exp.cost > 0 && exp.cost < st.coins * 3;
          if (saving && target.payback > 240) return;
          pickId = target.id;
        }
      }
      if (!pickId) return;
      this.buy(sim, pickId);
    }
  }
}

/** Plays `opt.farms` farms (or until `opt.minutes`) with one profile's habits. */
export function runBot(profile: Profile, opt: RunOptions): RunReport {
  const st0 = newGameState(opt.seed);
  if (opt.startFarm !== 'meadow') {
    st0.farmId = opt.startFarm;
    st0.unlockedFarms = [opt.startFarm];
  }
  const sim = new Sim(st0);
  const st = sim.state;
  const dt = opt.dt;
  const player = new Player(profile);
  player.arrived(sim);
  const milestones: [string, number][] = [];
  const mark = (name: string) => {
    if (!milestones.some(([n]) => n === name)) milestones.push([name, st.simTime]);
  };
  const farms: FarmStats[] = [];
  const rate: number[] = [];
  const growth: number[] = [];
  let grownThisMinute = 0;
  let lastMinuteCoins = 0;
  let addsTotal = 0;

  // ——— Per-farm accumulators ———
  let farmStart = 0;
  let purchases: Record<string, number> = {};
  let bandIdx = 0;
  let band = new BandAcc(0, 0, 0, vMax(1));
  let bands: BandStats[] = [];
  let lastEvent = 0;
  let lastGrowth = 0;
  let longestNoGrowth = 0;
  let droughtSince = -1;
  let longestDrought = 0;
  let droughtTicks = 0;
  let farmTicks = 0;
  let upgradesThisFarm = 0;
  let allGaps: number[] = [];
  let peakCoins = 0;

  const event = () => {
    const gap = st.simTime - lastEvent;
    band.gaps.push(gap);
    allGaps.push(gap);
    lastEvent = st.simTime;
  };
  const newFarm = () => {
    farmStart = st.simTime;
    purchases = {};
    bandIdx = 0;
    band = new BandAcc(st.simTime, sim.cleared, st.economy.ema, vMax(st.progress.speedLevel));
    bands = [];
    lastEvent = st.simTime;
    lastGrowth = st.simTime;
    longestNoGrowth = 0;
    droughtSince = -1;
    longestDrought = 0;
    droughtTicks = 0;
    farmTicks = 0;
    upgradesThisFarm = 0;
    allGaps = [];
    peakCoins = st.coins;
  };
  const closeBand = () => {
    bands.push(band.close(BAND_NAMES[bandIdx], st.simTime, sim.cleared, st.economy.ema, vMax(st.progress.speedLevel)));
  };
  const closeFarm = (finished: boolean) => {
    closeBand();
    const p = st.progress;
    farms.push({
      farm: st.farmId,
      seconds: st.simTime - farmStart,
      finished,
      bands,
      longestDrought,
      longestNoGrowth,
      longestEventGap: allGaps.length ? Math.max(...allGaps) : st.simTime - farmStart,
      avgUpgradeInterval: (st.simTime - farmStart) / Math.max(1, upgradesThisFarm),
      savingShare: droughtTicks / Math.max(1, farmTicks),
      purchases,
      end: {
        speedLevel: p.speedLevel,
        capacityLevel: p.capacityLevel,
        segments: p.segments.length,
        maxLevel: Math.max(...p.segments.map((x) => x.level)),
        vMax: vMax(p.speedLevel),
        income: st.economy.ema,
      },
      peakCoins,
    });
    opt.onFarm?.(sim, farms[farms.length - 1]);
  };
  newFarm();

  player.onAction = (a) => {
    opt.onAction?.(a, st.simTime);
    if (a.kind === 'buy') {
      purchases[a.id] = (purchases[a.id] ?? 0) + 1;
      if (a.id === 'expand') {
        const k = a.free ? 'expand(free)' : 'expand(paid)';
        purchases[k] = (purchases[k] ?? 0) + 1;
        mark(`${st.farmId} zone ${st.progress.zone + 1}${a.free ? ' (free)' : ' (paid)'}`);
      }
      if (CORE.includes(a.id)) {
        band.upgrades++;
        upgradesThisFarm++;
      }
    } else if (a.kind === 'coinBuy') purchases[`coins:${a.id}`] = (purchases[`coins:${a.id}`] ?? 0) + 1;
    else if (a.kind === 'charge') purchases[`free:${a.id}`] = (purchases[`free:${a.id}`] ?? 0) + 1;
    band.decisions++;
    event();
  };

  const total = opt.minutes * 60;
  let finishedAll = false;
  let farmsDone = 0;
  let checkAcc = 0;
  while (st.simTime < total) {
    const events = player.step(sim, dt);
    if (st.coins > peakCoins) peakCoins = st.coins;
    farmTicks++;
    band.ticks++;
    if (st.basket.mass >= capacityOf(st) - 0.5) band.full++;

    // Wallet drought: nothing in the upgrade bar affordable (checked 4× a second).
    checkAcc += dt;
    if (checkAcc >= 0.25) {
      checkAcc = 0;
      let affordable = false;
      let any = false;
      for (const id of CORE) {
        const c = sim.check(id);
        if (c.reason && MAXED.has(c.reason)) continue;
        any = true;
        if (c.ok) affordable = true;
      }
      const dry = any && !affordable;
      if (dry && droughtSince < 0) droughtSince = st.simTime;
      if (!dry && droughtSince >= 0) {
        const d = st.simTime - droughtSince;
        longestDrought = Math.max(longestDrought, d);
        band.longestDrought = Math.max(band.longestDrought, d);
        droughtSince = -1;
      }
    }
    if (droughtSince >= 0) {
      droughtTicks++;
      band.drought++;
    }

    let finishedFarm: SimEvent | null = null;
    for (const e of events) {
      opt.onEvent?.(e, st.simTime);
      switch (e.t) {
        case 'chunk':
          band.chunks++;
          mark('first chunk');
          break;
        case 'unload':
          mark('first unload');
          break;
        case 'basketFull':
          mark('first basket FULL');
          break;
        case 'routeGrew':
          mark('first route growth');
          grownThisMinute += e.plots.length;
          band.growths++;
          band.plots += e.plots.length;
          if (st.simTime - farmStart > 60) longestNoGrowth = Math.max(longestNoGrowth, st.simTime - lastGrowth);
          lastGrowth = st.simTime;
          event();
          break;
        case 'segAdded':
          addsTotal++;
          if ([1, 2, 5, 10, 20].includes(addsTotal)) mark(`ADD #${addsTotal}`);
          break;
        case 'merged':
          if (e.firstTime) {
            mark(`Lv ${e.level} unlocked`);
            event();
          }
          break;
        case 'freebie':
          if (e.reason === 'progress') event();
          break;
        case 'zoneOpened':
          mark(`${st.farmId} zone ${e.zone + 1}`);
          break;
        case 'farmFinished':
          mark(`${e.farm} FINISHED`);
          finishedFarm = e;
          break;
        default:
          break;
      }
    }

    // Band crossings (a big claim can skip a band: close the skipped ones at zero length).
    while (bandIdx + 1 < BAND_EDGES.length && sim.cleared >= BAND_EDGES[bandIdx + 1]) {
      closeBand();
      bandIdx++;
      band = new BandAcc(st.simTime, sim.cleared, st.economy.ema, vMax(st.progress.speedLevel));
    }

    if (finishedFarm && finishedFarm.t === 'farmFinished') {
      if (droughtSince >= 0) longestDrought = Math.max(longestDrought, st.simTime - droughtSince);
      closeFarm(true);
      farmsDone++;
      if (farmsDone >= opt.farms || !finishedFarm.next) {
        finishedAll = farmsDone >= opt.farms;
        break;
      }
      sim.execute({ c: 'travel', farm: finishedFarm.next });
      sim.drainEvents();
      player.arrived(sim);
      newFarm();
      continue;
    }

    if (opt.onSample && opt.sampleEvery && Math.floor(st.simTime / opt.sampleEvery) > Math.floor((st.simTime - dt) / opt.sampleEvery)) opt.onSample(sim);

    if (Math.floor(st.simTime / 60) > rate.length) {
      rate.push((st.lifetimeCoins - lastMinuteCoins) / 60);
      growth.push(grownThisMinute);
      grownThisMinute = 0;
      lastMinuteCoins = st.lifetimeCoins;
      opt.onMinute?.(
        `${String(rate.length).padStart(3)}m ${st.farmId} cleared=${(sim.cleared * 100).toFixed(0)}% zone=${st.progress.zone} rate=${(rate.at(-1) ?? 0).toPrecision(3)}/s ` +
          `coins=${st.coins.toPrecision(3)} L=${sim.path.length.toFixed(0)} spd=${st.progress.speedLevel} cap=${st.progress.capacityLevel} ` +
          `segs=${st.progress.segments.map((x) => x.level).join('')} +${growth.at(-1)}plots`,
      );
    }
  }
  if (!farms.length || farms.at(-1)!.farm !== st.farmId || !farms.at(-1)!.finished) {
    if (st.simTime >= total) closeFarm(false);
  }
  return { profile, milestones, farms, rateByMinute: rate, growthByMinute: growth, finishedAll, adsWatched: player.adsWatched };
}

/** Clear rate (farm % per minute) over the named bands, weighted by time. */
export function bandRate(f: FarmStats, names: readonly string[]): number {
  const bs = f.bands.filter((b) => names.includes(b.name) && b.seconds > 5);
  return bs.reduce((s, b) => s + b.clearPerMin * b.seconds, 0) / Math.max(1e-9, bs.reduce((s, b) => s + b.seconds, 0));
}

export interface LateGameStats {
  /** Late game (70 % → finish) clear rate relative to the mid game (25–70 %): median and worst farm. */
  ratioMedian: number;
  ratioWorst: number;
  /** Longest gap between meaningful events in any late game. */
  gapWorst: number;
  /** Longest stretch with nothing affordable: typical (median farm) and worst farm. */
  droughtMedian: number;
  droughtWorst: number;
}

/**
 * Is the end of a farm a waiting room? Measured over several seeds (claim timing is chaotic), against the mid game:
 * the start is boosted by free gifts (a tornado, the 25 % ×2), so it is not a fair yardstick.
 */
export function lateGameStats(id: ProfileId, farms: number, startFarm: FarmId, minutes: number, dt: number, seeds: number[]): LateGameStats {
  const ratios: number[] = [];
  const gaps: number[] = [];
  const droughts: number[] = [];
  for (const seed of seeds) {
    const r = runBot(PROFILES[id], { farms, startFarm, minutes, dt, seed });
    for (const f of r.farms) {
      ratios.push(bandRate(f, ['70–80%', '80–90%', '90%+']) / bandRate(f, ['25–50%', '50–70%']));
      gaps.push(Math.max(0, ...f.bands.filter((b) => b.name === '70–80%' || b.name === '80–90%').map((b) => b.longestEventGap)));
      droughts.push(f.longestDrought);
    }
  }
  const sorted = (xs: number[]) => [...xs].sort((a, b) => a - b);
  const rs = sorted(ratios);
  const ds = sorted(droughts);
  return { ratioMedian: median(rs), ratioWorst: rs[0], gapWorst: Math.max(...gaps), droughtMedian: median(ds), droughtWorst: ds[ds.length - 1] };
}
