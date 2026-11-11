import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { Layer } from '../src/core/contracts';
import type { ColliderSpec } from '../src/assets/manifest';
import type { StaticOptions } from '../src/physics/PhysicsWorld';
import { staticFromSpec, worldTriangles } from '../src/world/colliders';

function expectOptions(options: StaticOptions | null): StaticOptions {
  if (!options) throw new Error('expected a collider, got null');
  return options;
}

/** A single triangle geometry; callers decide whether to index it. */
function triangle(positions: number[]): THREE.BufferGeometry {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  return geometry;
}

const CORNER = [0, 0, 0, 1, 0, 0, 0, 1, 0];

describe('staticFromSpec', () => {
  it('rotates a box offset by the object world yaw', () => {
    const object = new THREE.Object3D();
    object.position.set(5, 0, 5);
    object.rotation.set(0, Math.PI / 2, 0);
    const spec: ColliderSpec = { kind: 'box', halfExtents: [0.5, 0.5, 0.5], offset: [1, 0, 0] };
    const options = expectOptions(staticFromSpec('crate', spec, object, Layer.World, true));

    // three's own transform is the ground truth for a yaw-only rotation.
    const expected = object.localToWorld(new THREE.Vector3(1, 0, 0));
    expect(options.position.x).toBeCloseTo(expected.x, 10);
    expect(options.position.y).toBeCloseTo(expected.y, 10);
    expect(options.position.z).toBeCloseTo(expected.z, 10);
    expect(options.yaw).toBeCloseTo(Math.PI / 2, 10);
    expect(options.layer).toBe(Layer.World);
    expect(options.blocksCamera).toBe(true);
  });

  it('uses the world yaw from a rotated parent, not the local rotation', () => {
    const parent = new THREE.Group();
    parent.rotation.set(0, Math.PI / 2, 0);
    const child = new THREE.Object3D();
    child.rotation.set(0, Math.PI / 2, 0);
    parent.add(child);
    const spec: ColliderSpec = { kind: 'box', halfExtents: [1, 1, 1], offset: [0, 0, 0] };
    const options = expectOptions(staticFromSpec('child', spec, child, Layer.Block, false));
    expect(options.yaw).toBeCloseTo(Math.PI, 10);
  });

  it('scales box half extents by the world scale', () => {
    const object = new THREE.Object3D();
    object.scale.set(2, 2, 2);
    const spec: ColliderSpec = { kind: 'box', halfExtents: [0.5, 0.25, 1], offset: [0, 1, 0] };
    const options = expectOptions(staticFromSpec('scaled', spec, object, Layer.World, false));
    expect(options.shape).toEqual({ kind: 'box', halfExtents: [1, 0.5, 2] });
    expect(options.position).toEqual({ x: 0, y: 2, z: 0 });
  });

  it('passes cylinder radius and height through at scale 1', () => {
    const object = new THREE.Object3D();
    object.position.set(3, 0.5, -4);
    const spec: ColliderSpec = { kind: 'cylinder', radius: 0.4, height: 1.2, offset: [0, 0.6, 0] };
    const options = expectOptions(staticFromSpec('post', spec, object, Layer.Pedestal, true));
    expect(options.shape).toEqual({ kind: 'cylinder', radius: 0.4, height: 1.2 });
    expect(options.position).toEqual({ x: 3, y: 1.1, z: -4 });
    expect(options.yaw).toBeCloseTo(0, 10);
  });

  it('returns null for kind none', () => {
    expect(staticFromSpec('chuck', { kind: 'none' }, new THREE.Object3D(), Layer.World, false)).toBeNull();
  });

  it('trimesh keeps the world triangles and takes no position or yaw', () => {
    const object = new THREE.Object3D();
    object.position.set(1, 2, 3);
    const mesh = new THREE.Mesh(triangle(CORNER));
    object.add(mesh);
    const options = expectOptions(staticFromSpec('tree', { kind: 'trimesh' }, object, Layer.World, true));
    expect(options.shape.kind).toBe('trimesh');
    expect(options.position).toEqual({ x: 0, y: 0, z: 0 });
    expect(options.yaw).toBeUndefined();
    if (options.shape.kind !== 'trimesh') throw new Error('shape should be trimesh');
    expect(options.shape.vertices.length).toBe(9);
    expect(options.shape.indices).toEqual(new Uint32Array([0, 1, 2]));
  });
});

describe('worldTriangles', () => {
  it('combines an indexed and a non-indexed mesh under a translated parent', () => {
    const parent = new THREE.Group();
    parent.position.set(1, 2, 3);
    const indexed = new THREE.Mesh(triangle(CORNER));
    indexed.geometry.setIndex([0, 2, 1]);
    const plain = new THREE.Mesh(triangle(CORNER));
    parent.add(indexed, plain);

    const { vertices, indices } = worldTriangles(parent);
    expect(vertices.length).toBe(18); // two triangles of three vertices
    expect(indices).toEqual(new Uint32Array([0, 2, 1, 3, 4, 5]));
    // World space: the parent translation is baked into every vertex.
    expect(Array.from(vertices.slice(0, 3))).toEqual([1, 2, 3]);
    expect(Array.from(vertices.slice(3, 6))).toEqual([2, 2, 3]);
    expect(Array.from(vertices.slice(6, 9))).toEqual([1, 3, 3]);
    expect(Array.from(vertices.slice(9, 12))).toEqual([1, 2, 3]);
  });

  it('skips outline meshes', () => {
    const parent = new THREE.Group();
    parent.position.set(1, 2, 3);
    const mesh = new THREE.Mesh(triangle(CORNER));
    const outline = new THREE.Mesh(triangle(CORNER));
    outline.userData.isOutline = true;
    parent.add(mesh, outline);

    const { vertices, indices } = worldTriangles(parent);
    expect(vertices.length).toBe(9);
    expect(indices).toEqual(new Uint32Array([0, 1, 2]));
  });

  it('throws when there are no triangles', () => {
    expect(() => worldTriangles(new THREE.Group())).toThrow();
  });
});
