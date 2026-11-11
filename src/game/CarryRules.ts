import { Emitter } from '../core/Emitter';
import {
  PlayerTuning,
  type Activatable,
  type BlockState,
  type CarryEvents,
  type EventSource,
  type FocusTarget,
  type PedestalState,
  type Unsubscribe,
  type Vec3,
  type WorldQuery,
} from '../core/contracts';
import { horizontalDistance, rotateY } from '../core/math';

export interface CarryRulesOptions {
  world: WorldQuery;
  /** Live array: entries may be added or removed between steps. */
  blocks: BlockState[];
  pedestals: PedestalState[];
  activatables?: Activatable[];
}

/** A candidate for the focus, with its horizontal distance from Chuck. */
interface Candidate {
  target: FocusTarget;
  distance: number;
}

/**
 * Drop geometry that is not in PlayerTuning because it only makes sense for a
 * block being let go: the height the probe ray runs at, the clearance the block
 * rests above the ground, and how far above Chuck the ground is searched from.
 */
const DROP_PROBE_HEIGHT = 0.4;
const DROP_REST_CLEARANCE = 0.02;
const DROP_LOOKDOWN_FROM = 0.15;

/** The focus is judged by kind + id, not object identity, so a rebuilt
 * FocusTarget for the same thing is not a change. */
function focusId(target: FocusTarget): string {
  if (target.kind === 'block') return target.block.id;
  if (target.kind === 'pedestal') return target.pedestal.id;
  return target.target.id;
}

function sameFocus(a: FocusTarget | null, b: FocusTarget | null): boolean {
  if (a === null || b === null) return a === b;
  return a.kind === b.kind && focusId(a) === focusId(b);
}

/**
 * What the action would act on. No rendering and no physics: it is told where
 * Chuck is each step and answers through events.
 */
export class CarryRules implements EventSource<CarryEvents> {
  private readonly world: WorldQuery;
  private readonly blocks: BlockState[];
  private readonly pedestals: PedestalState[];
  private readonly activatables: Activatable[];
  private readonly emitter = new Emitter<CarryEvents>();

  private carriedBlock: BlockState | null = null;
  private currentFocus: FocusTarget | null = null;
  private chuck: Vec3 = { x: 0, y: 0, z: 0 };
  private heading: { x: number; z: number } = { x: 0, z: 1 };

  constructor(options: CarryRulesOptions) {
    this.world = options.world;
    this.blocks = options.blocks;
    this.pedestals = options.pedestals;
    this.activatables = options.activatables ?? [];
  }

  get carried(): BlockState | null {
    return this.carriedBlock;
  }

  get focus(): FocusTarget | null {
    return this.currentFocus;
  }

  on<K extends keyof CarryEvents>(event: K, listener: (payload: CarryEvents[K]) => void): Unsubscribe {
    return this.emitter.on(event, listener);
  }

  step(position: Vec3, heading: { x: number; z: number }, action: boolean): void {
    // Copy so the caller can reuse its own vectors between steps.
    this.chuck = { x: position.x, y: position.y, z: position.z };
    this.heading = { x: heading.x, z: heading.z };

    this.updateFocus();
    if (action) this.act();
  }

  /** Forget a carried block without dropping it (it was consumed elsewhere). */
  releaseCarried(): void {
    if (this.carriedBlock === null) return;
    this.carriedBlock.carried = false;
    this.carriedBlock = null;
    // No event: the block's position is stale while carried, so the focus is
    // only recomputed on the next step.
  }

  private act(): void {
    const focus = this.currentFocus;
    if (focus === null) {
      if (this.carriedBlock !== null) this.drop();
    } else if (focus.kind === 'block') {
      this.pickUp(focus.block);
    } else if (focus.kind === 'pedestal') {
      this.place(focus.pedestal);
    } else {
      focus.target.activate();
    }

    // The highlight must be right on the same step the action fired.
    this.updateFocus();
  }

  private pickUp(block: BlockState): void {
    const pedestal = this.pedestalOf(block);
    if (pedestal !== null) {
      pedestal.blockId = null;
      block.pedestalId = null;
      this.emitter.emit('removed', { block, pedestal });
    }

    block.carried = true;
    this.carriedBlock = block;
    this.emitter.emit('pickedUp', block);
  }

  private place(pedestal: PedestalState): void {
    // A pedestal is only a candidate while carrying, so this cannot be reached
    // with empty hands.
    const block = this.carriedBlock;
    if (block === null) return;

    block.carried = false;
    block.pedestalId = pedestal.id;
    pedestal.blockId = block.id;
    block.position = {
      x: pedestal.position.x,
      y: pedestal.position.y + pedestal.snapHeight,
      z: pedestal.position.z,
    };
    this.carriedBlock = null;
    this.emitter.emit('placed', { block, pedestal });
  }

  /** First drop spot that has ground, is clear, and is reachable. */
  private drop(): void {
    const block = this.carriedBlock;
    if (block === null) return;

    for (const degrees of PlayerTuning.dropAngles) {
      const direction = rotateY(this.heading.x, this.heading.z, (degrees * Math.PI) / 180);
      const x = this.chuck.x + direction.x * PlayerTuning.dropDistance;
      const z = this.chuck.z + direction.z * PlayerTuning.dropDistance;

      const ground = this.world.groundHeight(x, z, this.chuck.y + DROP_LOOKDOWN_FROM);
      if (ground === null) continue;
      const rest = ground + DROP_REST_CLEARANCE;
      const centre = { x, y: rest + DROP_PROBE_HEIGHT, z };

      if (!this.world.isBoxClear(centre, PlayerTuning.dropHalfExtents, [block.id])) continue;

      const from = { x: this.chuck.x, y: this.chuck.y + DROP_PROBE_HEIGHT, z: this.chuck.z };
      if (!this.world.canReach(from, centre, [block.id])) continue;

      block.carried = false;
      block.position = { x, y: rest, z };
      this.carriedBlock = null;
      this.emitter.emit('dropped', block);
      return;
    }
    // Nothing survived: Chuck keeps the block.
  }

  private updateFocus(): void {
    const candidates = this.candidates();
    let chosen: FocusTarget | null = null;

    if (candidates.length > 0) {
      let nearest = candidates[0];
      for (const candidate of candidates) {
        if (candidate.distance < nearest.distance) nearest = candidate;
      }

      // Hysteresis: the lit target only changes when another is nearer by more
      // than the hysteresis, so it does not flicker between two close things.
      const previous = candidates.find((candidate) => sameFocus(candidate.target, this.currentFocus));
      const keep =
        previous !== undefined && nearest.distance >= previous.distance - PlayerTuning.focusHysteresis;
      chosen = keep ? previous.target : nearest.target;
    }

    if (sameFocus(chosen, this.currentFocus)) return;
    this.currentFocus = chosen;
    this.emitter.emit('focusChanged', chosen);
  }

  private candidates(): Candidate[] {
    const from = { x: this.chuck.x, y: this.chuck.y + PlayerTuning.reachFromHeight, z: this.chuck.z };
    const found: Candidate[] = [];

    const consider = (target: FocusTarget, position: Vec3, ignoreIds: readonly string[]): void => {
      const distance = horizontalDistance(this.chuck, position);
      if (distance >= PlayerTuning.interactionDistance) return;

      const to = { x: position.x, y: position.y + PlayerTuning.reachToHeight, z: position.z };
      if (!this.world.canReach(from, to, ignoreIds)) return;
      found.push({ target, distance });
    };

    if (this.carriedBlock === null) {
      for (const block of this.blocks) {
        if (block.carried) continue;
        const ignoreIds = block.pedestalId === null ? [block.id] : [block.id, block.pedestalId];
        consider({ kind: 'block', block }, block.position, ignoreIds);
      }
    } else {
      for (const pedestal of this.pedestals) {
        if (pedestal.blockId !== null) continue;
        consider({ kind: 'pedestal', pedestal }, pedestal.position, [pedestal.id]);
      }
    }

    for (const target of this.activatables) {
      consider({ kind: 'activatable', target }, target.position, [target.id]);
    }

    return found;
  }

  private pedestalOf(block: BlockState): PedestalState | null {
    if (block.pedestalId === null) return null;
    return this.pedestals.find((pedestal) => pedestal.id === block.pedestalId) ?? null;
  }
}
