import * as THREE from 'three';
import type { BlockState, FocusTarget, Vec3 } from './core/contracts';
import { FixedStepLoop } from './core/FixedStepLoop';
import { AssetLibrary, AssetLoadError } from './assets/AssetLibrary';
import { FONT, MODELS, SOUNDS, type ModelId } from './assets/manifest';
import { configureRenderer } from './assets/look/LightingRig';
import { getInkMaterial, setInkResolution } from './assets/look/InkOutline';
import { AudioEngine } from './audio/AudioEngine';
import { PhonemeSequencer } from './audio/PhonemeSequencer';
import { FollowCameraRig, screenToWorld } from './camera/FollowCameraRig';
import { applyPose, createGameCamera } from './camera/applyRig';
import { CarryRules } from './game/CarryRules';
import { ButtonSource } from './input/ButtonSource';
import { GamepadSource } from './input/GamepadSource';
import { InputManager } from './input/InputManager';
import { KeyboardSource } from './input/KeyboardSource';
import { PointerSource } from './input/PointerSource';
import { PhysicsWorld } from './physics/PhysicsWorld';
import { Hud, type ElLike } from './ui/Hud';
import type { BlockView } from './world/BlockView';
import type { PedestalView } from './world/PedestalView';
import { buildWorld, blockColliderCentre } from './world/buildWorld';
import { LetterTextureCache, loadLetterFont, type CanvasLike } from './world/LetterTexture';
import { DebugSource, installDebugHook, type DebugHook } from './debug';

/** The id a focus target is known by, so the console can name it. */
const targetId = (target: FocusTarget): string =>
  target.kind === 'block' ? target.block.id : target.kind === 'pedestal' ? target.pedestal.id : target.target.id;

function errorMessage(error: unknown): string {
  if (error instanceof AssetLoadError) return `Could not load ${error.url}: ${error.message}`;
  return `Something went wrong: ${error instanceof Error ? error.message : String(error)}`;
}

const copyVec = (from: Vec3, to: Vec3): void => {
  to.x = from.x;
  to.y = from.y;
  to.z = from.z;
};

async function boot(): Promise<void> {
  const canvas = document.getElementById('game');
  const ui = document.getElementById('ui');
  if (!(canvas instanceof HTMLCanvasElement) || !ui) {
    console.error('Phonics Farm needs a #game canvas and a #ui layer.');
    return;
  }

  const button = new ButtonSource();
  // Safe: the HUD only touches the DOM members it names, which every element has.
  const hud = new Hud({ root: ui as unknown as ElLike, doc: document, onAction: () => button.press() });

  try {
    const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
    configureRenderer(renderer);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0.80, 0.86, 0.90);

    const base = import.meta.env.BASE_URL;
    const library = new AssetLibrary({ baseUrl: base });
    const audio = new AudioEngine();
    const onProgress = (done: number, total: number): void => hud.showLoading(done, total);

    const [, physics] = await Promise.all([
      library.load(Object.keys(MODELS) as ModelId[], onProgress),
      PhysicsWorld.create(),
      loadLetterFont(base + FONT.url, FONT.family, FONT.weight),
      audio.load(SOUNDS, base),
    ]);

    const letters = new LetterTextureCache({
      createCanvas: (size) => {
        const c = document.createElement('canvas');
        c.width = c.height = size;
        // Safe: the cache only uses the 2D members it names, which a real canvas has.
        return c as unknown as CanvasLike;
      },
    });

    const world = buildWorld({ scene, library, physics, letters });
    const player = world.player;
    const rules = new CarryRules({ world: physics, blocks: world.blocks, pedestals: world.pedestals });
    const sequencer = new PhonemeSequencer(audio);

    const rig = new FollowCameraRig({ probe: physics });
    const camera = createGameCamera(canvas.clientWidth / canvas.clientHeight);

    const debug = new DebugSource();
    const input = new InputManager([
      new KeyboardSource(window),
      new GamepadSource(() => navigator.getGamepads()),
      new PointerSource(canvas),
      button,
      debug,
    ]);

    // Focus is lost when the page loses it, so nothing stays held.
    window.addEventListener('blur', () => input.releaseAll());
    document.addEventListener('visibilitychange', () => { if (document.hidden) input.releaseAll(); });

    let focusedView: BlockView | PedestalView | null = null;
    const ready = (): boolean => rules.focus !== null || rules.carried !== null;

    rules.on('focusChanged', (target) => {
      focusedView?.setFocused(false);
      focusedView = null;
      if (target !== null) {
        const view = target.kind === 'block'
          ? world.blockViews.get(target.block.id)
          : target.kind === 'pedestal' ? world.pedestalViews.get(target.pedestal.id) : null;
        if (view) {
          view.setFocused(true);
          focusedView = view;
        }
      }
      hud.setActionReady(ready());
    });

    rules.on('pickedUp', (block) => {
      physics.setEnabled(block.id, false);
      world.blockViews.get(block.id)?.attachTo(player.view.carryAnchor);
      sequencer.playSequence([block.letter]);
      hud.setActionReady(ready());
    });

    const land = (block: BlockState): void => {
      physics.setPosition(block.id, blockColliderCentre(block.position));
      physics.setEnabled(block.id, true);
      world.blockViews.get(block.id)?.attachTo(null);
    };

    rules.on('dropped', (block) => {
      land(block);
      if (!block.silentDrops) sequencer.playSequence([block.letter]);
      hud.setActionReady(ready());
    });

    rules.on('placed', ({ block }) => {
      land(block);
      sequencer.playSequence([block.letter]);
      hud.setActionReady(ready());
    });

    const prev: Vec3 = { ...player.body.position };
    const curr: Vec3 = { ...player.body.position };
    let facingYaw = 0;
    let yawInput = 0;
    let frames = 0;

    function simulate(dt: number): void {
      const s = input.sample();
      const dir = screenToWorld(s.moveX, s.moveY, rig.forwardYaw);

      copyVec(curr, prev);
      player.body.move(dir.x, dir.z, dt);
      physics.step(dt);
      copyVec(player.body.position, curr);

      if (Math.hypot(dir.x, dir.z) > 0.1) facingYaw = Math.atan2(dir.x, dir.z);
      rules.step(curr, { x: Math.sin(facingYaw), z: Math.cos(facingYaw) }, s.action);
      yawInput = s.cameraYaw;
    }

    function render(alpha: number, frameDt: number): void {
      player.view.setPose(prev, curr, alpha);
      player.view.setFacing(facingYaw);
      const speed = Math.hypot(player.body.velocity.x, player.body.velocity.z);
      player.view.setMoving(speed > 0.3);

      world.update(frameDt);

      const pose = rig.update(player.view.root.position, player.body.velocity, yawInput, frameDt);
      applyPose(camera, pose);
      world.lighting.follow(player.view.root.position);
      renderer.render(scene, camera);
      frames += 1;
    }

    function resize(): void {
      // @types/three does not expose drawingBufferWidth; the canvas backing store is the drawing buffer.
      const surface = renderer.domElement;
      renderer.setSize(surface.clientWidth, surface.clientHeight, false);
      camera.aspect = surface.clientWidth / surface.clientHeight;
      camera.updateProjectionMatrix();
      setInkResolution(getInkMaterial(), surface.width, surface.height);
    }

    const loop = new FixedStepLoop({ simulate, render, onError: console.error });

    const hook: DebugHook = {
      get ready() { return loop.running; },
      hold: (moveX, moveY, cameraYaw) => debug.hold(moveX, moveY, cameraYaw),
      press: () => debug.press(),
      teleport: (x, z) => {
        const y = (physics.groundHeight(x, z, 6) ?? 0) + 0.1;
        player.body.teleport({ x, y, z });
        copyVec(player.body.position, prev);
        copyVec(player.body.position, curr);
      },
      state: () => ({
        player: { ...player.body.position },
        grounded: player.body.grounded,
        facingYaw,
        focus: rules.focus === null ? null : targetId(rules.focus),
        carried: rules.carried === null ? null : rules.carried.id,
        blocks: world.blocks.map((block) => ({
          id: block.id, letter: block.letter, position: { ...block.position },
          carried: block.carried, pedestalId: block.pedestalId,
        })),
        camera: { position: { ...rig.pose.position }, yaw: rig.pose.yaw, distance: rig.pose.distance },
        frames,
        audio: audio.state,
      }),
    };
    installDebugHook(hook);

    resize();
    render(0, 0); // one frame so the world is on screen behind the play button

    await hud.waitForStart();
    await audio.unlock();
    hud.hideOverlay();
    hud.setActionVisible(true);
    loop.start();
  } catch (error) {
    hud.showError(errorMessage(error));
    console.error(error);
  }
}

boot();
