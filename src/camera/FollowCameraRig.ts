import type { CameraProbe, Vec3 } from '../core/contracts';
import { clamp, damp, dampAngle, wrapAngle } from '../core/math';

export interface FollowCameraOptions {
  distance?: number;
  minDistance?: number;
  /** Radians down from horizontal. */
  pitch?: number;
  /** Height above the target's feet the camera looks at. */
  lookHeight?: number;
  lead?: number;
  leadRate?: number;
  fullSpeed?: number;
  deadzone?: number;
  followRate?: number;
  /** World yaw the camera looks along when the stick is idle. */
  homeYaw?: number;
  yawRange?: number;
  yawSpeed?: number;
  yawHomeDelay?: number;
  yawHomeRate?: number;
  probeRadius?: number;
  pullInRate?: number;
  pushOutRate?: number;
  probe?: CameraProbe;
}

export interface CameraPose {
  position: Vec3;
  lookAt: Vec3;
  yaw: number;
  distance: number;
}

/** Rate the home yaw eases toward its target; not a tunable feel value. */
const HOME_YAW_RATE = 1.5;

const finite = (v: number) => Number.isFinite(v);
const nonNegative = (v: number) => finite(v) && v >= 0;
const positive = (v: number) => finite(v) && v > 0;

/**
 * Where the camera should be and what it should look at. Pure maths: it has no
 * idea about rendering, so gameplay can ask for a pose without a scene.
 */
export class FollowCameraRig {
  private readonly opts: Required<Omit<FollowCameraOptions, 'probe'>>;
  private readonly probe: CameraProbe | null;

  private homeYaw: number;
  private homeYawTarget: number;
  private offset = 0;
  private idleTime = 0;
  private currentDistance = 0;
  private started = false;

  private readonly focus: Vec3 = { x: 0, y: 0, z: 0 };
  private readonly leadVec: Vec3 = { x: 0, y: 0, z: 0 };
  readonly pose: CameraPose = {
    position: { x: 0, y: 0, z: 0 },
    lookAt: { x: 0, y: 0, z: 0 },
    yaw: 0,
    distance: 0,
  };

  constructor(options: FollowCameraOptions = {}) {
    const opts: Required<Omit<FollowCameraOptions, 'probe'>> = {
      distance: options.distance ?? 11,
      minDistance: options.minDistance ?? 3.5,
      pitch: options.pitch ?? (24 * Math.PI) / 180,
      lookHeight: options.lookHeight ?? 1.0,
      lead: options.lead ?? 1.6,
      leadRate: options.leadRate ?? 4,
      fullSpeed: options.fullSpeed ?? 6.4,
      deadzone: options.deadzone ?? 0.35,
      followRate: options.followRate ?? 7.5,
      homeYaw: options.homeYaw ?? 0,
      yawRange: options.yawRange ?? (55 * Math.PI) / 180,
      yawSpeed: options.yawSpeed ?? 1.6,
      yawHomeDelay: options.yawHomeDelay ?? 2.5,
      yawHomeRate: options.yawHomeRate ?? 2.0,
      probeRadius: options.probeRadius ?? 0.3,
      pullInRate: options.pullInRate ?? 12.5,
      pushOutRate: options.pushOutRate ?? 1.67,
    };
    const rules: Array<[string, number, (value: number) => boolean]> = [
      ['distance', opts.distance, positive],
      ['minDistance', opts.minDistance, (v) => nonNegative(v) && v <= opts.distance],
      ['pitch', opts.pitch, (v) => finite(v) && v > 0 && v < Math.PI / 2],
      ['lookHeight', opts.lookHeight, nonNegative],
      ['lead', opts.lead, nonNegative],
      ['leadRate', opts.leadRate, nonNegative],
      ['fullSpeed', opts.fullSpeed, positive],
      ['deadzone', opts.deadzone, nonNegative],
      ['followRate', opts.followRate, nonNegative],
      ['homeYaw', opts.homeYaw, finite],
      ['yawRange', opts.yawRange, nonNegative],
      ['yawSpeed', opts.yawSpeed, nonNegative],
      ['yawHomeDelay', opts.yawHomeDelay, nonNegative],
      ['yawHomeRate', opts.yawHomeRate, nonNegative],
      ['probeRadius', opts.probeRadius, positive],
      ['pullInRate', opts.pullInRate, nonNegative],
      ['pushOutRate', opts.pushOutRate, nonNegative],
    ];
    for (const [name, value, ok] of rules) {
      if (!ok(value)) throw new RangeError(`FollowCameraRig ${name} is out of range, got ${value}`);
    }
    this.opts = opts;
    this.probe = options.probe ?? null;
    this.homeYaw = wrapAngle(opts.homeYaw);
    this.homeYawTarget = this.homeYaw;
  }

  /** World yaw of screen up: the direction a push up the screen walks. */
  get forwardYaw(): number {
    return this.pose.yaw;
  }

  snap(target: Vec3): void {
    this.focus.x = target.x;
    this.focus.y = target.y;
    this.focus.z = target.z;
    this.leadVec.x = 0;
    this.leadVec.y = 0;
    this.leadVec.z = 0;
    this.offset = 0;
    this.idleTime = 0;
    this.currentDistance = this.opts.distance;
    this.started = true;
    this.pose.yaw = wrapAngle(this.homeYaw);
    this.setLookAt();
    this.placeAt(this.currentDistance);
    this.pose.distance = this.currentDistance;
  }

  update(target: Vec3, velocity: Vec3, yawInput: number, dt: number): CameraPose {
    const opts = this.opts;
    if (!this.started) this.snap(target);

    const speed = Math.hypot(velocity.x, velocity.z);
    if (speed > 0.5) {
      const scale = (opts.lead * Math.min(speed / opts.fullSpeed, 1)) / speed;
      this.leadVec.x = damp(this.leadVec.x, velocity.x * scale, opts.leadRate, dt);
      this.leadVec.z = damp(this.leadVec.z, velocity.z * scale, opts.leadRate, dt);
    } else {
      this.leadVec.x = damp(this.leadVec.x, 0, opts.leadRate, dt);
      this.leadVec.z = damp(this.leadVec.z, 0, opts.leadRate, dt);
    }

    const gapX = target.x + this.leadVec.x - this.focus.x;
    const gapZ = target.z + this.leadVec.z - this.focus.z;
    const gap = Math.hypot(gapX, gapZ);
    if (gap > opts.deadzone) {
      const step = (gap - opts.deadzone) / gap;
      this.focus.x += gapX * step * (1 - Math.exp(-opts.followRate * dt));
      this.focus.z += gapZ * step * (1 - Math.exp(-opts.followRate * dt));
    }
    this.focus.y = damp(this.focus.y, target.y, opts.followRate, dt);

    this.homeYaw = dampAngle(this.homeYaw, this.homeYawTarget, HOME_YAW_RATE, dt);
    if (Math.abs(yawInput) > 0.05) {
      this.offset = clamp(this.offset + yawInput * opts.yawSpeed * dt, -opts.yawRange, opts.yawRange);
      this.idleTime = 0;
    } else {
      this.idleTime += dt;
      if (this.idleTime > opts.yawHomeDelay) {
        this.offset = damp(this.offset, 0, opts.yawHomeRate, dt);
      }
    }
    this.pose.yaw = wrapAngle(this.homeYaw + this.offset);

    this.setLookAt();

    // The sweep is measured against the full distance, so the fraction it
    // returns is directly the fraction of the distance the camera may use.
    this.placeAt(opts.distance);
    const fraction = this.probe ? clamp(this.probe.sweep(this.pose.lookAt, this.pose.position, opts.probeRadius), 0, 1) : 1;
    const allowed = Math.max(opts.minDistance, fraction * opts.distance);
    const rate = allowed < this.currentDistance ? opts.pullInRate : opts.pushOutRate;
    this.currentDistance = damp(this.currentDistance, allowed, rate, dt);
    this.pose.distance = this.currentDistance;
    this.placeAt(this.currentDistance);
    return this.pose;
  }

  setHomeYaw(yaw: number): void {
    if (!Number.isFinite(yaw)) throw new RangeError(`FollowCameraRig homeYaw must be finite, got ${yaw}`);
    this.homeYawTarget = wrapAngle(yaw);
  }

  private setLookAt(): void {
    this.pose.lookAt.x = this.focus.x;
    this.pose.lookAt.y = this.focus.y + this.opts.lookHeight;
    this.pose.lookAt.z = this.focus.z;
  }

  /** Camera sits behind lookAt along yaw, raised by pitch, at distance d. */
  private placeAt(d: number): void {
    const opts = this.opts;
    const horizontal = Math.cos(opts.pitch) * d;
    this.pose.position.x = this.pose.lookAt.x - Math.sin(this.pose.yaw) * horizontal;
    this.pose.position.z = this.pose.lookAt.z - Math.cos(this.pose.yaw) * horizontal;
    this.pose.position.y = this.pose.lookAt.y + Math.sin(opts.pitch) * d;
  }
}

/** Turn a screen-space stick (x right, y DOWN) into a world direction. */
export function screenToWorld(moveX: number, moveY: number, cameraYaw: number): { x: number; z: number } {
  // Screen up walks along the way the camera looks; screen right is that turned
  // -90 degrees about +Y, which is -X when the camera looks along +Z.
  const upX = Math.sin(cameraYaw);
  const upZ = Math.cos(cameraYaw);
  const rightX = -upZ;
  const rightZ = upX;
  return { x: rightX * moveX - upX * moveY, z: rightZ * moveX - upZ * moveY };
}
