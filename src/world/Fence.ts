import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { StaticOptions } from '../physics/PhysicsWorld';

export interface FencePoint {
  x: number;
  z: number;
}

export interface FenceOptions {
  picketSpacing?: number;
  picketWidth?: number;
  picketDepth?: number;
  picketHeight?: number;
  /** Metres between the thicker posts. */
  postEvery?: number;
  railHeights?: [number, number];
}

const DEFAULTS: Required<FenceOptions> = {
  picketSpacing: 0.28,
  picketWidth: 0.16,
  picketDepth: 0.05,
  picketHeight: 0.95,
  postEvery: 2.0,
  railHeights: [0.32, 0.68],
};

/** Pieces are sunk into the ground so the bottom edge never floats. */
const SINK = 0.05;
const POST_WIDTH = 0.2;
const POST_RISE = 0.1;
const RAIL_HEIGHT = 0.07;
const RAIL_DEPTH = 0.04;
/** Cap: radius and height, radius as a fraction of the picket width. */
const CAP_RADIUS = 0.62;
const CAP_HEIGHT = 0.14;
/**
 * Colliders are thicker than the boards so a ray crossing the fence hits, and far
 * taller than the pickets so a jump (even one taken from on top of a block) cannot clear it.
 */
const COLLIDER_HALF_HEIGHT = 1.5;
const COLLIDER_HALF_DEPTH = 0.12;
const MAX_COLLIDER_PIECE = 2;

const EPS = 1e-9;
const UP = new THREE.Vector3(0, 1, 0);
const UNIT_X = new THREE.Vector3(1, 0, 0);
const ONE = new THREE.Vector3(1, 1, 1);

interface Segment {
  ax: number;
  az: number;
  bx: number;
  bz: number;
  length: number;
  /** World yaw of the direction of travel: yaw = atan2(dx, dz). */
  yaw: number;
  /** Distance along the path where this segment starts. */
  start: number;
}

/** A picket or post placed on the path. `distance` is where it sits along the run. */
interface Node {
  x: number;
  z: number;
  ground: number;
  yaw: number;
  post: boolean;
  distance: number;
}

function segments(path: readonly FencePoint[]): Segment[] {
  const out: Segment[] = [];
  let start = 0;
  for (let i = 0; i + 1 < path.length; i++) {
    const a = path[i];
    const b = path[i + 1];
    const dx = b.x - a.x;
    const dz = b.z - a.z;
    const length = Math.hypot(dx, dz);
    if (length < EPS) continue;
    out.push({ ax: a.x, az: a.z, bx: b.x, bz: b.z, length, yaw: Math.atan2(dx, dz), start });
    start += length;
  }
  return out;
}

/** Yaw that puts a box's local X along the segment. */
function yawAlongSegment(yaw: number): number {
  return yaw - Math.PI / 2;
}

function transform(position: THREE.Vector3, quaternion: THREE.Quaternion, scale: THREE.Vector3): THREE.Matrix4 {
  return new THREE.Matrix4().compose(position, quaternion, scale);
}

/** Clone so the shared base geometry is not transformed twice. */
function piece(geometry: THREE.BufferGeometry, matrix: THREE.Matrix4): THREE.BufferGeometry {
  const clone = geometry.clone();
  clone.applyMatrix4(matrix);
  // Box and cone only merge when both are non-indexed.
  return clone.toNonIndexed();
}

/** Every picket spacing plus every path vertex, in order along the path. */
function nodes(path: readonly FencePoint[], groundY: (x: number, z: number) => number, opts: Required<FenceOptions>): Node[] {
  const segs = segments(path);
  if (segs.length === 0) throw new Error('Fence: path needs at least two points');
  const total = segs[segs.length - 1].start + segs[segs.length - 1].length;

  const distances: number[] = [];
  for (let k = 0; k * opts.picketSpacing <= total + EPS; k++) distances.push(k * opts.picketSpacing);
  for (const seg of segs) distances.push(seg.start);
  distances.push(total);
  distances.sort((a, b) => a - b);

  const out: Node[] = [];
  for (const d of distances) {
    if (out.length > 0 && Math.abs(d - out[out.length - 1].distance) < EPS) continue;
    const seg = segs.find((s) => d <= s.start + s.length + EPS) ?? segs[segs.length - 1];
    const t = (d - seg.start) / seg.length;
    const x = seg.ax + (seg.bx - seg.ax) * t;
    const z = seg.az + (seg.bz - seg.az) * t;
    const atVertex = segs.some((s) => Math.abs(d - s.start) < EPS) || Math.abs(d - total) < EPS;
    const nearestPost = Math.round(d / opts.postEvery) * opts.postEvery;
    out.push({ x, z, ground: groundY(x, z), yaw: seg.yaw, post: atVertex || Math.abs(d - nearestPost) < EPS, distance: d });
  }
  return out;
}

/** One merged mesh for a run of fence along `path`, following the ground. */
export function buildFenceMesh(
  path: readonly FencePoint[],
  groundY: (x: number, z: number) => number,
  options?: FenceOptions,
): THREE.Mesh {
  const opts: Required<FenceOptions> = { ...DEFAULTS, ...options };
  const placed = nodes(path, groundY, opts);

  const picketBox = new THREE.BoxGeometry(opts.picketWidth, opts.picketHeight, opts.picketDepth);
  const cap = new THREE.ConeGeometry(opts.picketWidth * CAP_RADIUS, CAP_HEIGHT, 4);
  const postBox = new THREE.BoxGeometry(POST_WIDTH, opts.picketHeight + POST_RISE, POST_WIDTH);
  const unitBox = new THREE.BoxGeometry(1, 1, 1);
  const parts: THREE.BufferGeometry[] = [];

  for (const n of placed) {
    const bottom = n.ground - SINK;
    const yaw = yawAlongSegment(n.yaw);
    const quaternion = new THREE.Quaternion().setFromAxisAngle(UP, yaw);
    if (n.post) {
      const height = opts.picketHeight + POST_RISE;
      parts.push(piece(postBox, transform(new THREE.Vector3(n.x, bottom + height / 2, n.z), quaternion, ONE)));
      continue;
    }

    parts.push(piece(picketBox, transform(new THREE.Vector3(n.x, bottom + opts.picketHeight / 2, n.z), quaternion, ONE)));
    // The cap is turned 45 degrees before the picket's own rotation so a flat
    // face points across the fence.
    const centre = new THREE.Vector3(n.x, bottom + opts.picketHeight + CAP_HEIGHT / 2, n.z);
    parts.push(piece(cap, transform(centre, new THREE.Quaternion().setFromAxisAngle(UP, yaw + Math.PI / 4), ONE)));
  }

  for (let i = 0; i + 1 < placed.length; i++) {
    const a = placed[i];
    const b = placed[i + 1];
    for (const railHeight of opts.railHeights) {
      const from = new THREE.Vector3(a.x, a.ground + railHeight, a.z);
      const to = new THREE.Vector3(b.x, b.ground + railHeight, b.z);
      const direction = to.clone().sub(from);
      const length = direction.length();
      if (length < EPS) continue;
      // lookAt-style: the unit box's local X is stretched from A to B, so the
      // rail slopes with the hill.
      const quaternion = new THREE.Quaternion().setFromUnitVectors(UNIT_X, direction.normalize());
      const centre = from.clone().add(to).multiplyScalar(0.5);
      parts.push(piece(unitBox, transform(centre, quaternion, new THREE.Vector3(length, RAIL_HEIGHT, RAIL_DEPTH))));
    }
  }

  for (const geometry of [picketBox, cap, postBox, unitBox]) geometry.dispose();

  const mesh = new THREE.Mesh(mergeGeometries(parts), createFenceMaterial());
  mesh.name = 'Fence';
  return mesh;
}

/** Box colliders for the same run, one per ~2 m piece. */
export function fenceColliders(
  idPrefix: string,
  path: readonly FencePoint[],
  groundY: (x: number, z: number) => number,
  layer: number,
): StaticOptions[] {
  const out: StaticOptions[] = [];
  for (const seg of segments(path)) {
    const pieces = Math.max(1, Math.ceil(seg.length / MAX_COLLIDER_PIECE));
    const pieceLength = seg.length / pieces;
    for (let i = 0; i < pieces; i++) {
      const t = (i + 0.5) / pieces;
      const x = seg.ax + (seg.bx - seg.ax) * t;
      const z = seg.az + (seg.bz - seg.az) * t;
      out.push({
        id: `${idPrefix}-${out.length}`,
        shape: { kind: 'box', halfExtents: [pieceLength / 2, COLLIDER_HALF_HEIGHT, COLLIDER_HALF_DEPTH] },
        position: { x, y: groundY(x, z) + COLLIDER_HALF_HEIGHT, z },
        yaw: yawAlongSegment(seg.yaw),
        layer,
        blocksCamera: false,
      });
    }
  }
  return out;
}

/** Warm white fence paint: a small per-texel variation, no mipmapping. */
export function createFenceMaterial(): THREE.MeshStandardMaterial {
  const size = 4;
  const data = new Uint8Array(size * size * 4);
  for (let i = 0; i < size * size; i++) {
    const n = (i * 7) % 11;
    data[i * 4] = 244 - n;
    data[i * 4 + 1] = 236 - n;
    data[i * 4 + 2] = 220 - Math.floor(n / 2);
    data[i * 4 + 3] = 255;
  }

  const map = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
  map.colorSpace = THREE.SRGBColorSpace;
  map.magFilter = THREE.LinearFilter;
  map.minFilter = THREE.LinearFilter;
  map.needsUpdate = true;

  return new THREE.MeshStandardMaterial({ map, roughness: 1 });
}
