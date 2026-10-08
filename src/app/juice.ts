import type { Sim } from '../game/sim.ts';
import type { SimEvent } from '../game/types.ts';
import { unloadAt, vMax } from '../game/config.ts';
import { payoutTier } from '../game/economy.ts';
import { plotRect } from '../game/territory.ts';
import type { GameRenderer } from '../render/Renderer.ts';
import { MERGE_TRAVEL } from '../render/views/CaterpillarView.ts';
import { TIER_BLOCK_COLORS, levelColor } from '../render/palette.ts';
import type { AudioEngine } from '../platform/audio/AudioEngine.ts';
import type { Haptics } from '../platform/haptics.ts';

const LEAF = 0x6cc24a;
const DUST = 0xc9a27a;
const PUFF = 0xe6d2ae;
const cp = { x: 0, y: 0, z: 0 };
/** Bites handled this frame: when a strong chain chews through a row, debris thins out (the chunks still fly). */
let bitesThisFrame = 0;

/** Unit vector from body (bx, bz) towards point (x, z), blended with the body's travel direction. */
const sprayDir = (x: number, z: number, b: { x: number; z: number; tx: number; tz: number }, along: number): [number, number] => {
  let ax = x - b.x;
  let az = z - b.z;
  const l = Math.hypot(ax, az) || 1;
  ax = ax / l + b.tx * along;
  az = az / l + b.tz * along;
  const m = Math.hypot(ax, az) || 1;
  return [ax / m, az / m];
};

/** Particles, sound and haptics for simulation events. */
export function juice(e: SimEvent, sim: Sim, r: GameRenderer, audio: AudioEngine, haptics: Haptics): void {
  const f = sim.field;
  const colors = TIER_BLOCK_COLORS[sim.farm.id];
  const now = performance.now() / 1000;
  switch (e.t) {
    case 'chunk': {
      // The bite comes from a specific body: the crop recoils away from it, bits fly off the bitten side (in the
      // blade's direction of travel) and the chunk arcs from there into that body's stack.
      const color = e.golden ? 0xffd700 : colors[e.tier];
      const body = r.cat.poses[e.body];
      r.field.strike(e.crop, body.x, body.z);
      const c = r.field.contact(e.crop, cp);
      const final = f.dead[e.crop] === 1;
      const [dx, dz] = sprayDir(c.x, c.z, body, 0.9);
      const busy = ++bitesThisFrame > 6;
      if (!busy || final) r.fx.spray(c.x, c.y, c.z, dx, dz, color, busy ? 1 : final ? 3 : 2, 1.9, 0.085, 0.38, 2.2, 9, 0.3);
      r.stacks.chunk(c.x, c.y, c.z, color, e.body, now, final);
      r.cat.gulp(e.body, now);
      audio.chomp(e.golden, e.tier, final);
      break;
    }
    case 'kill': {
      if (e.swept) {
        r.fx.burst(f.x[e.crop], 0.2, f.z[e.crop], DUST, 2, 1.2, 0.14, 0.5, 1.5);
        break;
      }
      // Final bite: leaves burst off the bitten side, dirt kicks up at the base, a small puff where it stood.
      const body = r.cat.poses[e.body];
      const c = r.field.contact(e.crop, cp);
      const [dx, dz] = sprayDir(f.x[e.crop], f.z[e.crop], body, 0.4);
      r.fx.spray(c.x, c.y + 0.08, c.z, dx, dz, LEAF, 5, 2.4, 0.11, 0.55, 3, 9, 0.45);
      r.fx.spray(c.x, c.y, c.z, dx, dz, colors[f.tier[e.crop]], 2, 2, 0.1, 0.5, 2.6, 9, 0.45);
      r.fx.spray(f.x[e.crop], 0.1, f.z[e.crop], dx, dz, DUST, 3, 1.3, 0.12, 0.45, 1.5, 9, 0.7);
      r.fx.puff(f.x[e.crop], f.z[e.crop], PUFF, 7, 0.38);
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
      // The land pushes out: living crops along the new border flinch away from it.
      let nudged = 0;
      for (const p of e.plots) {
        const [x0, z0, x1, z1] = plotRect(sim.terr, p, 2.4);
        const cx = (x0 + x1) / 2;
        const cz = (z0 + z1) / 2;
        for (let i = 0; i < f.count && nudged < 48; i++) {
          if (f.dead[i] || f.x[i] < x0 || f.x[i] > x1 || f.z[i] < z0 || f.z[i] > z1) continue;
          r.field.nudge(i, cx, cz, now);
          nudged++;
        }
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
    case 'finalHarvest': {
      // The last stretch: a golden ring rolls out from the head, a bright run, the hand feels it.
      const hp = r.cat.poses[0];
      r.waves.spawn(hp.x, hp.z, 0xffd23f, 11, now, 1.3);
      r.fx.ring(hp.x, 0.5, hp.z, 0xffd23f, 22, 1.2);
      r.rig.addKick(0.05);
      audio.finalHarvest();
      haptics.fire('success');
      break;
    }
    case 'unloadStart':
      // The wave starts: each segment tips its stack so it lands as that segment is paid.
      r.stacks.beginUnload(e.segs, e.elapsed, now);
      r.depot.wake(now);
      r.onUnloadStart(e.segs, unloadAt(e.segs - 1, e.segs) - e.elapsed);
      audio.unloadStart();
      haptics.fire('light');
      break;
    case 'unloadSeg':
      r.stacks.onUnloadSeg(e.seg, now);
      r.depot.onSegment(now);
      audio.unloadSeg(e.seg, e.last);
      if (e.last || e.seg % 3 === 0) haptics.fire(e.last ? 'medium' : 'selection');
      break;
    case 'unload': {
      // Last load in: the barn answers, coins spray out of the hopper — more of everything for a big payout.
      const tier = payoutTier(e.value, sim.state, sim.valueMult);
      audio.unload(e.mass, tier);
      r.depot.bounce(now);
      const h = r.depot.hopperTop;
      r.fx.burst(h.x, h.y + 0.5, h.z, 0xffd23f, [8, 12, 22][tier], 3 + tier, 0.16, 0.9, 5.5 + tier, 12);
      r.waves.spawn(h.x, h.z, 0xffe680, 2.6 + tier * 1.4, now, 0.5 + tier * 0.15);
      if (tier === 2) {
        r.fx.ring(h.x, h.y + 0.3, h.z, 0xfff3a0, 18, 1.1);
        haptics.fire('success');
      }
      break;
    }
    case 'basketFull': {
      // The blades grind against crops that won't fit: sparks, a shake and a grumble.
      r.cat.grind(now);
      const n = Math.min(4, sim.state.progress.segments.length + 1);
      for (let b = 0; b < n; b++) {
        const p = r.cat.poses[b];
        r.fx.burst(p.x - p.tz * 0.6, 0.55, p.z + p.tx * 0.6, 0xfff3a0, 3, 3.2, 0.05, 0.25, 2, 8);
        r.fx.burst(p.x + p.tz * 0.6, 0.55, p.z - p.tx * 0.6, 0xfff3a0, 3, 3.2, 0.05, 0.25, 2, 8);
      }
      audio.full();
      haptics.fire('light');
      break;
    }
    case 'segAdded':
      audio.upgrade();
      haptics.fire('selection');
      break;
    case 'upgraded': {
      // Upgrades show up in the world, not just on the button.
      const hp = r.cat.poses[0];
      if (e.id === 'speed') {
        // Felt at once: a surge (sim), the head digs in, dust kicks from the tail, white streaks along the body,
        // the servo winds up. Milestone levels (5, 10, 15) go bigger.
        const milestone = e.level % 5 === 0;
        const n = sim.state.progress.segments.length;
        const tail = r.cat.tailPoint(n, 0.8);
        r.cat.overdriveKick(true);
        r.fx.burst(tail.x, 0.15, tail.z, DUST, milestone ? 22 : 14, 3.5, 0.18, 0.7, 2, 5);
        for (let b = 0; b <= Math.min(n, 8); b += 2) {
          const p = r.cat.poses[b];
          for (const side of [1, -1]) r.fx.spray(p.x - p.tz * 0.8 * side, 0.5, p.z + p.tx * 0.8 * side, -p.tx, -p.tz, 0xffffff, 1, 6, 0.07, 0.35, 0.3, 0, 0.05, 2);
        }
        r.waves.spawn(hp.x, hp.z, 0x9fe3ff, milestone ? 6 : 3.5, now, milestone ? 0.8 : 0.45);
        r.rig.addKick(milestone ? 0.08 : 0.05);
        audio.overdrive(true);
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
        // The impact ripples down the whole chain; a brand-new level gets a golden fountain on top.
        r.cat.pulseWave(performance.now() / 1000, 0.03);
        if (e.firstTime && p) {
          r.fx.ring(p.x, 1.2, p.z, 0xffd23f, 26, 1.0);
          r.fx.burst(p.x, 1.4, p.z, 0xffd23f, 16, 3.5, 0.12, 1.0, 6, 8);
        }
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
      r.tornado.play(e.x, e.z, now, colors, e.fromX, e.fromZ);
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
    case 'farmFinished': {
      // The farm is done (the dialog waits ~1.6 s for this): the camera pulls wide and the barn hops (Renderer), crop
      // confetti bursts from the head and the hopper, a golden ring rolls out, the chain does a proud wiggle and what
      // is left of the field twinkles in staggered waves. The crawler coasts meanwhile (boot ignores the throttle).
      const hp = r.cat.poses[0];
      const hop = r.depot.hopperTop;
      r.onFarmFinished();
      r.waves.spawn(hp.x, hp.z, 0xffd23f, 14, now, 1.4);
      r.fx.ring(hp.x, 0.6, hp.z, 0xffd23f, 24, 1.4);
      for (let k = 0; k < 4; k++) r.fx.burst(hp.x, 1.2, hp.z, colors[k], 9, 4.5, 0.15, 1.4, 8, 8);
      r.fx.burst(hop.x, hop.y + 0.5, hop.z, 0xffd23f, 16, 3.5, 0.13, 1.2, 7, 9);
      r.cat.pulseWave(now, 0.04);
      setTimeout(() => r.cat.pulseWave(performance.now() / 1000, 0.04), 650);
      // Twinkles: living crops in view (the camera is pulled wide), at most ~40, in four waves.
      const pick: number[] = [];
      for (let i = 0; i < f.count; i++) if (!f.dead[i] && Math.hypot(f.x[i] - hp.x, f.z[i] - hp.z) < 15) pick.push(i);
      const stride = Math.max(1, Math.ceil(pick.length / 40));
      for (let w = 0; w < 4; w++) {
        setTimeout(() => {
          for (let k = w * stride; k < pick.length; k += stride * 4) {
            const c = pick[k];
            if (!f.dead[c]) r.fx.burst(f.x[c], 0.7, f.z[c], 0xfff6c0, 3, 1.4, 0.09, 0.8, 3, 2);
          }
        }, 120 + w * 300);
      }
      audio.farmComplete();
      haptics.fire('success');
      break;
    }
    default:
      break;
  }
}

/** Approach cue levels already played on this lap (0 = none, 1 = 50 %, 2 = 25 %, 3 = almost there). */
let approachLevel = 0;
let wasHot = false;

export function juiceFrame(sim: Sim, audio: AudioEngine, held: boolean, r: GameRenderer, paused = false): void {
  bitesThisFrame = 0;
  const st = sim.state;
  // Under a dialog the world stands still: so does the motor. OVERDRIVE winds the servo a little higher.
  audio.setSpeed(paused ? 0 : Math.min(1.4, st.v / vMax(st.progress.speedLevel)));
  // The motor runs hot: one hiss of steam (once per overheat).
  const hot = st.heat > 0.97;
  if (hot && !wasHot && !paused) audio.overheat();
  wasHot = hot;
  if (!paused) audio.motion(st.odometer, held);
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
