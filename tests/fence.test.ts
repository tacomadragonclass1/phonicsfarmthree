import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { Layer } from '../src/core/contracts';
import { PhysicsWorld } from '../src/physics/PhysicsWorld';
import { buildFenceMesh, createFenceMaterial, fenceColliders, type FencePoint } from '../src/world/Fence';

const FLAT = () => 0;

/** A straight run of `length` metres from the origin along one axis. */
function run(axis: 'x' | 'z', length: number): FencePoint[] {
  const end = axis === 'x' ? { x: length, z: 0 } : { x: 0, z: length };
  return [{ x: 0, z: 0 }, end];
}

function bounds(mesh: THREE.Mesh): THREE.Box3 {
  return new THREE.Box3().setFromObject(mesh);
}

function halfSpan(box: THREE.Box3, axis: 'x' | 'y' | 'z'): number {
  return Math.max(Math.abs(box.min[axis]), Math.abs(box.max[axis]));
}

/** Span across the run, measured on the pickets between the square end posts. */
function acrossSpan(mesh: THREE.Mesh, along: 'x' | 'z'): number {
  const alongIndex = along === 'x' ? 0 : 2;
  const acrossIndex = along === 'x' ? 2 : 0;
  const array = mesh.geometry.getAttribute('position').array;
  let min = Infinity;
  let max = -Infinity;
  for (let i = 0; i < array.length / 3; i++) {
    const distance = array[i * 3 + alongIndex];
    if (distance < 0.5 || distance > 3.5) continue;
    const across = array[i * 3 + acrossIndex];
    if (across < min) min = across;
    if (across > max) max = across;
  }
  return max - min;
}

describe('buildFenceMesh', () => {
  it('spans a 4 m run along +X and is thin across it', () => {
    const mesh = buildFenceMesh(run('x', 4), FLAT);
    expect(mesh.name).toBe('Fence');
    expect(mesh.position.x).toBe(0); // vertices are already world space
    const box = bounds(mesh);

    expect(box.min.x).toBeCloseTo(-0.1, 1);
    expect(box.max.x).toBeCloseTo(4.1, 1);
    expect(box.min.y).toBeCloseTo(-0.05, 1);
    expect(box.max.y).toBeGreaterThan(1.0);
    expect(box.max.y).toBeLessThan(1.15);
    expect(halfSpan(box, 'z')).toBeLessThan(0.15);
  });

  it('is thin in x for the same run along +Z', () => {
    const box = bounds(buildFenceMesh(run('z', 4), FLAT));
    expect(box.min.z).toBeCloseTo(-0.1, 1);
    expect(box.max.z).toBeCloseTo(4.1, 1);
    expect(halfSpan(box, 'x')).toBeLessThan(0.15);
  });

  // The 0.2 posts are square, so the bounding box alone cannot show which way
  // the pickets face: measured between the end posts, a swapped width/depth
  // would span the 0.16 picket width across the run instead of 0.14.
  it('turns the picket wide face across the run', () => {
    const noPosts = { postEvery: 20 };
    expect(acrossSpan(buildFenceMesh(run('x', 4), FLAT, noPosts), 'x')).toBeLessThan(0.15);
    expect(acrossSpan(buildFenceMesh(run('z', 4), FLAT, noPosts), 'z')).toBeLessThan(0.15);
  });

  it('pickets follow sloping ground', () => {
    const box = bounds(buildFenceMesh(run('x', 4), (x) => x * 0.5));
    expect(box.min.y).toBeCloseTo(-0.05, 1);
    expect(box.max.y).toBeGreaterThan(2.5);
  });

  it('has a painted map', () => {
    const material = createFenceMaterial();
    expect(material.map).not.toBeNull();
    expect(material.map?.colorSpace).toBe(THREE.SRGBColorSpace);
  });
});

describe('fenceColliders', () => {
  it('splits a 5 m run into three pieces that block across the fence', async () => {
    const colliders = fenceColliders('f', run('x', 5), FLAT, Layer.World);
    expect(colliders.map((c) => c.id)).toEqual(['f-0', 'f-1', 'f-2']);
    const halfX = colliders.reduce((sum, c) => sum + (c.shape.kind === 'box' ? c.shape.halfExtents[0] : 0), 0);
    expect(halfX).toBeCloseTo(2.5, 10);
    // A run along +X needs yaw 0 for a box that is long in X.
    expect(colliders[0].yaw).toBeCloseTo(0, 10);

    const world = await PhysicsWorld.create();
    for (const c of colliders) world.addStatic(c);
    expect(world.canReach({ x: 2.5, y: 0.5, z: -1 }, { x: 2.5, y: 0.5, z: 1 })).toBe(false);
    expect(world.canReach({ x: 0.5, y: 0.5, z: 1 }, { x: 4.5, y: 0.5, z: 1 })).toBe(true);
    world.dispose();
  });

  it('blocks a ray crossing a run along +Z', async () => {
    const colliders = fenceColliders('z', run('z', 5), FLAT, Layer.World);
    const world = await PhysicsWorld.create();
    for (const c of colliders) world.addStatic(c);
    expect(world.canReach({ x: -1, y: 0.5, z: 2.5 }, { x: 1, y: 0.5, z: 2.5 })).toBe(false);
    world.dispose();
  });
});
