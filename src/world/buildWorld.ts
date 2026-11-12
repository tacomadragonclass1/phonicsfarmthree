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
import { ANNETTE, BELL, BLOCKS, PEDESTALS, PLAYER_START, PROPS, TERRAIN_TILES, WORLD_HALF_EXTENT } from './layout';
import { BellView } from './BellView';
import { BlockView } from './BlockView';
import { CharacterView } from './CharacterView';
import { LetterFaces } from './LetterFaces';
import type { LetterTextureCache } from './LetterTexture';
import { PedestalView } from './PedestalView';

/** Stump size, measured on the models: post + cap. */
export const PEDESTAL = { radius: 0.69, height: 0.61 } as const;

/** Block half extent, the same as MODELS.block.collider. */
const BLOCK_HALF = 0.4;

/** A resting block's collider is not at its bottom centre, so callers need this. */
export function blockColliderCentre(position: Vec3): Vec3 {
  return { x: position.x, y: position.y + BLOCK_HALF, z: position.z };
}

/** XZ half extent of a model's collider footprint, the radius footprintY samples at. */
function footprintRadius(model: ModelId): number {
  const spec = MODELS[model].collider;
  if (spec.kind === 'box') return Math.max(spec.halfExtents[0], spec.halfExtents[2]);
  if (spec.kind === 'cylinder') return spec.radius;
  return 0;
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
  annette: { id: string; position: Vec3; view: CharacterView };
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

  /**
   * Lowest ground under a model's footprint. A wide building on a slope would
   * otherwise float above the low side of its own base.
   */
  function footprintY(x: number, z: number, radius: number): number {
    return Math.min(
      groundY(x, z),
      groundY(x + radius, z),
      groundY(x - radius, z),
      groundY(x, z + radius),
      groundY(x, z - radius),
    );
  }

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

  // Terrain first: every ground height depends on it.
  for (const tile of TERRAIN_TILES) {
    const object = build('terrain', { outline: false });
    object.position.set(tile.x, 0, tile.z);
    // Mirrored so neighbouring tiles' hills meet at the seam.
    object.scale.set(tile.mirrorX ? -1 : 1, 1, tile.mirrorZ ? -1 : 1);
    scene.add(object);
    register(tile.id, 'terrain', object, Layer.World);
  }

  /** Invisible wall closing the square at WORLD_HALF_EXTENT: 1 m thick, 10 m tall. */
  function addEdge(id: string, position: Vec3, halfExtents: [number, number, number]): void {
    physics.addStatic({ id, shape: { kind: 'box', halfExtents }, position, layer: Layer.World, blocksCamera: false });
  }

  // Half the wall thickness past the limit, and long enough that the corners meet.
  const edge = WORLD_HALF_EXTENT + 0.5;
  addEdge('edge-n', { x: 0, y: 4, z: -edge }, [edge, 5, 0.5]);
  addEdge('edge-s', { x: 0, y: 4, z: edge }, [edge, 5, 0.5]);
  addEdge('edge-e', { x: edge, y: 4, z: 0 }, [0.5, 5, edge]);
  addEdge('edge-w', { x: -edge, y: 4, z: 0 }, [0.5, 5, edge]);

  function placeStatic(model: ModelId, x: number, z: number, entityId: string, yaw = 0): void {
    const object = build(model);
    object.position.set(x, footprintY(x, z, footprintRadius(model)), z);
    object.rotation.y = yaw;
    scene.add(object);
    register(entityId, model, object, Layer.World);
  }

  PROPS.forEach((prop, index) => placeStatic(prop.model, prop.x, prop.z, `${prop.model}-${index}`, prop.yaw ?? 0));

  const pedestals: PedestalState[] = [];
  const pedestalViews = new Map<string, PedestalView>();
  for (const entry of PEDESTALS) {
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

  const bellLayout = BELL;
  const bellPosition = { x: bellLayout.x, y: groundY(bellLayout.x, bellLayout.z), z: bellLayout.z };
  const frame = build('bellFrame');
  const bellModel = build('bell');
  const bellView = new BellView({ position: bellPosition, frame, bell: bellModel });
  scene.add(bellView.root);

  // Only the frame is physical: the bell hangs from it and swings freely.
  const bellCollider = staticFromSpec('bell', MODELS.bellFrame.collider, bellView.root, Layer.World, false);
  if (bellCollider) physics.addStatic(bellCollider);

  const annetteLayout = ANNETTE;
  const annettePosition = { x: annetteLayout.x, y: groundY(annetteLayout.x, annetteLayout.z), z: annetteLayout.z };
  const annetteView = new CharacterView({ model: build('annette'), clips: library.get('annette').clips });
  // She never moves, so the two physics states are the same and the blend is a no-op.
  annetteView.setPose(annettePosition, annettePosition, 1);
  annetteView.setFacing(annetteLayout.yaw);
  // Her yaw is world space, so her root must be a direct child of the scene.
  scene.add(annetteView.root);

  // The model has no collider, so this is what stops Chuck walking through her.
  physics.addStatic({
    id: 'annette',
    shape: { kind: 'cylinder', radius: 0.35, height: 1.5 },
    position: { x: annettePosition.x, y: annettePosition.y + 0.75, z: annettePosition.z },
    layer: Layer.World,
    blocksCamera: false,
  });

  const blocks: BlockState[] = [];
  const blockViews = new Map<string, BlockView>();
  for (const entry of BLOCKS) {
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

  const start = PLAYER_START;
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
    annetteView.update(frameDt);
  }

  return {
    lighting,
    player,
    blocks,
    pedestals,
    blockViews,
    pedestalViews,
    bell: { id: 'bell', position: bellPosition, view: bellView },
    annette: { id: 'annette', position: annettePosition, view: annetteView },
    update,
  };
}
