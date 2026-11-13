import { Emitter } from '../core/Emitter';
import type { EventSource, GuideEvents, Unsubscribe } from '../core/contracts';
import { yawFromDirection } from '../core/math';

export interface GuidePoint {
  x: number;
  z: number;
}

export interface GuideOptions {
  /** At least one point. She starts standing on the first. */
  path: readonly GuidePoint[];
  speed?: number;
  /** She stops and waits when the follower is further than this behind her. */
  waitDistance?: number;
  /** ...and sets off again once the follower is within this. */
  resumeDistance?: number;
}

/**
 * A guide who walks a path and waits for the player. Horizontal only: y is
 * not hers to know, so nothing here needs the physics world.
 */
export class Guide implements EventSource<GuideEvents> {
  private readonly path: readonly GuidePoint[];
  private readonly speed: number;
  private readonly waitDistance: number;
  private readonly resumeDistance: number;
  private readonly emitter = new Emitter<GuideEvents>();

  /** Index of the point she is walking toward; past the last one means she is done. */
  private nextIndex: number;
  private isLeading = false;
  private isArrived = false;
  private isWaiting = false;

  /** Horizontal position; y is not hers to know. */
  readonly position: GuidePoint;
  private yawValue = 0;
  private movingValue = false;

  /** World yaw she faces: direction of travel, or toward the follower while waiting. */
  get yaw(): number {
    return this.yawValue;
  }

  /** True while her feet are moving this step. */
  get moving(): boolean {
    return this.movingValue;
  }

  constructor(options: GuideOptions) {
    if (options.path.length === 0) throw new Error('Guide needs at least one path point');
    this.path = options.path;
    this.speed = options.speed ?? 2.6;
    this.waitDistance = options.waitDistance ?? 5;
    this.resumeDistance = options.resumeDistance ?? 3;
    this.position = { x: options.path[0].x, z: options.path[0].z };
    this.nextIndex = 1;
  }

  get leading(): boolean {
    return this.isLeading;
  }

  get arrived(): boolean {
    return this.isArrived;
  }

  /** Start walking the path. Does nothing if already leading or arrived. */
  lead(): void {
    if (this.isLeading || this.isArrived) return;
    this.isLeading = true;
  }

  /** Advance by dt. `follower` is the player's position. */
  step(dt: number, follower: GuidePoint): void {
    if (!this.isLeading) return;

    let gap = Math.hypot(follower.x - this.position.x, follower.z - this.position.z);
    // A child who runs on ahead is not left behind: if he is nearer to the end of
    // the walk than she is, she keeps walking instead of waiting for him to come back.
    // Measured to the end, not the next corner: he may be several corners ahead.
    const target = this.path[this.path.length - 1];
    const herDistance = Math.hypot(target.x - this.position.x, target.z - this.position.z);
    const hisDistance = Math.hypot(target.x - follower.x, target.z - follower.z);
    if (hisDistance < herDistance) gap = 0;
    if (this.isWaiting) {
      if (gap >= this.resumeDistance) {
        this.face(follower);
        this.movingValue = false;
        return;
      }
      this.isWaiting = false;
    } else if (gap > this.waitDistance) {
      this.isWaiting = true;
      this.face(follower);
      this.movingValue = false;
      return;
    }

    this.movingValue = this.walk(dt);
    if (this.nextIndex >= this.path.length) this.arrive(follower);
  }

  on<K extends keyof GuideEvents>(event: K, listener: (payload: GuideEvents[K]) => void): Unsubscribe {
    return this.emitter.on(event, listener);
  }

  /** Walks up to speed * dt, carrying a step that passes a point on to the next segment. */
  private walk(dt: number): boolean {
    let remaining = this.speed * dt;
    let moved = false;

    while (remaining > 0 && this.nextIndex < this.path.length) {
      const point = this.path[this.nextIndex];
      const dx = point.x - this.position.x;
      const dz = point.z - this.position.z;
      const length = Math.hypot(dx, dz);
      // A repeated point has no direction to face, so it is simply stepped over.
      if (length === 0) {
        this.nextIndex += 1;
        continue;
      }

      if (remaining >= length) {
        // Snap to the point so the walk does not drift across segments.
        this.position.x = point.x;
        this.position.z = point.z;
        remaining -= length;
        this.nextIndex += 1;
      } else {
        this.position.x += (dx / length) * remaining;
        this.position.z += (dz / length) * remaining;
        remaining = 0;
      }

      this.yawValue = yawFromDirection(dx, dz);
      moved = true;
    }

    return moved;
  }

  private arrive(follower: GuidePoint): void {
    this.isLeading = false;
    this.isArrived = true;
    this.movingValue = false;
    this.face(follower);
    this.emitter.emit('arrived');
  }

  private face(follower: GuidePoint): void {
    const dx = follower.x - this.position.x;
    const dz = follower.z - this.position.z;
    // Standing on top of the follower gives no direction; keep the last one.
    if (dx === 0 && dz === 0) return;
    this.yawValue = yawFromDirection(dx, dz);
  }
}
