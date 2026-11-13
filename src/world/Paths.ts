import * as THREE from 'three';
import { createPaintedMaterial } from '../assets/look/PaintedMaterial';

export interface PathPoint {
  x: number;
  z: number;
}

export interface PathSpec {
  width: number;
  points: readonly PathPoint[];
}

export interface PatchSpec {
  x: number;
  z: number;
  radius: number;
}

export type GroundY = (x: number, z: number) => number;

/** How far above the ground the dirt is drawn, so it never fights the grass for depth. */
export const PATH_LIFT = 0.05;
/** Distance between cross-sections along a path, and vertices across each one. */
const STEP = 0.5;
const ACROSS = 5;
const PATCH_RINGS = 6;
const PATCH_SEGMENTS = 48;
/** Metres of path one repeat of the texture covers. */
const TEXTURE_LENGTH = 2;

interface Builder {
  positions: number[];
  uvs: number[];
  indices: number[];
}

/**
 * A ribbon along a smooth curve through `points`, draped on the ground. Both ends
 * are rounded, so a path that stops at a door ends like a path and not like a cut.
 */
function addPath(out: Builder, path: PathSpec, groundY: GroundY): void {
  if (path.points.length < 2) return;
  const curve = new THREE.CatmullRomCurve3(
    path.points.map((point) => new THREE.Vector3(point.x, 0, point.z)),
    false,
    'centripetal',
  );
  const length = curve.getLength();
  const rows = Math.max(2, Math.ceil(length / STEP));
  const centres = curve.getSpacedPoints(rows);
  const half = path.width / 2;
  const first = out.positions.length / 3;

  for (let row = 0; row <= rows; row++) {
    const here = centres[row];
    const before = centres[Math.max(0, row - 1)];
    const after = centres[Math.min(rows, row + 1)];
    const dx = after.x - before.x;
    const dz = after.z - before.z;
    const span = Math.hypot(dx, dz) || 1;
    // Across the path: the direction of travel turned a quarter turn about Y.
    const sideX = dz / span;
    const sideZ = -dx / span;

    const along = (row / rows) * length;
    const fromEnd = Math.min(along, length - along);
    // A semicircle: full width once a half-width in from the end.
    const taper = fromEnd >= half ? 1 : Math.sqrt(Math.max(0, 1 - (1 - fromEnd / half) ** 2));

    for (let column = 0; column < ACROSS; column++) {
      const t = column / (ACROSS - 1);
      const offset = (t - 0.5) * path.width * taper;
      const x = here.x + sideX * offset;
      const z = here.z + sideZ * offset;
      out.positions.push(x, groundY(x, z) + PATH_LIFT, z);
      out.uvs.push(t, along / TEXTURE_LENGTH);
    }
  }

  for (let row = 0; row < rows; row++) {
    for (let column = 0; column < ACROSS - 1; column++) {
      const a = first + row * ACROSS + column;
      const b = a + 1;
      const c = a + ACROSS;
      const d = c + 1;
      // Wound so the face points up: columns run to the right of the direction of travel.
      out.indices.push(a, c, b, b, c, d);
    }
  }
}

/** A disc draped on the ground. u runs 0.5 at the centre to 1 at the rim, so the rim is the soft edge. */
function addPatch(out: Builder, patch: PatchSpec, groundY: GroundY): void {
  const first = out.positions.length / 3;
  out.positions.push(patch.x, groundY(patch.x, patch.z) + PATH_LIFT, patch.z);
  out.uvs.push(0.5, 0);

  for (let ring = 1; ring <= PATCH_RINGS; ring++) {
    const radius = (ring / PATCH_RINGS) * patch.radius;
    for (let segment = 0; segment <= PATCH_SEGMENTS; segment++) {
      const angle = (segment / PATCH_SEGMENTS) * Math.PI * 2;
      const x = patch.x + Math.sin(angle) * radius;
      const z = patch.z + Math.cos(angle) * radius;
      out.positions.push(x, groundY(x, z) + PATH_LIFT, z);
      // v is measured along the rim so the edge grain is the same size as a path's.
      out.uvs.push(0.5 + 0.5 * (ring / PATCH_RINGS), (angle * patch.radius) / TEXTURE_LENGTH);
    }
  }

  const ringStart = (ring: number): number => first + 1 + (ring - 1) * (PATCH_SEGMENTS + 1);
  for (let segment = 0; segment < PATCH_SEGMENTS; segment++) {
    out.indices.push(first, ringStart(1) + segment, ringStart(1) + segment + 1);
  }
  for (let ring = 1; ring < PATCH_RINGS; ring++) {
    for (let segment = 0; segment < PATCH_SEGMENTS; segment++) {
      const a = ringStart(ring) + segment;
      const b = a + 1;
      const c = ringStart(ring + 1) + segment;
      const d = c + 1;
      out.indices.push(a, c, b, b, c, d);
    }
  }
}

export function buildPathGeometry(
  paths: readonly PathSpec[],
  patches: readonly PatchSpec[],
  groundY: GroundY,
): THREE.BufferGeometry {
  const out: Builder = { positions: [], uvs: [], indices: [] };
  for (const path of paths) addPath(out, path, groundY);
  for (const patch of patches) addPatch(out, patch, groundY);

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(out.positions, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(out.uvs, 2));
  geometry.setIndex(out.indices);
  geometry.computeVertexNormals();
  return geometry;
}

function hash(x: number, y: number): number {
  const value = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
  return value - Math.floor(value);
}

/** Smooth noise along the edge, so the rim wanders instead of sparkling. */
const EDGE_PERIODS = 8;
function periodicEdgeNoise(v: number): number {
  const cell = Math.floor(v);
  const f = v - cell;
  const eased = f * f * (3 - 2 * f);
  return hash(cell % EDGE_PERIODS, 7) * (1 - eased) + hash((cell + 1) % EDGE_PERIODS, 7) * eased;
}

/**
 * Packed earth: warm brown with a little speckle, opaque in the middle and fading
 * out through a wandering edge at u = 0 and u = 1. Repeats along v.
 */
export function createPathTexture(size = 64): THREE.DataTexture {
  const data = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++) {
    // Whole periods fit in the texture, so the edge is seamless where it repeats.
    const wander = 0.03 + 0.07 * periodicEdgeNoise((y / size) * EDGE_PERIODS);
    for (let x = 0; x < size; x++) {
      const u = (x + 0.5) / size;
      const edge = Math.min(u, 1 - u);
      const alpha = Math.min(1, Math.max(0, (edge - wander) / 0.05));
      const speckle = hash(x, y);
      const shade = 0.92 + 0.14 * speckle + (speckle > 0.965 ? 0.12 : 0);
      const i = (y * size + x) * 4;
      data[i] = Math.min(255, Math.round(168 * shade));
      data[i + 1] = Math.min(255, Math.round(122 * shade));
      data[i + 2] = Math.min(255, Math.round(78 * shade));
      data[i + 3] = Math.round(alpha * 255);
    }
  }
  const texture = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = THREE.ClampToEdgeWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.magFilter = THREE.LinearFilter;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.generateMipmaps = true;
  texture.needsUpdate = true;
  return texture;
}

/** Every path and patch as one mesh, in the game's painted look, drawn over the grass. */
export function buildPathMesh(
  paths: readonly PathSpec[],
  patches: readonly PatchSpec[],
  groundY: GroundY,
): THREE.Mesh {
  const material = createPaintedMaterial(createPathTexture());
  material.transparent = true;
  // It lies on the ground: it must not hide what stands on it, nor fight the grass.
  material.depthWrite = false;
  material.polygonOffset = true;
  material.polygonOffsetFactor = -2;
  material.polygonOffsetUnits = -2;

  const mesh = new THREE.Mesh(buildPathGeometry(paths, patches, groundY), material);
  mesh.name = 'Paths';
  mesh.castShadow = false;
  mesh.receiveShadow = true;
  // Before the other see-through things (there are none yet), after the ground.
  mesh.renderOrder = -1;
  return mesh;
}
