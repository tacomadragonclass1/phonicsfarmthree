import { describe, expect, it } from 'vitest';
import { Guide, type GuidePoint } from '../src/game/Guide';

const STEP = 1 / 60;

function walk(guide: Guide, steps: number, follower: GuidePoint): void {
  for (let i = 0; i < steps; i += 1) guide.step(STEP, follower);
}

/** The follower walking right beside her, so she never has to wait. */
function beside(guide: Guide): GuidePoint {
  return { x: guide.position.x, z: guide.position.z };
}

/** How far along the polyline she is: a step crossing a corner walks two pieces, not the chord. */
function arcLength(path: readonly GuidePoint[], p: GuidePoint): number {
  let total = 0;
  for (const [i, from] of path.slice(0, -1).entries()) {
    const to = path[i + 1];
    const segment = Math.hypot(to.x - from.x, to.z - from.z);
    const on = Math.hypot(p.x - from.x, p.z - from.z);
    if (on <= segment) return total + on;
    total += segment;
  }
  return total;
}

describe('a follower far ahead', () => {
  it('does not stop her at a corner he has already passed', () => {
    // An L-shaped walk; he stands at the far end, much further from her next corner than she is.
    const guide = new Guide({ path: [{ x: 0, z: 0 }, { x: 0, z: 10 }, { x: 30, z: 10 }] });
    guide.lead();
    for (let i = 0; i < 60; i++) guide.step(1 / 60, { x: 30, z: 10 });
    expect(guide.position.z).toBeGreaterThan(2);
  });
});

describe('Guide', () => {
  it('does nothing before lead()', () => {
    const guide = new Guide({ path: [{ x: 0, z: 0 }, { x: 10, z: 0 }] });
    walk(guide, 60, { x: 0, z: 0 });
    expect(guide.leading).toBe(false);
    expect(guide.arrived).toBe(false);
    expect(guide.moving).toBe(false);
    expect(guide.position).toEqual({ x: 0, z: 0 });
  });
  it('walks a straight path at speed and faces along it', () => {
    const guide = new Guide({ path: [{ x: 0, z: 0 }, { x: 10, z: 0 }] });
    guide.lead();
    walk(guide, 60, beside(guide));
    expect(guide.position.x).toBeCloseTo(2.6, 2);
    expect(guide.position.z).toBeCloseTo(0, 6);
    expect(guide.moving).toBe(true);
    expect(guide.yaw).toBeCloseTo(Math.PI / 2, 6); // +x
  });
  it('turns a corner and carries the remainder of the step onto the next segment', () => {
    const path = [{ x: 0, z: 0 }, { x: 5, z: 0 }, { x: 5, z: 5 }];
    const guide = new Guide({ path });
    guide.lead();
    let walked = 0;
    let time = 0;
    for (const dt of [...Array(115).fill(STEP), 0.1]) {
      const before = arcLength(path, guide.position);
      guide.step(dt, beside(guide));
      walked += arcLength(path, guide.position) - before;
      time += dt;
    }
    expect(walked).toBeCloseTo(2.6 * time, 6);
    expect(guide.position.x).toBeCloseTo(5, 6);
    expect(guide.position.z).toBeCloseTo(2.6 * time - 5, 6); // 0.243 m past the corner
    expect(guide.yaw).toBeCloseTo(0, 6); // facing +z down the second segment
  });
  it('waits for a follower left behind and sets off again when he catches up', () => {
    const guide = new Guide({ path: [{ x: 0, z: 0 }, { x: 20, z: 0 }] });
    guide.lead();
    guide.step(STEP, beside(guide));
    expect(guide.moving).toBe(true);
    guide.step(STEP, { x: guide.position.x - 6, z: 0 });
    expect(guide.moving).toBe(false);
    expect(guide.yaw).toBeCloseTo(-Math.PI / 2, 6); // turned back to him
    const held = { x: guide.position.x, z: guide.position.z };
    guide.step(STEP, { x: held.x - 4, z: 0 }); // still further than resumeDistance
    expect(guide.moving).toBe(false);
    expect(guide.position).toEqual(held);
    guide.step(STEP, { x: held.x - 2, z: 0 });
    expect(guide.moving).toBe(true);
    expect(guide.position).not.toEqual(held);
    expect(guide.yaw).toBeCloseTo(Math.PI / 2, 6); // facing along the path again
  });
  it('arrives once, lands exactly on the last point, and then does nothing', () => {
    const end = { x: 0, z: 5 };
    const guide = new Guide({ path: [{ x: 0, z: 0 }, end] });
    let arrived = 0;
    guide.on('arrived', () => void (arrived += 1));
    guide.lead();
    for (let i = 0; i < 120 && !guide.arrived; i += 1) guide.step(STEP, { x: 0, z: guide.position.z - 4 });
    expect(guide.arrived).toBe(true);
    expect(guide.leading).toBe(false);
    expect(guide.moving).toBe(false);
    expect(guide.position).toEqual(end);
    expect(arrived).toBe(1);
    expect(guide.yaw).toBeCloseTo(Math.PI, 6); // facing back to the follower
    walk(guide, 60, { x: 0, z: -1 });
    expect(guide.position).toEqual(end);
    expect(arrived).toBe(1);
  });
  it('lead() twice does not restart the walk', () => {
    const guide = new Guide({ path: [{ x: 0, z: 0 }, { x: 10, z: 0 }] });
    guide.lead();
    walk(guide, 60, beside(guide));
    const walked = guide.position.x;
    guide.lead();
    walk(guide, 60, beside(guide));
    expect(guide.position.x).toBeCloseTo(walked + 2.6, 2);
    expect(guide.arrived).toBe(false);
  });
  it('a one-point path arrives on the first step after lead()', () => {
    const guide = new Guide({ path: [{ x: 3, z: 4 }] });
    let arrived = 0;
    guide.on('arrived', () => void (arrived += 1));
    guide.lead();
    expect(guide.arrived).toBe(false);
    guide.step(STEP, { x: 3, z: 3 });
    expect(guide.arrived).toBe(true);
    expect(guide.leading).toBe(false);
    expect(guide.moving).toBe(false);
    expect(guide.position).toEqual({ x: 3, z: 4 });
    expect(arrived).toBe(1);
    expect(guide.yaw).toBeCloseTo(Math.PI, 6);
  });

  it('does not wait for a follower who has run on ahead', () => {
    const guide = new Guide({ path: [{ x: 0, z: 0 }, { x: 0, z: 20 }] });
    guide.lead();
    for (let i = 0; i < 60; i++) guide.step(1 / 60, { x: 0, z: 15 });
    expect(guide.moving).toBe(true);
    expect(guide.position.z).toBeCloseTo(2.6, 2);
  });
});
