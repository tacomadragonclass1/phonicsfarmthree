import * as THREE from 'three';
import type { BlockState, PedestalState, Vec3 } from '../core/contracts';
import { Layer } from '../core/contracts';
import type { AssetLibrary } from '../assets/AssetLibrary';
import { MODELS, type ModelId } from '../assets/manifest';
import { applyLook, type LookOptions } from '../assets/look/applyLook';
import { createFog, createLightingRig, type LightingRig } from '../assets/look/LightingRig';
import type { CharacterBody } from '../physics/CharacterBody';
import type { PhysicsWorld } from '../physics/PhysicsWorld';
import { staticFromSpec } from './colliders';
import { BellView } from './BellView';
import { BlockView } from './BlockView';
import { CharacterView } from './CharacterView';
import { LetterFaces } from './LetterFaces';
import type { LetterTextureCache } from './LetterTexture';
import { PedestalView } from './PedestalView';

export const SLICE_LAYOUT = {
  playerStart: { x: 0, z: 3 },
  cottage: { x: 6, z: -7, yaw: 0 },
  trees: [{ x: -7, z: -6 }, { x: 9, z: 1 }, { x: -9, z: 5 }],
  blocks: [
    { id: 'block-s', letter: 's', x: -4.2, z: 1.0 },
    { id: 'block-a', letter: 'a', x: -2.6, z: 2.2 },
    { id: 'block-t', letter: 't', x: 2.6, z: 2.0 },
    { id: 'block-p', letter: 'p', x: 4.2, z: 0.8 },
    { id: 'block-i', letter: 'i', x: -5.0, z: -1.2 },
    { id: 'block-n', letter: 'n', x: 5.0, z: -1.4 },
    { id: 'block-m', letter: 'm', x: -3.4, z: 4.4 },
    { id: 'block-o', letter: 'o', x: 3.4, z: 4.6 },
  ],
  // Ordered left to right on screen: the camera's home yaw looks along -Z, so
  // increasing x is screen-right.
  pedestals: [
    { id: 'stump-1', x: -1.6, z: -3 },
    { id: 'stump-2', x: 0, z: -3 },
    { id: 'stump-3', x: 1.6, z: -3 },
  ],
  // To the right of the row, so Chuck walks up to it rather than through it.
  bell: { x: 3.6, z: -3.2 },
} as const;

/** Stump size, measured on the models: post + cap. */
export const PEDESTAL = { radius: 0.69, height: 0.61 } as const;

/** Block half extent, the same as MODELS.block.collider. */
const BLOCK_HALF = 0.4;

/** A resting block's collider is not at its bottom centre, so callers need this. */
export function blockColliderCentre(position: Vec3): Vec3 {
  return { x: position.x, y: position.y + BLOCK_HALF, z: position.z };
}

export interface BuildWorldDeps {
  scene: THREE.Scene;
  /** Already loaded. */
  library: AssetLibrary;
  physics: PhysicsWorld;
  letters: LetterTextureCache;
}

export interface SliceWorld {
  lighting: LightingRig;
  player: { body: CharacterBody; view: CharacterView };
  blocks: BlockState[];
  pedestals: PedestalState[];
  blockViews: Map<string, BlockView>;
  pedestalViews: Map<string, PedestalView>;
  bell: { id: string; position: Vec3; view: BellView };
  /** Every view, for the per-frame update(dt). */
  update(frameDt: number): void;
}

/** Puts everything in the scene, registers every collider and builds the state. */
export function buildWorld(deps: BuildWorldDeps): SliceWorld {
  const { scene, library, physics, letters } = deps;

  const lighting = createLightingRig();
  scene.add(lighting.group);
  scene.fog = createFog();

  /** Ground under a model. Only valid after the terrain is registered. */
  const groundY = (x: number, z: number): number => physics.groundHeight(x, z, 6) ?? 0;

  /** Painted models, so the manifest's shadow flags can be applied in one pass. */
  const shadowed: Array<{ root: THREE.Object3D; model: ModelId }> = [];

  /** Instantiate and paint; the caller decides where the copy sits in the graph. */
  function build(model: ModelId, look: LookOptions = {}): THREE.Object3D {
    const object = library.instantiate(model);
    applyLook(object, look);
    shadowed.push({ root: object, model });
    return object;
  }

  function register(entityId: string, model: ModelId, object: THREE.Object3D, layer: number): void {
    const options = staticFromSpec(entityId, MODELS[model].collider, object, layer, MODELS[model].blocksCamera);
    // A 'none' spec means the model is drawn but not physical.
    if (options) physics.addStatic(options);
  }

  // Terrain first: everything else is placed on it.
  const terrain = build('terrain', { outline: false });
  scene.add(terrain);
  register('terrain', 'terrain', terrain, Layer.World);

  function placeStatic(model: ModelId, x: number, z: number, entityId: string, yaw = 0): void {
    const object = build(model);
    object.position.set(x, groundY(x, z), z);
    object.rotation.y = yaw;
    scene.add(object);
    register(entityId, model, object, Layer.World);
  }

  placeStatic('cottage', SLICE_LAYOUT.cottage.x, SLICE_LAYOUT.cottage.z, 'cottage', SLICE_LAYOUT.cottage.yaw);
  SLICE_LAYOUT.trees.forEach((tree, index) => placeStatic('tree', tree.x, tree.z, `tree-${index}`));

  const pedestals: PedestalState[] = [];
  const pedestalViews = new Map<string, PedestalView>();
  for (const entry of SLICE_LAYOUT.pedestals) {
    const position = { x: entry.x, y: groundY(entry.x, entry.z), z: entry.z };
    const state: PedestalState = { id: entry.id, position, snapHeight: PEDESTAL.height, blockId: null };

    const view = new PedestalView({ state, post: build('pedestalPost'), cap: build('pedestalCap') });
    scene.add(view.root);
    pedestalViews.set(entry.id, view);
    pedestals.push(state);

    physics.addStatic({
      id: entry.id,
      shape: { kind: 'cylinder', radius: PEDESTAL.radius, height: PEDESTAL.height },
      position: { x: position.x, y: position.y + PEDESTAL.height / 2, z: position.z },
      layer: Layer.Pedestal,
      blocksCamera: MODELS.pedestalPost.blocksCamera,
    });
  }

  const bellLayout = SLICE_LAYOUT.bell;
  const bellPosition = { x: bellLayout.x, y: groundY(bellLayout.x, bellLayout.z), z: bellLayout.z };
  const frame = build('bellFrame');
  const bellModel = build('bell');
  const bellView = new BellView({ position: bellPosition, frame, bell: bellModel });
  scene.add(bellView.root);

  // Only the frame is physical: the bell hangs from it and swings freely.
  const bellCollider = staticFromSpec('bell', MODELS.bellFrame.collider, bellView.root, Layer.World, false);
  if (bellCollider) physics.addStatic(bellCollider);

  const blocks: BlockState[] = [];
  const blockViews = new Map<string, BlockView>();
  for (const entry of SLICE_LAYOUT.blocks) {
    const position = { x: entry.x, y: groundY(entry.x, entry.z), z: entry.z };
    const state: BlockState = {
      id: entry.id,
      letter: entry.letter,
      position,
      carried: false,
      pedestalId: null,
      silentDrops: false,
    };

    // The model stays at the view's origin: BlockView owns the transform.
    const view = new BlockView({ state, model: build('block'), faces: new LetterFaces(letters) });
    scene.add(view.root);
    view.syncFromState();
    blockViews.set(entry.id, view);
    blocks.push(state);

    physics.addStatic({
      id: entry.id,
      shape: { kind: 'box', halfExtents: [BLOCK_HALF, BLOCK_HALF, BLOCK_HALF] },
      position: blockColliderCentre(position),
      layer: Layer.Block,
      blocksCamera: MODELS.block.blocksCamera,
    });
  }

  const start = SLICE_LAYOUT.playerStart;
  const startPosition = { x: start.x, y: groundY(start.x, start.z) + 0.1, z: start.z };
  const body = physics.createCharacter(startPosition);
  const view = new CharacterView({
    model: build('chuck'),
    clips: library.get('chuck').clips,
    // In front of the chest: above the head the carried block hid Chuck.
    carryOffset: [0, 0.5, 0.85],
  });
  // The character carries a world yaw, so its root must be a direct child of the scene.
  view.root.position.set(startPosition.x, startPosition.y, startPosition.z);
  scene.add(view.root);
  const player = { body, view };

  for (const { root, model } of shadowed) {
    const casts = MODELS[model].castsShadow;
    root.traverse((node) => {
      if (!(node instanceof THREE.Mesh)) return;
      // Ink hulls are visual only: they must never be in a shadow pass.
      if (node.userData.isOutline === true) return;
      node.castShadow = casts;
      node.receiveShadow = true;
    });
  }

  function update(frameDt: number): void {
    for (const blockView of blockViews.values()) blockView.update(frameDt);
    for (const pedestalView of pedestalViews.values()) pedestalView.update(frameDt);
    bellView.update(frameDt);
    player.view.update(frameDt);
  }

  return { lighting, player, blocks, pedestals, blockViews, pedestalViews, bell: { id: 'bell', position: bellPosition, view: bellView }, update };
}
