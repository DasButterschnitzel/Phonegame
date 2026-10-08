import type { GameState } from './types.ts';
import { BONUS, MISC } from './config.ts';

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

/**
 * Coins earned while away: half the recent *active* income rate plus finished farms' full passive income, capped at 2 h.
 * (The EMA already contains passive income, so it is split out to avoid counting it 1.5×.)
 */
export function offlineReward(st: GameState, elapsedSec: number): { seconds: number; coins: number } {
  if (!(elapsedSec >= MISC.OFFLINE_MIN_S)) return { seconds: 0, coins: 0 };
  const seconds = Math.min(elapsedSec, MISC.OFFLINE_CAP_S);
  const passive = passiveRate(st);
  const active = Math.max(0, st.economy.ema - passive);
  const coins = Math.floor((active * MISC.OFFLINE_EFF + passive) * seconds);
  return { seconds, coins };
}

/** Reward for tapping the gift (scaled to current income, with a floor for brand new farms). */
export function giftReward(st: GameState, valueMult: number): number {
  return Math.max(Math.floor(st.economy.ema * MISC.GIFT_INCOME_S), Math.floor(25 * valueMult));
}

export function finishReward(st: GameState, valueMult: number): number {
  return Math.max(Math.floor(st.economy.ema * MISC.FINISH_INCOME_S), Math.floor(2000 * valueMult));
}

/** Rounds a price up to two significant digits (2.5K, 180, 37 — easy to read and compare). */
export function nicePrice(x: number): number {
  if (!(x > 0)) return 0;
  const mag = 10 ** Math.max(0, Math.floor(Math.log10(x)) - 1);
  return Math.ceil(x / mag) * mag;
}

const income = (st: GameState, valueMult: number): number => Math.max(st.economy.ema, (BONUS.PRICE_FLOOR * valueMult) / BONUS.AUTOPILOT_S);

/** Coin price of a 3-minute autopilot (the ad is the other way to pay). */
export const autopilotPrice = (st: GameState, valueMult: number): number => nicePrice(income(st, valueMult) * BONUS.AUTOPILOT_S);

/** Coin price of one more tornado on this farm (each one bought costs more). */
export const tornadoPrice = (st: GameState, valueMult: number): number =>
  nicePrice(income(st, valueMult) * BONUS.TORNADO_S * BONUS.TORNADO_CLIMB ** (st.progress.tornadoesBought ?? 0));

/** Coins for opening a field (a small burst, not a jackpot). */
export const zoneBonus = (st: GameState, valueMult: number): number => Math.floor(Math.max(st.economy.ema * BONUS.ZONE_COINS_S, 20 * valueMult));

/**
 * How big a depot payout feels: 0 routine, 1 good, 2 big — relative to ~30 s of the current income, so the same
 * load is "big" early on and routine later, and the feedback scales with it (not with the raw number).
 */
export function payoutTier(value: number, st: GameState, valueMult: number): 0 | 1 | 2 {
  const ref = Math.max(st.economy.ema * 30, 20 * valueMult);
  const r = value / ref;
  return r >= 2.2 ? 2 : r >= 0.8 ? 1 : 0;
}
