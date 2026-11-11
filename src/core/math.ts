import type { Vec3 } from './contracts';

export function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/** Exponential approach that gives the same result for any split of the same elapsed time. */
export function damp(current: number, target: number, rate: number, dt: number): number {
  return current + (target - current) * (1 - Math.exp(-rate * dt));
}

export function moveToward(current: number, target: number, maxDelta: number): number {
  const delta = target - current;
  if (Math.abs(delta) <= maxDelta) return target;
  return current + Math.sign(delta) * maxDelta;
}

/** Into (-PI, PI]. */
export function wrapAngle(a: number): number {
  const wrapped = ((a + Math.PI) % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI) - Math.PI;
  // The modulo lands on -PI for an angle of exactly PI; -PI is the open end, so move it.
  return wrapped <= -Math.PI ? Math.PI : wrapped;
}

/** Shortest signed difference, in (-PI, PI]. */
export function angleDelta(from: number, to: number): number {
  return wrapAngle(to - from);
}

/** `damp` along the shortest arc, wrapped back into (-PI, PI]. */
export function dampAngle(current: number, target: number, rate: number, dt: number): number {
  return wrapAngle(damp(current, current + angleDelta(current, target), rate, dt));
}

/** Yaw 0 faces +Z, so yaw = atan2(x, z). */
export function yawFromDirection(x: number, z: number): number {
  return Math.atan2(x, z);
}

export function directionFromYaw(yaw: number): { x: number; z: number } {
  return { x: Math.sin(yaw), z: Math.cos(yaw) };
}

/** Rotates the horizontal vector (x, z) about +Y (right-handed, Y up). */
export function rotateY(x: number, z: number, angle: number): { x: number; z: number } {
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  return { x: x * cos + z * sin, z: -x * sin + z * cos };
}

export function horizontalDistance(a: Vec3, b: Vec3): number {
  return Math.hypot(b.x - a.x, b.z - a.z);
}

export function limitLength2(x: number, y: number, max: number): { x: number; y: number } {
  const length = Math.hypot(x, y);
  if (length <= max) return { x, y };
  // A zero vector cannot be scaled; this is only reachable when max < 0.
  if (length === 0) return { x: 0, y: 0 };
  const scale = max / length;
  return { x: x * scale, y: y * scale };
}
