import { h } from './dom.ts';

const COLORS = ['#ffd23f', '#ff5d5d', '#3fa7f5', '#7ed957', '#9b5de5', '#ff9f1c', '#ffffff'];

/** A short burst of DOM confetti (WAAPI, compositor-only). Pieces remove themselves. */
export function confetti(host: HTMLElement, n = 36): void {
  if (document.documentElement.classList.contains('reduce-motion')) return;
  const r = host.getBoundingClientRect();
  const layer = h('div', { class: 'confetti' });
  host.append(layer);
  let alive = n;
  for (let i = 0; i < n; i++) {
    const p = h('i');
    p.style.background = COLORS[i % COLORS.length];
    if (i % 3 === 0) p.style.borderRadius = '50%';
    layer.append(p);
    const x0 = r.width / 2 + (Math.random() - 0.5) * 40;
    const y0 = r.height * 0.3;
    const a = -Math.PI / 2 + (Math.random() - 0.5) * 2.2;
    const v = 140 + Math.random() * 180;
    const x1 = x0 + Math.cos(a) * v;
    const y1 = y0 + Math.sin(a) * v;
    const x2 = x1 + (Math.random() - 0.5) * 80;
    const y2 = y1 + 260 + Math.random() * 160;
    const rot = (Math.random() - 0.5) * 1080;
    const anim = p.animate(
      [
        { transform: `translate(${x0}px, ${y0}px) rotate(0deg) scale(0.4)`, opacity: 1 },
        { transform: `translate(${x1}px, ${y1}px) rotate(${rot / 2}deg) scale(1)`, opacity: 1, offset: 0.3 },
        { transform: `translate(${x2}px, ${y2}px) rotate(${rot}deg) scale(0.9)`, opacity: 0 },
      ],
      { duration: 1400 + Math.random() * 700, easing: 'cubic-bezier(.15,.6,.4,1)', delay: Math.random() * 120 },
    );
    anim.onfinish = () => {
      p.remove();
      if (--alive === 0) layer.remove();
    };
  }
}
