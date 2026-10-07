import type { GameState, PathTable, UpgradeId } from './types.ts';
import type { FarmDef } from './farms/index.ts';
import { BODY, MOVE, cost, farmEco } from './config.ts';
import { findMergePair } from './caterpillar.ts';

export type BuyReason = 'coins' | 'maxSegments' | 'noPair' | 'maxLevel' | 'finalStage' | 'notFinalStage' | 'finished';
export interface BuyCheck {
  ok: boolean;
  cost: number;
  reason?: BuyReason;
}

/** How many segments fit on the current loop (stage cap and geometry). */
export function maxSegments(farm: FarmDef, stage: number, path: PathTable): number {
  const geometric = Math.floor((path.length - BODY.HEAD_GAP - 4) / BODY.SEG_SPACING) + 1;
  return Math.min(farm.stages[stage].maxSegments, geometric);
}

export function upgradeCost(st: GameState, farm: FarmDef, id: UpgradeId): number {
  const m = farmEco(farm.index).costMult;
  const p = st.progress;
  switch (id) {
    case 'add':
      return Math.ceil(cost.add(p.segments.length, p.addCount) * m);
    case 'merge':
      {
      const pair = findMergePair(p.segments);
      return Math.ceil(cost.merge(pair ? pair.level : 1, p.mergeCount) * m);
    }
    case 'speed':
      return Math.ceil(cost.speed(p.speedLevel) * m);
    case 'capacity':
      return Math.ceil(cost.capacity(p.capacityLevel) * m);
    case 'expand':
      return p.stage >= 3 ? Infinity : Math.ceil(farm.stages[p.stage + 1].cost * m);
    case 'finish':
      return Math.ceil(farm.finishCost * m);
  }
}

export function canBuy(st: GameState, farm: FarmDef, path: PathTable, id: UpgradeId, free = false): BuyCheck {
  const c = upgradeCost(st, farm, id);
  const p = st.progress;
  const fail = (reason: BuyReason): BuyCheck => ({ ok: false, cost: c, reason });
  switch (id) {
    case 'add':
      if (p.segments.length >= maxSegments(farm, p.stage, path)) return fail('maxSegments');
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
      if (p.stage >= 3) return fail('finalStage');
      break;
    case 'finish':
      if (p.finished) return fail('finished');
      if (p.stage < 3) return fail('notFinalStage');
      break;
  }
  if (!free && st.coins < c) return fail('coins');
  return { ok: true, cost: c };
}
