import { ICONS } from './icons.ts';

/** Coins arc from a world point (barn) into the coin counter. */
export function coinFly(
  layer: HTMLElement,
  from: { x: number; y: number },
  to: { x: number; y: number },
  n: number,
  onArrive: () => void,
  reduceMotion = false,
  onEach: (i: number) => void = () => {},
): void {
  if (reduceMotion || typeof Element.prototype.animate !== 'function') {
    onArrive();
    return;
  }
  const count = Math.max(1, Math.min(14, n));
  let arrived = 0;
  for (let i = 0; i < count; i++) {
    const el = document.createElement('div');
    el.className = 'coin-fly';
    el.innerHTML = ICONS.coin;
    layer.append(el);
    const sx = from.x + (Math.random() - 0.5) * 60;
    const sy = from.y + (Math.random() - 0.5) * 40;
    const mx = (sx + to.x) / 2 + (Math.random() - 0.5) * 120;
    const my = Math.min(sy, to.y) - 40 - Math.random() * 60;
    const anim = el.animate(
      [
        { transform: `translate(${sx}px, ${sy}px) scale(0.4)`, opacity: 0 },
        { transform: `translate(${sx}px, ${sy - 20}px) scale(1)`, opacity: 1, offset: 0.15 },
        { transform: `translate(${mx}px, ${my}px) scale(1.1)`, offset: 0.55 },
        { transform: `translate(${to.x - 14}px, ${to.y - 14}px) scale(0.7)`, opacity: 1 },
      ],
      { duration: 650 + Math.random() * 250, delay: i * 45, easing: 'cubic-bezier(.5,0,.6,1)', fill: 'backwards' },
    );
    anim.onfinish = () => {
      el.remove();
      arrived++;
      onEach(arrived);
      if (arrived === 1 || arrived === count) onArrive();
    };
  }
}
