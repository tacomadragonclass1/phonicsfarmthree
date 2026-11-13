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
import {
  ANNETTE, BELL, BLOCKS, PATCHES, PATHS, PEDESTALS, PLAYER_START, PROPS, TERRAIN_TILES,
  VILLAGE_BELL, VILLAGE_BLOCKS, VILLAGE_FENCE, WORLD_HALF_EXTENT,
} from './layout';
import { BellView } from './BellView';
import { BlockView } from './BlockView';
import { CharacterView } from './CharacterView';
import { buildFenceMesh, fenceColliders, type FencePoint } from './Fence';
import { GateView } from './GateView';
import { LetterFaces } from './LetterFaces';
import { buildPathMesh } from './Paths';
import type { LetterTextureCache } from './LetterTexture';
import { PedestalView } from './PedestalView';

/** Stump size, measured on the models: post + cap. */
export const PEDESTAL = { radius: 0.69, height: 0.61 } as const;

/** Half the height of the pickets: what the camera may not pass through. */
const FENCE_CAMERA_HALF_HEIGHT = 0.65;

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
  villageBlocks: BlockState[];
  pedestals: PedestalState[];
  blockViews: Map<string, BlockView>;
  pedestalViews: Map<string, PedestalView>;
  bell: { id: string; position: Vec3; view: BellView };
  /** The bell in the village square. */
  villageBell: { id: string; position: Vec3; view: BellView };
  annette: { id: string; position: Vec3; view: CharacterView; home: Vec3; homeYaw: number };
  /** `position` is the middle of the gateway. Open and close also add and remove what blocks the gap. */
  gate: { id: string; position: Vec3; view: GateView; readonly isOpen: boolean; open(): void; close(): void };
  /** Puts every village letter back where the layout has it, found or not. */
  resetVillageBlocks(): void;
  /** A found letter leaves the world: arrays, collider and view. Unknown id: does nothing. */
  removeBlock(id: string): void;
  groundY(x: number, z: number): number;
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

  /** Instantiate, paint and set the manifest's shadow flags; the caller decides where the copy sits. */
  function build(model: ModelId, look: LookOptions = {}): THREE.Object3D {
    const object = library.instantiate(model);
    applyLook(object, look);
    const casts = MODELS[model].castsShadow;
    object.traverse((node) => {
      if (!(node instanceof THREE.Mesh)) return;
      // Ink hulls are visual only: they must never be in a shadow pass.
      if (node.userData.isOutline === true) return;
      node.castShadow = casts;
      node.receiveShadow = true;
    });
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

  // Paths next, while the terrain is the only ground there is: draped after the
  // props, a path would climb whatever stands on it.
  scene.add(buildPathMesh(PATHS, PATCHES, groundY));

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

  const fence = VILLAGE_FENCE;
  const gateLayout = fence.gate;

  /** The fence stops at each side of the gate, so the gap stays open. */
  const runA: FencePoint[] = [
    { x: gateLayout.x + gateLayout.width / 2, z: fence.north },
    { x: fence.east, z: fence.north },
    { x: fence.east, z: fence.south },
    { x: fence.west, z: fence.south },
    { x: fence.west, z: fence.north },
    { x: gateLayout.x - gateLayout.width / 2, z: fence.north },
  ];

  const fenceMesh = buildFenceMesh(runA, groundY);
  applyLook(fenceMesh);
  fenceMesh.castShadow = true;
  fenceMesh.receiveShadow = true;
  scene.add(fenceMesh);
  for (const options of fenceColliders('fence', runA, groundY, Layer.World)) {
    physics.addStatic(options);
    // The tall collider keeps Chuck in but lets the camera through, so the usual
    // view from over the fence is untouched. This second one is only as tall as
    // the pickets and stops the camera: a low view comes in front of the fence
    // instead of looking through the boards from outside.
    if (options.shape.kind !== 'box') continue;
    const [halfLength, halfHeight, halfDepth] = options.shape.halfExtents;
    physics.addStatic({
      ...options,
      id: `${options.id}-camera`,
      shape: { kind: 'box', halfExtents: [halfLength, FENCE_CAMERA_HALF_HEIGHT, halfDepth] },
      position: { ...options.position, y: options.position.y - halfHeight + FENCE_CAMERA_HALF_HEIGHT },
      blocksCamera: true,
    });
  }

  const gatePath: FencePoint[] = [
    { x: gateLayout.x - gateLayout.width / 2, z: fence.north },
    { x: gateLayout.x + gateLayout.width / 2, z: fence.north },
  ];
  const gateMesh = buildFenceMesh(gatePath, groundY);
  applyLook(gateMesh);
  const hinge = {
    x: gateLayout.x - gateLayout.width / 2,
    y: groundY(gateLayout.x - gateLayout.width / 2, fence.north),
    z: fence.north,
  };
  const gateView = new GateView({ hinge, mesh: gateMesh });
  scene.add(gateView.root);

  const gatePosition = { x: gateLayout.x, y: groundY(gateLayout.x, fence.north), z: fence.north };

  // The leaf is drawn by the swinging mesh; this is what stops Chuck walking through the gap.
  function blockGateway(): void {
    physics.addStatic({
      id: 'gate',
      shape: { kind: 'box', halfExtents: [gateLayout.width / 2, 1.5, 0.12] },
      position: { x: gatePosition.x, y: gatePosition.y + 1.5, z: gatePosition.z },
      layer: Layer.World,
      blocksCamera: false,
    });
  }
  blockGateway();

  let gateOpened = false;
  function openGate(): void {
    if (gateOpened) return;
    gateOpened = true;
    physics.remove('gate');
    gateView.open();
  }
  function closeGate(): void {
    if (!gateOpened) return;
    gateOpened = false;
    blockGateway();
    gateView.close();
  }

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

  const villageBellPosition = { x: VILLAGE_BELL.x, y: groundY(VILLAGE_BELL.x, VILLAGE_BELL.z), z: VILLAGE_BELL.z };
  const villageBellView = new BellView({ position: villageBellPosition, frame: build('bellFrame'), bell: build('bell') });
  scene.add(villageBellView.root);
  const villageBellCollider = staticFromSpec('villageBell', MODELS.bellFrame.collider, villageBellView.root, Layer.World, false);
  if (villageBellCollider) physics.addStatic(villageBellCollider);

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
  const villageBlocks: BlockState[] = [];
  const blockViews = new Map<string, BlockView>();

  interface BlockEntry {
    id: string;
    letter: string;
    x: number;
    z: number;
  }

  function addBlock(entry: BlockEntry, village: boolean): void {
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
    if (village) villageBlocks.push(state);

    physics.addStatic({
      id: entry.id,
      shape: { kind: 'box', halfExtents: [BLOCK_HALF, BLOCK_HALF, BLOCK_HALF] },
      position: blockColliderCentre(position),
      layer: Layer.Block,
      blocksCamera: MODELS.block.blocksCamera,
    });
  }

  for (const entry of VILLAGE_BLOCKS) addBlock(entry, true);
  for (const entry of BLOCKS) addBlock(entry, false);

  function removeBlock(id: string): void {
    const view = blockViews.get(id);
    const index = blocks.findIndex((block) => block.id === id);
    if (view === undefined || index < 0) return;

    blocks.splice(index, 1);
    const villageIndex = villageBlocks.findIndex((block) => block.id === id);
    if (villageIndex >= 0) villageBlocks.splice(villageIndex, 1);
    blockViews.delete(id);

    physics.remove(id);
    view.dispose();
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

  function resetVillageBlocks(): void {
    for (const id of villageBlocks.map((block) => block.id)) removeBlock(id);
    for (const entry of VILLAGE_BLOCKS) addBlock(entry, true);
  }

  function update(frameDt: number): void {
    for (const blockView of blockViews.values()) blockView.update(frameDt);
    for (const pedestalView of pedestalViews.values()) pedestalView.update(frameDt);
    bellView.update(frameDt);
    villageBellView.update(frameDt);
    gateView.update(frameDt);
    player.view.update(frameDt);
    annetteView.update(frameDt);
  }

  return {
    lighting,
    player,
    blocks,
    villageBlocks,
    pedestals,
    blockViews,
    pedestalViews,
    bell: { id: 'bell', position: bellPosition, view: bellView },
    villageBell: { id: 'villageBell', position: villageBellPosition, view: villageBellView },
    annette: {
      id: 'annette',
      position: annettePosition,
      view: annetteView,
      home: { ...annettePosition },
      homeYaw: annetteLayout.yaw,
    },
    gate: {
      id: 'gate',
      position: gatePosition,
      view: gateView,
      get isOpen() { return gateOpened; },
      open: openGate,
      close: closeGate,
    },
    resetVillageBlocks,
    removeBlock,
    groundY,
    update,
  };
}
