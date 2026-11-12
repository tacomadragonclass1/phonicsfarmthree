import * as THREE from 'three';
import type { Disposable, Updatable, Vec3 } from '../core/contracts';
import { damp } from '../core/math';

/** The bell model's origin is its pivot, so it hangs below this height. */
const DEFAULT_PIVOT_HEIGHT = 1.42;

const FOCUS_SCALE = 1.1;
const FOCUS_SCALE_RATE = 14;

/** Damped swing: decay rate, frequency in Hz, and the time it is cut off at. */
const SWING_AMPLITUDE = 0.5;
const SWING_DECAY = 2.2;
const SWING_HZ = 1.6;
const SWING_CUTOFF = 3;

export interface BellViewOptions {
  /** Bottom centre of the frame. */
  position: Vec3;
  frame: THREE.Object3D;
  bell: THREE.Object3D;
  pivotHeight?: number;
}

/** Draws the bell and its frame. The parts are supplied already built. */
export class BellView implements Updatable, Disposable {
  readonly root = new THREE.Group();
  readonly frame: THREE.Object3D;
  readonly bell: THREE.Object3D;

  private readonly pivotHeight: number;
  private focused = false;
  private scale = 1;
  private swinging = false;
  private time = 0;
  private disposed = false;

  constructor(options: BellViewOptions) {
    this.frame = options.frame;
    this.bell = options.bell;
    this.pivotHeight = options.pivotHeight ?? DEFAULT_PIVOT_HEIGHT;

    this.root.name = 'BellView';
    this.root.add(this.frame);
    this.root.add(this.bell);

    const p = options.position;
    this.root.position.set(p.x, p.y, p.z);
    this.frame.position.set(0, 0, 0);
    this.bell.position.set(0, this.pivotHeight, 0);
  }

  setFocused(on: boolean): void {
    this.focused = on;
  }

  /** Start a swing. Ringing during a swing restarts it at full amplitude. */
  ring(): void {
    this.time = 0;
    this.swinging = true;
  }

  update(dt: number): void {
    if (this.disposed || dt <= 0) return;

    if (this.swinging) {
      this.time += dt;
      if (this.time > SWING_CUTOFF) {
        this.swinging = false;
        this.bell.rotation.z = 0;
      } else {
        const decay = Math.exp(-SWING_DECAY * this.time);
        this.bell.rotation.z = SWING_AMPLITUDE * decay * Math.sin(2 * Math.PI * SWING_HZ * this.time);
      }
    }

    // Only the bell grows, so the frame stays put.
    this.scale = damp(this.scale, this.focused ? FOCUS_SCALE : 1, FOCUS_SCALE_RATE, dt);
    this.bell.scale.setScalar(this.scale);
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.root.removeFromParent();
  }
}
