/** Simulation throughput benchmark: 60 sim-minutes at 30 Hz with a long caterpillar on the final stage. */
import { Sim, newGameState } from '../src/game/sim.ts';
import { SIM } from '../src/game/config.ts';

const sim = new Sim(newGameState(7));
sim.execute({ c: 'grantCoins', amount: 1e12, reason: 'debug' });
for (let i = 0; i < 3; i++) sim.execute({ c: 'buy', id: 'expand' });
sim.state.progress.segments = Array.from({ length: 32 }, (_, i) => ({ id: 1000 + i, level: 1 + (i % 6) }));
sim.state.progress.capacityLevel = 30;
const steps = 60 * 60 * SIM.HZ;
const t0 = performance.now();
for (let i = 0; i < steps; i++) {
  sim.step(SIM.DT, { throttleHeld: true });
  sim.drainEvents();
}
const ms = performance.now() - t0;
console.log(`${steps} steps in ${ms.toFixed(0)} ms → ${((ms / steps) * 1000).toFixed(1)} µs/step (budget 300 µs on mobile)`);
