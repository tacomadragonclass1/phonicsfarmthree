import * as THREE from 'three';
import type { Disposable, Updatable, Vec3 } from '../core/contracts';
import { damp } from '../core/math';

/** Yaw the leaf swings to, and the rate it is eased at. */
const OPEN_YAW = -1.75;
const OPEN_RATE = 3;

export interface GateViewOptions {
  /** The hinge post, in world coordinates. */
  hinge: Vec3;
  /** A fence run whose vertices are baked in world coordinates. */
  mesh: THREE.Object3D;
}

/**
 * The gate leaf. `root` sits at the hinge so turning it about Y swings the leaf;
 * the mesh's world-space vertices are offset by -hinge, so at yaw 0 the leaf is
 * exactly where it was built.
 */
export class GateView implements Updatable, Disposable {
  readonly root = new THREE.Group();
  readonly mesh: THREE.Object3D;

  private opened = false;
  private yaw = 0;
  private disposed = false;

  /** True once `open` has been called. */
  get isOpen(): boolean {
    return this.opened;
  }

  constructor(options: GateViewOptions) {
    this.mesh = options.mesh;
    const hinge = options.hinge;

    this.root.name = 'GateView';
    this.root.position.set(hinge.x, hinge.y, hinge.z);
    this.mesh.position.set(-hinge.x, -hinge.y, -hinge.z);
    this.root.add(this.mesh);
  }

  open(): void {
    if (this.disposed) return;
    this.opened = true;
  }

  update(dt: number): void {
    if (this.disposed || dt <= 0) return;
    this.yaw = damp(this.yaw, this.isOpen ? OPEN_YAW : 0, OPEN_RATE, dt);
    this.root.rotation.y = this.yaw;
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.root.removeFromParent();
  }
}
