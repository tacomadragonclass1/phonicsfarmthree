import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { BellView } from '../src/world/BellView';
import { BlockView } from '../src/world/BlockView';
import { LetterFaces } from '../src/world/LetterFaces';
import { LetterTextureCache, type CanvasLike, type Ctx2DLike } from '../src/world/LetterTexture';
import type { BlockState, Vec3 } from '../src/core/contracts';

class FakeCtx implements Ctx2DLike {
  font = '';
  textAlign: CanvasTextAlign = 'start';
  textBaseline: CanvasTextBaseline = 'alphabetic';
  fillStyle = '';
  fillText(_text: string, _x: number, _y: number): void {}
}

class FakeCanvas implements CanvasLike {
  readonly ctx = new FakeCtx();
  constructor(readonly width: number, readonly height: number) {}
  getContext(type: '2d'): Ctx2DLike | null {
    return type === '2d' ? this.ctx : null;
  }
}

function fakeFaces(): LetterFaces {
  const cache = new LetterTextureCache({ createCanvas: (size) => new FakeCanvas(size, size) });
  return new LetterFaces(cache);
}

function blockState(position: Vec3): BlockState {
  return { id: 'b1', letter: 'a', position, carried: false, pedestalId: null, silentDrops: false };
}

function makeBlock(position: Vec3): BlockView {
  return new BlockView({ state: blockState(position), model: new THREE.Group(), faces: fakeFaces() });
}

describe('BellView', () => {
  function makeBell(): BellView {
    return new BellView({ position: { x: 2, y: 0, z: 3 }, frame: new THREE.Group(), bell: new THREE.Group() });
  }

  it('puts the frame at 0 and the bell at the pivot height under root at the position', () => {
    const view = makeBell();
    expect(view.root.position.toArray()).toEqual([2, 0, 3]);
    expect(view.frame.position.toArray()).toEqual([0, 0, 0]);
    expect(view.bell.position.toArray()).toEqual([0, 1.42, 0]);
  });

  it('swings after ring and stops exactly at zero', () => {
    const view = makeBell();
    view.ring();
    view.update(0.15);
    expect(view.bell.rotation.z).not.toBe(0);
    for (let i = 0; i < 40; i += 1) view.update(0.1);
    expect(view.bell.rotation.z).toBe(0);
  });

  it('ring during a swing restarts it', () => {
    const view = makeBell();
    view.ring();
    for (let i = 0; i < 40; i += 1) view.update(0.1);
    view.ring();
    view.update(0.15);
    expect(view.bell.rotation.z).not.toBe(0);
  });

  it('focus eases the bell scale up and back without moving root', () => {
    const view = makeBell();
    view.setFocused(true);
    for (let i = 0; i < 10; i += 1) view.update(0.05);
    expect(view.bell.scale.x).toBeGreaterThan(1.08);
    view.setFocused(false);
    for (let i = 0; i < 10; i += 1) view.update(0.05);
    expect(view.bell.scale.x).toBeLessThan(1.01);
    expect(view.root.position.toArray()).toEqual([2, 0, 3]);
  });

  it('dispose removes root from its parent', () => {
    const scene = new THREE.Group();
    const view = makeBell();
    scene.add(view.root);
    view.dispose();
    expect(scene.children).toEqual([]);
  });
});

describe('BlockView reactions', () => {
  it('pulse pops the lift group up and back to the ground', () => {
    const view = makeBlock({ x: 1, y: 0, z: -2 });
    const lift = view.root.children[0];
    view.pulse();
    view.update(0.17);
    expect(lift.position.y).toBeGreaterThan(0.1);
    for (let i = 0; i < 2; i += 1) view.update(0.2);
    expect(lift.position.y).toBe(0);
    expect(view.root.position.toArray()).toEqual([1, 0, -2]);
  });

  it('celebrate waits for the delay then hops three times and stops', () => {
    const view = makeBlock({ x: 1, y: 0, z: -2 });
    const lift = view.root.children[0];
    view.celebrate(0.2);
    view.update(0.1);
    expect(lift.position.y).toBe(0);
    view.update(0.25);
    expect(lift.position.y).toBeGreaterThan(0);
    for (let i = 0; i < 20; i += 1) view.update(0.1);
    expect(lift.position.y).toBe(0);
    expect(view.root.position.toArray()).toEqual([1, 0, -2]);
  });
});
