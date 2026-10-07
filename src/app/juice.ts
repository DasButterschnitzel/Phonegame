import type { Sim } from '../game/sim.ts';
import type { SimEvent } from '../game/types.ts';
import { vMax } from '../game/config.ts';
import { sampleAt } from '../game/path.ts';
import { farmPaths } from '../game/field.ts';
import type { GameRenderer } from '../render/Renderer.ts';
import { TIER_BLOCK_COLORS, levelColor } from '../render/palette.ts';
import type { AudioEngine } from '../platform/audio/AudioEngine.ts';
import type { Haptics } from '../platform/haptics.ts';

const tmp = { x: 0, z: 0, tx: 0, tz: 0 };
const LEAF = 0x6cc24a;
const DUST = 0xc9a27a;

/** Particles, sound and haptics for simulation events. */
export function juice(e: SimEvent, sim: Sim, r: GameRenderer, audio: AudioEngine, haptics: Haptics): void {
  const f = sim.field;
  const colors = TIER_BLOCK_COLORS[sim.farm.id];
  switch (e.t) {
    case 'chunk':
      if (e.wasted) break;
      r.fx.burst(f.x[e.crop], 0.4, f.z[e.crop], e.golden ? 0xffd700 : colors[e.tier], 2, 2, 0.1, 0.5, 2.5);
      r.cat.gulp(e.body, performance.now() / 1000);
      audio.chomp(e.golden);
      break;
    case 'kill':
      r.fx.burst(f.x[e.crop], 0.35, f.z[e.crop], LEAF, 5, 2.5, 0.12, 0.6, 3);
      if (e.golden) {
        r.fx.ring(f.x[e.crop], 0.4, f.z[e.crop], 0xffd700, 16, 0.5);
        haptics.fire('light');
      }
      audio.pop();
      break;
    case 'regrow':
      if (e.golden) r.fx.ring(f.x[e.crop], 0.2, f.z[e.crop], 0xffe680, 10, 0.4);
      break;
    case 'unload':
      r.stacks.onUnload(e.massByTier, e.mass);
      audio.unload(e.mass);
      haptics.fire('medium');
      break;
    case 'basketFull':
      audio.full();
      break;
    case 'segAdded':
    case 'upgraded':
      audio.upgrade();
      haptics.fire('selection');
      break;
    case 'merged': {
      const i = sim.state.progress.segments.findIndex((s) => s.id === e.into);
      const p = r.cat.poses[i + 1];
      if (p) {
        const now = performance.now() / 1000;
        r.fx.ring(p.x, 0.8, p.z, levelColor(e.level), 22, 0.7);
        r.fx.burst(p.x, 1, p.z, 0xffffff, 10, 3, 0.1, 0.7, 4);
        r.waves.spawn(p.x, p.z, levelColor(e.level), 3.2, now, 0.55);
        if (e.firstTime) r.waves.spawn(p.x, p.z, 0xffffff, 5, now, 0.9);
      }
      audio.merge(e.level);
      haptics.fire('medium');
      break;
    }
    case 'stageChanged': {
      const path = farmPaths(sim.farm)[e.stage];
      for (let s = 0; s < path.length; s += 2.5) {
        sampleAt(path, s, tmp);
        r.fx.burst(tmp.x, 0.2, tmp.z, DUST, 2, 1.5, 0.18, 0.9, 2.5, 6);
      }
      const hp = r.cat.poses[0];
      r.waves.spawn(hp.x, hp.z, 0xfff3a0, 9, performance.now() / 1000, 1.1);
      audio.expand();
      haptics.fire('heavy');
      break;
    }
    case 'tornado': {
      for (let k = 0; k < Math.min(60, e.crops.length); k++) {
        const c = e.crops[k];
        r.fx.burst(f.x[c], 0.3, f.z[c], colors[f.tier[c]], 1, 3, 0.14, 1.1, 7, 6);
      }
      r.fx.burst(e.x, 0.3, e.z, DUST, 30, 6, 0.2, 1.2, 4, 5);
      r.rig.addShake(0.3);
      r.tornado.play(e.x, e.z, performance.now() / 1000);
      r.waves.spawn(e.x, e.z, 0xdfe8f2, 7, performance.now() / 1000, 0.8);
      audio.tornado();
      haptics.fire('heavy');
      break;
    }
    case 'giftClaimed':
      audio.gift();
      haptics.fire('success');
      break;
    case 'coins':
      audio.coin();
      break;
    case 'farmFinished':
      audio.levelUp();
      haptics.fire('success');
      break;
    default:
      break;
  }
}

export function juiceFrame(sim: Sim, audio: AudioEngine): void {
  audio.setSpeed(Math.min(1, sim.state.v / vMax(sim.state.progress.speedLevel)));
}
