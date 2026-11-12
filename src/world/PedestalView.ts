import * as THREE from 'three';
import type { Disposable, PedestalState, Updatable } from '../core/contracts';
import { damp } from '../core/math';

const POST_Y = 0.25;
const CAP_Y = 0.56;

/** How far the focused cap lifts above its rest height. */
const CAP_RISE = 0.05;

const PULSE_HZ = 1.4;
const PULSE_AMPLITUDE = 0.06;

/** Rate that puts the cap ~95% of the way back to rest in 0.15 s. */
const SETTLE_RATE = 20;

export interface PedestalViewOptions {
  state: PedestalState;
  post: THREE.Object3D;
  cap: THREE.Object3D;
}

/** Draws one pedestal stump. The parts are supplied already built. */
export class PedestalView implements Updatable, Disposable {
  readonly root = new THREE.Group();
  readonly post: THREE.Object3D;
  readonly cap: THREE.Object3D;

  private focused = false;
  private phase = 0;
  private capY = CAP_Y;
  private scale = 1;
  private disposed = false;

  constructor(options: PedestalViewOptions) {
    this.post = options.post;
    this.cap = options.cap;

    this.root.name = 'PedestalView';
    this.root.add(this.post);
    this.root.add(this.cap);

    const p = options.state.position;
    this.root.position.set(p.x, p.y, p.z);
    this.post.position.set(0, POST_Y, 0);
    this.cap.position.set(0, CAP_Y, 0);
  }

  setFocused(on: boolean): void {
    this.focused = on;
    // Unfocused starts settling from wherever the pulse currently is.
    if (!on) this.phase = 0;
  }

  update(dt: number): void {
    if (this.disposed || dt <= 0) return;

    this.capY = damp(this.capY, CAP_Y + (this.focused ? CAP_RISE : 0), SETTLE_RATE, dt);
    this.cap.position.y = this.capY;

    if (this.focused) {
      // Starts at scale 1.0 and reaches 1.06 at half a period, so the pulse
      // never jumps when focus turns on.
      this.phase += 2 * Math.PI * PULSE_HZ * dt;
      this.scale = 1 + PULSE_AMPLITUDE * (0.5 - 0.5 * Math.cos(this.phase));
    } else {
      this.scale = damp(this.scale, 1, SETTLE_RATE, dt);
    }
    this.cap.scale.set(this.scale, this.scale, this.scale);
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.root.removeFromParent();
  }
}
