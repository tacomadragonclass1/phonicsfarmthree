import { describe, expect, it } from 'vitest';
import { Layer, PlayerTuning } from '../src/core/contracts';
import { PhysicsWorld, type StaticOptions } from '../src/physics/PhysicsWorld';
import type { CharacterBody } from '../src/physics/CharacterBody';

const DT = 1 / 60;

async function createWorld(): Promise<PhysicsWorld> {
  const world = await PhysicsWorld.create();
  // Flat ground: a big thin box whose top face is y = 0.
  world.addStatic({
    id: 'ground',
    shape: { kind: 'box', halfExtents: [20, 0.1, 20] },
    position: { x: 0, y: -0.1, z: 0 },
    layer: Layer.World,
  });
  return world;
}

function addBox(world: PhysicsWorld, options: StaticOptions): void {
  world.addStatic(options);
}

/** Runs the character until it settles on the ground (or `maxSteps` passes). */
function settle(world: PhysicsWorld, character: CharacterBody, maxSteps = 300): boolean {
  for (let i = 0; i < maxSteps; i++) {
    character.move(0, 0, DT);
    world.step(DT);
    if (character.grounded) return true;
  }
  return false;
}

function walk(world: PhysicsWorld, character: CharacterBody, wishX: number, wishZ: number, steps: number): void {
  for (let i = 0; i < steps; i++) {
    character.move(wishX, wishZ, DT);
    world.step(DT);
  }
}

describe('groundHeight', () => {
  it('finds the ground below and nothing above fromY', async () => {
    const world = await createWorld();
    expect(world.groundHeight(0, 0, 5)).toBeCloseTo(0, 3);
    expect(world.groundHeight(19.5, -19.5, 3)).toBeCloseTo(0, 3);
    expect(world.groundHeight(21, 0, 5)).toBeNull(); // past the ground's edge
    expect(world.groundHeight(0, 0, 9.5)).toBeNull(); // more than 8 m above it
  });

  it('does not see a platform above fromY', async () => {
    const world = await createWorld();
    addBox(world, {
      id: 'platform',
      shape: { kind: 'box', halfExtents: [2, 0.1, 2] },
      position: { x: 0, y: 3, z: 0 },
      layer: Layer.World,
    });
    expect(world.groundHeight(0, 0, 2)).toBeCloseTo(0, 3);
    expect(world.groundHeight(0, 0, 2.8)).toBeCloseTo(0, 3);
  });
});

describe('canReach', () => {
  const wall: StaticOptions = {
    id: 'wall',
    shape: { kind: 'box', halfExtents: [0.25, 1, 2] },
    position: { x: 5, y: 1, z: 0 },
    layer: Layer.Block,
  };

  it('is false straight through a wall and true around it', async () => {
    const world = await createWorld();
    addBox(world, wall);
    expect(world.canReach({ x: 0, y: 1, z: 0 }, { x: 10, y: 1, z: 0 })).toBe(false);
    expect(world.canReach({ x: 0, y: 1, z: 3 }, { x: 10, y: 1, z: 3 })).toBe(true); // past its edge
    expect(world.canReach({ x: 0, y: 3, z: 0 }, { x: 10, y: 3, z: 0 })).toBe(true); // over the top
  });

  it('is true when the wall is ignored', async () => {
    const world = await createWorld();
    addBox(world, wall);
    expect(world.canReach({ x: 0, y: 1, z: 0 }, { x: 10, y: 1, z: 0 }, ['wall'])).toBe(true);
    expect(world.canReach({ x: 0, y: 1, z: 0 }, { x: 10, y: 1, z: 0 }, ['other'])).toBe(false);
  });

  it('is not blocked by the character the ray starts inside', async () => {
    const world = await createWorld();
    const character = world.createCharacter({ x: 0, y: 0.05, z: 0 });
    settle(world, character);
    expect(world.canReach({ x: 0, y: 0.6, z: 0 }, { x: 1, y: 0.4, z: 0 })).toBe(true);
    expect(world.groundHeight(0, 0, 6)).toBeCloseTo(0, 3); // the ground, not his head
  });

  it('sees a wall added in the same step', async () => {
    const world = await createWorld();
    expect(world.canReach({ x: 0, y: 1, z: 0 }, { x: 10, y: 1, z: 0 })).toBe(true);
    addBox(world, wall);
    expect(world.canReach({ x: 0, y: 1, z: 0 }, { x: 10, y: 1, z: 0 })).toBe(false);
    world.remove('wall');
    expect(world.canReach({ x: 0, y: 1, z: 0 }, { x: 10, y: 1, z: 0 })).toBe(true);
  });
});

describe('isBoxClear', () => {
  it('is false against a block, true once disabled or removed', async () => {
    const world = await createWorld();
    addBox(world, {
      id: 'block',
      shape: { kind: 'box', halfExtents: [0.4, 0.4, 0.4] },
      position: { x: 2, y: 0.4, z: 0 },
      layer: Layer.Block,
    });
    const centre = { x: 2, y: 0.4, z: 0 };
    const half = { x: 0.42, y: 0.38, z: 0.42 };
    expect(world.isBoxClear(centre, half)).toBe(false);
    expect(world.isBoxClear(centre, half, ['block'])).toBe(true);

    world.setEnabled('block', false);
    expect(world.isBoxClear(centre, half)).toBe(true);

    world.setEnabled('block', true);
    expect(world.isBoxClear(centre, half)).toBe(false);
    world.remove('block');
    expect(world.isBoxClear(centre, half)).toBe(true);
    expect(world.isBoxClear({ x: 0, y: 1, z: 0 }, half)).toBe(true);
  });
});

describe('sweep', () => {
  const cameraBox: StaticOptions = {
    id: 'cameraBox',
    shape: { kind: 'box', halfExtents: [0.1, 0.5, 0.5] },
    position: { x: 5.1, y: 0, z: 0 },
    layer: Layer.World,
    blocksCamera: true,
  };

  it('reports the fraction of the way to the first camera blocker', async () => {
    const world = await createWorld();
    addBox(world, cameraBox);
    // Ball radius 0.1 reaches the near face (x = 5.0) after 4.9 of the 10 m.
    expect(world.sweep({ x: 0, y: 0, z: 0 }, { x: 10, y: 0, z: 0 }, 0.1)).toBeCloseTo(0.49, 2);
    expect(world.sweep({ x: 0, y: 0, z: 5 }, { x: 10, y: 0, z: 5 }, 0.1)).toBe(1);
    expect(world.sweep({ x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 0 }, 0.1)).toBe(1);
  });

  it('ignores colliders that do not block the camera', async () => {
    const world = await createWorld();
    addBox(world, { ...cameraBox, id: 'notBlocking', blocksCamera: false });
    expect(world.sweep({ x: 0, y: 0, z: 0 }, { x: 10, y: 0, z: 0 }, 0.1)).toBe(1);
  });
});

describe('CharacterBody', () => {
  it('falls and lands on the ground', async () => {
    const world = await createWorld();
    const character = world.createCharacter({ x: 0, y: 1, z: 0 });
    expect(character.grounded).toBe(false);
    expect(settle(world, character)).toBe(true);
    expect(character.position.y).toBeGreaterThan(-0.01);
    expect(character.position.y).toBeLessThan(0.1); // the controller keeps its 0.02 offset
  });

  it('accelerates to walkSpeed and covers roughly 12 m in 2 s', async () => {
    const world = await createWorld();
    const character = world.createCharacter({ x: 0, y: 1, z: 0 });
    expect(settle(world, character)).toBe(true);
    const start = { ...character.position };
    walk(world, character, 1, 0, 120);
    expect(character.velocity.x).toBeCloseTo(PlayerTuning.walkSpeed, 1);
    expect(Math.abs(character.velocity.x - PlayerTuning.walkSpeed)).toBeLessThan(PlayerTuning.walkSpeed * 0.02);
    const covered = character.position.x - start.x;
    expect(covered).toBeGreaterThan(11.5);
    expect(covered).toBeLessThan(12.5);

    walk(world, character, 0, 0, 60);
    expect(character.velocity.x).toBeCloseTo(0, 3);
  });

  it('stops at a wall', async () => {
    const world = await createWorld();
    addBox(world, {
      id: 'wall',
      shape: { kind: 'box', halfExtents: [0.25, 1, 2] },
      position: { x: 5, y: 1, z: 0 },
      layer: Layer.Block,
    });
    const character = world.createCharacter({ x: 1, y: 1, z: 0 });
    expect(settle(world, character)).toBe(true);
    walk(world, character, 1, 0, 180);
    const face = 5 - 0.25;
    expect(character.position.x).toBeLessThanOrEqual(face - 0.3);
    expect(character.position.x).toBeGreaterThan(face - 1);
    expect(Math.abs(character.velocity.x)).toBeLessThan(0.01);
  });

  it('walks up a 20 degree ramp but not a 60 degree one', async () => {
    const world = await createWorld();
    const ramp = (angle: number): { vertices: Float32Array; indices: Uint32Array } => {
      const rise = Math.tan(angle) * 10;
      // Wound so the face normal points up.
      const vertices = new Float32Array([
        0, 0, -2, 10, rise, -2, 10, rise, 2, 0, 0, 2,
      ]);
      return { vertices, indices: new Uint32Array([0, 3, 2, 0, 2, 1]) };
    };

    const gentle = Math.tan((20 * Math.PI) / 180);
    addBox(world, {
      id: 'ramp20',
      shape: { kind: 'trimesh', vertices: ramp((20 * Math.PI) / 180).vertices, indices: ramp((20 * Math.PI) / 180).indices },
      position: { x: 0, y: 0, z: 0 },
      layer: Layer.World,
    });
    const character = world.createCharacter({ x: 1, y: gentle + 0.2, z: 0 });
    expect(settle(world, character)).toBe(true);
    const start = character.position.y;
    // 60 steps is about 6 m of the 9 m of ramp ahead; more would walk off its top end.
    walk(world, character, 1, 0, 60);
    expect(character.position.y).toBeGreaterThan(start + 1.5);
    expect(character.grounded).toBe(true);

    // The steep ramp gets its own world so he can approach it from flat ground.
    const world2 = await createWorld();
    addBox(world2, {
      id: 'ramp60',
      shape: { kind: 'trimesh', vertices: ramp((60 * Math.PI) / 180).vertices, indices: ramp((60 * Math.PI) / 180).indices },
      position: { x: 0, y: 0, z: 0 },
      layer: Layer.World,
    });
    const climber = world2.createCharacter({ x: -2, y: 1, z: 0 });
    expect(settle(world2, climber)).toBe(true);
    walk(world2, climber, 1, 0, 180);
    expect(climber.position.y).toBeLessThan(0.3); // does not climb
    expect(climber.position.x).toBeLessThan(0.6);
  });

  it('steps over a 0.15 m lip but not a 0.6 m one', async () => {
    const world = await createWorld();
    addBox(world, {
      id: 'lip',
      shape: { kind: 'box', halfExtents: [1, 0.075, 1] },
      position: { x: 5, y: 0.075, z: 0 },
      layer: Layer.Block,
    });
    const character = world.createCharacter({ x: 1, y: 1, z: 0 });
    expect(settle(world, character)).toBe(true);
    // The lip only spans x = 4..6 on a ground that ends at x = 20, so stop on top of
    // it instead of walking off its far side and then off the edge of the world.
    for (let i = 0; i < 240 && character.position.x < 5; i++) {
      character.move(1, 0, DT);
      world.step(DT);
    }
    expect(Math.abs(character.position.y - 0.15)).toBeLessThan(0.03);
    expect(character.position.x).toBeGreaterThanOrEqual(5);

    const world2 = await createWorld();
    addBox(world2, {
      id: 'step',
      shape: { kind: 'box', halfExtents: [1, 0.3, 1] },
      position: { x: 5, y: 0.3, z: 0 },
      layer: Layer.Block,
    });
    const blocked = world2.createCharacter({ x: 1, y: 1, z: 0 });
    expect(settle(world2, blocked)).toBe(true);
    walk(world2, blocked, 1, 0, 120);
    expect(blocked.position.x).toBeLessThan(4 - 0.25);
    expect(blocked.position.y).toBeLessThan(0.05);
  });

  it('teleports and zeroes velocity', async () => {
    const world = await createWorld();
    const character = world.createCharacter({ x: 0, y: 1, z: 0 });
    walk(world, character, 1, 0, 30);
    expect(character.velocity.x).toBeGreaterThan(1);
    character.teleport({ x: 10, y: 2, z: -3 });
    expect(character.velocity.x).toBe(0);
    expect(character.velocity.y).toBe(0);
    expect(character.position.x).toBe(10);
    expect(character.position.y).toBe(2);
    expect(character.position.z).toBe(-3);
    expect(settle(world, character)).toBe(true);
    expect(character.position.x).toBe(10);
    expect(character.position.y).toBeLessThan(2.1);
  });
});
