import * as THREE from 'three';
import type { ColliderSpec } from '../assets/manifest';
import type { StaticOptions } from '../physics/PhysicsWorld';

/** Flatten every Mesh under `object` into world-space triangles. */
export function worldTriangles(object: THREE.Object3D): { vertices: Float32Array; indices: Uint32Array } {
  object.updateWorldMatrix(true, true);
  const vertices: number[] = [];
  const indices: number[] = [];
  const point = new THREE.Vector3();

  object.traverse((node) => {
    if (!(node instanceof THREE.Mesh)) return;
    if (node.userData.isOutline) return; // outline meshes are visual, not physical
    const position = node.geometry.getAttribute('position');
    if (!position) return;
    // Indices from a later mesh must point at its own vertices, so offset by
    // the vertices already collected.
    const base = vertices.length / 3;
    for (let i = 0; i < position.count; i++) {
      point.fromBufferAttribute(position, i).applyMatrix4(node.matrixWorld);
      vertices.push(point.x, point.y, point.z);
    }
    if (node.geometry.index) {
      for (let i = 0; i < node.geometry.index.count; i++) indices.push(base + node.geometry.index.array[i]);
    } else {
      for (let i = 0; i < position.count; i++) indices.push(base + i);
    }
  });

  if (indices.length === 0) throw new Error(`worldTriangles: no triangles under ${object.name || 'object'}`);
  return { vertices: new Float32Array(vertices), indices: new Uint32Array(indices) };
}

/**
 * Build the physics description for one placed model.
 * @param id       entity id
 * @param spec     the model's ColliderSpec from the manifest
 * @param object   the placed scene object (already positioned/rotated in the world)
 * @param layer    Layer.* value
 * @param blocksCamera from the manifest
 * @returns null when spec.kind is 'none'
 */
export function staticFromSpec(
  id: string,
  spec: ColliderSpec,
  object: THREE.Object3D,
  layer: number,
  blocksCamera: boolean,
): StaticOptions | null {
  object.updateWorldMatrix(true, true);
  if (spec.kind === 'none') return null;

  if (spec.kind === 'trimesh') {
    // Vertices are already world space, so the shape carries no position or yaw.
    return { id, shape: { kind: 'trimesh', ...worldTriangles(object) }, position: { x: 0, y: 0, z: 0 }, layer, blocksCamera };
  }

  const worldPosition = object.getWorldPosition(new THREE.Vector3());
  const worldScale = object.getWorldScale(new THREE.Vector3());
  // World yaw, not the local rotation of a node whose parent may be rotated.
  const yaw = new THREE.Euler().setFromQuaternion(object.getWorldQuaternion(new THREE.Quaternion()), 'YXZ').y;

  // The spec's offset is in the model's local space: turn it by the world yaw
  // (no tilt assumed) and scale it.
  const offset = new THREE.Vector3(spec.offset[0], spec.offset[1], spec.offset[2]);
  offset.applyEuler(new THREE.Euler(0, yaw, 0, 'YXZ'));
  offset.multiply(worldScale);

  const centre = { x: worldPosition.x + offset.x, y: worldPosition.y + offset.y, z: worldPosition.z + offset.z };

  if (spec.kind === 'box') {
    const [hx, hy, hz] = spec.halfExtents;
    return { id, shape: { kind: 'box', halfExtents: [hx * worldScale.x, hy * worldScale.y, hz * worldScale.z] }, position: centre, yaw, layer, blocksCamera };
  }

  return {
    id,
    shape: { kind: 'cylinder', radius: spec.radius * worldScale.x, height: spec.height * worldScale.y },
    position: centre,
    yaw,
    layer,
    blocksCamera,
  };
}
