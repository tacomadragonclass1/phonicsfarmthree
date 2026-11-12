import * as THREE from 'three';
import type { Disposable, Updatable, Vec3 } from '../core/contracts';
import { PlayerTuning } from '../core/contracts';
import { clamp, dampAngle, lerp, wrapAngle } from '../core/math';

/** Seconds the idle/walk cross-fade takes. */
const CROSSFADE = 0.15;
const DEFAULT_CARRY_OFFSET: [number, number, number] = [0, 0.9, 0.7];

export interface CharacterViewOptions {
  model: THREE.Object3D;
  clips: ReadonlyMap<string, THREE.AnimationClip>;
  carryOffset?: [number, number, number];
}

/** Draws a character. Yaw is world space, so `root` must be a direct child of the scene. */
export class CharacterView implements Updatable, Disposable {
  readonly root = new THREE.Group();
  /** Where a carried block hangs: hands, a little ahead of the chest. */
  readonly carryAnchor = new THREE.Object3D();
  /** Public so tests can read blend weights without reaching into privates. */
  readonly mixer: THREE.AnimationMixer;
  private readonly idle: THREE.AnimationAction;
  private readonly walk: THREE.AnimationAction;
  private moving = false;
  private facing = 0;
  private facingTarget = 0;
  private facingSet = false;
  private disposed = false;

  constructor(options: CharacterViewOptions) {
    const idleClip = options.clips.get('idle');
    if (!idleClip) throw new Error('CharacterView is missing clip "idle"');
    const walkClip = options.clips.get('walk');
    if (!walkClip) throw new Error('CharacterView is missing clip "walk"');

    this.root.name = 'CharacterView';
    this.carryAnchor.name = 'CarryAnchor';
    const offset = options.carryOffset ?? DEFAULT_CARRY_OFFSET;
    this.carryAnchor.position.set(offset[0], offset[1], offset[2]);
    this.root.add(options.model);
    this.root.add(this.carryAnchor);

    this.mixer = new THREE.AnimationMixer(options.model);
    this.idle = this.mixer.clipAction(idleClip);
    this.walk = this.mixer.clipAction(walkClip);
    this.idle.play();
    this.walk.play();
    // Both actions stay active so a fade can run on either; the pose that is
    // not wanted is held at zero weight rather than stopped.
    this.walk.enabled = false;
  }

  /** Two physics states plus the frame's blend factor: the drawn pose sits between them. */
  setPose(prev: Vec3, curr: Vec3, alpha: number): void {
    const t = clamp(alpha, 0, 1);
    this.root.position.set(lerp(prev.x, curr.x, t), lerp(prev.y, curr.y, t), lerp(prev.z, curr.z, t));
  }

  setFacing(yaw: number): void {
    this.facingTarget = wrapAngle(yaw);
    // The first facing snaps: a character should not swing round when it spawns.
    if (!this.facingSet) {
      this.facingSet = true;
      this.facing = this.facingTarget;
      this.root.rotation.y = this.facing;
    }
  }

  setMoving(moving: boolean): void {
    if (moving === this.moving) return;
    this.moving = moving;
    const fadingOut = moving ? this.idle : this.walk;
    const fadingIn = moving ? this.walk : this.idle;
    fadingOut.fadeOut(CROSSFADE);
    fadingIn.enabled = true;
    fadingIn.fadeIn(CROSSFADE);
  }

  update(frameDt: number): void {
    this.mixer.update(frameDt);
    if (this.facingSet) {
      this.facing = dampAngle(this.facing, this.facingTarget, PlayerTuning.turnRate, frameDt);
      this.root.rotation.y = this.facing;
    }
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.mixer.stopAllAction();
    this.root.removeFromParent();
  }
}
