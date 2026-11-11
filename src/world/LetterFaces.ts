import * as THREE from 'three';
import type { Disposable } from '../core/contracts';
import type { LetterTextureCache } from './LetterTexture';

export const FACE_NAMES = ['Front', 'Right', 'Back', 'Left', 'Top'] as const;
export type FaceName = (typeof FACE_NAMES)[number];

export interface FacePlacement {
  position: [number, number, number];
  /** Euler XYZ, radians. */
  rotation: [number, number, number];
}

export interface FacePlacementOptions {
  /** Distance from the block's centre axis to a face plane, measured on the model. */
  half?: number;
  /** Height of the face centres above the block's bottom centre. */
  centreY?: number;
  /** How far proud of the face the decal sits, to avoid z-fighting. */
  lift?: number;
}

const DEFAULT_HALF = 0.4178;
const DEFAULT_CENTRE_Y = 0.4847;
const DEFAULT_LIFT = 0.002;
const DEFAULT_SIZE = 0.62;

/** Where each letter decal sits, in the block's local space (origin at the bottom centre). */
export function facePlacements(
  options: FacePlacementOptions = {},
): Record<FaceName, FacePlacement> {
  const half = options.half ?? DEFAULT_HALF;
  const centreY = options.centreY ?? DEFAULT_CENTRE_Y;
  const lift = options.lift ?? DEFAULT_LIFT;
  const d = half + lift;
  return {
    Front: { position: [0, centreY, d], rotation: [0, 0, 0] },
    Right: { position: [d, centreY, 0], rotation: [0, Math.PI / 2, 0] },
    Back: { position: [0, centreY, -d], rotation: [0, Math.PI, 0] },
    Left: { position: [-d, centreY, 0], rotation: [0, -Math.PI / 2, 0] },
    // Top's "up" points toward -Z so the letter reads upright to a viewer on
    // the +Z side looking down.
    Top: { position: [0, centreY + d, 0], rotation: [-Math.PI / 2, 0, 0] },
  };
}

/** The five letter decals, sharing one geometry and one material. */
export class LetterFaces implements Disposable {
  readonly group = new THREE.Group();
  private readonly cache: LetterTextureCache;
  private readonly geometry: THREE.PlaneGeometry;
  private readonly material: THREE.MeshBasicMaterial;
  private disposed = false;

  constructor(cache: LetterTextureCache, options: { size?: number } = {}) {
    const size = options.size ?? DEFAULT_SIZE;
    this.cache = cache;
    this.group.name = 'LetterFaces';
    this.geometry = new THREE.PlaneGeometry(size, size);
    this.material = new THREE.MeshBasicMaterial({
      transparent: true,
      // alphaTest keeps the decals out of the sorted transparent pass.
      alphaTest: 0.5,
      depthWrite: false,
      toneMapped: false,
      polygonOffset: true,
      polygonOffsetFactor: -1,
      polygonOffsetUnits: -1,
    });

    const placements = facePlacements();
    for (const name of FACE_NAMES) {
      const mesh = new THREE.Mesh(this.geometry, this.material);
      mesh.name = name;
      const placement = placements[name];
      mesh.position.set(...placement.position);
      mesh.rotation.set(...placement.rotation);
      mesh.castShadow = false;
      mesh.receiveShadow = false;
      mesh.renderOrder = 1;
      this.group.add(mesh);
    }
  }

  setLetter(letter: string): void {
    this.material.map = this.cache.get(letter);
    // A null-to-texture map change needs the shader recompiled.
    this.material.needsUpdate = true;
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    // The cached textures outlive this instance: they are shared by every block.
    this.geometry.dispose();
    this.material.dispose();
  }
}
