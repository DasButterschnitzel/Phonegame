import type { GameState } from '../types.ts';
import type { DailyState } from '../daily.ts';

export const SAVE_VERSION = 1;

/** Per-crop state that differs from "fully grown": [cellKey, hp, regrowRemainingSec, golden]. */
export type CropRecord = [number, number, number, number];

export interface SaveMeta {
  daily: DailyState;
  tutorial: Record<string, boolean>;
  /** Ad policy persistence (install playtime, recent interstitial wall times). */
  adPlaytimeSec: number;
  adInterstitialWall: number[];
  sessions: number;
  firstSeenWall: number;
}

export interface SaveV1 {
  v: 1;
  savedAtWall: number;
  game: GameState;
  crops: CropRecord[];
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
