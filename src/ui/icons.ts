/** Inline SVG icons (no asset files). */
const svg = (body: string, vb = '0 0 48 48') => `<svg viewBox="${vb}" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">${body}</svg>`;

export const ICONS = {
  coin: svg(
    '<circle cx="24" cy="24" r="20" fill="#f7b500"/><circle cx="24" cy="22" r="20" fill="#ffd23f"/><circle cx="24" cy="22" r="14" fill="#f7b500"/><path d="M16 26 L19 16 L24 22 L29 16 L32 26 Z" fill="#ffe680"/>',
  ),
  add: svg(
    '<ellipse cx="28" cy="30" rx="15" ry="11" fill="#ff7a59"/><circle cx="22" cy="40" r="4" fill="#3a3f47"/><circle cx="34" cy="40" r="4" fill="#3a3f47"/><rect x="21" y="18" width="14" height="5" rx="2" fill="#8b5a2b"/><path d="M10 6v16M2 14h16" stroke="#fff" stroke-width="5" stroke-linecap="round"/>',
  ),
  merge: svg(
    '<ellipse cx="13" cy="28" rx="10" ry="8" fill="#ff7a59"/><ellipse cx="35" cy="28" rx="10" ry="8" fill="#ff7a59"/><path d="M24 20v16M16 28h16" stroke="#fff" stroke-width="5" stroke-linecap="round"/>',
  ),
  speed: svg(
    '<path d="M6 34a18 18 0 0 1 36 0" fill="#fff" stroke="#2b2d42" stroke-width="3"/><path d="M6 34a18 18 0 0 1 9-15.6" stroke="#5cc93b" stroke-width="6" fill="none"/><path d="M33 18.4A18 18 0 0 1 42 34" stroke="#ff5d5d" stroke-width="6" fill="none"/><path d="M24 34 L34 20" stroke="#2b2d42" stroke-width="4" stroke-linecap="round"/><circle cx="24" cy="34" r="4" fill="#2b2d42"/><path d="M6 14l5-7 5 7M6 20l5-7 5 7" stroke="#2b2d42" stroke-width="3" fill="none" stroke-linejoin="round"/>',
  ),
  capacity: svg(
    '<path d="M8 20h32l-4 22H12z" fill="#c98d5a" stroke="#8b5a2b" stroke-width="3" stroke-linejoin="round"/><path d="M14 20c0-8 20-8 20 0" stroke="#8b5a2b" stroke-width="4" fill="none"/><rect x="13" y="12" width="8" height="8" rx="2" fill="#7ed957"/><rect x="22" y="10" width="8" height="10" rx="2" fill="#ff8c3b"/><rect x="30" y="13" width="6" height="7" rx="2" fill="#f2d16b"/><path d="M14 30h20M16 36h16" stroke="#8b5a2b" stroke-width="2"/>',
  ),
  tornado: svg(
    '<path d="M6 9c0-4 36-4 36 0s-36 4-36 0z" fill="#eef4fa" stroke="#2b2d42" stroke-width="2.5"/><path d="M9 11c6 6 24 6 30 0l-5 9c-5 4-15 4-20 0z" fill="#d5e2ee" stroke="#2b2d42" stroke-width="2.5" stroke-linejoin="round"/><path d="M14 20c4 4 16 4 20 0l-5 9c-3 3-7 3-10 0z" fill="#c2d3e3" stroke="#2b2d42" stroke-width="2.5" stroke-linejoin="round"/><path d="M19 29c2 3 8 3 10 0l-3 8c-1 2-3 2-4 0z" fill="#aec4d8" stroke="#2b2d42" stroke-width="2.5" stroke-linejoin="round"/><path d="M23 39l2 6" stroke="#2b2d42" stroke-width="3" stroke-linecap="round"/>',
  ),
  map: svg(
    '<path d="M4 10l12-4 16 4 12-4v32l-12 4-16-4-12 4z" fill="#a8e6ff" stroke="#2b7bb9" stroke-width="3" stroke-linejoin="round"/><path d="M16 6v32M32 10v32" stroke="#2b7bb9" stroke-width="2"/><path d="M10 30c6-2 6-10 14-10s8 8 14 4" stroke="#ff5d5d" stroke-width="2.5" stroke-dasharray="3 3" fill="none"/>',
  ),
  gear: svg(
    '<path d="M24 4l4 6 7-2 1 7 7 3-3 6 3 6-7 3-1 7-7-2-4 6-4-6-7 2-1-7-7-3 3-6-3-6 7-3 1-7 7 2z" fill="#dfe6ee" stroke="#4a4e69" stroke-width="3" stroke-linejoin="round"/><circle cx="24" cy="24" r="7" fill="#4a4e69"/>',
  ),
  ad: svg('<rect x="4" y="10" width="40" height="28" rx="8" fill="#fff"/><path d="M20 17v14l12-7z" fill="#ff5d5d"/>'),
  gift: svg(
    '<rect x="6" y="20" width="36" height="22" rx="3" fill="#ff5d5d"/><rect x="4" y="14" width="40" height="9" rx="3" fill="#ff7b7b"/><rect x="21" y="14" width="6" height="28" fill="#ffd23f"/><path d="M24 14c-4-8-14-8-10-2 2 3 10 2 10 2zM24 14c4-8 14-8 10-2-2 3-10 2-10 2z" fill="#ffd23f"/>',
  ),
  autopilot: svg(
    '<circle cx="24" cy="24" r="18" fill="none" stroke="#2b2d42" stroke-width="5"/><circle cx="24" cy="24" r="5" fill="#2b2d42"/><path d="M24 24v18M24 24L8 18M24 24l16-6" stroke="#2b2d42" stroke-width="4"/>',
  ),
  x2: svg(
    '<circle cx="24" cy="24" r="20" fill="#ffd23f"/><text x="24" y="31" font-family="Arial Rounded MT Bold,Arial" font-weight="900" font-size="20" text-anchor="middle" fill="#2b2d42">x2</text>',
  ),
  finger: svg(
    '<path d="M18 26V10a4 4 0 0 1 8 0v12l10 2a5 5 0 0 1 4 6l-2 10a6 6 0 0 1-6 5H22a6 6 0 0 1-5-3l-7-11a3.5 3.5 0 0 1 5-4z" fill="#fff" stroke="#2b2d42" stroke-width="3" stroke-linejoin="round"/>',
  ),
  basket: svg(
    '<path d="M6 20h36l-5 22H11z" fill="#c98d5a" stroke="#6b4423" stroke-width="3" stroke-linejoin="round"/><path d="M14 20c0-10 20-10 20 0" stroke="#6b4423" stroke-width="4" fill="none"/><path d="M12 28h24M14 35h20" stroke="#6b4423" stroke-width="2.5"/>',
  ),
  trophy: svg('<path d="M14 6h20v10a10 10 0 0 1-20 0z" fill="#ffd23f"/><path d="M14 10H6a8 8 0 0 0 8 8M34 10h8a8 8 0 0 1-8 8" stroke="#f7b500" stroke-width="3" fill="none"/><rect x="20" y="26" width="8" height="8" fill="#f7b500"/><rect x="14" y="34" width="20" height="6" rx="2" fill="#8b5a2b"/>'),
  lock: svg('<rect x="10" y="20" width="28" height="22" rx="4" fill="#8a99a8"/><path d="M16 20v-6a8 8 0 0 1 16 0v6" stroke="#8a99a8" stroke-width="5" fill="none"/>'),
  close: svg('<path d="M12 12l24 24M36 12L12 36" stroke="#fff" stroke-width="6" stroke-linecap="round"/>'),
  collection: svg('<rect x="6" y="6" width="16" height="16" rx="4" fill="#6cc24a"/><rect x="26" y="6" width="16" height="16" rx="4" fill="#3fa7f5"/><rect x="6" y="26" width="16" height="16" rx="4" fill="#9b5de5"/><rect x="26" y="26" width="16" height="16" rx="4" fill="#ff5d5d"/>'),
  star: svg('<path d="M24 4l6 13 14 2-10 10 2 14-12-7-12 7 2-14L4 19l14-2z" fill="#ffd23f" stroke="#f7b500" stroke-width="2.5" stroke-linejoin="round"/>'),
  check: svg('<circle cx="24" cy="24" r="20" fill="#5cc93b"/><path d="M14 25l7 7 14-15" stroke="#fff" stroke-width="6" fill="none" stroke-linecap="round" stroke-linejoin="round"/>'),
  pin: svg('<path d="M24 44s14-14 14-24a14 14 0 0 0-28 0c0 10 14 24 14 24z" fill="#ff5d5d"/><circle cx="24" cy="20" r="6" fill="#fff"/>'),
  globe: svg('<circle cx="24" cy="24" r="19" fill="#3fa7f5"/><path d="M13 14c5 2 6 6 3 9s0 7 4 8 3 6 1 9M31 8c-3 4 0 6 4 7s5 5 2 8" stroke="#6cc24a" stroke-width="5" fill="none" stroke-linecap="round"/><circle cx="24" cy="24" r="19" fill="none" stroke="#1f77c4" stroke-width="3"/>'),
  arrow: svg('<path d="M8 24h28M26 12l12 12-12 12" stroke="#fff" stroke-width="7" fill="none" stroke-linecap="round" stroke-linejoin="round"/>'),
};

export type IconName = keyof typeof ICONS;

export function icon(name: IconName, cls = 'ico'): HTMLSpanElement {
  const s = document.createElement('span');
  s.className = cls;
  s.innerHTML = ICONS[name];
  return s;
}
