import { describe, expect, it } from 'vitest';
import { PlayerTuning, type Activatable, type BlockState, type CarryEvents, type PedestalState, type Vec3 } from '../src/core/contracts';
import { CarryRules } from '../src/game/CarryRules';
import { FakeWorld } from './helpers/FakeWorld';

const ORIGIN: Vec3 = { x: 0, y: 0, z: 0 };
const FACING: { x: number; z: number } = { x: 0, z: 1 };

interface Recorded {
  event: keyof CarryEvents;
  payload: unknown;
}

function makeBlock(id: string, position: Vec3): BlockState {
  return { id, letter: id, position, carried: false, pedestalId: null, silentDrops: false };
}

function makePedestal(id: string, position: Vec3, snapHeight = 0.5): PedestalState {
  return { id, position, snapHeight, blockId: null };
}

function makeActivatable(id: string, position: Vec3, activated: string[]): Activatable {
  return { id, position, activate: () => activated.push(id) };
}

function record(rules: CarryRules): Recorded[] {
  const events: Recorded[] = [];
  rules.on('focusChanged', (payload) => events.push({ event: 'focusChanged', payload }));
  rules.on('pickedUp', (payload) => events.push({ event: 'pickedUp', payload }));
  rules.on('dropped', (payload) => events.push({ event: 'dropped', payload }));
  rules.on('placed', (payload) => events.push({ event: 'placed', payload }));
  rules.on('removed', (payload) => events.push({ event: 'removed', payload }));
  return events;
}

function names(events: Recorded[]): string[] {
  return events.map((event) => event.event);
}

describe('CarryRules focus', () => {
  it('emits focusChanged once on entering reach and not again while it stays', () => {
    const world = new FakeWorld();
    const block = makeBlock('b1', { x: 0, y: 0, z: 3 }); // out of reach
    const rules = new CarryRules({ world, blocks: [block], pedestals: [] });
    const events = record(rules);

    rules.step(ORIGIN, FACING, false);
    expect(rules.focus).toBeNull();
    expect(events).toEqual([]);

    rules.step({ x: 0, y: 0, z: 1.5 }, FACING, false);
    expect(rules.focus).toEqual({ kind: 'block', block });
    expect(names(events)).toEqual(['focusChanged']);

    rules.step({ x: 0, y: 0, z: 1.6 }, FACING, false);
    rules.step({ x: 0, y: 0, z: 1.5 }, FACING, false);
    expect(names(events)).toEqual(['focusChanged']);

    // Leaving reach emits again.
    rules.step(ORIGIN, FACING, false);
    expect(names(events)).toEqual(['focusChanged', 'focusChanged']);
    expect(rules.focus).toBeNull();
  });

  it('the nearest candidate is the focus', () => {
    const world = new FakeWorld();
    const near = makeBlock('b1', { x: 0, y: 0, z: 1.0 });
    const far = makeBlock('b2', { x: 0, y: 0, z: 1.3 });
    const rules = new CarryRules({ world, blocks: [near, far], pedestals: [] });
    const events = record(rules);

    rules.step(ORIGIN, FACING, false);
    expect(rules.focus).toEqual({ kind: 'block', block: near });
    expect(names(events)).toEqual(['focusChanged']);
  });

  it('hysteresis: a candidate nearer by 0.1 does not steal the focus, nearer by 0.3 does', () => {
    const world = new FakeWorld();
    const a = makeBlock('b1', { x: 0, y: 0, z: 1.0 });
    const b = makeBlock('b2', { x: 0, y: 0, z: 1.3 });
    const rules = new CarryRules({ world, blocks: [a, b], pedestals: [] });
    const events = record(rules);

    rules.step(ORIGIN, FACING, false); // a at 1.0, b at 1.3 => a
    expect(rules.focus).toEqual({ kind: 'block', block: a });

    // b is nearer by 0.1 (0.4 vs 0.5): hysteresis keeps a.
    rules.step({ x: 0.4, y: 0, z: 1.3 }, FACING, false);
    expect(rules.focus).toEqual({ kind: 'block', block: a });
    expect(names(events)).toEqual(['focusChanged']);

    // b is nearer by 0.3 (0.0 vs 0.3): b takes the focus.
    rules.step(ORIGIN, FACING, false);
    rules.step({ x: 0, y: 0, z: 1.3 }, FACING, false);
    expect(rules.focus).toEqual({ kind: 'block', block: b });
    expect(names(events)).toEqual(['focusChanged', 'focusChanged']);
  });

  it('a candidate with no line of sight is never the focus', () => {
    // Only the ray to the far block is clear, so it wins even though the
    // blocked one is nearer.
    const world = new FakeWorld({ canReach: (_from, to) => to.z > 0.95 });
    const blocked = makeBlock('b1', { x: 0, y: 0, z: 0.8 });
    const clear = makeBlock('b2', { x: 0, y: 0, z: 1.2 });
    const rules = new CarryRules({ world, blocks: [blocked, clear], pedestals: [] });
    const events = record(rules);

    rules.step(ORIGIN, FACING, false);
    expect(rules.focus).toEqual({ kind: 'block', block: clear });
    expect(names(events)).toEqual(['focusChanged']);
  });

  it('ignore ids are the candidate itself plus the pedestal it sits on', () => {
    const world = new FakeWorld();
    const pedestal = makePedestal('p1', { x: 0, y: 0, z: 1.0 });
    const onPedestal = makeBlock('b1', { x: 0, y: 0, z: 1.0 });
    onPedestal.pedestalId = 'p1';
    pedestal.blockId = 'b1';
    const loose = makeBlock('b2', { x: 0, y: 0, z: 1.2 });
    const bell = makeActivatable('bell', { x: 0, y: 0, z: 1.4 }, []);

    const rules = new CarryRules({ world, blocks: [onPedestal, loose], pedestals: [pedestal], activatables: [bell] });
    rules.step(ORIGIN, FACING, false);

    const reach = world.calls.reach;
    const blockCall = reach.find((call) => call.to.z === 1.0);
    expect(blockCall?.ignoreIds).toEqual(['b1', 'p1']);
    expect(blockCall?.from).toEqual({ x: 0, y: PlayerTuning.reachFromHeight, z: 0 });
    expect(blockCall?.to).toEqual({ x: 0, y: PlayerTuning.reachToHeight, z: 1.0 });

    const looseCall = reach.find((call) => call.to.z === 1.2);
    expect(looseCall?.ignoreIds).toEqual(['b2']);

    const bellCall = reach.find((call) => call.to.z === 1.4);
    expect(bellCall?.ignoreIds).toEqual(['bell']);
  });

  it('while carrying, blocks are not candidates but an empty pedestal is', () => {
    const world = new FakeWorld();
    const carried = makeBlock('b1', { x: 0, y: 0, z: 0.5 });
    const empty = makePedestal('p1', { x: 0, y: 0, z: 1.2 });
    const occupied = makePedestal('p2', { x: 0, y: 0, z: 0.9 });
    const onP2 = makeBlock('b2', { x: 0, y: 0, z: 0.9 });
    onP2.pedestalId = 'p2';
    occupied.blockId = 'b2';

    const rules = new CarryRules({ world, blocks: [carried, onP2], pedestals: [empty, occupied] });
    const events = record(rules);

    // Empty hands: pedestals are not candidates, so the loose block is the focus.
    rules.step(ORIGIN, FACING, false);
    expect(rules.focus).toEqual({ kind: 'block', block: carried });

    rules.step(ORIGIN, FACING, true);
    expect(names(events)).toEqual(['focusChanged', 'pickedUp', 'focusChanged']);
    expect(rules.carried).toBe(carried);
    expect(rules.focus).toEqual({ kind: 'pedestal', pedestal: empty });
  });

  it('standing next to a block does not pick it up without the action', () => {
    const world = new FakeWorld();
    const block = makeBlock('b1', { x: 0, y: 0, z: 1.0 });
    const rules = new CarryRules({ world, blocks: [block], pedestals: [] });
    const events = record(rules);

    rules.step(ORIGIN, FACING, false);
    rules.step(ORIGIN, FACING, false);
    expect(block.carried).toBe(false);
    expect(rules.carried).toBeNull();
    expect(names(events)).toEqual(['focusChanged']);
  });

  it('action on a focused loose block picks it up and the focus is recomputed', () => {
    const world = new FakeWorld();
    const block = makeBlock('b1', { x: 0, y: 0, z: 1.0 });
    const rules = new CarryRules({ world, blocks: [block], pedestals: [] });
    const events = record(rules);

    rules.step(ORIGIN, FACING, false);
    rules.step(ORIGIN, FACING, true);

    expect(names(events)).toEqual(['focusChanged', 'pickedUp', 'focusChanged']);
    expect(block.carried).toBe(true);
    expect(rules.carried).toBe(block);
    // Nothing else is in reach, so the focus is null while carrying.
    expect(rules.focus).toBeNull();
  });

  it('places the carried block on the focused pedestal', () => {
    const world = new FakeWorld();
    const block = makeBlock('b1', { x: 0, y: 0, z: 1.0 });
    const pedestal = makePedestal('p1', { x: 0, y: 0, z: 1.2 }, 0.5);
    const rules = new CarryRules({ world, blocks: [block], pedestals: [pedestal] });
    const events = record(rules);

    rules.step(ORIGIN, FACING, false); // focus the block
    rules.step(ORIGIN, FACING, true); // pick it up, focus becomes the pedestal
    rules.step(ORIGIN, FACING, true); // place it

    expect(names(events)).toEqual(['focusChanged', 'pickedUp', 'focusChanged', 'placed', 'focusChanged']);
    expect(pedestal.blockId).toBe('b1');
    expect(block.pedestalId).toBe('p1');
    expect(block.carried).toBe(false);
    expect(block.position).toEqual({ x: 0, y: 0.5, z: 1.2 });
    expect(rules.carried).toBeNull();
    // Empty hands again: the block just placed is a candidate.
    expect(rules.focus).toEqual({ kind: 'block', block });
  });

  it('empty hands next to an occupied pedestal: the block on it is the focus', () => {
    const world = new FakeWorld();
    const pedestal = makePedestal('p1', { x: 0, y: 0, z: 1.0 }, 0.5);
    const block = makeBlock('b1', { x: 0, y: 0.5, z: 1.0 });
    block.pedestalId = 'p1';
    pedestal.blockId = 'b1';

    const rules = new CarryRules({ world, blocks: [block], pedestals: [pedestal] });
    const events = record(rules);

    rules.step(ORIGIN, FACING, false);
    expect(rules.focus).toEqual({ kind: 'block', block });

    rules.step(ORIGIN, FACING, true);
    expect(names(events)).toEqual(['focusChanged', 'removed', 'pickedUp', 'focusChanged']);
    expect(pedestal.blockId).toBeNull();
    expect(block.pedestalId).toBeNull();
    expect(block.carried).toBe(true);
    expect(rules.carried).toBe(block);
    // The now-empty pedestal is the focus while carrying.
    expect(rules.focus).toEqual({ kind: 'pedestal', pedestal });
  });

  it('activatable in focus is activated empty-handed and while carrying', () => {
    const activated: string[] = [];
    const world = new FakeWorld();
    const block = makeBlock('b1', { x: 0, y: 0, z: 1.0 });
    const bell = makeActivatable('bell', { x: 0, y: 0, z: 1.4 }, activated);
    const rules = new CarryRules({ world, blocks: [block], pedestals: [], activatables: [bell] });
    const events = record(rules);

    rules.step(ORIGIN, FACING, false); // empty hands: the block is nearer, so it wins
    expect(rules.focus).toEqual({ kind: 'block', block });

    rules.step(ORIGIN, FACING, true); // pick up; the bell is now the only candidate
    expect(names(events)).toEqual(['focusChanged', 'pickedUp', 'focusChanged']);
    expect(rules.focus).toEqual({ kind: 'activatable', target: bell });

    rules.step(ORIGIN, FACING, true);
    expect(activated).toEqual(['bell']);
    expect(rules.carried).toBe(block); // hands unchanged
    expect(names(events)).toEqual(['focusChanged', 'pickedUp', 'focusChanged']);
  });

  it('a pedestal nearer than the bell wins while carrying', () => {
    const activated: string[] = [];
    const world = new FakeWorld();
    const block = makeBlock('b1', { x: 0, y: 0, z: 1.0 });
    const pedestal = makePedestal('p1', { x: 0, y: 0, z: 1.2 }, 0.5);
    const bell = makeActivatable('bell', { x: 0, y: 0, z: 1.4 }, activated);
    const rules = new CarryRules({ world, blocks: [block], pedestals: [pedestal], activatables: [bell] });
    const events = record(rules);

    rules.step(ORIGIN, FACING, false);
    rules.step(ORIGIN, FACING, true); // pick up
    expect(rules.focus).toEqual({ kind: 'pedestal', pedestal });

    rules.step(ORIGIN, FACING, true);
    expect(activated).toEqual([]);
    expect(names(events)).toEqual(['focusChanged', 'pickedUp', 'focusChanged', 'placed', 'focusChanged']);
    expect(pedestal.blockId).toBe('b1');
  });
});

describe('CarryRules drop', () => {
  /** Carrying one block, with nothing else in reach so there is no focus. */
  function setup(options: { canReach?: (from: Vec3, to: Vec3, ignoreIds: readonly string[]) => boolean; isBoxClear?: (center: Vec3, halfExtents: Vec3, ignoreIds: readonly string[]) => boolean; ground?: number | ((x: number, z: number) => number | null) | null }) {
    const world = new FakeWorld(options);
    const block = makeBlock('b1', { x: 0, y: 0, z: 1.0 });
    const rules = new CarryRules({ world, blocks: [block], pedestals: [] });
    const events = record(rules);

    rules.step(ORIGIN, FACING, false);
    rules.step(ORIGIN, FACING, true); // pick it up; focus becomes null
    events.length = 0;
    world.clearCalls();
    return { world, block, rules, events };
  }

  it('drops 1.12 m ahead along the heading at ground + 0.02', () => {
    const { world, block, rules, events } = setup({});

    rules.step(ORIGIN, FACING, true);

    // The block lands 1.12 m ahead, still inside interactionDistance, so the
    // focus is recomputed to it on the same step.
    expect(names(events)).toEqual(['dropped', 'focusChanged']);
    expect(rules.focus).toEqual({ kind: 'block', block });
    expect(block.carried).toBe(false);
    expect(rules.carried).toBeNull();
    expect(block.position).toEqual({ x: 0, y: 0.02, z: PlayerTuning.dropDistance });

    expect(world.calls.ground).toEqual([{ x: 0, z: PlayerTuning.dropDistance, fromY: 0.15 }]);

    const boxCall = world.calls.box[0];
    expect(boxCall.center.x).toBe(0);
    expect(boxCall.center.y).toBeCloseTo(0.02 + 0.4, 10); // rest + probe height
    expect(boxCall.center.z).toBe(PlayerTuning.dropDistance);
    expect(boxCall.halfExtents).toEqual(PlayerTuning.dropHalfExtents);
    expect(boxCall.ignoreIds).toEqual(['b1']);

    // The second reach call is the focus recomputed after the drop.
    const reachCall = world.calls.reach[0];
    expect(reachCall.from).toEqual({ x: 0, y: 0.4, z: 0 });
    expect(reachCall.to.x).toBe(0);
    expect(reachCall.to.y).toBeCloseTo(0.02 + 0.4, 10);
    expect(reachCall.to.z).toBe(PlayerTuning.dropDistance);
    expect(reachCall.ignoreIds).toEqual(['b1']);
    expect(world.calls.reach.length).toBe(2);
  });

  it('falls back to the 45-degree spot when the front is blocked', () => {
    const blocked = 1.12 * Math.SQRT1_2;
    const isBoxClear = (center: Vec3) => !(center.z > 1.0 && center.x < 0.1);
    const { block, rules, events } = setup({ isBoxClear });

    rules.step(ORIGIN, FACING, true);

    expect(names(events)).toEqual(['dropped', 'focusChanged']);
    expect(block.position.x).toBeCloseTo(blocked, 10);
    expect(block.position.y).toBeCloseTo(0.02, 10);
    expect(block.position.z).toBeCloseTo(blocked, 10);
  });

  it('keeps the block when all eight spots fail', () => {
    const { block, rules, events } = setup({ isBoxClear: () => false });

    rules.step(ORIGIN, FACING, true);

    expect(events).toEqual([]);
    expect(block.carried).toBe(true);
    expect(rules.carried).toBe(block);
  });

  it('skips a spot with no ground under it', () => {
    const ground = (_x: number, z: number) => (z > 1.0 ? null : 0);
    const spot = 1.12 * Math.SQRT1_2;
    const { world, block, rules, events } = setup({ ground });

    rules.step(ORIGIN, FACING, true);

    expect(names(events)).toEqual(['dropped', 'focusChanged']);
    expect(world.calls.ground.length).toBe(2); // front spot skipped, then 45 degrees
    expect(block.position.x).toBeCloseTo(spot, 10);
    expect(block.position.y).toBeCloseTo(0.02, 10);
    expect(block.position.z).toBeCloseTo(spot, 10);
  });

  it('no focus with empty hands does nothing', () => {
    const world = new FakeWorld();
    const rules = new CarryRules({ world, blocks: [], pedestals: [] });
    const events = record(rules);

    rules.step(ORIGIN, FACING, true);

    expect(events).toEqual([]);
    expect(world.calls.ground).toEqual([]);
  });

  it('releaseCarried empties the hands without a dropped event', () => {
    const { block, rules, events } = setup({});

    rules.releaseCarried();

    expect(events).toEqual([]);
    expect(rules.carried).toBeNull();
    expect(block.carried).toBe(false);
    expect(block.position).toEqual({ x: 0, y: 0, z: 1.0 }); // left where it was
  });
});
