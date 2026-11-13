import * as THREE from 'three';
import type { Activatable, BlockState, FocusTarget, Vec3 } from './core/contracts';
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
import { FindRules } from './game/FindRules';
import { Guide } from './game/Guide';
import { WordRules } from './game/WordRules';
import { ButtonSource } from './input/ButtonSource';
import { GamepadSource } from './input/GamepadSource';
import { InputManager } from './input/InputManager';
import { KeyboardSource } from './input/KeyboardSource';
import { PointerSource } from './input/PointerSource';
import { PhysicsWorld } from './physics/PhysicsWorld';
import { Hud, type ElLike } from './ui/Hud';
import { buildWorld, blockColliderCentre } from './world/buildWorld';
import { LetterTextureCache, loadLetterFont, type CanvasLike } from './world/LetterTexture';
import { ANNETTE_PATH, VILLAGE_FENCE } from './world/layout';
import { DebugSource, installDebugHook, type DebugHook } from './debug';
import { showPadDebug } from './ui/padDebug';

/** Chuck counts as having left the village, or come back, this far past the fence line. */
const VILLAGE_EDGE_MARGIN = 1.2;
/** Walking into Annette: closer than this she speaks, and not again until he is past the second distance. */
const BUMP_DISTANCE = 0.95;
const BUMP_REARM_DISTANCE = 1.6;

const isTerrain = (id: string): boolean => id.startsWith('terrain');

/** What focus needs from a view: BlockView, PedestalView and BellView all have it. */
interface FocusedView {
  setFocused(on: boolean): void;
}

/** The id a focus target is known by, so the console can name it. */
const targetId = (target: FocusTarget): string =>
  target.kind === 'block' ? target.block.id : target.kind === 'pedestal' ? target.pedestal.id : target.target.id;

function errorMessage(error: unknown): string {
  if (error instanceof AssetLoadError) return `Could not load ${error.url}: ${error.message}`;
  return `Something went wrong: ${error instanceof Error ? error.message : String(error)}`;
}

/** The terrain stops a little past the playable square; outside it there is nothing to ask about. */
const clampTo = (value: number): number => Math.min(36.5, Math.max(-36.5, value));

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
      audio.load(SOUNDS, new URL(base, document.baseURI).href),
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
    const sequencer = new PhonemeSequencer(audio);
    const words = new WordRules({ pedestals: world.pedestals, blocks: world.blocks, sound: sequencer });

    const bell: Activatable = {
      id: 'bell',
      position: world.bell.position,
      activate: () => {
        world.bell.view.ring();
        audio.chime();
        words.ring();
      },
    };

    // `rules` is built after `find`, so the carried block is read lazily: the
    // closure only runs when she is talked to, long after start-up.
    let rules: CarryRules;
    // The debug hook pretends a block is in Chuck's hands; the real one wins
    // whenever the hook is not mid-call.
    let debugCarried: BlockState | null = null;
    const find = new FindRules({
      blocks: world.villageBlocks,
      sound: sequencer,
      carried: () => debugCarried ?? rules.carried,
    });

    const annette: Activatable = {
      id: 'annette',
      position: world.annette.position,
      activate: () => find.talk(),
    };

    // The activatable and the rules hold this same object, so it is mutated in place.
    const annettePos = world.annette.position;
    const annettePrev: Vec3 = { ...annettePos };
    const annetteCurr: Vec3 = { ...annettePos };
    /**
     * home: standing in the village. leading: walking Chuck to the word stumps.
     * away: waiting there. returning: walking back to her place in the village.
     */
    let annetteMode: 'home' | 'leading' | 'away' | 'returning' = 'home';
    let annetteYaw = world.annette.homeYaw;

    // Her collider is off while she walks, so nothing pushes the player; it is
    // put back where she stopped.
    function onGuideArrived(): void {
      const y = world.groundY(guide.position.x, guide.position.z);
      physics.setPosition('annette', { x: guide.position.x, y: y + 0.75, z: guide.position.z });
      physics.setEnabled('annette', true);
      if (annetteMode === 'returning') {
        annetteMode = 'home';
        annetteYaw = world.annette.homeYaw;
      } else {
        annetteMode = 'away';
        annetteYaw = guide.yaw;
      }
    }

    /** A guide is one walk: a new one is made for each. `waits` is whether she stops for Chuck. */
    function makeGuide(path: readonly { x: number; z: number }[], waits: boolean): Guide {
      const made = new Guide(waits ? { path } : { path, waitDistance: Infinity });
      made.on('arrived', onGuideArrived);
      return made;
    }
    let guide = makeGuide(ANNETTE_PATH, true);

    function stepAnnette(dt: number, follower: Vec3): void {
      if (!guide.leading) return;
      guide.step(dt, follower);
      copyVec(annetteCurr, annettePrev);
      annettePos.x = guide.position.x;
      annettePos.z = guide.position.z;
      annettePos.y = world.groundY(annettePos.x, annettePos.z);
      copyVec(annettePos, annetteCurr);
      annetteYaw = guide.yaw;
    }

    /** She walks back the way she came, from wherever she is, without waiting for anyone. */
    function sendAnnetteHome(): void {
      if (annetteMode === 'home' || annetteMode === 'returning') return;
      const back = [...ANNETTE_PATH].reverse();
      let nearest = 0;
      for (let i = 1; i < back.length; i++) {
        const d = Math.hypot(back[i].x - annettePos.x, back[i].z - annettePos.z);
        if (d < Math.hypot(back[nearest].x - annettePos.x, back[nearest].z - annettePos.z)) nearest = i;
      }
      physics.setEnabled('annette', false);
      annetteMode = 'returning';
      guide = makeGuide([{ x: annettePos.x, z: annettePos.z }, ...back.slice(nearest)], false);
      guide.lead();
    }

    const villageBell: Activatable = {
      id: 'villageBell',
      position: world.villageBell.position,
      activate: () => {
        world.villageBell.view.ring();
        audio.chime();
        restartVillage();
      },
    };

    // Only there to be used while the gate is shut: it is taken out of the list
    // when the gate opens, so an open gateway never takes the action from a letter.
    const gate: Activatable = {
      id: 'gate',
      position: world.gate.position,
      activate: () => openGate(),
    };
    const activatables: Activatable[] = [bell, annette, villageBell, gate];

    function openGate(): void {
      world.gate.open();
      const index = activatables.indexOf(gate);
      if (index >= 0) activatables.splice(index, 1);
    }

    function closeGate(): void {
      world.gate.close();
      if (!activatables.includes(gate)) activatables.push(gate);
    }

    rules = new CarryRules({
      world: physics,
      blocks: world.blocks,
      pedestals: world.pedestals,
      // Held by reference: the gate comes and goes from this list.
      activatables,
    });

    // Home yaw PI looks along -Z, so screen-right is +X and words read left to right.
    // The player may swing, tilt and zoom, and the view stays where it is put;
    // pressing the right stick eases it back to this home view.
    const rig = new FollowCameraRig({
      probe: physics,
      homeYaw: Math.PI,
      // All the way round, and from high overhead down to ground level looking up.
      yawRange: Math.PI,
      yawSpeed: 2.2,
      // Just below level: the camera ends up at ground height, looking slightly up at him.
      // Any lower and its line of sight runs under the ground, and under the fence.
      pitchMin: (-4 * Math.PI) / 180,
      pitchMax: (72 * Math.PI) / 180,
      pitchSpeed: 1.5,
      holdView: true,
    });
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

    let focusedView: FocusedView | null = null;
    const ready = (): boolean => rules.focus !== null || rules.carried !== null;

    rules.on('focusChanged', (target) => {
      focusedView?.setFocused(false);
      focusedView = null;
      if (target !== null) {
        // An activatable has no highlight view: Annette is not a thing that lights up.
        const view: FocusedView | null = target.kind === 'block'
          ? world.blockViews.get(target.block.id) ?? null
          : target.kind === 'pedestal'
            ? world.pedestalViews.get(target.pedestal.id) ?? null
            : target.target.id === 'bell'
              ? world.bell.view
              : target.target.id === 'villageBell'
                ? world.villageBell.view
                : null;
        if (view) {
          view.setFocused(true);
          focusedView = view;
        }
      }
      hud.setActionReady(ready());
    });

    words.on('letterSounded', (event) => world.blockViews.get(event.blockId)?.pulse());

    words.on('wordMade', (event) => {
      event.blockIds.forEach((id, index) => world.blockViews.get(id)?.celebrate(index * 0.12));
      audio.chime(880);
      sequencer.playSequence(['annette_good']);
    });

    // Feedback is never punitive: a non-word and an empty row stay quiet.
    words.on('notYet', () => undefined);
    words.on('nothingToSound', () => undefined);

    // She speaks her own lines; the chime is the game's celebration on top.
    const collect = (blockId: string, letter: string): void => {
      // The highlight must be dropped before the view is disposed.
      if (focusedView === world.blockViews.get(blockId)) focusedView = null;
      if (rules.carried?.id === blockId) rules.releaseCarried();
      world.removeBlock(blockId);
      hud.addMedal(letter);
      audio.chime(880);
      hud.setActionReady(ready());
      find.next();
    };
    find.on('found', (event) => collect(event.blockId, event.letter));

    find.on('complete', () => {
      openGate();
      physics.setEnabled('annette', false);
      annetteMode = 'leading';
      guide = makeGuide(ANNETTE_PATH, true);
      guide.lead();
    });

    /** Every village letter back in its place, no medals, and nothing asked for yet. */
    function resetVillageGame(): void {
      const carried = rules.carried;
      if (carried !== null && world.villageBlocks.includes(carried)) rules.releaseCarried();
      // The lit view may be one of the blocks about to be rebuilt.
      focusedView?.setFocused(false);
      focusedView = null;
      world.resetVillageBlocks();
      hud.clearMedals();
      find.reset();
      sequencer.stop();
      hud.setActionReady(ready());
    }

    /** She asks for a letter; if she is off in CVC Land she comes home as she does. */
    function startAsking(): void {
      sendAnnetteHome();
      find.begin();
    }

    /** The village bell: start the letter hunt again, here and now. */
    function restartVillage(): void {
      resetVillageGame();
      closeGate();
      gateClosePending = false;
      startAsking();
    }

    let inVillage = true;
    /** Set when Chuck walks out: the gate shuts behind him once Annette is not in the gateway. */
    let gateClosePending = false;
    let bumpArmed = true;

    function stepVillage(chuck: Vec3): void {
      const north = VILLAGE_FENCE.north;
      if (inVillage && chuck.z < north - VILLAGE_EDGE_MARGIN) {
        // Leaving ends the hunt: it starts fresh the next time he comes in.
        inVillage = false;
        resetVillageGame();
        gateClosePending = true;
      } else if (!inVillage && chuck.z > north + VILLAGE_EDGE_MARGIN) {
        inVillage = true;
        gateClosePending = false;
        startAsking();
      }

      // Never on her: not while she is still on her way out through it, nor on her way back in.
      const annetteCrossing = (annetteMode === 'leading' && annettePos.z > north - 1.5)
        || (annetteMode === 'returning' && annettePos.z < north + 1.5);
      if (gateClosePending && !annetteCrossing) {
        gateClosePending = false;
        closeGate();
      }

      // Walking into her makes her say what she wants again, once per bump and
      // never over the top of something she is already saying.
      const gap = Math.hypot(chuck.x - annettePos.x, chuck.z - annettePos.z);
      if (gap < BUMP_DISTANCE) {
        if (bumpArmed && !sequencer.busy) find.remind();
        bumpArmed = false;
      } else if (gap > BUMP_REARM_DISTANCE) {
        bumpArmed = true;
      }
    }

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
    // Starts facing away from the camera, which looks along -Z.
    let facingYaw = Math.PI;
    let yawInput = 0;
    let pitchInput = 0;
    let zoomInput = 0;
    let frames = 0;

    function simulate(dt: number): void {
      const s = input.sample();
      const dir = screenToWorld(s.moveX, s.moveY, rig.forwardYaw);

      copyVec(curr, prev);
      if (s.jump) player.body.jump();
      player.body.move(dir.x, dir.z, dt);
      physics.step(dt);
      copyVec(player.body.position, curr);

      if (Math.hypot(dir.x, dir.z) > 0.1) facingYaw = Math.atan2(dir.x, dir.z);
      rules.step(curr, { x: Math.sin(facingYaw), z: Math.cos(facingYaw) }, s.action);
      stepAnnette(dt, curr);
      stepVillage(curr);
      yawInput = s.cameraYaw;
      pitchInput = s.cameraPitch;
      zoomInput = s.cameraZoom;
      if (s.cameraReset) rig.resetView();
    }

    function render(alpha: number, frameDt: number): void {
      player.view.setPose(prev, curr, alpha);
      player.view.setFacing(facingYaw);
      const speed = Math.hypot(player.body.velocity.x, player.body.velocity.z);
      player.view.setMoving(speed > 0.3);

      world.annette.view.setPose(annettePrev, annetteCurr, alpha);
      world.annette.view.setFacing(annetteYaw);
      world.annette.view.setMoving(guide.moving);

      world.update(frameDt);

      const pose = rig.update(player.view.root.position, player.body.velocity, yawInput, frameDt, pitchInput, zoomInput);
      // A low, close view could otherwise sink into a hillside. Only the terrain
      // counts: trees and roofs are handled by the rig's own sweep.
      const eye = pose.position;
      const under = physics.groundHeight(clampTo(eye.x), clampTo(eye.z), 7.9, isTerrain) ?? 0;
      if (eye.y < under + 0.45) eye.y = under + 0.45;
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
      hold: (moveX, moveY, cameraYaw, cameraPitch, cameraZoom) => debug.hold(moveX, moveY, cameraYaw, cameraPitch, cameraZoom),
      press: () => debug.press(),
      teleport: (x, z) => {
        const y = (physics.groundHeight(x, z, 6) ?? 0) + 0.1;
        player.body.teleport({ x, y, z });
        copyVec(player.body.position, prev);
        copyVec(player.body.position, curr);
      },
      /** Delivers the wanted letter through the normal path, without a player. */
      collectWanted: () => {
        const wanted = find.wanted;
        if (wanted === null) return false;
        const block = world.villageBlocks.find((b) => b.letter === wanted);
        if (block === undefined) return false;
        block.carried = true;
        debugCarried = block;
        find.talk();
        debugCarried = null;
        return true;
      },
      state: () => ({
        player: { ...player.body.position },
        grounded: player.body.grounded,
        facingYaw,
        focus: rules.focus === null ? null : targetId(rules.focus),
        carried: rules.carried === null ? null : rules.carried.id,
        sounding: words.sounding,
        wanted: find.wanted,
        medals: hud.medalCount,
        villageLeft: world.villageBlocks.length,
        gateOpen: world.gate.isOpen,
        inVillage,
        annetteMode,
        findDone: find.done,
        annette: { x: annettePos.x, z: annettePos.z, leading: guide.leading, arrived: guide.arrived },
        stumps: world.pedestals.map((pedestal) => pedestal.blockId),
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
    // Never wait on the audio unlock: resume() can stay pending until the browser
    // sees a gesture it trusts, and the game must start regardless. Later presses retry.
    const unlock = (): void => void audio.unlock().catch(() => undefined);
    unlock();
    window.addEventListener('pointerdown', unlock);
    window.addEventListener('keydown', unlock);
    hud.hideOverlay();
    hud.setActionVisible(true);
    loop.start();
    // Her first request is unprompted: the child has to be shown what to do.
    find.begin();
  } catch (error) {
    hud.showError(errorMessage(error));
    console.error(error);
  }
}

if (new URLSearchParams(location.search).has('pad')) showPadDebug();
boot();
