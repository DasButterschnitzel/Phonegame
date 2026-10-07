import * as THREE from 'three';

/** 8×8 atlas of round level badges "1".."64". */
export function numberAtlas(): THREE.CanvasTexture {
  const size = 1024;
  const cell = size / 8;
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d')!;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  for (let i = 0; i < 64; i++) {
    const cx = (i % 8) * cell + cell / 2;
    const cy = Math.floor(i / 8) * cell + cell / 2;
    g.beginPath();
    g.arc(cx, cy, cell * 0.44, 0, Math.PI * 2);
    g.fillStyle = '#ffffff';
    g.fill();
    g.lineWidth = cell * 0.07;
    g.strokeStyle = '#2b2d42';
    g.stroke();
    g.fillStyle = '#2b2d42';
    const label = String(i + 1);
    g.font = `800 ${label.length > 1 ? cell * 0.5 : cell * 0.62}px Fredoka, "Arial Rounded MT Bold", system-ui, sans-serif`;
    g.fillText(label, cx, cy + cell * 0.03);
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 2;
  return t;
}

/** Billboard badge material sampling one atlas cell per instance (`aCell`). */
export function badgeMaterial(map: THREE.Texture): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: { map: { value: map } },
    vertexShader: /* glsl */ `
      attribute float aCell;
      varying vec2 vUv;
      void main() {
        float cx = mod(aCell, 8.0);
        float cy = floor(aCell / 8.0);
        vUv = vec2((uv.x + cx) / 8.0, 1.0 - (cy + 1.0 - uv.y) / 8.0);
        gl_Position = projectionMatrix * modelViewMatrix * instanceMatrix * vec4(position, 1.0);
      }`,
    fragmentShader: /* glsl */ `
      uniform sampler2D map;
      varying vec2 vUv;
      void main() {
        vec4 c = texture2D(map, vUv);
        if (c.a < 0.35) discard;
        gl_FragColor = c;
        #include <colorspace_fragment>
      }`,
    transparent: false,
  });
}
