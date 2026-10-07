import * as THREE from 'three';

/** Preallocated temporaries — the per-frame code paths must not allocate. */
export const M4 = new THREE.Matrix4();
export const Q = new THREE.Quaternion();
export const Q2 = new THREE.Quaternion();
export const E = new THREE.Euler();
export const V = new THREE.Vector3();
export const V2 = new THREE.Vector3();
export const S = new THREE.Vector3();
export const C = new THREE.Color();
export const UP = new THREE.Vector3(0, 1, 0);
export const ZERO_SCALE = new THREE.Matrix4().makeScale(0, 0, 0);
