import type { BoostId, CoinReason, Command, DepotPass, FarmId, FarmProgress, FieldSnapshot, GameState, PathTable, CropField, SimEvent, SimInput, UpgradeId } from './types.ts';
import { FARM_ORDER } from './types.ts';
import { FARMS, type FarmDef } from './farms/index.ts';
import { BONUS, DEPOT, FIELD, FINAL, MISC, MOVE, OVERDRIVE, TERRITORY, capacityOf, farmEco, overdriveShare, unloadAt, vMax } from './config.ts';
import { buildBins, buildField, buildRoute, computeReach, markDirty } from './field.ts';
import { nearestS, sampleAt, type PathSample } from './path.ts';
import { bodyOffset, findMergePair, sortSegments, updateSpeed } from './caterpillar.ts';
import { harvestStep, kill, tornado, type HarvestCtx } from './harvest.ts';
import { canBuy, farmCleared, zoneOpensFree } from './upgrades.ts';
import { autopilotPrice, finishReward, giftReward, passiveRate, tickIncome, tornadoPrice, trackIncome, zoneBonus } from './economy.ts';
import { nextRandom, randRange } from './rng.ts';
import {
  clearedUpTo,
  isFrontier,
  isSimple,
  keepsRouteTidy,
  keepsSimpleLoop,
  newTerritory,
  plotRect,
  updateReady,
  type Territory,
} from './territory.ts';
import { packBits, unpackBits } from '../shared/bits.ts';
import { wrap } from '../shared/math.ts';

export function newFarmProgress(firstSegId: number): FarmProgress {
  const segments = [];
  for (let i = 0; i < MISC.START_SEGMENTS; i++) segments.push({ id: firstSegId + i, level: 1 });
  return { zone: 0, finished: false, addCount: 0, mergeCount: 0, speedLevel: 1, capacityLevel: 1, segments };
}

/** Cleared share of a farm you are not on, from its saved field (null = never visited). */
export function clearedOfSnapshot(id: FarmId, snap: FieldSnapshot | undefined): number | null {
  if (!snap) return null;
  const l = FARMS[id].layout;
  const total = l.zonePlots.reduce((a, b) => a + b, 0) * FIELD.PLOT_CROPS ** 2;
  const dead = snap.ver === l.version ? unpackBits(snap.dead, total) : null;
  if (!dead || total === 0) return 0;
  let n = 0;
  for (let i = 0; i < total; i++) n += dead[i];
  return n / total;
}

export const newDepotPass = (): DepotPass => ({ active: false, t: 0, segs: 0, mass: 0, value: 0, done: 0, paidMass: 0, paidValue: 0 });

export function newGameState(seed = 0x5eed): GameState {
  return {
    simTime: 0,
    rng: seed | 0,
    coins: 0,
    lifetimeCoins: 0,
    farmId: 'meadow',
    progress: newFarmProgress(1),
    farmsProgress: {},
    unlockedFarms: ['meadow'],
    completedFarms: [],
    nextSegId: 1 + MISC.START_SEGMENTS,
    headS: Number.NaN,
    prevHeadS: Number.NaN,
    v: 0,
    odometer: 0,
    basket: { mass: 0, value: 0, massByTier: [0, 0, 0, 0, 0] },
    depot: newDepotPass(),
    boosts: { incomeX2: 0, autopilot: 0 },
    charges: { incomeX2: 0, autopilot: 0 },
    tornadoes: 1,
    maxLevelReached: 1,
    economy: { ema: 0, winTime: 0, winCoins: 0, passive: {} },
    gift: { nextAt: 75, activeUntil: 0, kind: 'ladybug' },
    stats: { harvested: 0, unloads: 0, merges: 0, tornadoesUsed: 0, goldenHarvested: 0 },
    lastFullAt: -99,
    heat: 0,
  };
}

const tmp: PathSample = { x: 0, z: 0, tx: 0, tz: 0 };
const tmp2: PathSample = { x: 0, z: 0, tx: 0, tz: 0 };

export class Sim {
  state: GameState;
  farm!: FarmDef;
  path!: PathTable;
  field!: CropField;
  terr!: Territory;
  private cmds: Command[] = [];
  private events: SimEvent[] = [];
  /** OVERDRIVE boost share applied in the last step (0 = none, 1 = full). */
  overdrive = 0;
  /** FINAL HARVEST was on last step (it is announced once, when it starts during play). */
  private wasFinal = false;
  /** Seconds left of the surge a SPEED purchase gives. */
  surge = 0;

  constructor(state: GameState = newGameState()) {
    this.state = state;
    this.loadFarm(state.farmId);
  }

  private loadFarm(id: FarmId): void {
    const st = this.state;
    this.farm = FARMS[id];
    this.field = buildField(this.farm);
    this.terr = newTerritory(this.farm.layout);
    const f = this.field;
    const t = this.terr;
    const nPlots = t.claimed.length;
    for (let p = 0; p < nPlots; p++) t.cropsIn[p] = f.plotStart[p + 1] - f.plotStart[p];
    for (let i = 0; i < f.count; i++) t.zoneCrops[f.tier[i]]++;
    this.restoreField(st.progress.field);
    this.path = buildRoute(this.farm, t);
    this.afterRouteChange(false);
    this.wasFinal = this.final;
    // Saves from before the bonus milestones: no retroactive gifts for progress already made.
    const p = st.progress;
    if (p.bonusClaimed === undefined) p.bonusClaimed = BONUS.MILESTONES.filter((m) => this.cleared >= m).length;
    if (!Number.isFinite(st.headS)) {
      // Spawn so the first depot pass comes quickly.
      st.headS = this.path.barnS - this.path.length * 0.55 + this.path.length * 1000;
      st.prevHeadS = st.headS;
    }
  }

  /** Applies a saved field snapshot (ignored when the farm layout changed since it was written). */
  private restoreField(snap: FarmProgress['field']): void {
    const f = this.field;
    const t = this.terr;
    if (!snap || snap.ver !== this.farm.layout.version) return;
    const dead = unpackBits(snap.dead, f.count);
    if (dead) {
      for (let i = 0; i < f.count; i++) {
        if (!dead[i]) continue;
        f.dead[i] = 1;
        f.hp[i] = 0;
        f.deadCount++;
        t.deadIn[f.plot[i]]++;
        t.zoneDead[f.tier[i]]++;
      }
    }
    if (Array.isArray(snap.hp)) {
      for (let k = 0; k + 1 < snap.hp.length; k += 2) {
        const i = snap.hp[k];
        const hp = snap.hp[k + 1];
        if (Number.isInteger(i) && i >= 0 && i < f.count && !f.dead[i] && Number.isFinite(hp)) f.hp[i] = Math.min(f.maxHp[i], Math.max(1e-3, hp));
      }
    }
    const claimed = unpackBits(snap.claimed, t.claimed.length);
    if (claimed) {
      const keep = t.claimed.slice();
      t.claimed.set(claimed);
      if (isSimple(t)) {
        t.claimedCount = 0;
        for (let p = 0; p < t.claimed.length; p++) t.claimedCount += t.claimed[p];
      } else t.claimed.set(keep);
    }
    if (Array.isArray(snap.ready))
      for (let k = 0; k + 1 < snap.ready.length; k += 2) {
        const p = snap.ready[k];
        if (Number.isInteger(p) && p >= 0 && p < t.claimed.length && Number.isFinite(snap.ready[k + 1])) t.readySince[p] = snap.ready[k + 1];
      }
    for (let i = 0; i < f.count; i++) markDirty(f, i);
  }

  /** Writes the current field into the farm's progress (for saving and when leaving the farm). */
  syncField(): void {
    const f = this.field;
    const hp: number[] = [];
    for (let i = 0; i < f.count; i++) if (!f.dead[i] && f.hp[i] < f.maxHp[i]) hp.push(i, Math.round(f.hp[i] * 100) / 100);
    const ready: number[] = [];
    this.terr.readySince.forEach((t, p) => t >= 0 && ready.push(p, t));
    this.state.progress.field = { ver: this.farm.layout.version, claimed: packBits(this.terr.claimed), dead: packBits(f.dead), hp, ready };
  }

  get valueMult(): number {
    return farmEco(this.farm.index).valueMult;
  }

  get capacity(): number {
    return capacityOf(this.state);
  }

  /** Destroyed share of the whole farm (the farm progress metric). */
  get cleared(): number {
    return farmCleared(this.terr);
  }

  /** Destroyed share of the open zones (drives the free fence opening). */
  get openCleared(): number {
    return clearedUpTo(this.terr, this.state.progress.zone);
  }

  enqueue(cmd: Command): void {
    this.cmds.push(cmd);
  }

  /** Applies a command immediately (UI taps, bots); events are queued as usual. */
  execute(cmd: Command): void {
    this.apply(cmd);
  }

  drainEvents(): SimEvent[] {
    const e = this.events;
    this.events = [];
    return e;
  }

  check(id: UpgradeId, free = false) {
    return canBuy(this.state, this.farm, this.terr, this.path, id, free);
  }

  headPosition(out: PathSample = tmp): PathSample {
    return sampleAt(this.path, this.state.headS, out);
  }

  private ctx(): HarvestCtx {
    return { st: this.state, path: this.path, field: this.field, terr: this.terr, valueMult: this.valueMult, events: this.events, power: this.final ? FINAL.POWER : 1 };
  }

  /** FINAL HARVEST: the last stretch of an unfinished farm (faster, harder bites). */
  get final(): boolean {
    return !this.state.progress.finished && this.cleared >= FINAL.AT;
  }

  step(dt: number, input: SimInput): void {
    const st = this.state;
    for (const c of this.cmds) this.apply(c);
    this.cmds.length = 0;

    st.simTime += dt;
    st.boosts.incomeX2 = Math.max(0, st.boosts.incomeX2 - dt);
    st.boosts.autopilot = Math.max(0, st.boosts.autopilot - dt);

    // OVERDRIVE: only while actually crawling at full throttle; the motor heats up and the boost fades with it.
    const od = input.overdrive === true && (input.throttleHeld || st.boosts.autopilot > 0);
    st.heat = od ? Math.min(1, st.heat + dt / OVERDRIVE.HEAT_S) : Math.max(0, st.heat - dt / OVERDRIVE.COOL_S);
    this.overdrive = od ? overdriveShare(st.heat) : 0;
    const boost = 1 + (OVERDRIVE.MULT - 1) * this.overdrive;

    const final = this.final;
    if (final && !this.wasFinal) this.events.push({ t: 'finalHarvest' });
    this.wasFinal = final;
    this.milestones();

    const cap = this.capacity;
    this.surge = Math.max(0, this.surge - dt);
    const surge = 1 + MOVE.SURGE * (this.surge / MOVE.SURGE_S);
    updateSpeed(st, input.throttleHeld, Math.min(1, st.basket.mass / cap), dt, (st.depot.active ? DEPOT.SLOW : 1) * boost * surge * (final ? FINAL.SPEED : 1));
    st.prevHeadS = st.headS;
    const ds = st.v * dt;
    st.headS += ds;
    st.odometer += ds;

    harvestStep(this.ctx(), ds);

    const L = this.path.length;
    const b = this.path.barnS;
    if (Math.floor((st.headS - b) / L) > Math.floor((st.prevHeadS - b) / L)) this.depotEnter(st.headS - b - Math.floor((st.headS - b) / L) * L);
    else if (st.depot.active) this.depotRoll(dt);

    const passive = passiveRate(st) * dt;
    if (passive > 0) {
      st.coins += passive;
      st.lifetimeCoins += passive;
      trackIncome(st, passive);
    }
    tickIncome(st, dt);

    // Stateless cadence (survives save/load unchanged).
    if (Math.floor(st.simTime / TERRITORY.CHECK_S) > Math.floor((st.simTime - dt) / TERRITORY.CHECK_S)) this.tryClaims();

    if (st.simTime >= st.gift.nextAt && st.gift.activeUntil < st.simTime) this.spawnGift();
  }

  // ── Depot: rolling unload ──────────────────────────────────────────────────────────────────────────────────────

  /**
   * The head just passed the chute (`over` units ago): start a pass. The cargo leaves in a wave from the first
   * segment to the last (`unloadAt`), each segment paying its share as its load lands in the hopper — no stopping,
   * and never longer than DEPOT.WAVE_MAX_S however long the caterpillar is.
   */
  private depotEnter(over: number): void {
    const st = this.state;
    if (st.depot.active) this.depotFlush();
    if (st.basket.mass <= 0) return;
    const d = st.depot;
    d.active = true;
    d.t = Math.max(0, over) / Math.max(0.5, st.v);
    d.segs = Math.max(1, st.progress.segments.length);
    d.mass = st.basket.mass;
    d.value = st.basket.value;
    d.done = 0;
    d.paidMass = 0;
    d.paidValue = 0;
    this.events.push({ t: 'unloadStart', segs: d.segs, value: d.value * this.incomeMult, mass: d.mass, massByTier: st.basket.massByTier.slice(), elapsed: d.t });
    this.depotRoll(0);
  }

  private get incomeMult(): number {
    return this.state.boosts.incomeX2 > 0 ? 2 : 1;
  }

  private depotRoll(dt: number): void {
    const d = this.state.depot;
    d.t += dt;
    while (d.active && d.t >= unloadAt(d.done, d.segs) - 1e-9) this.depotPay();
  }

  /** Pays out every segment still waiting (leaving the farm, or a new pass before the old one finished). */
  private depotFlush(): void {
    while (this.state.depot.active) this.depotPay();
  }

  private depotPay(): void {
    const st = this.state;
    const d = st.depot;
    const k = d.done;
    const last = k + 1 >= d.segs;
    const m = last ? d.mass - d.paidMass : (d.mass * (k + 1)) / d.segs - d.paidMass;
    const v = last ? d.value - d.paidValue : (d.value * (k + 1)) / d.segs - d.paidValue;
    d.paidMass += m;
    d.paidValue += v;
    d.done++;
    const bk = st.basket;
    const before = bk.mass;
    bk.mass = Math.max(0, bk.mass - m);
    bk.value = Math.max(0, bk.value - v);
    const keep = before > 0 ? bk.mass / before : 0;
    for (let t = 0; t < bk.massByTier.length; t++) bk.massByTier[t] *= keep;
    if (bk.mass < 1e-6) {
      bk.mass = 0;
      bk.value = 0;
      bk.massByTier.fill(0);
    }
    const value = v * this.incomeMult;
    st.coins += value;
    st.lifetimeCoins += value;
    trackIncome(st, value);
    this.events.push({ t: 'unloadSeg', seg: k, value, mass: m, last });
    if (last) {
      d.active = false;
      st.stats.unloads++;
      this.events.push({ t: 'unload', value: d.value * this.incomeMult, mass: d.mass });
    }
  }

  // ── Territory: route growth ───────────────────────────────────────────────────────────────────────────────────

  /** Claims ready plots (after the anticipation beat, once the body is clear of them) and grows the route. */
  private tryClaims(): void {
    const st = this.state;
    const t = this.terr;
    const now = st.simTime;
    const ready: number[] = [];
    for (let p = 0; p < t.readySince.length; p++) if (t.readySince[p] >= 0 && now - t.readySince[p] >= TERRITORY.CLAIM_DELAY_S) ready.push(p);
    if (!ready.length) return;
    ready.sort((a, b) => t.readySince[a] - t.readySince[b] || a - b);
    const claimed: number[] = [];
    const grace = TERRITORY.TIDY_GRACE_S + (TERRITORY.TIDY_GRACE_LAPS * this.path.length) / vMax(st.progress.speedLevel);
    for (const p of ready) {
      const age = now - t.readySince[p];
      if (!isFrontier(t, p, st.progress.zone) || !keepsSimpleLoop(t, p)) continue;
      if (age < grace && !keepsRouteTidy(t, p, st.progress.zone)) continue;
      if (age < TERRITORY.MAX_DEFER_S && this.bodyNear(p)) continue;
      t.claimed[p] = 1;
      t.claimedCount++;
      t.readySince[p] = -1;
      claimed.push(p);
    }
    if (claimed.length) this.growRoute(claimed);
  }

  /** True while any part of the caterpillar is close to plot p (growth there would yank the body sideways). */
  private bodyNear(p: number): boolean {
    const [x0, z0, x1, z1] = plotRect(this.terr, p, TERRITORY.BODY_PAD);
    const n = this.state.progress.segments.length + 1;
    for (let b = 0; b < n; b++) {
      sampleAt(this.path, this.state.headS - bodyOffset(b), tmp2);
      if (tmp2.x > x0 && tmp2.x < x1 && tmp2.z > z0 && tmp2.z < z1) return true;
    }
    return false;
  }

  private growRoute(plots: number[]): void {
    const st = this.state;
    const prevLength = this.path.length;
    const head = this.headPosition({ x: 0, z: 0, tx: 0, tz: 0 });
    this.path = buildRoute(this.farm, this.terr);
    // Keep headS large and positive; only its value modulo L matters.
    st.headS = nearestS(this.path, head.x, head.z) + this.path.length * 1000;
    st.prevHeadS = st.headS;
    this.afterRouteChange(true);
    this.events.push({ t: 'routeGrew', plots, prevLength });
  }

  /**
   * Recomputes everything that depends on the route or the open zones: reach, proximity bins, blockers and
   * readiness. Crops left inside the territory out of reach of the new route are swept away (no yield).
   */
  private afterRouteChange(sweep: boolean): void {
    const f = this.field;
    const t = this.terr;
    const st = this.state;
    computeReach(f, this.path);
    if (sweep) {
      const ctx = this.ctx();
      for (let i = 0; i < f.count; i++) if (!f.dead[i] && !f.reach[i] && t.claimed[f.plot[i]]) kill(ctx, i, -1, true);
    }
    buildBins(f, this.path, st.progress.zone);
    t.blockers.fill(0);
    for (let i = 0; i < f.count; i++) if (!f.dead[i] && f.reach[i]) t.blockers[f.plot[i]]++;
    for (let p = 0; p < t.claimed.length; p++) if (updateReady(t, p, st.progress.zone, st.simTime)) this.events.push({ t: 'plotReady', plot: p });
  }

  // ── Bonus economy ────────────────────────────────────────────────────────────────────────────────────────────

  /** Farm progress milestones each give one free charge (no ad, no coins). */
  private milestones(): void {
    const p = this.state.progress;
    const k = p.bonusClaimed ?? 0;
    if (k >= BONUS.MILESTONES.length || this.cleared < BONUS.MILESTONES[k]) return;
    p.bonusClaimed = k + 1;
    const kind = BONUS.MILESTONE_KINDS[k];
    if (kind === 'tornado') this.state.tornadoes++;
    else this.state.charges[kind]++;
    this.events.push({ t: 'freebie', kind, reason: 'progress', at: BONUS.MILESTONES[k] });
  }

  /**
   * Where a tornado does the most good: the densest patch of living crops in the open fields within sight of the
   * head (the camera follows the head). Centred on the head it mostly swept already-cleared ground — the route is the
   * edge of the cleared land — and often hit only a handful of crops. Deterministic: same state, same spot.
   */
  tornadoSpot(): { x: number; z: number; fromX: number; fromZ: number } {
    const f = this.field;
    const t = this.terr;
    const zone = this.state.progress.zone;
    const h = this.headPosition({ x: 0, z: 0, tx: 0, tz: 0 });
    const r2 = MISC.TORNADO_R ** 2;
    const reach2 = MISC.TORNADO_AIM ** 2;
    let best = { x: h.x + h.tx * 2.5, z: h.z + h.tz * 2.5, score: -Infinity };
    const consider = (x: number, z: number) => {
      const d2 = (x - h.x) ** 2 + (z - h.z) ** 2;
      if (d2 > reach2) return;
      let n = 0;
      for (let i = 0; i < f.count; i++) if (!f.dead[i] && f.tier[i] <= zone && (f.x[i] - x) ** 2 + (f.z[i] - z) ** 2 <= r2) n++;
      // Nearer is better between equals (it should feel like it came out of the crawler).
      const score = n - 0.05 * Math.sqrt(d2);
      if (score > best.score) best = { x, z, score };
    };
    consider(best.x, best.z);
    for (let p = 0; p < t.claimed.length; p++) {
      if (t.claimed[p] || t.cropsIn[p] === 0 || t.deadIn[p] >= t.cropsIn[p]) continue;
      const [x0, z0, x1, z1] = plotRect(t, p, 0);
      consider((x0 + x1) / 2, (z0 + z1) / 2);
    }
    return { x: best.x, z: best.z, fromX: h.x, fromZ: h.z };
  }

  /** Coin price of a 3-minute autopilot right now. */
  get autopilotPrice(): number {
    return autopilotPrice(this.state, this.valueMult);
  }

  /** Coin price of one tornado right now. */
  get tornadoPrice(): number {
    return tornadoPrice(this.state, this.valueMult);
  }

  /** A boost can take another 3 minutes (it stacks up to BOOST_CAP_S). */
  boostRoom(id: BoostId): boolean {
    return this.state.boosts[id] <= MISC.BOOST_CAP_S - MISC.BOOST_ADD_S;
  }

  private startBoost(id: BoostId, seconds: number): void {
    const st = this.state;
    st.boosts[id] = Math.min(MISC.BOOST_CAP_S, st.boosts[id] + seconds);
    this.events.push({ t: 'boost', id, seconds: st.boosts[id] });
  }

  // ── Misc ─────────────────────────────────────────────────────────────────────────────────────────────────────

  private spawnGift(): void {
    const st = this.state;
    st.gift.activeUntil = st.simTime + MISC.GIFT_LIFETIME_S;
    st.gift.nextAt = st.simTime + randRange(st, MISC.GIFT_MIN_S, MISC.GIFT_MAX_S);
    st.gift.kind = nextRandom(st) < 0.5 ? 'ladybug' : 'butterfly';
    this.events.push({ t: 'giftSpawn', kind: st.gift.kind });
  }

  get giftActive(): boolean {
    return this.state.gift.activeUntil >= this.state.simTime;
  }

  private grant(amount: number, reason: CoinReason): void {
    if (!(amount > 0)) return;
    this.state.coins += amount;
    this.state.lifetimeCoins += amount;
    this.events.push({ t: 'coins', delta: amount, reason });
  }

  private apply(c: Command): void {
    const st = this.state;
    switch (c.c) {
      case 'buy':
        this.buy(c.id, c.free === true);
        break;
      case 'useTornado':
        if (st.tornadoes > 0) {
          st.tornadoes--;
          const spot = this.tornadoSpot();
          const direct = tornado(this.ctx(), spot.x, spot.z, spot.fromX, spot.fromZ);
          if (direct > 0) {
            trackIncome(st, direct * this.incomeMult);
            this.grant(direct * this.incomeMult, 'tornado');
          }
        }
        break;
      case 'boost':
        this.startBoost(c.id, c.seconds);
        break;
      case 'grantCharge':
        st.charges[c.id] += c.n;
        break;
      case 'useCharge':
        if (st.charges[c.id] > 0 && this.boostRoom(c.id)) {
          st.charges[c.id]--;
          this.startBoost(c.id, MISC.BOOST_ADD_S);
        }
        break;
      case 'buyBoost': {
        const price = this.autopilotPrice;
        if (st.coins >= price && this.boostRoom(c.id)) {
          st.coins -= price;
          this.events.push({ t: 'bought', what: 'autopilot', cost: price });
          this.startBoost(c.id, MISC.BOOST_ADD_S);
        }
        break;
      }
      case 'buyTornado': {
        const price = this.tornadoPrice;
        if (st.coins >= price) {
          st.coins -= price;
          st.tornadoes++;
          st.progress.tornadoesBought = (st.progress.tornadoesBought ?? 0) + 1;
          this.events.push({ t: 'bought', what: 'tornado', cost: price });
        }
        break;
      }
      case 'grantCoins':
        this.grant(c.amount, c.reason);
        break;
      case 'grantTornado':
        st.tornadoes += c.n;
        this.events.push({ t: 'tornadoGranted', n: c.n });
        break;
      case 'claimGift':
        if (this.giftActive) {
          const amount = giftReward(st, this.valueMult) * c.mult;
          st.gift.activeUntil = 0;
          this.grant(amount, 'gift');
          this.events.push({ t: 'giftClaimed', amount });
        }
        break;
      case 'travel':
        this.travel(c.farm);
        break;
      case 'fillBasket': {
        const target = Math.floor(this.capacity * Math.min(MISC.TORNADO_OVERFLOW, c.frac));
        const add = Math.max(0, target - st.basket.mass);
        st.basket.mass += add;
        st.basket.massByTier[0] += add;
        st.basket.value += add * this.valueMult;
        break;
      }
      case 'forceGift':
        st.gift.nextAt = st.simTime;
        break;
      case 'forceGolden': {
        let n = c.n;
        const h = this.headPosition();
        const f = this.field;
        const order = [...Array(f.count).keys()]
          .filter((i) => !f.dead[i] && f.tier[i] <= st.progress.zone)
          .sort((a, b) => (f.x[a] - h.x) ** 2 + (f.z[a] - h.z) ** 2 - ((f.x[b] - h.x) ** 2 + (f.z[b] - h.z) ** 2));
        for (const i of order) {
          if (n-- <= 0) break;
          f.golden[i] = 1;
          markDirty(f, i);
        }
        break;
      }
      case 'clearFrontier':
        this.clearFrontier(c.n);
        break;
      case 'clearAll': {
        // Debug/test helper: every crop of the open zones is destroyed (no yield).
        const ctx = this.ctx();
        for (let i = 0; i < this.field.count; i++) if (!this.field.dead[i] && this.field.tier[i] <= st.progress.zone) kill(ctx, i, -1, true);
        break;
      }
    }
  }

  /** Debug/test helper: destroys (without yield) every crop of up to n frontier plots, nearest to the head first. */
  private clearFrontier(n: number): void {
    const t = this.terr;
    const f = this.field;
    const h = this.headPosition({ x: 0, z: 0, tx: 0, tz: 0 });
    const plots: number[] = [];
    for (let p = 0; p < t.claimed.length; p++) if (isFrontier(t, p, this.state.progress.zone)) plots.push(p);
    const d2 = (p: number) => {
      const [x0, z0, x1, z1] = plotRect(t, p, 0);
      return ((x0 + x1) / 2 - h.x) ** 2 + ((z0 + z1) / 2 - h.z) ** 2;
    };
    plots.sort((a, b) => d2(a) - d2(b) || a - b);
    const ctx = this.ctx();
    for (const p of plots.slice(0, n)) for (let i = f.plotStart[p]; i < f.plotStart[p + 1]; i++) kill(ctx, i, -1, true);
  }

  private buy(id: UpgradeId, free: boolean): void {
    const st = this.state;
    const chk = this.check(id, free);
    if (!chk.ok) {
      this.events.push({ t: 'buyFailed', id });
      return;
    }
    if (!free) st.coins -= chk.cost;
    const p = st.progress;
    switch (id) {
      case 'add': {
        const seg = { id: st.nextSegId++, level: 1 };
        p.segments.push(seg);
        p.addCount++;
        this.events.push({ t: 'segAdded', id: seg.id, level: 1 });
        break;
      }
      case 'merge': {
        const pair = findMergePair(p.segments)!;
        const a = p.segments[pair.a];
        const b = p.segments[pair.b];
        const merged = { id: st.nextSegId++, level: pair.level + 1 };
        p.segments.splice(pair.b, 1);
        p.segments.splice(pair.a, 1, merged);
        sortSegments(p.segments);
        p.mergeCount++;
        st.stats.merges++;
        const firstTime = merged.level > st.maxLevelReached;
        if (firstTime) st.maxLevelReached = merged.level;
        this.events.push({ t: 'merged', consumed: [a.id, b.id], into: merged.id, level: merged.level, firstTime });
        break;
      }
      case 'speed':
        p.speedLevel++;
        this.surge = MOVE.SURGE_S;
        this.events.push({ t: 'upgraded', id: 'speed', level: p.speedLevel });
        break;
      case 'capacity':
        p.capacityLevel++;
        this.events.push({ t: 'upgraded', id: 'capacity', level: p.capacityLevel });
        break;
      case 'expand':
        this.openZone(chk.cost === 0);
        break;
      case 'finish':
        this.finishFarm();
        break;
    }
  }

  /** Opens the next zone's fence: its crops become harvestable and the territory may grow into it. */
  private openZone(free: boolean): void {
    const st = this.state;
    st.progress.zone++;
    this.afterRouteChange(false);
    this.events.push({ t: 'zoneOpened', zone: st.progress.zone, free });
    // A new field pays a little welcome bonus.
    const amount = zoneBonus(st, this.valueMult);
    this.grant(amount, 'zoneBonus');
    this.events.push({ t: 'freebie', kind: 'coins', reason: 'zone', amount });
  }

  /** True when EXPAND would cost nothing right now. */
  get zoneFree(): boolean {
    return this.state.progress.zone < 3 && zoneOpensFree(this.state, this.terr);
  }

  private finishFarm(): void {
    const st = this.state;
    const p = st.progress;
    p.finished = true;
    const reward = finishReward(st, this.valueMult);
    st.economy.passive[this.farm.id] = Math.max(st.economy.passive[this.farm.id] ?? 0, st.economy.ema * MISC.PASSIVE_FRAC);
    if (!st.completedFarms.includes(this.farm.id)) st.completedFarms.push(this.farm.id);
    const next = FARM_ORDER[this.farm.index + 1] ?? null;
    if (next && !st.unlockedFarms.includes(next)) st.unlockedFarms.push(next);
    this.grant(reward, 'farmComplete');
    // A celebration ×2 for the road: one free charge, used whenever the player likes (usually on the next farm).
    st.charges.incomeX2++;
    this.events.push({ t: 'farmFinished', farm: this.farm.id, reward, next });
    this.events.push({ t: 'freebie', kind: 'incomeX2', reason: 'farmComplete' });
  }

  private travel(id: FarmId): void {
    const st = this.state;
    if (!st.unlockedFarms.includes(id) || id === st.farmId) return;
    this.depotFlush();
    this.syncField();
    st.farmsProgress[st.farmId] = st.progress;
    const firstVisit = !st.farmsProgress[id];
    st.progress = st.farmsProgress[id] ?? newFarmProgress(st.nextSegId);
    if (firstVisit) st.nextSegId += MISC.START_SEGMENTS;
    delete st.farmsProgress[id];
    st.farmId = id;
    // Sell whatever is still in the basket instead of silently discarding it.
    const carried = st.basket.value * this.incomeMult;
    st.basket = { mass: 0, value: 0, massByTier: [0, 0, 0, 0, 0] };
    st.depot = newDepotPass();
    this.grant(carried, 'travel');
    // The rolling income estimate belongs to the farm we left; restart it from the passive baseline.
    st.economy.ema = passiveRate(st);
    st.economy.winTime = 0;
    st.economy.winCoins = 0;
    st.headS = Number.NaN;
    st.v = 0;
    this.loadFarm(id);
    this.events.push({ t: 'traveled', farm: id });
    // Every new farm starts with a tornado in hand.
    if (firstVisit) {
      st.tornadoes++;
      this.events.push({ t: 'freebie', kind: 'tornado', reason: 'newFarm' });
    }
  }

  /** Arc position of body b, wrapped into [0, L). */
  bodyS(b: number, headS = this.state.headS): number {
    return wrap(headS - bodyOffset(b), this.path.length);
  }
}
