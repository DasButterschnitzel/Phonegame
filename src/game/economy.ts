import type { GameState } from './types.ts';
import { MISC } from './config.ts';

const ALPHA = 1 - Math.exp(-MISC.EMA_WINDOW_S / MISC.EMA_HORIZON_S);

/** Feed earned coins (unloads + passive) into the rolling income estimate. */
export function trackIncome(st: GameState, coins: number): void {
  st.economy.winCoins += coins;
}

export function tickIncome(st: GameState, dt: number): void {
  const e = st.economy;
  e.winTime += dt;
  if (e.winTime >= MISC.EMA_WINDOW_S) {
    const rate = e.winCoins / e.winTime;
    e.ema = e.ema === 0 ? rate : e.ema + ALPHA * (rate - e.ema);
    e.winTime = 0;
    e.winCoins = 0;
  }
}

export function passiveRate(st: GameState): number {
  let r = 0;
  for (const v of Object.values(st.economy.passive)) r += v ?? 0;
  return r;
}

/** Coins earned while away: half the recent income rate plus finished farms' passive income, capped at 2 h. */
export function offlineReward(st: GameState, elapsedSec: number): { seconds: number; coins: number } {
  if (!(elapsedSec >= MISC.OFFLINE_MIN_S)) return { seconds: 0, coins: 0 };
  const seconds = Math.min(elapsedSec, MISC.OFFLINE_CAP_S);
  const coins = Math.floor((st.economy.ema * MISC.OFFLINE_EFF + passiveRate(st)) * seconds);
  return { seconds, coins };
}

/** Reward for tapping the gift (scaled to current income, with a floor for brand new farms). */
export function giftReward(st: GameState, valueMult: number): number {
  return Math.max(Math.floor(st.economy.ema * MISC.GIFT_INCOME_S), Math.floor(25 * valueMult));
}

export function finishReward(st: GameState, valueMult: number): number {
  return Math.max(Math.floor(st.economy.ema * MISC.FINISH_INCOME_S), Math.floor(2000 * valueMult));
}
