import RAPIER from '@dimforge/rapier3d-compat';
import type { CameraProbe, Disposable, Vec3, WorldQuery } from '../core/contracts';
import { Layer } from '../core/contracts';
import { CAPSULE_HEIGHT, CAPSULE_RADIUS, CharacterBody, interactionGroups } from './CharacterBody';

export type StaticShape =
  | { kind: 'box'; halfExtents: [number, number, number] }
  | { kind: 'cylinder'; radius: number; height: number }
  | { kind: 'trimesh'; vertices: Float32Array; indices: Uint32Array }; // already in world space

export interface StaticOptions {
  /** Entity id, used by `ignoreIds`. */
  id: string;
  shape: StaticShape;
  /** Centre of the box/cylinder; ignored for trimesh, whose vertices are world space. */
  position: Vec3;
  /** Rotation about +Y, radians. */
  yaw?: number;
  /** One of Layer.*. */
  layer: number;
  blocksCamera?: boolean;
}

const ALL_LAYERS = Layer.World | Layer.Player | Layer.Block | Layer.Pedestal;
/** `groundHeight` looks this far down. */
const GROUND_MAX_DROP = 8;
const NO_ROTATION = { x: 0, y: 0, z: 0, w: 1 };

function yawQuaternion(yaw: number): { x: number; y: number; z: number; w: number } {
  return { x: 0, y: Math.sin(yaw / 2), z: 0, w: Math.cos(yaw / 2) };
}

interface StaticEntry {
  collider: RAPIER.Collider;
  kind: StaticShape['kind'];
  layer: number;
  blocksCamera: boolean;
  /** Collision groups the collider was created with, so re-enabling restores them. */
  groups: number;
}

/**
 * The physics world. Nothing here is dynamic: every static shape is a fixed
 * collider and characters are kinematic, so gravity is 0 and the character
 * controller does its own falling.
 */
export class PhysicsWorld implements WorldQuery, CameraProbe, Disposable {
  private readonly world: RAPIER.World;
  private readonly entries = new Map<string, StaticEntry>();
  /** Collider handle -> entity id, for the `ignoreIds` predicates. */
  private readonly handleToId = new Map<number, string>();
  private disposed = false;

  private constructor(world: RAPIER.World) {
    this.world = world;
  }

  static async create(): Promise<PhysicsWorld> {
    await RAPIER.init();
    return new PhysicsWorld(new RAPIER.World({ x: 0, y: 0, z: 0 }));
  }

  addStatic(options: StaticOptions): void {
    if (this.entries.has(options.id)) {
      throw new Error(`PhysicsWorld: duplicate static id "${options.id}"`);
    }
    const shape = options.shape;
    let desc: RAPIER.ColliderDesc;
    if (shape.kind === 'box') {
      desc = RAPIER.ColliderDesc.cuboid(shape.halfExtents[0], shape.halfExtents[1], shape.halfExtents[2]);
    } else if (shape.kind === 'cylinder') {
      desc = RAPIER.ColliderDesc.cylinder(shape.height / 2, shape.radius);
    } else {
      desc = RAPIER.ColliderDesc.trimesh(shape.vertices, shape.indices);
    }
    const groups = interactionGroups(options.layer, ALL_LAYERS);
    desc.setCollisionGroups(groups);
    if (shape.kind !== 'trimesh') desc.setTranslation(options.position.x, options.position.y, options.position.z);
    if (options.yaw) desc.setRotation(yawQuaternion(options.yaw));

    const collider = this.world.createCollider(desc);
    this.entries.set(options.id, {
      collider,
      kind: shape.kind,
      layer: options.layer,
      blocksCamera: options.blocksCamera ?? false,
      groups,
    });
    this.handleToId.set(collider.handle, options.id);
    this.refresh();
  }

  remove(id: string): void {
    const entry = this.entries.get(id);
    if (!entry) return;
    this.entries.delete(id);
    this.handleToId.delete(entry.collider.handle);
    this.world.removeCollider(entry.collider, false);
    this.refresh();
  }

  /** Move an existing box/cylinder collider (a block being put down). */
  setPosition(id: string, position: Vec3): void {
    const entry = this.entry(id);
    if (entry.kind === 'trimesh') {
      throw new Error(`PhysicsWorld: cannot move trimesh "${id}", its vertices are world space`);
    }
    entry.collider.setTranslation({ x: position.x, y: position.y, z: position.z });
    this.refresh();
  }

  /**
   * Enable/disable a collider without removing it (a carried block).
   * `collider.setEnabled` is not enough: a re-enabled collider is still invisible to
   * scene queries until a real step. Groups do it in one refresh — group 0 means the
   * collider is a member of nothing, so no query or character can hit it.
   */
  setEnabled(id: string, enabled: boolean): void {
    const entry = this.entry(id);
    entry.collider.setCollisionGroups(enabled ? entry.groups : 0);
    this.refresh();
  }

  createCharacter(position: Vec3): CharacterBody {
    const halfHeight = CAPSULE_HEIGHT / 2;
    const body = this.world.createRigidBody(
      RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(position.x, position.y + halfHeight, position.z),
    );
    const collider = this.world.createCollider(
      RAPIER.ColliderDesc.capsule(halfHeight - CAPSULE_RADIUS, CAPSULE_RADIUS)
        .setCollisionGroups(interactionGroups(Layer.Player, ALL_LAYERS)),
      body,
    );
    const controller = this.world.createCharacterController(0.02);
    controller.setUp({ x: 0, y: 1, z: 0 });
    controller.setMaxSlopeClimbAngle((45 * Math.PI) / 180);
    controller.setMinSlopeSlideAngle((50 * Math.PI) / 180);
    controller.enableAutostep(0.25, 0.2, false);
    controller.enableSnapToGround(0.2);

    const character = new CharacterBody(
      {
        body,
        collider,
        controller,
        filterGroups: interactionGroups(Layer.World | Layer.Block | Layer.Pedestal, ALL_LAYERS),
        refresh: () => this.refresh(),
      },
      position,
    );
    this.refresh();
    return character;
  }

  step(dt: number): void {
    if (this.disposed) return;
    this.world.timestep = dt;
    this.world.step();
  }

  canReach(from: Vec3, to: Vec3, ignoreIds?: readonly string[]): boolean {
    const direction = { x: to.x - from.x, y: to.y - from.y, z: to.z - from.z };
    const length = Math.hypot(direction.x, direction.y, direction.z);
    if (length === 0) return true;
    direction.x /= length;
    direction.y /= length;
    direction.z /= length;

    const ignored = new Set(ignoreIds);
    const ray = new RAPIER.Ray({ x: from.x, y: from.y, z: from.z }, direction);
    let blocked = false;
    this.world.intersectionsWithRay(
      ray,
      length,
      true,
      (hit) => {
        if (!ignored.has(this.idOf(hit.collider.handle))) {
          blocked = true;
          return false;
        }
        return true;
      },
      undefined,
      interactionGroups(Layer.World | Layer.Block | Layer.Pedestal, ALL_LAYERS),
    );
    return !blocked;
  }

  groundHeight(x: number, z: number, fromY: number): number | null {
    const ray = new RAPIER.Ray({ x, y: fromY, z }, { x: 0, y: -1, z: 0 });
    const hit = this.world.castRay(ray, GROUND_MAX_DROP, true, undefined, interactionGroups(Layer.World, ALL_LAYERS));
    return hit ? fromY - hit.timeOfImpact : null;
  }

  isBoxClear(center: Vec3, halfExtents: Vec3, ignoreIds?: readonly string[]): boolean {
    const ignored = new Set(ignoreIds);
    const shape = new RAPIER.Cuboid(halfExtents.x, halfExtents.y, halfExtents.z);
    let clear = true;
    this.world.intersectionsWithShape(
      { x: center.x, y: center.y, z: center.z },
      NO_ROTATION,
      shape,
      (collider) => {
        if (!ignored.has(this.idOf(collider.handle))) {
          clear = false;
          return false;
        }
        return true;
      },
      undefined,
      interactionGroups(ALL_LAYERS, ALL_LAYERS),
    );
    return clear;
  }

  sweep(from: Vec3, to: Vec3, radius: number): number {
    const direction = { x: to.x - from.x, y: to.y - from.y, z: to.z - from.z };
    const totalDistance = Math.hypot(direction.x, direction.y, direction.z);
    if (totalDistance === 0) return 1;

    const shape = new RAPIER.Ball(radius);
    const hit = this.world.castShape(
      { x: from.x, y: from.y, z: from.z },
      NO_ROTATION,
      direction,
      shape,
      0,
      1,
      true,
      undefined,
      interactionGroups(ALL_LAYERS, ALL_LAYERS),
      undefined,
      undefined,
      (collider) => this.entries.get(this.idOf(collider.handle))?.blocksCamera === true,
    );
    if (!hit) return 1;
    // targetDistance is 0, so timeOfImpact is hitDistance / totalDistance.
    return Math.min(1, Math.max(0, hit.time_of_impact));
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.entries.clear();
    this.handleToId.clear();
    this.world.free();
  }

  private entry(id: string): StaticEntry {
    const entry = this.entries.get(id);
    if (!entry) throw new Error(`PhysicsWorld: unknown static id "${id}"`);
    return entry;
  }

  private idOf(handle: number): string {
    return this.handleToId.get(handle) ?? '';
  }

  /**
   * Scene queries read the broad-phase AABBs, which Rapier only rebuilds inside
   * `step()`. A zero-length step rebuilds them without integrating anything, so
   * a collider added, moved, enabled or removed here is visible to the next
   * query without advancing the simulation.
   */
  private refresh(): void {
    if (this.disposed) return;
    const timestep = this.world.timestep;
    this.world.timestep = 0;
    this.world.step();
    this.world.timestep = timestep;
  }
}
