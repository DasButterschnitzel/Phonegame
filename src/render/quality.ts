export type QualityTier = 'low' | 'med' | 'high';

export interface QualitySettings {
  tier: QualityTier;
  dprCap: number;
  antialias: boolean;
  particleScale: number;
  /**
   * Decorative extras (twinkles, fountains, streaks, kicked-up dirt): 0 = essential feedback only (low-end phones),
   * 1 = normal, more on high-end ones. Never gameplay: bites, kills, coins, rings and golden sparkles always show.
   */
  extraFx: number;
  /** Full-screen blended cloud-shadow layer (fill-rate heavy). */
  cloudShadows: boolean;
  /** Ink outlines on the loot-stack cubes (up to ~1k extra hulls). */
  stackOutlines: boolean;
  /** Vertex wind sway on crops and foliage. */
  wind: boolean;
}

/**
 * Classifies a GPU from its unmasked renderer string. Pure, so it can be unit-tested against real device strings.
 * Returns null when the string says nothing useful (desktop / unknown).
 */
export function tierFromGpu(gpu: string): QualityTier | null {
  const s = gpu.toLowerCase();
  if (/swiftshader|llvmpipe|software/.test(s)) return 'low';
  let m = /adreno[^0-9]*(\d{3})/.exec(s);
  if (m) {
    const n = Number(m[1]);
    return n < 616 ? 'low' : n < 660 ? 'med' : 'high';
  }
  m = /mali-?\s?([gt])?(\d+)/.exec(s);
  if (m) {
    const n = Number(m[2]);
    if (m[1] !== 'g') return 'low';
    if (n < 100) return n >= 76 || n === 57 ? 'med' : 'low';
    return n >= 710 ? 'high' : 'med';
  }
  if (/immortalis|xclipse/.test(s)) return 'high';
  if (/powervr|imagination/.test(s)) return /dxt|d-series|bxm|cxt/.test(s) ? 'med' : 'low';
  if (/apple/.test(s)) return 'high';
  return null;
}

export function detectTier(gl?: WebGLRenderingContext | WebGL2RenderingContext | null): QualityTier {
  const nav = navigator as Navigator & { deviceMemory?: number };
  const cores = nav.hardwareConcurrency || 4;
  const mem = nav.deviceMemory ?? 4;
  let gpu = '';
  try {
    const ext = gl?.getExtension('WEBGL_debug_renderer_info');
    if (gl && ext) gpu = String(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL));
  } catch {
    /* ignore */
  }
  const mobile = /Android|iPhone|iPad|Mobile/i.test(navigator.userAgent);
  const byGpu = tierFromGpu(gpu);
  if (byGpu === 'low' || mem <= 3 || cores <= 4) return 'low';
  if (byGpu) return mobile && byGpu === 'high' ? 'high' : byGpu;
  return mobile ? 'med' : 'high';
}

export function settingsFor(tier: QualityTier): QualitySettings {
  switch (tier) {
    case 'low':
      return { tier, dprCap: 1, antialias: false, particleScale: 0.5, extraFx: 0, cloudShadows: false, stackOutlines: false, wind: false };
    case 'high':
      // 1.75 rather than 2: on a phone the difference is barely visible, the fill cost is ~23 % lower (heat, battery).
      return { tier, dprCap: 1.75, antialias: true, particleScale: 1, extraFx: 1.6, cloudShadows: true, stackOutlines: true, wind: true };
    case 'med':
    default:
      return { tier: 'med', dprCap: 1.5, antialias: true, particleScale: 1, extraFx: 1, cloudShadows: false, stackOutlines: true, wind: true };
  }
}

/** Big screens (tablets, foldables) get a pixel budget instead of the full device ratio. */
export function pixelBudgetRatio(cap: number, cssW: number, cssH: number, budget = 1.6e6): number {
  return Math.max(0.75, Math.min(cap, Math.sqrt(budget / Math.max(1, cssW * cssH))));
}

/**
 * Steps the pixel ratio down when real frame intervals miss the frame budget (GPU-bound phones) and back up when
 * there is headroom. Uses wall-clock frame intervals, not JS time — a fill-rate-bound GPU barely shows up in JS.
 */
export class DynamicResolution {
  private acc = 0;
  private n = 0;
  private slowFor = 0;
  private fastFor = 0;
  ratio: number;
  private cap: number;
  enabled = true;

  constructor(cap: number) {
    this.cap = cap;
    this.ratio = cap;
  }

  /** Highest pixel ratio it may return to. */
  get max(): number {
    return this.cap;
  }

  setCap(cap: number): number {
    this.cap = cap;
    this.ratio = Math.min(this.ratio, cap);
    return this.ratio;
  }

  /** `intervalMs`: time since the last rendered frame; `budgetMs`: the frame cap's interval. */
  sample(intervalMs: number, budgetMs: number): number | null {
    if (!this.enabled || intervalMs > 200) return null; // ignore hitches (tab switch, GC, ad)
    this.acc += intervalMs;
    this.n++;
    if (this.acc < 500) return null;
    const avg = this.acc / this.n;
    const window = this.acc / 1000;
    this.acc = 0;
    this.n = 0;
    if (avg > budgetMs * 1.25) {
      this.slowFor += window;
      this.fastFor = 0;
    } else if (avg < budgetMs * 1.08) {
      this.fastFor += window;
      this.slowFor = 0;
    } else {
      this.slowFor = 0;
      this.fastFor = 0;
    }
    if (this.slowFor > 2 && this.ratio > 0.75) {
      this.slowFor = 0;
      this.ratio = Math.max(0.75, this.ratio - 0.25);
      return this.ratio;
    }
    if (this.fastFor > 10 && this.ratio < this.cap) {
      this.fastFor = 0;
      this.ratio = Math.min(this.cap, this.ratio + 0.25);
      return this.ratio;
    }
    return null;
  }
}
