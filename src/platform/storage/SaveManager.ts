import type { KeyValueStore } from './Storage.ts';
import { parseSave, type LoadResult } from '../../game/save/migrations.ts';

const MAIN = 'cc.save';
const BAK = 'cc.save.bak';

/** Load (with backup fallback + corrupt quarantine), debounced saves, periodic autosave. */
export class SaveManager {
  readonly store: KeyValueStore;
  private build: () => string;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private interval: ReturnType<typeof setInterval> | null = null;
  readOnly = false;
  lastSavedAt = 0;

  constructor(store: KeyValueStore, build: () => string) {
    this.store = store;
    this.build = build;
  }

  async load(wallNow: number): Promise<LoadResult> {
    const raw = await this.store.get(MAIN);
    let res = parseSave(raw, wallNow);
    if (!res.ok && res.reason === 'future') {
      this.readOnly = true;
      return res;
    }
    if (!res.ok && res.reason === 'corrupt') {
      await this.store.set(`${MAIN}.corrupt.${Math.floor(wallNow)}`, raw ?? '');
      const bak = await this.store.get(BAK);
      res = parseSave(bak, wallNow);
    }
    // Keep the last known-good save as a backup.
    if (res.ok && raw) await this.store.set(BAK, raw);
    return res;
  }

  /** Debounced save (purchases, settings). */
  saveSoon(delayMs = 2000): void {
    if (this.timer) return;
    this.timer = setTimeout(() => {
      this.timer = null;
      void this.saveNow();
    }, delayMs);
  }

  async saveNow(): Promise<void> {
    if (this.readOnly) return;
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    await this.store.set(MAIN, this.build());
    this.lastSavedAt = Date.now();
  }

  startAutosave(everyMs = 15000): void {
    this.interval ??= setInterval(() => void this.saveNow(), everyMs);
  }

  async wipe(): Promise<void> {
    this.readOnly = true;
    if (this.interval) clearInterval(this.interval);
    await this.store.remove(MAIN);
    await this.store.remove(BAK);
  }
}
