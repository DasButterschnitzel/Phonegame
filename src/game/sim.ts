import type { CoinReason, Command, FarmId, FarmProgress, GameState, PathTable, CropField, SimEvent, SimInput, UpgradeId } from './types.ts';
import { FARM_ORDER } from './types.ts';
import { FARMS, type FarmDef } from './farms/index.ts';
import { MISC, capacityOf, farmEco } from './config.ts';
import { applyStage, buildField, farmPaths, markDirty } from './field.ts';
import { nearestS, sampleAt, type PathSample } from './path.ts';
import { bodyOffset, findMergePair, sortSegments, updateSpeed } from './caterpillar.ts';
import { harvestStep, regrowStep, tornado, type HarvestCtx } from './harvest.ts';
import { canBuy } from './upgrades.ts';
import { finishReward, giftReward, passiveRate, tickIncome, trackIncome } from './economy.ts';
import { nextRandom, randRange } from './rng.ts';
import { wrap } from '../shared/math.ts';

export function newFarmProgress(firstSegId: number): FarmProgress {
  const segments = [];
  for (let i = 0; i < MISC.START_SEGMENTS; i++) segments.push({ id: firstSegId + i, level: 1 });
  return { stage: 0, finished: false, addCount: 0, mergeCount: 0, speedLevel: 1, capacityLevel: 1, segments };
}

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
    boosts: { incomeX2: 0, autopilot: 0 },
    tornadoes: 1,
    maxLevelReached: 1,
    economy: { ema: 0, winTime: 0, winCoins: 0, passive: {} },
    gift: { nextAt: 75, activeUntil: 0, kind: 'ladybug' },
    stats: { harvested: 0, unloads: 0, merges: 0, tornadoesUsed: 0, goldenHarvested: 0 },
    lastFullAt: -99,
  };
}

const tmp: PathSample = { x: 0, z: 0, tx: 0, tz: 0 };

export class Sim {
  state: GameState;
  farm!: FarmDef;
  path!: PathTable;
  field!: CropField;
  private cmds: Command[] = [];
  private events: SimEvent[] = [];
  private regrowAcc = 0;

  constructor(state: GameState = newGameState()) {
    this.state = state;
    this.loadFarm(state.farmId);
  }

  private loadFarm(id: FarmId): void {
    this.farm = FARMS[id];
    this.path = farmPaths(this.farm)[this.state.progress.stage];
    this.field = buildField(this.farm, this.state.progress.stage);
    if (!Number.isFinite(this.state.headS)) {
      // Spawn so the first barn pass comes quickly.
      this.state.headS = this.path.barnS - this.path.length * 0.55 + this.path.length;
      this.state.prevHeadS = this.state.headS;
    }
  }

  get valueMult(): number {
    return farmEco(this.farm.index).valueMult;
  }

  get capacity(): number {
    return capacityOf(this.state);
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
    return canBuy(this.state, this.farm, this.path, id, free);
  }

  headPosition(out: PathSample = tmp): PathSample {
    return sampleAt(this.path, this.state.headS, out);
  }

  private ctx(): HarvestCtx {
    return { st: this.state, path: this.path, field: this.field, valueMult: this.valueMult, events: this.events };
  }

  step(dt: number, input: SimInput): void {
    const st = this.state;
    for (const c of this.cmds) this.apply(c);
    this.cmds.length = 0;

    st.simTime += dt;
    st.boosts.incomeX2 = Math.max(0, st.boosts.incomeX2 - dt);
    st.boosts.autopilot = Math.max(0, st.boosts.autopilot - dt);

    const cap = this.capacity;
    updateSpeed(st, input.throttleHeld, Math.min(1, st.basket.mass / cap), dt);
    st.prevHeadS = st.headS;
    const ds = st.v * dt;
    st.headS += ds;
    st.odometer += ds;

    harvestStep(this.ctx(), ds);

    const L = this.path.length;
    const b = this.path.barnS;
    if (Math.floor((st.headS - b) / L) > Math.floor((st.prevHeadS - b) / L)) this.unload();

    const passive = passiveRate(st) * dt;
    if (passive > 0) {
      st.coins += passive;
      st.lifetimeCoins += passive;
      trackIncome(st, passive);
    }
    tickIncome(st, dt);

    this.regrowAcc += dt;
    if (this.regrowAcc >= 0.5) {
      this.regrowAcc = 0;
      regrowStep(this.ctx());
    }

    if (st.simTime >= st.gift.nextAt && st.gift.activeUntil < st.simTime) this.spawnGift();
  }

  private unload(): void {
    const st = this.state;
    const bk = st.basket;
    if (bk.mass <= 0) return;
    const value = bk.value * (st.boosts.incomeX2 > 0 ? 2 : 1);
    st.coins += value;
    st.lifetimeCoins += value;
    st.stats.unloads++;
    trackIncome(st, value);
    this.events.push({ t: 'unload', value, mass: bk.mass, massByTier: bk.massByTier.slice() });
    bk.mass = 0;
    bk.value = 0;
    bk.massByTier.fill(0);
  }

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
          const h = this.headPosition();
          tornado(this.ctx(), h.x + h.tx * 2.5, h.z + h.tz * 2.5);
        }
        break;
      case 'boost':
        st.boosts[c.id] = Math.min(MISC.BOOST_CAP_S, st.boosts[c.id] + c.seconds);
        this.events.push({ t: 'boost', id: c.id, seconds: st.boosts[c.id] });
        break;
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
        const order = [...Array(this.field.count).keys()]
          .filter((i) => this.field.regrowAt[i] === 0 && !this.field.paved[i])
          .sort((a, b) => (this.field.x[a] - h.x) ** 2 + (this.field.z[a] - h.z) ** 2 - ((this.field.x[b] - h.x) ** 2 + (this.field.z[b] - h.z) ** 2));
        for (const i of order) {
          if (n-- <= 0) break;
          this.field.golden[i] = 1;
          markDirty(this.field, i);
        }
        break;
      }
    }
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
        this.events.push({ t: 'upgraded', id: 'speed', level: p.speedLevel });
        break;
      case 'capacity':
        p.capacityLevel++;
        this.events.push({ t: 'upgraded', id: 'capacity', level: p.capacityLevel });
        break;
      case 'expand':
        this.setStage(p.stage + 1);
        break;
      case 'finish':
        this.finishFarm();
        break;
    }
  }

  private setStage(stage: number): void {
    const st = this.state;
    const prevLength = this.path.length;
    const head = this.headPosition({ x: 0, z: 0, tx: 0, tz: 0 });
    st.progress.stage = stage;
    this.path = farmPaths(this.farm)[stage];
    applyStage(this.field, this.path, stage);
    const s = nearestS(this.path, head.x, head.z);
    // Keep headS large and monotonic-ish; only its value modulo L matters.
    st.headS = s + this.path.length * 1000;
    st.prevHeadS = st.headS;
    this.events.push({ t: 'stageChanged', stage, prevLength });
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
    this.events.push({ t: 'farmFinished', farm: this.farm.id, reward, next });
  }

  private travel(id: FarmId): void {
    const st = this.state;
    if (!st.unlockedFarms.includes(id) || id === st.farmId) return;
    st.farmsProgress[st.farmId] = st.progress;
    st.progress = st.farmsProgress[id] ?? newFarmProgress(st.nextSegId);
    if (!st.farmsProgress[id]) st.nextSegId += MISC.START_SEGMENTS;
    delete st.farmsProgress[id];
    st.farmId = id;
    st.basket = { mass: 0, value: 0, massByTier: [0, 0, 0, 0, 0] };
    st.headS = Number.NaN;
    st.v = 0;
    this.loadFarm(id);
    this.events.push({ t: 'traveled', farm: id });
  }

  /** Arc position of body b, wrapped into [0, L). */
  bodyS(b: number, headS = this.state.headS): number {
    return wrap(headS - bodyOffset(b), this.path.length);
  }
}
