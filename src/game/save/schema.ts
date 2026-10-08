import type { GameState } from '../types.ts';
import type { DailyState } from '../daily.ts';

/**
 * v1: stage-based farms with regrowing crops (+ a per-crop regrowth list).
 * v2: persistent clearing — each farm's cleared territory, destroyed crops and crop damage live in
 *     `progress.field` (bitsets); stages became zones; rolling depot pass state.
 * v3: endless World Tour — farms are keys (the starter ids stay valid), World Tour farms carry their blueprint in
 *     their progress, and a bounded `journey` (world seed, frontier, Core Rank, stamps, records) replaces the idea of
 *     a last farm.
 */
export const SAVE_VERSION = 3;

export interface SaveMeta {
  daily: DailyState;
  tutorial: Record<string, boolean>;
  /** Ad policy persistence (install playtime, recent interstitial wall times). */
  adPlaytimeSec: number;
  adInterstitialWall: number[];
  sessions: number;
  firstSeenWall: number;
}

export interface SaveData {
  v: 3;
  savedAtWall: number;
  game: GameState;
  meta: SaveMeta;
  settings: Record<string, unknown>;
}

export const newMeta = (wallNow: number): SaveMeta => ({
  daily: { lastClaimKey: '', day: 0 },
  tutorial: {},
  adPlaytimeSec: 0,
  adInterstitialWall: [],
  sessions: 0,
  firstSeenWall: wallNow,
});
