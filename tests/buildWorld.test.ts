import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { AssetLibrary, type GltfLoaderLike } from '../src/assets/AssetLibrary';
import { MODELS, type ModelId } from '../src/assets/manifest';
import { PhysicsWorld } from '../src/physics/PhysicsWorld';
import { LetterTextureCache, type CanvasLike, type Ctx2DLike } from '../src/world/LetterTexture';
import { BELL, BLOCKS, PEDESTALS, PROPS, TERRAIN_TILES } from '../src/world/layout';
import { blockColliderCentre, buildWorld, PEDESTAL, type SliceWorld } from '../src/world/buildWorld';

const DT = 1 / 60;
const MODEL_IDS = Object.keys(MODELS) as ModelId[];

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
    // Every url gets the clips the manifest might require, so any model can be loaded.
    const clips = [new THREE.AnimationClip('idle', 1, []), new THREE.AnimationClip('walk', 1, [])];
    return { scene, animations: clips };
  },
};

interface Fixture {
  scene: THREE.Scene;
  physics: PhysicsWorld;
  library: AssetLibrary;
  letters: LetterTextureCache;
  world: SliceWorld;
}

async function fixtureBase(): Promise<Omit<Fixture, 'world'>> {
  const physics = await PhysicsWorld.create();
  const library = new AssetLibrary({ baseUrl: '/', loader: fakeLoader });
  await library.load(MODEL_IDS);
  const letters = new LetterTextureCache({ createCanvas: (size) => new FakeCanvas(size, size) });
  return { scene: new THREE.Scene(), physics, library, letters };
}

async function setup(): Promise<Fixture> {
  const base = await fixtureBase();
  return { ...base, world: buildWorld(base) };
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
    expect(world.blocks.map((block) => block.id)).toEqual(BLOCKS.map((block) => block.id));
    expect(world.pedestals.map((pedestal) => pedestal.id)).toEqual(PEDESTALS.map((p) => p.id));
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

  it('puts the bell on the ground and blocks reach through its frame', async () => {
    const { scene, physics, world } = await setup();
    const layout = BELL;
    const root = world.bell.view.root;
    expect(root.parent).toBe(scene);
    expect(root.position.y).toBe(0); // flat test ground
    expect(root.position.x).toBeCloseTo(layout.x, 10);
    expect(root.position.z).toBeCloseTo(layout.z, 10);

    // Straight through the frame slab at its collider centre height.
    const from = { x: layout.x, y: 0.875, z: layout.z - 1 };
    const to = { x: layout.x, y: 0.875, z: layout.z + 1 };
    expect(physics.canReach(from, to)).toBe(false);
    expect(physics.canReach(from, to, ['bell'])).toBe(true);
  });

  it('puts Annette in the scene with a collider Chuck cannot walk through', async () => {
    const { scene, physics, world } = await setup();
    expect(world.annette.view.root.parent).toBe(scene);
    const centre = { x: world.annette.position.x, y: world.annette.position.y + 0.75, z: world.annette.position.z };
    expect(physics.isBoxClear(centre, { x: 0.2, y: 0.2, z: 0.2 })).toBe(false);
  });

  it('places every terrain tile, so a neighbouring tile is still ground', async () => {
    const { scene, physics } = await setup();
    const roots = scene.children.filter((child) => meshesUnder(child).some((mesh) => mesh.name === 'TerrainQuad'));
    expect(roots.length).toBe(TERRAIN_TILES.length);
    // Past the centre tile but inside the east one, then past every tile.
    expect(physics.groundHeight(30, 0, 6)).not.toBeNull();
    expect(physics.groundHeight(60, 0, 6)).toBeNull();
  });

  it('adds one scene object per prop', async () => {
    const base = await fixtureBase();
    const before = base.scene.children.length;
    buildWorld(base);
    expect(base.scene.children.length - before).toBeGreaterThanOrEqual(PROPS.length);
  });

  it('the invisible edge walls stop a ray leaving the square', async () => {
    const { physics } = await setup();
    expect(physics.canReach({ x: 30, y: 1, z: 0 }, { x: 44, y: 1, z: 0 })).toBe(false);
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

    const blockView = world.blockViews.get(BLOCKS[0].id);
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
