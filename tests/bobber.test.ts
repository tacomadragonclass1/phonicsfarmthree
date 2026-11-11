import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { Bobber } from '../src/world/Bobber';

function block(): THREE.Object3D {
  const node = new THREE.Object3D();
  node.position.set(1.5, 0.4, -2.25);
  node.rotation.set(0.3, 1.1, 0.7);
  return node;
}

describe('Bobber', () => {
  it('reaches base + amplitude after a quarter period', () => {
    const node = block();
    const bobber = new Bobber(node);
    const quarterPeriod = 1 / (4 * 1.2); // 1/(4f) is the peak of the sine
    bobber.update(quarterPeriod);
    expect(node.position.y).toBeCloseTo(0.4 + 0.08, 10);
  });

  it('yaw advances by spin * elapsed time', () => {
    const node = block();
    const bobber = new Bobber(node, { spin: 0.9 });
    bobber.update(0.25);
    bobber.update(0.25);
    expect(node.rotation.y).toBeCloseTo(1.1 + 0.9 * 0.5, 10);
  });

  it('honours custom options', () => {
    const node = block();
    const bobber = new Bobber(node, { amplitude: 0.2, frequency: 0.5, spin: 0 });
    bobber.update(0.5); // half period = peak
    expect(node.position.y).toBeCloseTo(0.4 + 0.2, 10);
    expect(node.rotation.y).toBeCloseTo(1.1, 10);
  });

  it('never touches x/z or rotation x/z', () => {
    const node = block();
    const bobber = new Bobber(node);
    bobber.update(0.1);
    expect(node.position.x).toBe(1.5);
    expect(node.position.z).toBe(-2.25);
    expect(node.rotation.x).toBe(0.3);
    expect(node.rotation.z).toBe(0.7);
  });

  it('disabling restores base y and yaw and resets internal time', () => {
    const node = block();
    const bobber = new Bobber(node);
    bobber.update(0.1);
    expect(node.position.y).not.toBeCloseTo(0.4, 6);

    bobber.enabled = false;
    expect(node.position.y).toBeCloseTo(0.4, 10);
    expect(node.rotation.y).toBeCloseTo(1.1, 10);

    bobber.update(0.1); // disabled: nothing happens
    expect(node.position.y).toBeCloseTo(0.4, 10);

    bobber.enabled = true;
    bobber.update(0); // time restarted at 0
    expect(node.position.y).toBeCloseTo(0.4, 10);
    expect(node.rotation.y).toBeCloseTo(1.1, 10);
  });

  it('dispose restores the target and freezes later updates', () => {
    const node = block();
    const bobber = new Bobber(node);
    bobber.update(0.1);
    bobber.dispose();
    expect(node.position.y).toBeCloseTo(0.4, 10);
    expect(node.rotation.y).toBeCloseTo(1.1, 10);

    bobber.update(1);
    expect(node.position.y).toBeCloseTo(0.4, 10);
    expect(node.rotation.y).toBeCloseTo(1.1, 10);
    bobber.dispose(); // second dispose is a no-op
    expect(node.position.y).toBeCloseTo(0.4, 10);
  });

  it('rejects negative or non-finite options', () => {
    const node = block();
    for (const options of [
      { amplitude: -0.01 },
      { amplitude: Number.NaN },
      { frequency: -1 },
      { frequency: Number.POSITIVE_INFINITY },
      { spin: -0.1 },
      { spin: Number.NaN },
    ]) {
      expect(() => new Bobber(node, options)).toThrow(RangeError);
    }
    // Zero is a valid (degenerate) option: no hover, no spin.
    const still = block();
    const bobber = new Bobber(still, { amplitude: 0, frequency: 0, spin: 0 });
    bobber.update(1);
    expect(still.position.y).toBe(0.4);
    expect(still.rotation.y).toBe(1.1);
  });
});
