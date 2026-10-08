import type { GameState, PathTable, UpgradeId } from './types.ts';
import type { FarmDef } from './farms/index.ts';
import { BODY, MOVE, TERRITORY, cost, farmEco } from './config.ts';
import { findMergePair } from './caterpillar.ts';
import { clearedUpTo, type Territory } from './territory.ts';

export type BuyReason = 'coins' | 'maxSegments' | 'noPair' | 'maxLevel' | 'finalZone' | 'notCleared' | 'finished';
export interface BuyCheck {
  ok: boolean;
  cost: number;
  reason?: BuyReason;
}

/** How many segments fit: the open zone's cap and the loop's length. */
export function maxSegments(farm: FarmDef, zone: number, path: PathTable): number {
  const geometric = Math.floor((path.length - BODY.HEAD_GAP - 4) / BODY.SEG_SPACING) + 1;
  return Math.max(1, Math.min(farm.maxSegments[zone], geometric));
}

/** EXPAND (open the next zone's fence) is free once the open area is mostly cleared. */
export const zoneOpensFree = (st: GameState, terr: Territory): boolean => clearedUpTo(terr, st.progress.zone) >= TERRITORY.ZONE_FREE_AT;

/** Destroyed share of all the farm's crops. */
export const farmCleared = (terr: Territory): number => clearedUpTo(terr, 3);

export function upgradeCost(st: GameState, farm: FarmDef, terr: Territory, id: UpgradeId): number {
  const m = farmEco(farm.index).costMult;
  const p = st.progress;
  switch (id) {
    case 'add':
      return Math.ceil(cost.add(p.segments.length, p.addCount, p.zone) * m);
    case 'merge': {
      const pair = findMergePair(p.segments);
      return Math.ceil(cost.merge(pair ? pair.level : 1, p.mergeCount, p.zone) * m);
    }
    case 'speed':
      return Math.ceil(cost.speed(p.speedLevel) * m);
    case 'capacity':
      return Math.ceil(cost.capacity(p.capacityLevel) * m);
    case 'expand':
      if (p.zone >= 3) return Infinity;
      return zoneOpensFree(st, terr) ? 0 : Math.ceil(farm.zoneCost[p.zone + 1] * m);
    case 'finish':
      return 0;
  }
}

export function canBuy(st: GameState, farm: FarmDef, terr: Territory, path: PathTable, id: UpgradeId, free = false): BuyCheck {
  const c = upgradeCost(st, farm, terr, id);
  const p = st.progress;
  const fail = (reason: BuyReason): BuyCheck => ({ ok: false, cost: c, reason });
  switch (id) {
    case 'add':
      if (p.segments.length >= maxSegments(farm, p.zone, path)) return fail('maxSegments');
      break;
    case 'merge':
      if (!findMergePair(p.segments)) return fail('noPair');
      break;
    case 'speed':
      if (p.speedLevel >= MOVE.MAX_LVL) return fail('maxLevel');
      break;
    case 'capacity':
      break;
    case 'expand':
      if (p.zone >= 3) return fail('finalZone');
      break;
    case 'finish':
      if (p.finished) return fail('finished');
      if (p.zone < 3 || farmCleared(terr) < TERRITORY.FINISH_AT) return fail('notCleared');
      break;
  }
  if (!free && st.coins < c) return fail('coins');
  return { ok: true, cost: c };
}
