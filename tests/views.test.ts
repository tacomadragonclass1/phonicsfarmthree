import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { BlockView } from '../src/world/BlockView';
import { CharacterView } from '../src/world/CharacterView';
import { PedestalView } from '../src/world/PedestalView';
import { FACE_NAMES, LetterFaces } from '../src/world/LetterFaces';
import { LetterTextureCache, type CanvasLike, type Ctx2DLike } from '../src/world/LetterTexture';
import type { BlockState, PedestalState, Vec3 } from '../src/core/contracts';

class FakeCtx implements Ctx2DLike {
  font = '';
  textAlign: CanvasTextAlign = 'start';
  textBaseline: CanvasTextBaseline = 'alphabetic';
  fillStyle = '';

  fillText(_text: string, _x: number, _y: number): void {}
}

class FakeCanvas implements CanvasLike {
  readonly ctx = new FakeCtx();

  constructor(
    readonly width: number,
    readonly height: number,
  ) {}

  getContext(type: '2d'): Ctx2DLike | null {
    return type === '2d' ? this.ctx : null;
  }
}

function fakeFaces(): LetterFaces {
  const cache = new LetterTextureCache({ createCanvas: (size) => new FakeCanvas(size, size) });
  return new LetterFaces(cache);
}

/** A model with a Cube plus the five named face panels, all on one shared material. */
function panelModel(shared: THREE.Material): THREE.Group {
  const model = new THREE.Group();
  const cube = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.8, 0.8), shared);
  cube.name = 'Cube';
  model.add(cube);
  for (const name of FACE_NAMES) {
    const plane = new THREE.Mesh(new THREE.PlaneGeometry(0.62, 0.62), shared);
    plane.name = name;
    model.add(plane);
  }
  return model;
}

function blockState(position: Vec3): BlockState {
  return { id: 'b1', letter: 'a', position, carried: false, pedestalId: null, silentDrops: false };
}

function pedestalState(position: Vec3): PedestalState {
  return { id: 'p1', position, snapHeight: 0.56, blockId: null };
}

describe('BlockView', () => {
  it('puts root at the state position', () => {
    const view = new BlockView({ state: blockState({ x: 1, y: 0, z: -2 }), model: panelModel(new THREE.MeshStandardMaterial()), faces: fakeFaces() });
    expect(view.root.position.toArray()).toEqual([1, 0, -2]);
  });

  it('focus lerps the panel colour without touching the shared material', () => {
    const shared = new THREE.MeshStandardMaterial();
    const view = new BlockView({ state: blockState({ x: 0, y: 0, z: 0 }), model: panelModel(shared), faces: fakeFaces() });
    const front = view.root.getObjectByName('Front') as THREE.Mesh;
    const panelMaterial = front.material as THREE.MeshStandardMaterial;
    view.setFocused(true);
    view.update(0.1);
    expect(panelMaterial.color.equals(shared.color)).toBe(false);
    expect(shared.color.equals(new THREE.Color(1, 1, 1))).toBe(true);
  });

  it('unfocus restores the panel colour exactly', () => {
    const shared = new THREE.MeshStandardMaterial();
    const view = new BlockView({ state: blockState({ x: 0, y: 0, z: 0 }), model: panelModel(shared), faces: fakeFaces() });
    const panelMaterial = (view.root.getObjectByName('Front') as THREE.Mesh).material as THREE.MeshStandardMaterial;
    const original = panelMaterial.color.clone();
    view.setFocused(true);
    view.update(0.1);
    view.setFocused(false);
    expect(panelMaterial.color.equals(original)).toBe(true);
  });

  it('each view has its own copy of the shared panel material', () => {
    const shared = new THREE.MeshStandardMaterial();
    const a = new BlockView({ state: blockState({ x: 0, y: 0, z: 0 }), model: panelModel(shared), faces: fakeFaces() });
    const b = new BlockView({ state: blockState({ x: 2, y: 0, z: 0 }), model: panelModel(shared), faces: fakeFaces() });
    const materialA = (a.root.getObjectByName('Front') as THREE.Mesh).material;
    const materialB = (b.root.getObjectByName('Front') as THREE.Mesh).material;
    expect(materialA).not.toBe(materialB);
    expect(materialA).not.toBe(shared);
  });

  it('the bob runs on an inner group, so root stays at the state position', () => {
    const view = new BlockView({ state: blockState({ x: 1.5, y: 0, z: -2 }), model: panelModel(new THREE.MeshStandardMaterial()), faces: fakeFaces() });
    view.setFocused(true);
    for (let i = 0; i < 5; i += 1) view.update(0.05);
    expect(view.root.position.toArray()).toEqual([1.5, 0, -2]);
  });

  it('focus eases the inner group scale up and back without scaling root', () => {
    const view = new BlockView({ state: blockState({ x: 1.5, y: 0, z: -2 }), model: panelModel(new THREE.MeshStandardMaterial()), faces: fakeFaces() });
    const inner = view.root.children[0];
    view.setFocused(true);
    for (let i = 0; i < 10; i += 1) view.update(0.05);
    expect(inner.scale.x).toBeGreaterThan(1.1);
    expect(view.root.scale.toArray()).toEqual([1, 1, 1]);

    view.setFocused(false);
    for (let i = 0; i < 10; i += 1) view.update(0.05);
    expect(inner.scale.x).toBeLessThan(1.01);
  });

  it('attachTo moves root under the anchor and back to the remembered parent', () => {
    const state = blockState({ x: 1, y: 0.6, z: -2 });
    const scene = new THREE.Group();
    const view = new BlockView({ state, model: panelModel(new THREE.MeshStandardMaterial()), faces: fakeFaces() });
    scene.add(view.root);
    const anchor = new THREE.Object3D();
    scene.add(anchor);

    view.attachTo(anchor);
    expect(view.root.parent).toBe(anchor);
    expect(view.root.position.toArray()).toEqual([0, 0, 0]);

    view.attachTo(null);
    expect(view.root.parent).toBe(scene);
    expect(view.root.position.toArray()).toEqual([1, 0.6, -2]);
  });

  it('a model with only Cube does not throw on focus', () => {
    const cubeOnly = new THREE.Group();
    cubeOnly.add(new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.8, 0.8), new THREE.MeshStandardMaterial()));
    const view = new BlockView({ state: blockState({ x: 0, y: 0, z: 0 }), model: cubeOnly, faces: fakeFaces() });
    expect(() => {
      view.setFocused(true);
      view.update(0.1);
    }).not.toThrow();
  });
});

describe('PedestalView', () => {
  it('puts post at 0.25 and cap at 0.56 under root at the state position', () => {
    const view = new PedestalView({ state: pedestalState({ x: 3, y: 0, z: 1 }), post: new THREE.Group(), cap: new THREE.Group() });
    expect(view.root.position.toArray()).toEqual([3, 0, 1]);
    expect(view.post.position.y).toBe(0.25);
    expect(view.cap.position.y).toBe(0.56);
  });

  it('focused cap rises, unfocused cap settles back to rest', () => {
    const view = new PedestalView({ state: pedestalState({ x: 0, y: 0, z: 0 }), post: new THREE.Group(), cap: new THREE.Group() });
    view.setFocused(true);
    view.update(0.2);
    expect(view.cap.position.y).toBeGreaterThan(0.56);

    view.setFocused(false);
    for (let i = 0; i < 10; i += 1) view.update(0.05);
    expect(Math.abs(view.cap.position.y - 0.56)).toBeLessThan(0.005);
  });
});

describe('CharacterView', () => {
  const clips = (names: string[]): Map<string, THREE.AnimationClip> =>
    new Map(names.map((name) => [name, new THREE.AnimationClip(name, 1, [])]));

  it('throws when the walk clip is missing', () => {
    expect(() => new CharacterView({ model: new THREE.Group(), clips: clips(['idle']) })).toThrow(/walk/);
  });

  it('setPose puts root between the two physics states', () => {
    const view = new CharacterView({ model: new THREE.Group(), clips: clips(['idle', 'walk']) });
    view.setPose({ x: 0, y: 0, z: 0 }, { x: 2, y: 0, z: 4 }, 0.5);
    expect(view.root.position.toArray()).toEqual([1, 0, 2]);
  });

  it('first facing snaps, later facing eases', () => {
    const view = new CharacterView({ model: new THREE.Group(), clips: clips(['idle', 'walk']) });
    view.setFacing(1);
    expect(view.root.rotation.y).toBe(1);

    view.setFacing(2);
    view.update(0.01);
    expect(view.root.rotation.y).toBeGreaterThan(1);
    expect(view.root.rotation.y).toBeLessThan(2);
  });
});
