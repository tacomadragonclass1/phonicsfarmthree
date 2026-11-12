import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { AssetLibrary, type GltfLoaderLike } from '../src/assets/AssetLibrary';
import { PhysicsWorld } from '../src/physics/PhysicsWorld';
import { LetterTextureCache, type CanvasLike, type Ctx2DLike } from '../src/world/LetterTexture';
import { blockColliderCentre, buildWorld, PEDESTAL, SLICE_LAYOUT, type SliceWorld } from '../src/world/buildWorld';

const DT = 1 / 60;
const MODEL_IDS = ['terrain', 'cottage', 'tree', 'pedestalPost', 'pedestalCap', 'block', 'chuck'] as const;

class FakeCtx implements Ctx2DLike {
  font = '';
  textAlign: CanvasTextAlign = 'start';
  textBaseline: CanvasTextBaseline = 'alphabetic';
  fillStyle = '';
  fillText(): void {}
}

class FakeCanvas implements CanvasLike {
  private readonly ctx = new FakeCtx();

  constructor(
    readonly width: number,
    readonly height: number,
  ) {}

  getContext(type: '2d'): Ctx2DLike | null {
    return type === '2d' ? this.ctx : null;
  }
}

/** A mapped standard material: what applyLook paints and outlines. */
function paintedMaterial(): THREE.MeshStandardMaterial {
  const map = new THREE.DataTexture(new Uint8Array([255, 255, 255]), 1, 1);
  map.needsUpdate = true;
  return new THREE.MeshStandardMaterial({ map });
}

function boxMesh(name: string, size: number, material: THREE.Material): THREE.Mesh {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(size, size, size), material);
  mesh.name = name;
  return mesh;
}

/** One flat indexed quad, 26 x 26 m at y = 0. */
function terrainScene(): THREE.Group {
  const group = new THREE.Group();
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    'position',
    new THREE.Float32BufferAttribute([-13, 0, -13, 13, 0, -13, 13, 0, 13, -13, 0, 13], 3),
  );
  geometry.setIndex([0, 1, 2, 0, 2, 3]);
  const quad = new THREE.Mesh(geometry, paintedMaterial());
  quad.name = 'TerrainQuad';
  group.add(quad);
  return group;
}

function blockScene(): THREE.Group {
  const group = new THREE.Group();
  group.add(boxMesh('Cube', 0.8, paintedMaterial()));
  // The cream panels have no map in the real model, so applyLook leaves them alone.
  for (const name of ['Front', 'Back', 'Left', 'Right', 'Top']) {
    group.add(boxMesh(name, 0.6, new THREE.MeshStandardMaterial()));
  }
  return group;
}

function chuckScene(): THREE.Group {
  const group = new THREE.Group();
  group.add(boxMesh('Body', 0.5, paintedMaterial()));
  return group;
}

function singleBoxScene(): THREE.Group {
  const group = new THREE.Group();
  group.add(boxMesh('Body', 1, paintedMaterial()));
  return group;
}

const fakeLoader: GltfLoaderLike = {
  async loadAsync(url: string) {
    const scene = url.endsWith('terrain.glb')
      ? terrainScene()
      : url.endsWith('block.glb')
        ? blockScene()
        : url.endsWith('chuck.glb')
          ? chuckScene()
          : singleBoxScene();
    const clips = url.endsWith('chuck.glb')
      ? [new THREE.AnimationClip('idle', 1, []), new THREE.AnimationClip('walk', 1, [])]
      : [];
    return { scene, animations: clips };
  },
};

interface Fixture {
  scene: THREE.Scene;
  physics: PhysicsWorld;
  world: SliceWorld;
}

async function setup(): Promise<Fixture> {
  const physics = await PhysicsWorld.create();
  const library = new AssetLibrary({ baseUrl: '/', loader: fakeLoader });
  await library.load([...MODEL_IDS]);
  const letters = new LetterTextureCache({ createCanvas: (size) => new FakeCanvas(size, size) });
  const scene = new THREE.Scene();
  return { scene, physics, world: buildWorld({ scene, library, physics, letters }) };
}

function meshesUnder(root: THREE.Object3D): THREE.Mesh[] {
  const meshes: THREE.Mesh[] = [];
  root.traverse((node) => {
    if (node instanceof THREE.Mesh) meshes.push(node);
  });
  return meshes;
}

describe('buildWorld', () => {
  it('creates the state and a view for every block and pedestal', async () => {
    const { scene, world } = await setup();
    expect(world.blocks.map((block) => block.id)).toEqual(SLICE_LAYOUT.blocks.map((block) => block.id));
    expect(world.pedestals.map((pedestal) => pedestal.id)).toEqual(SLICE_LAYOUT.pedestals.map((p) => p.id));
    expect(world.blockViews.size).toBe(8);
    expect(world.pedestalViews.size).toBe(3);
    for (const view of world.blockViews.values()) expect(view.root.parent).toBe(scene);
    for (const view of world.pedestalViews.values()) expect(view.root.parent).toBe(scene);
    expect(world.lighting.group.parent).toBe(scene);
    expect(scene.fog).toBeInstanceOf(THREE.FogExp2);
  });

  it('puts each block root at its state position on the flat ground', async () => {
    const { world } = await setup();
    for (const block of world.blocks) {
      const view = world.blockViews.get(block.id);
      if (!view) throw new Error(`no view for ${block.id}`);
      expect(block.position.y).toBe(0);
      expect(view.root.position.x).toBeCloseTo(block.position.x, 10);
      expect(view.root.position.y).toBeCloseTo(block.position.y, 10);
      expect(view.root.position.z).toBeCloseTo(block.position.z, 10);
    }
  });

  it('registers each block collider under the block id', async () => {
    const { physics, world } = await setup();
    for (const block of world.blocks) {
      const centre = blockColliderCentre(block.position);
      // 1 m each side: past the block's own 0.4 half extent, but short enough to
      // stay out of the pedestal cylinders, which are the only other things in range.
      const from = { x: block.position.x - 1, y: centre.y, z: block.position.z };
      const to = { x: block.position.x + 1, y: centre.y, z: block.position.z };
      expect(physics.canReach(from, to)).toBe(false);
      expect(physics.canReach(from, to, [block.id])).toBe(true);
    }
  });

  it('registers each pedestal collider at its centre', async () => {
    const { physics, world } = await setup();
    for (const pedestal of world.pedestals) {
      const centre = {
        x: pedestal.position.x,
        y: pedestal.position.y + PEDESTAL.height / 2,
        z: pedestal.position.z,
      };
      const probe = { x: 0.1, y: 0.1, z: 0.1 };
      expect(pedestal.snapHeight).toBe(PEDESTAL.height);
      expect(physics.isBoxClear(centre, probe)).toBe(false);
      expect(physics.isBoxClear(centre, probe, [pedestal.id])).toBe(true);
    }
  });

  it('the player settles on the ground', async () => {
    const { physics, world } = await setup();
    const body = world.player.body;
    // Run the frames out: `grounded` is true on the first frame that touches the
    // ground, and the feet keep closing to the controller's 0.02 m offset after it.
    for (let i = 0; i < 120; i++) {
      body.move(0, 0, DT);
      physics.step(DT);
    }
    expect(body.grounded).toBe(true);
    expect(body.position.y).toBeGreaterThanOrEqual(0);
    expect(body.position.y).toBeLessThan(0.03);
  });

  it('the character root is a direct child of the scene', async () => {
    const { scene, world } = await setup();
    expect(world.player.view.root.parent).toBe(scene);
  });

  it('shadow flags follow the manifest, and ink hulls never cast or receive', async () => {
    const { scene, world } = await setup();
    const outlines = meshesUnder(scene).filter((mesh) => mesh.userData.isOutline === true);
    expect(outlines.length).toBeGreaterThan(0);
    for (const outline of outlines) {
      expect(outline.castShadow).toBe(false);
      expect(outline.receiveShadow).toBe(false);
    }

    const quad = scene.getObjectByName('TerrainQuad');
    if (!(quad instanceof THREE.Mesh)) throw new Error('no terrain mesh in the scene');
    expect(quad.castShadow).toBe(false);
    expect(quad.receiveShadow).toBe(true);

    const blockView = world.blockViews.get(SLICE_LAYOUT.blocks[0].id);
    const cube = blockView?.root.getObjectByName('Cube');
    expect(cube instanceof THREE.Mesh && cube.castShadow).toBe(true);
  });

  it('update runs every view', async () => {
    const { world } = await setup();
    const pedestal = world.pedestals[0];
    const view = world.pedestalViews.get(pedestal.id);
    if (!view) throw new Error('no pedestal view');
    view.setFocused(true);
    const before = view.cap.position.y;
    world.update(DT);
    expect(view.cap.position.y).toBeGreaterThan(before);
  });
});
