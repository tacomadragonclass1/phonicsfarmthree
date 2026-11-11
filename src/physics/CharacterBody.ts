import RAPIER from '@dimforge/rapier3d-compat';
import type { Vec3 } from '../core/contracts';
import { PlayerTuning } from '../core/contracts';

export const CAPSULE_RADIUS = 0.3;
export const CAPSULE_HEIGHT = 1.33;

/** Gravity used for the character only: the world itself has none (nothing is dynamic). */
const GRAVITY = 20;
/**
 * Downward speed while grounded. Zero on purpose: pressing into the floor makes the
 * controller return no horizontal movement on scattered steps (measured: 4-6 stalled
 * steps in 120 at 1 m/s). Snap-to-ground keeps him on slopes without it.
 */
const STICK_SPEED = 0;

/** Rapier interaction groups: membership in the high 16 bits, filter mask in the low 16. */
export function interactionGroups(membership: number, mask: number): number {
  return (membership << 16) | mask;
}

export interface CharacterContext {
  readonly body: RAPIER.RigidBody;
  readonly collider: RAPIER.Collider;
  readonly controller: RAPIER.KinematicCharacterController;
  /** Groups the character slides against: World, Block and Pedestal. */
  readonly filterGroups: number;
  /** Rebuilds the broad-phase AABBs so scene queries see the character where it now is. */
  refresh(): void;
}

/**
 * A kinematic position-based character. `position` is the feet (bottom-centre),
 * which is the body translation minus half the capsule height.
 */
export class CharacterBody {
  readonly position: Vec3;
  readonly velocity: Vec3;
  grounded = false;

  private readonly ctx: CharacterContext;
  /**
   * The speed the controller is asked for, which accelerates independently of what
   * the controller allowed; `velocity` is only the achieved speed. Keeping them apart
   * is what lets the walk ramp up to walkSpeed instead of re-accelerating from the
   * movement each step.
   */
  private readonly intent: { x: number; z: number };

  constructor(ctx: CharacterContext, position: Vec3) {
    this.ctx = ctx;
    this.position = { x: position.x, y: position.y, z: position.z };
    this.velocity = { x: 0, y: 0, z: 0 };
    this.intent = { x: 0, z: 0 };
    this.syncFromBody();
  }

  /**
   * Walk. `wishX`/`wishZ` is the desired horizontal direction * strength
   * (length <= 1). Accelerates toward wish * walkSpeed at `acceleration`,
   * applies the stick-to-ground or gravity speed, then moves through the
   * character controller; `velocity` is what the controller actually allowed.
   */
  move(wishX: number, wishZ: number, dt: number): void {
    if (dt <= 0) return;

    this.intent.x = approach(this.intent.x, wishX * PlayerTuning.walkSpeed, PlayerTuning.acceleration * dt);
    this.intent.z = approach(this.intent.z, wishZ * PlayerTuning.walkSpeed, PlayerTuning.acceleration * dt);
    this.velocity.y = this.grounded ? -STICK_SPEED : this.velocity.y - GRAVITY * dt;

    const delta = { x: this.intent.x * dt, y: this.velocity.y * dt, z: this.intent.z * dt };
    this.ctx.controller.computeColliderMovement(this.ctx.collider, delta, undefined, this.ctx.filterGroups);
    const movement = this.ctx.controller.computedMovement();
    this.grounded = this.ctx.controller.computedGrounded();

    // The velocity actually achieved, so a wall stops the walk instead of
    // leaving a wish velocity that would keep pushing.
    this.velocity.x = movement.x / dt;
    this.velocity.y = movement.y / dt;
    this.velocity.z = movement.z / dt;

    // If the controller allowed much less than asked for on an axis, he hit something:
    // stop pushing on that axis so intent does not keep building against the obstacle.
    // Both sides are speeds, so compare with the achieved speed, not the per-step distance.
    if (Math.abs(this.velocity.x) < 0.5 * Math.abs(this.intent.x)) this.intent.x = this.velocity.x;
    if (Math.abs(this.velocity.z) < 0.5 * Math.abs(this.intent.z)) this.intent.z = this.velocity.z;

    const body = this.ctx.body;
    const t = body.translation();
    body.setNextKinematicTranslation({ x: t.x + movement.x, y: t.y + movement.y, z: t.z + movement.z });
    this.syncFromBody(movement);
  }

  teleport(position: Vec3): void {
    this.velocity.x = 0;
    this.velocity.y = 0;
    this.velocity.z = 0;
    this.intent.x = 0;
    this.intent.z = 0;
    this.grounded = false;
    const next = { x: position.x, y: position.y + CAPSULE_HEIGHT / 2, z: position.z };
    this.ctx.body.setTranslation(next, true);
    this.ctx.body.setNextKinematicTranslation(next);
    this.position.x = position.x;
    this.position.y = position.y;
    this.position.z = position.z;
    this.ctx.refresh();
  }

  private syncFromBody(movement?: { x: number; y: number; z: number }): void {
    const t = this.ctx.body.translation();
    const dx = movement ? movement.x : 0;
    const dy = movement ? movement.y : 0;
    const dz = movement ? movement.z : 0;
    this.position.x = t.x + dx;
    this.position.y = t.y + dy - CAPSULE_HEIGHT / 2;
    this.position.z = t.z + dz;
  }
}

function approach(current: number, target: number, maxChange: number): number {
  const difference = target - current;
  if (difference > maxChange) return current + maxChange;
  if (difference < -maxChange) return current - maxChange;
  return target;
}
