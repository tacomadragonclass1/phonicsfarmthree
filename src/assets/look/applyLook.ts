import * as THREE from 'three';
import { createPaintedMaterial } from './PaintedMaterial';
import { addOutline } from './InkOutline';

export interface LookOptions {
  outline?: boolean;
}

/**
 * Paints every mapped standard material in a GLTF subtree and gives it an ink
 * hull. Materials with no map (the block's cream letter faces) are left
 * untouched and get no hull: the body mesh carries the block's outline.
 * Idempotent — a second call finds the toon materials already in place.
 */
export function applyLook(root: THREE.Object3D, options: LookOptions = {}): void {
  // Keyed by the source material uuid so meshes sharing a material share the
  // painted one.
  const painted = new Map<string, THREE.MeshToonMaterial>();

  root.traverse((object) => {
    if (!(object instanceof THREE.Mesh)) return;
    if (object.userData.isOutline === true) return;

    const source = object.material;
    if (Array.isArray(source)) return;
    if (!source.isMeshStandardMaterial || !source.map) return;

    let material = painted.get(source.uuid);
    if (material === undefined) {
      material = createPaintedMaterial(source.map);
      // The map is the look; the source tint is still part of it.
      material.color.copy(source.color);
      painted.set(source.uuid, material);
    }

    object.material = material;
    if (options.outline !== false) addOutline(object);
  });
}
