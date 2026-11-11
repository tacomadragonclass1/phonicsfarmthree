import type { Vec3, WorldQuery } from '../../src/core/contracts';

export type GroundResolver = (x: number, z: number) => number | null;
export type ReachPredicate = (from: Vec3, to: Vec3, ignoreIds: readonly string[]) => boolean;
export type BoxClearPredicate = (center: Vec3, halfExtents: Vec3, ignoreIds: readonly string[]) => boolean;

export interface FakeWorldOptions {
  /** A fixed height, a function of (x, z), or null for "no ground anywhere". */
  ground?: number | GroundResolver | null;
  canReach?: ReachPredicate;
  isBoxClear?: BoxClearPredicate;
}

export interface ReachCall {
  from: Vec3;
  to: Vec3;
  ignoreIds: readonly string[];
}

export interface GroundCall {
  x: number;
  z: number;
  fromY: number;
}

export interface BoxCall {
  center: Vec3;
  halfExtents: Vec3;
  ignoreIds: readonly string[];
}

/** Everything this fake was asked, in the order it was asked. */
export interface FakeWorldCalls {
  reach: ReachCall[];
  ground: GroundCall[];
  box: BoxCall[];
}

/** A configurable WorldQuery for tests. Everything answers "yes" by default. */
export class FakeWorld implements WorldQuery {
  readonly calls: FakeWorldCalls = { reach: [], ground: [], box: [] };

  private readonly ground: number | GroundResolver | null;
  private readonly reachPredicate: ReachPredicate;
  private readonly boxClearPredicate: BoxClearPredicate;

  constructor(options: FakeWorldOptions = {}) {
    // `?? 0` would turn an explicit "no ground" into a floor at 0, so check for
    // undefined instead.
    this.ground = options.ground === undefined ? 0 : options.ground;
    this.reachPredicate = options.canReach ?? (() => true);
    this.boxClearPredicate = options.isBoxClear ?? (() => true);
  }

  groundHeight(x: number, z: number, fromY: number): number | null {
    this.calls.ground.push({ x, z, fromY });
    return typeof this.ground === 'function' ? this.ground(x, z) : this.ground;
  }

  canReach(from: Vec3, to: Vec3, ignoreIds: readonly string[] = []): boolean {
    this.calls.reach.push({ from: { ...from }, to: { ...to }, ignoreIds: [...ignoreIds] });
    return this.reachPredicate(from, to, ignoreIds);
  }

  isBoxClear(center: Vec3, halfExtents: Vec3, ignoreIds: readonly string[] = []): boolean {
    this.calls.box.push({ center: { ...center }, halfExtents: { ...halfExtents }, ignoreIds: [...ignoreIds] });
    return this.boxClearPredicate(center, halfExtents, ignoreIds);
  }

  /** Start recording from empty, so a test can assert on one step's calls. */
  clearCalls(): void {
    this.calls.reach.length = 0;
    this.calls.ground.length = 0;
    this.calls.box.length = 0;
  }
}
