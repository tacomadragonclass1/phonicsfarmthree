import * as THREE from 'three';
import type { Disposable, Updatable } from '../core/contracts';

export interface BobberOptions {
  /** Hover height in metres. */
  amplitude?: number;
  /** Hover frequency in Hz. */
  frequency?: number;
  /** Spin in rad/s. */
  spin?: number;
}

/** Makes an Object3D hover and spin to draw attention to it. */
export class Bobber implements Updatable, Disposable {
  private readonly target: THREE.Object3D;
  private readonly amplitude: number;
  private readonly frequency: number;
  private readonly spin: number;
  private readonly baseY: number;
  private readonly baseYaw: number;
  private time = 0;
  private isEnabled = true;
  private disposed = false;

  constructor(target: THREE.Object3D, options: BobberOptions = {}) {
    const amplitude = options.amplitude ?? 0.08;
    const frequency = options.frequency ?? 1.2;
    const spin = options.spin ?? 0.9;
    const opts = [['amplitude', amplitude], ['frequency', frequency], ['spin', spin]] as const;
    for (const [name, value] of opts) {
      if (!Number.isFinite(value) || value < 0) {
        throw new RangeError(`Bobber ${name} must be finite and >= 0, got ${value}`);
      }
    }
    this.target = target;
    this.amplitude = amplitude;
    this.frequency = frequency;
    this.spin = spin;
    this.baseY = target.position.y;
    this.baseYaw = target.rotation.y;
  }

  get enabled(): boolean {
    return this.isEnabled;
  }

  set enabled(value: boolean) {
    this.isEnabled = value;
    if (!value) {
      this.time = 0;
      this.restore();
    }
  }

  update(dt: number): void {
    if (this.disposed || !this.isEnabled) return;
    this.time += dt;
    this.target.position.y = this.baseY + this.amplitude * Math.sin(2 * Math.PI * this.frequency * this.time);
    // Yaw is world space: the bobbed node is a direct child of the world root,
    // so its local rotation.y is its world yaw.
    this.target.rotation.y = this.baseYaw + this.spin * this.time;
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.restore();
  }

  private restore(): void {
    this.target.position.y = this.baseY;
    this.target.rotation.y = this.baseYaw;
  }
}
