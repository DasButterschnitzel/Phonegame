import * as THREE from 'three';
import { mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

/** Uniforms shared by every stylised material (updated once per frame by the renderer). */
export const shared = {
  uTime: { value: 0 },
  uWind: { value: 1 },
};

/** Global feature switches set once from the quality tier, before any material is created. */
export const materialFlags = { wind: true };

let gradient: THREE.DataTexture | null = null;

/** 4-band toon ramp: crisp light/shadow steps give the "sticker" look. */
export function toonGradient(): THREE.DataTexture {
  if (gradient) return gradient;
  const steps = [118, 178, 222, 255];
  const data = new Uint8Array(steps.length * 4);
  steps.forEach((v, i) => data.set([v, v, v, 255], i * 4));
  gradient = new THREE.DataTexture(data, steps.length, 1, THREE.RGBAFormat);
  gradient.minFilter = THREE.NearestFilter;
  gradient.magFilter = THREE.NearestFilter;
  gradient.generateMipmaps = false;
  gradient.needsUpdate = true;
  return gradient;
}

export interface ToonOpts {
  /** Fresnel rim strength (0 = off). */
  rim?: number;
  /** Wind sway amplitude for foliage (0 = off); scales with height². */
  wind?: number;
  side?: THREE.Side;
  transparent?: boolean;
}

/** Vertex-coloured toon material with a soft rim light and optional wind sway. */
export function toon(opts: ToonOpts = {}): THREE.MeshToonMaterial {
  const rim = opts.rim ?? 0.22;
  // Wind is compiled out entirely on the low tier (not just zeroed) to save vertex work.
  const wind = materialFlags.wind ? (opts.wind ?? 0) : 0;
  const m = new THREE.MeshToonMaterial({ vertexColors: true, gradientMap: toonGradient(), side: opts.side ?? THREE.FrontSide });
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uTime = shared.uTime;
    sh.uniforms.uWind = shared.uWind;
    sh.uniforms.uRim = { value: rim };
    if (wind > 0) {
      sh.vertexShader = `uniform float uTime;\nuniform float uWind;\n${sh.vertexShader}`.replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        #ifdef USE_INSTANCING
          vec3 ip = instanceMatrix[3].xyz;
        #else
          vec3 ip = (modelMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
        #endif
        float hgt = max(position.y, 0.0);
        float sw = sin(uTime * 1.7 + ip.x * 0.31 + ip.z * 0.23) * 0.65 + sin(uTime * 3.3 + ip.x * 0.9 - ip.z * 0.4) * 0.25;
        transformed.xz += vec2(sw, sw * 0.45) * hgt * hgt * ${wind.toFixed(3)} * uWind;`,
      );
    }
    sh.fragmentShader = `uniform float uRim;\n${sh.fragmentShader}`.replace(
      '#include <opaque_fragment>',
      `float rimF = 1.0 - saturate(dot(normal, normalize(vViewPosition)));
      outgoingLight += diffuseColor.rgb * uRim * pow(rimF, 2.5);
      #include <opaque_fragment>`,
    );
  };
  m.customProgramCacheKey = () => `toon-r${rim}-w${wind}`;
  return m;
}

/** Inverted-hull outline: back faces pushed out along smooth normals, flat dark colour. */
export function outlineMaterial(width: number, color = 0x2b2d42): THREE.MeshBasicMaterial {
  const m = new THREE.MeshBasicMaterial({ color, side: THREE.BackSide });
  m.onBeforeCompile = (sh) => {
    sh.vertexShader = sh.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>\n transformed += normalize(normal) * ${width.toFixed(4)};`);
  };
  m.customProgramCacheKey = () => `outline-${width}`;
  return m;
}

const hullCache = new WeakMap<THREE.BufferGeometry, THREE.BufferGeometry>();

/** Welded copy of a flat-shaded geometry with smooth normals (so the outline hull has no cracks). */
export function hullGeometry(g: THREE.BufferGeometry): THREE.BufferGeometry {
  let h = hullCache.get(g);
  if (h) return h;
  const p = new THREE.BufferGeometry();
  p.setAttribute('position', g.getAttribute('position').clone());
  h = mergeVertices(p, 1e-3);
  h.computeVertexNormals();
  hullCache.set(g, h);
  return h;
}

/** An InstancedMesh outline that shares (and follows) another InstancedMesh's instance matrices. */
export function instancedOutline(src: THREE.InstancedMesh, width: number, color?: number): THREE.InstancedMesh {
  const o = new THREE.InstancedMesh(hullGeometry(src.geometry), outlineMaterial(width, color), src.instanceMatrix.count);
  o.instanceMatrix = src.instanceMatrix;
  o.frustumCulled = false;
  o.count = src.count;
  return o;
}

/** Vertical sky gradient used as the scene background. */
export function skyTexture(top: number, bottom: number): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 2;
  c.height = 256;
  const g = c.getContext('2d')!;
  const grd = g.createLinearGradient(0, 0, 0, 256);
  grd.addColorStop(0, `#${new THREE.Color(top).getHexString()}`);
  grd.addColorStop(1, `#${new THREE.Color(bottom).getHexString()}`);
  g.fillStyle = grd;
  g.fillRect(0, 0, 2, 256);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** Soft cloud-shadow texture (tiling) for the drifting shadow layer. */
export function cloudShadowTexture(): THREE.CanvasTexture {
  const s = 256;
  const c = document.createElement('canvas');
  c.width = c.height = s;
  const g = c.getContext('2d')!;
  let seed = 7;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;
  for (let i = 0; i < 9; i++) {
    const x = rnd() * s;
    const y = rnd() * s;
    const r = 30 + rnd() * 50;
    for (const dx of [-s, 0, s]) {
      for (const dy of [-s, 0, s]) {
        const grd = g.createRadialGradient(x + dx, y + dy, 0, x + dx, y + dy, r);
        grd.addColorStop(0, 'rgba(0,0,0,0.55)');
        grd.addColorStop(1, 'rgba(0,0,0,0)');
        g.fillStyle = grd;
        g.beginPath();
        g.arc(x + dx, y + dy, r, 0, Math.PI * 2);
        g.fill();
      }
    }
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}
