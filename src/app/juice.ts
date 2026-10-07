import type { Sim } from '../game/sim.ts';
import type { SimEvent } from '../game/types.ts';
import { vMax } from '../game/config.ts';
import { plotRect } from '../game/territory.ts';
import type { GameRenderer } from '../render/Renderer.ts';
import { MERGE_TRAVEL } from '../render/views/CaterpillarView.ts';
import { TIER_BLOCK_COLORS, levelColor } from '../render/palette.ts';
import type { AudioEngine } from '../platform/audio/AudioEngine.ts';
import type { Haptics } from '../platform/haptics.ts';

const LEAF = 0x6cc24a;
const DUST = 0xc9a27a;

/** Particles, sound and haptics for simulation events. */
export function juice(e: SimEvent, sim: Sim, r: GameRenderer, audio: AudioEngine, haptics: Haptics): void {
  const f = sim.field;
  const colors = TIER_BLOCK_COLORS[sim.farm.id];
  const now = performance.now() / 1000;
  switch (e.t) {
    case 'chunk': {
      const color = e.golden ? 0xffd700 : colors[e.tier];
      r.fx.burst(f.x[e.crop], 0.4, f.z[e.crop], color, 2, 2, 0.1, 0.45, 2.5);
      // The bite arcs into the stack of the body that took it.
      r.stacks.chunk(f.x[e.crop], f.z[e.crop], color, e.body, now);
      r.cat.gulp(e.body, now);
      audio.chomp(e.golden);
      break;
    }
    case 'kill': {
      if (e.swept) {
        r.fx.burst(f.x[e.crop], 0.2, f.z[e.crop], DUST, 2, 1.2, 0.14, 0.5, 1.5);
        break;
      }
      r.fx.burst(f.x[e.crop], 0.35, f.z[e.crop], LEAF, 6, 2.6, 0.12, 0.6, 3);
      r.fx.burst(f.x[e.crop], 0.15, f.z[e.crop], DUST, 3, 1.4, 0.16, 0.5, 1.2);
      if (e.golden) {
        r.fx.ring(f.x[e.crop], 0.4, f.z[e.crop], 0xffd700, 16, 0.5);
        haptics.fire('light');
      }
      audio.pop(f.tier[e.crop]);
      break;
    }
    case 'plotReady':
      audio.plotReady();
      break;
    case 'routeGrew': {
      // Dust kicks up along the edges of every claimed plot; the new stretch draws itself (WorldView).
      for (const p of e.plots) {
        const [x0, z0, x1, z1] = plotRect(sim.terr, p, 0);
        for (let k = 0; k < 6; k++) {
          const u = k / 6;
          r.fx.burst(x0 + (x1 - x0) * u, 0.2, z0, DUST, 1, 1.2, 0.2, 0.8, 2, 5);
          r.fx.burst(x0 + (x1 - x0) * u, 0.2, z1, DUST, 1, 1.2, 0.2, 0.8, 2, 5);
          r.fx.burst(x0, 0.2, z0 + (z1 - z0) * u, DUST, 1, 1.2, 0.2, 0.8, 2, 5);
          r.fx.burst(x1, 0.2, z0 + (z1 - z0) * u, DUST, 1, 1.2, 0.2, 0.8, 2, 5);
        }
        r.fx.burst((x0 + x1) / 2, 0.3, (z0 + z1) / 2, 0x9be36b, 8, 2.5, 0.12, 0.8, 3, 6);
        r.waves.spawn((x0 + x1) / 2, (z0 + z1) / 2, 0xfff3a0, 3.4, now, 0.6);
      }
      audio.routeGrow(e.plots.length);
      haptics.fire(e.plots.length > 1 ? 'medium' : 'light');
      break;
    }
    case 'zoneOpened': {
      const hp = r.cat.poses[0];
      r.waves.spawn(hp.x, hp.z, 0xfff3a0, 9, now, 1.1);
      r.rig.addKick(0.06);
      audio.expand();
      haptics.fire('heavy');
      break;
    }
    case 'unloadStart':
      audio.unloadStart();
      haptics.fire('light');
      break;
    case 'unloadSeg':
      r.stacks.onUnloadSeg(e.seg, e.mass, now);
      r.depot.onSegment(now);
      audio.unloadSeg(e.seg, e.last);
      if (e.last || e.seg % 3 === 0) haptics.fire(e.last ? 'medium' : 'selection');
      break;
    case 'unload':
      audio.unload(e.mass);
      r.depot.bounce(now);
      break;
    case 'basketFull':
      audio.full();
      break;
    case 'segAdded':
      audio.upgrade();
      haptics.fire('selection');
      break;
    case 'upgraded': {
      // Upgrades show up in the world, not just on the button.
      const hp = r.cat.poses[0];
      if (e.id === 'speed') {
        const n = sim.state.progress.segments.length;
        const tail = r.cat.tailPoint(n, 0.8);
        r.fx.burst(tail.x, 0.15, tail.z, DUST, 14, 3.5, 0.18, 0.7, 2, 5);
        r.fx.burst(hp.x, 0.6, hp.z, 0xffffff, 8, 4, 0.08, 0.45, 2.5, 4);
        r.waves.spawn(hp.x, hp.z, 0x9fe3ff, 3.5, now, 0.45);
        r.rig.addKick(0.05);
      } else {
        r.cat.pulseWave(now);
        r.waves.spawn(hp.x, hp.z, 0xffe680, 2.6, now, 0.5);
      }
      audio.upgrade(e.id);
      haptics.fire('light');
      break;
    }
    case 'merged': {
      // The two segments are pulled together first; the flash, ring, sound and haptic land on impact.
      r.cat.merge(e.consumed, e.into, e.level, now);
      audio.mergeCharge();
      setTimeout(() => {
        const i = sim.state.progress.segments.findIndex((s) => s.id === e.into);
        const p = i >= 0 ? r.cat.poses[i + 1] : undefined;
        if (p) {
          const t = performance.now() / 1000;
          r.fx.ring(p.x, 0.8, p.z, levelColor(e.level), 22, 0.7);
          r.fx.burst(p.x, 1, p.z, 0xffffff, 10, 3, 0.1, 0.7, 4);
          r.waves.spawn(p.x, p.z, levelColor(e.level), 3.2, t, 0.55);
          if (e.firstTime) r.waves.spawn(p.x, p.z, 0xffffff, 5, t, 0.9);
        }
        r.rig.addKick(e.firstTime ? 0.09 : 0.06);
        audio.merge(e.level);
        haptics.fire(e.firstTime ? 'heavy' : 'medium');
      }, MERGE_TRAVEL * 1000);
      break;
    }
    case 'tornado': {
      for (let k = 0; k < Math.min(60, e.crops.length); k++) {
        const c = e.crops[k];
        r.fx.burst(f.x[c], 0.3, f.z[c], colors[f.tier[c]], 1, 3, 0.14, 1.1, 7, 6);
      }
      r.fx.burst(e.x, 0.3, e.z, DUST, 30, 6, 0.2, 1.2, 4, 5);
      r.rig.addShake(0.3);
      r.tornado.play(e.x, e.z, now, colors);
      r.waves.spawn(e.x, e.z, 0xdfe8f2, 7, now, 0.8);
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

/** Approach cue levels already played on this lap (0 = none, 1 = 50 %, 2 = 25 %, 3 = almost there). */
let approachLevel = 0;

export function juiceFrame(sim: Sim, audio: AudioEngine, held: boolean, r: GameRenderer): void {
  const st = sim.state;
  audio.setSpeed(Math.min(1, st.v / vMax(st.progress.speedLevel)));
  audio.motion(st.odometer, held);
  // Depot approach feedback with a meaningful load: soft blips at half a lap, a quarter lap and just before the chute.
  const L = sim.path.length;
  const ahead = (((sim.path.barnS - st.headS) % L) + L) % L;
  const loaded = st.basket.mass >= sim.capacity * 0.3;
  const level = !loaded || st.depot.active ? 0 : ahead < 4 ? 3 : ahead < L * 0.25 ? 2 : ahead < L * 0.5 ? 1 : 0;
  if (level > approachLevel) {
    audio.approach(level - 1);
    r.depot.cue(level);
  }
  approachLevel = level;
}
