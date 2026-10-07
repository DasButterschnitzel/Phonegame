import { describe, it, expect } from 'vitest';
import { SaveManager } from './SaveManager.ts';
import type { KeyValueStore } from './Storage.ts';
import { Sim, newGameState } from '../../game/sim.ts';
import { serialize } from '../../game/save/serialize.ts';
import { newMeta } from '../../game/save/schema.ts';

class MemStore implements KeyValueStore {
  readonly name = 'mem';
  data = new Map<string, string>();
  async get(k: string) {
    return this.data.get(k) ?? null;
  }
  async set(k: string, v: string) {
    this.data.set(k, v);
  }
  async remove(k: string) {
    this.data.delete(k);
  }
}

const goodSave = () => JSON.stringify(serialize(new Sim(newGameState(7)), newMeta(1000), {}, 2000));

describe('SaveManager', () => {
  it('a corrupt main save falls back to the backup without overwriting it', async () => {
    const store = new MemStore();
    const good = goodSave();
    store.data.set('cc.save', '{not json');
    store.data.set('cc.save.bak', good);
    const res = await new SaveManager(store, () => '').load(3000);
    expect(res.ok).toBe(true);
    expect(store.data.get('cc.save.bak')).toBe(good);
    // The good backup is restored into the main slot, the corrupt one quarantined.
    expect(store.data.get('cc.save')).toBe(good);
    expect([...store.data.keys()].some((k) => k.startsWith('cc.save.corrupt.'))).toBe(true);
  });
  it('a valid main save becomes the new backup', async () => {
    const store = new MemStore();
    const good = goodSave();
    store.data.set('cc.save', good);
    await new SaveManager(store, () => '').load(3000);
    expect(store.data.get('cc.save.bak')).toBe(good);
  });
  it('autosave pauses while suspended', async () => {
    const store = new MemStore();
    const m = new SaveManager(store, () => 'x');
    m.suspended = true;
    m.startAutosave(5);
    await new Promise((r) => setTimeout(r, 30));
    expect(store.data.has('cc.save')).toBe(false);
    await m.wipe();
  });
});
