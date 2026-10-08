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

/** A gift icon (free charge) flies in a high arc from `from` to its button, growing as it leaves and landing small. */
export function iconFly(layer: HTMLElement, from: { x: number; y: number }, to: { x: number; y: number }, svg: string, onArrive: () => void, reduceMotion = false): void {
  if (reduceMotion || typeof Element.prototype.animate !== 'function') {
    onArrive();
    return;
  }
  const el = document.createElement('div');
  el.className = 'gift-fly';
  el.innerHTML = svg;
  layer.append(el);
  const mx = (from.x + to.x) / 2;
  const my = Math.min(from.y, to.y) - 90;
  const anim = el.animate(
    [
      { transform: `translate(${from.x - 22}px, ${from.y - 22}px) scale(0.3)`, opacity: 0 },
      { transform: `translate(${from.x - 22}px, ${from.y - 40}px) scale(1.5)`, opacity: 1, offset: 0.2 },
      { transform: `translate(${mx - 22}px, ${my - 22}px) scale(1.2)`, offset: 0.55 },
      { transform: `translate(${to.x - 22}px, ${to.y - 22}px) scale(0.8)`, opacity: 1 },
    ],
    { duration: 950, easing: 'cubic-bezier(.45,0,.55,1)' },
  );
  anim.onfinish = () => {
    el.remove();
    onArrive();
  };
}
