export type QualityTier = 'low' | 'med' | 'high';

export interface QualitySettings {
  tier: QualityTier;
  dprCap: number;
  antialias: boolean;
  particleScale: number;
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
  if (/Mali-[GT]?[4-6]\d|Adreno \(TM\) [3-5]\d\d|PowerVR|SwiftShader/i.test(gpu) || cores <= 4 || mem <= 2) return 'low';
  if (mobile) return 'med';
  return 'high';
}

export function settingsFor(tier: QualityTier): QualitySettings {
  switch (tier) {
    case 'low':
      return { tier, dprCap: 1, antialias: false, particleScale: 0.5 };
    case 'med':
      return { tier, dprCap: 1.5, antialias: true, particleScale: 1 };
    case 'high':
      return { tier, dprCap: 2, antialias: true, particleScale: 1 };
  }
}

/** Steps the pixel ratio down when frames are slow and back up when there is headroom. */
export class DynamicResolution {
  private acc = 0;
  private n = 0;
  private slowFor = 0;
  private fastFor = 0;
  ratio: number;
  private cap: number;

  constructor(cap: number) {
    this.cap = cap;
    this.ratio = cap;
  }

  /** Returns a new pixel ratio when it should change, else null. */
  sample(frameMs: number, dt: number): number | null {
    this.acc += frameMs;
    this.n++;
    if (this.n < 30) return null;
    const avg = this.acc / this.n;
    this.acc = 0;
    this.n = 0;
    const window = dt * 30;
    if (avg > 21) {
      this.slowFor += window;
      this.fastFor = 0;
    } else if (avg < 14) {
      this.fastFor += window;
      this.slowFor = 0;
    } else {
      this.slowFor = 0;
      this.fastFor = 0;
    }
    if (this.slowFor > 3 && this.ratio > 0.75) {
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
