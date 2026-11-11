import { describe, expect, it } from 'vitest';
import {
  angleDelta,
  clamp,
  damp,
  dampAngle,
  directionFromYaw,
  horizontalDistance,
  lerp,
  limitLength2,
  moveToward,
  rotateY,
  wrapAngle,
  yawFromDirection,
} from '../src/core/math';

const PI = Math.PI;

describe('clamp and lerp', () => {
  it('clamps to the bounds', () => {
    expect(clamp(0.5, 0, 1)).toBe(0.5);
    expect(clamp(-3, 0, 1)).toBe(0);
    expect(clamp(3, 0, 1)).toBe(1);
    expect(clamp(0, 0, 1)).toBe(0);
    expect(clamp(1, 0, 1)).toBe(1);
  });

  it('lerps at the ends and the middle', () => {
    expect(lerp(2, 8, 0)).toBe(2);
    expect(lerp(2, 8, 1)).toBe(8);
    expect(lerp(2, 8, 0.5)).toBe(5);
    expect(lerp(2, 8, 2)).toBe(14); // t is not clamped here; clamp() is for that
  });
});

describe('damp', () => {
  it('holds still for dt 0 and reaches the target as dt grows', () => {
    expect(damp(1, 5, 10, 0)).toBe(1);
    expect(damp(1, 5, 10, 1)).toBeCloseTo(4.9998184, 7);
  });

  it('is frame-rate independent: the same elapsed time gives the same result', () => {
    const oneStep = damp(0, 10, 5, 1);
    let value = 0;
    for (let i = 0; i < 60; i += 1) value = damp(value, 10, 5, 1 / 60);
    expect(value).toBeCloseTo(oneStep, 12);

    // And the same holds for a different split of the same second.
    let split = 0;
    for (const dt of [0.4, 0.3, 0.2, 0.1]) split = damp(split, 10, 5, dt);
    expect(split).toBeCloseTo(oneStep, 12);
  });

  it('never passes the target', () => {
    let value = 0;
    for (let i = 0; i < 1000; i += 1) value = damp(value, 10, 3, 0.016);
    expect(value).toBeLessThan(10);
    expect(value).toBeCloseTo(10, 6);
  });
});

describe('moveToward', () => {
  it('moves by at most maxDelta and never overshoots', () => {
    expect(moveToward(0, 10, 3)).toBe(3);
    expect(moveToward(0, 2, 3)).toBe(2); // closer than maxDelta: land exactly
    expect(moveToward(0, 3, 3)).toBe(3); // exactly maxDelta: land exactly
    expect(moveToward(0, -10, 3)).toBe(-3);
    expect(moveToward(0, -2, 3)).toBe(-2);
    expect(moveToward(5, 5, 1)).toBe(5);
    expect(moveToward(0, 10, 0)).toBe(0);
  });

  it('walks to the target and stops there', () => {
    let value = 0;
    for (let i = 0; i < 10; i += 1) value = moveToward(value, 1, 0.2);
    expect(value).toBe(1);
    for (let i = 0; i < 5; i += 1) value = moveToward(value, 1, 0.2);
    expect(value).toBe(1);
  });
});

describe('wrapAngle and angleDelta', () => {
  it('wraps into (-PI, PI]', () => {
    expect(wrapAngle(0)).toBe(0);
    expect(wrapAngle(PI / 2)).toBeCloseTo(PI / 2, 12);
    expect(wrapAngle(-PI / 2)).toBeCloseTo(-PI / 2, 12);
    expect(wrapAngle(PI)).toBeCloseTo(PI, 12);
    expect(wrapAngle(-PI)).toBeCloseTo(PI, 12); // -PI is the open end
    expect(wrapAngle(3 * PI)).toBeCloseTo(PI, 12);
    expect(wrapAngle(-3 * PI)).toBeCloseTo(PI, 12);
    expect(wrapAngle(2 * PI)).toBeCloseTo(0, 12);
    expect(wrapAngle(-2 * PI)).toBeCloseTo(0, 12);
    expect(wrapAngle(PI + 0.1)).toBeCloseTo(-PI + 0.1, 12);
    expect(wrapAngle(-PI - 0.1)).toBeCloseTo(PI - 0.1, 12);
  });

  it('always returns a value in (-PI, PI]', () => {
    for (let i = -200; i <= 200; i += 1) {
      const a = wrapAngle(i * 0.37);
      expect(a).toBeGreaterThan(-PI);
      expect(a).toBeLessThanOrEqual(PI);
    }
  });

  it('takes the shortest signed difference', () => {
    expect(angleDelta(0, PI / 2)).toBeCloseTo(PI / 2, 12);
    expect(angleDelta(0, -PI / 2)).toBeCloseTo(-PI / 2, 12);
    // Crossing the seam the short way, not the long way round.
    expect(angleDelta(3.0, -3.0)).toBeCloseTo(0.2831853, 7);
    expect(angleDelta(-3.0, 3.0)).toBeCloseTo(-0.2831853, 7);
    expect(angleDelta(1, 1)).toBe(0);
    expect(angleDelta(0, PI)).toBeCloseTo(PI, 12);
    // A 180 degree tie resolves to the closed end of (-PI, PI].
    expect(angleDelta(PI, 0)).toBeCloseTo(PI, 12);
  });
});

describe('dampAngle', () => {
  it('approaches along the shortest arc across the seam', () => {
    const current = 3.0;
    const target = -3.0;
    const step = angleDelta(3.0, -3.0) * (1 - Math.exp(-1));
    const after = dampAngle(current, target, 2, 0.5);
    // Shortest arc is forward through PI, so it crossed the seam to just below -PI.
    expect(after).toBeCloseTo(wrapAngle(3.0 + step), 12);
    expect(after).toBeLessThan(-3.0);
    expect(angleDelta(current, after)).toBeCloseTo(step, 12);

    // The other way must take the short arc back through -PI.
    const back = dampAngle(-3.0, 3.0, 2, 0.5);
    expect(angleDelta(-3.0, back)).toBeCloseTo(-step, 12);
  });

  it('holds still for dt 0 and wraps its result', () => {
    expect(dampAngle(PI, -PI + 0.2, 5, 0)).toBeCloseTo(PI, 12);
    const moved = dampAngle(PI, -PI + 0.2, 5, 0.2);
    expect(moved).toBeGreaterThan(-PI);
    expect(moved).toBeLessThanOrEqual(PI);
    expect(moved).toBeCloseTo(-PI + 0.2 * (1 - Math.exp(-1)), 9);

    // A target already wrapped must give the same result as the unwrapped one.
    expect(dampAngle(0.5, wrapAngle(0.5 + 2 * PI), 5, 0.2)).toBeCloseTo(dampAngle(0.5, 0.5, 5, 0.2), 12);
  });

  it('converges to the target from the short side', () => {
    let yaw = -3.1;
    for (let i = 0; i < 500; i += 1) yaw = dampAngle(yaw, 3.1, 4, 0.016);
    expect(yaw).toBeCloseTo(3.1, 3);
    expect(yaw).toBeGreaterThan(-PI);
    expect(yaw).toBeLessThanOrEqual(PI);
  });
});

describe('yaw and direction', () => {
  it('yaw 0 faces +Z', () => {
    expect(yawFromDirection(0, 1)).toBe(0);
    expect(yawFromDirection(1, 0)).toBeCloseTo(PI / 2, 12);
    expect(yawFromDirection(0, -1)).toBeCloseTo(PI, 12); // atan2(0,-1) is PI
    expect(yawFromDirection(-1, 0)).toBeCloseTo(-PI / 2, 12);
    expect(yawFromDirection(0, 0)).toBe(0);
  });

  it('directionFromYaw round-trips with yawFromDirection', () => {
    for (const yaw of [0, 0.7, PI / 2, PI, -PI / 2, -2.5]) {
      const dir = directionFromYaw(yaw);
      expect(yawFromDirection(dir.x, dir.z)).toBeCloseTo(wrapAngle(yaw), 12);
    }
    expect(directionFromYaw(0)).toEqual({ x: 0, z: 1 });
    // cos(PI/2) is not exactly 0 in floating point, so compare loosely.
    const east = directionFromYaw(PI / 2);
    expect(east.x).toBeCloseTo(1, 12);
    expect(east.z).toBeCloseTo(0, 12);
  });

  it('rotateY sends +Z to +X for a 90 degree turn', () => {
    const turned = rotateY(0, 1, PI / 2);
    expect(turned.x).toBeCloseTo(1, 12);
    expect(turned.z).toBeCloseTo(0, 12);

    // Right-handed about +Y: +X goes to -Z.
    const fromX = rotateY(1, 0, PI / 2);
    expect(fromX.x).toBeCloseTo(0, 12);
    expect(fromX.z).toBeCloseTo(-1, 12);

    // A full turn returns the vector, and length is preserved.
    const full = rotateY(0.6, 0.8, PI);
    expect(full.x).toBeCloseTo(-0.6, 12);
    expect(full.z).toBeCloseTo(-0.8, 12);
    expect(Math.hypot(full.x, full.z)).toBeCloseTo(1, 12);

    // rotateY agrees with yaw: turning a heading by yaw gives directionFromYaw.
    const turnedYaw = rotateY(0, 1, 1.2);
    const dir = directionFromYaw(1.2);
    expect(turnedYaw.x).toBeCloseTo(dir.x, 12);
    expect(turnedYaw.z).toBeCloseTo(dir.z, 12);
  });
});

describe('horizontalDistance and limitLength2', () => {
  it('horizontalDistance ignores y', () => {
    const a = { x: 1, y: 5, z: 2 };
    const b = { x: 4, y: -3, z: 6 };
    expect(horizontalDistance(a, b)).toBeCloseTo(5, 12);
    expect(horizontalDistance(a, { x: 1, y: 100, z: 2 })).toBe(0);
    expect(horizontalDistance(b, a)).toBeCloseTo(5, 12);
  });

  it('limitLength2 scales down but never up', () => {
    expect(limitLength2(3, 4, 5)).toEqual({ x: 3, y: 4 }); // already at max
    const scaled = limitLength2(3, 4, 2.5);
    expect(scaled.x).toBeCloseTo(1.5, 12);
    expect(scaled.y).toBeCloseTo(2, 12);
    expect(Math.hypot(scaled.x, scaled.y)).toBeCloseTo(2.5, 12);

    expect(limitLength2(0, 0, 5)).toEqual({ x: 0, y: 0 });
    expect(limitLength2(0, 0, 0)).toEqual({ x: 0, y: 0 });
    expect(limitLength2(1, 0, 0)).toEqual({ x: 0, y: 0 });

    const clamped = limitLength2(0.6, -0.8, 1);
    expect(clamped).toEqual({ x: 0.6, y: -0.8 });
  });
});
