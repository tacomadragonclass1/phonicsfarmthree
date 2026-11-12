import * as THREE from 'three';
import type { BlockState, Disposable, Updatable } from '../core/contracts';
import { Bobber } from './Bobber';
import { FACE_NAMES, LetterFaces } from './LetterFaces';
import { damp } from '../core/math';

/** Warm gold a focused block's cream face panels are lerped toward. */
const GOLD = new THREE.Color(1.0, 0.82, 0.3);

/** Fraction of the way to gold applied the instant focus turns on. */
const FOCUS_STEP = 0.75;

/** Rate the remaining distance to gold is eased at. */
const FOCUS_RATE = 8;

/** Inner group scale while focused, and the rate it is eased at. Colour alone read too faint. */
const FOCUS_SCALE = 1.12;
const FOCUS_SCALE_RATE = 14;

/** `pulse` pop and `celebrate` hops. Both start and end at 0, so they never snap. */
const PULSE_HEIGHT = 0.18;
const PULSE_DURATION = 0.35;
const HOP_HEIGHT = 0.3;
const HOP_DURATION = 0.3;
const HOP_COUNT = 3;

/** A panel material that has a `color` to lerp. */
type PanelMaterial = THREE.MeshStandardMaterial | THREE.MeshToonMaterial | THREE.MeshBasicMaterial;

interface Panel {
  mesh: THREE.Mesh;
  material: PanelMaterial;
}

export interface BlockViewOptions {
  state: BlockState;
  model: THREE.Object3D;
  faces: LetterFaces;
}

/**
 * Draws one block. It decides nothing: the game writes state, this draws it.
 * `root` is the block, origin at its bottom centre, so `root.position` always
 * equals the state position — the bob runs on an inner group instead.
 */
export class BlockView implements Updatable, Disposable {
  readonly root = new THREE.Group();
  readonly faces: LetterFaces;

  /** Reaction offset lives here so `root.position` stays the game state. */
  private readonly lift = new THREE.Group();

  /** Model + faces live here so the decals bob with the block. */
  private readonly inner = new THREE.Group();
  private readonly bobber: Bobber;

  /** Hop animation on `lift`: `hopEnd` 0 means nothing is playing. */
  private hopHeight = 0;
  private hopDuration = 0;
  private hopEnd = 0;
  private hopDelay = 0;
  private hopTime = 0;

  /** The model's cream face panels, empty when the model has none. */
  private readonly panels: Panel[];

  /** This block's own copy of the panel material, so focusing it cannot recolour the other blocks. */
  private readonly material: PanelMaterial | null = null;

  /** The colour the panels had before any focus, to return to. */
  private readonly original = new THREE.Color();

  private readonly state: BlockState;
  private parent: THREE.Object3D | null = null;
  private attached = false;
  private focused = false;
  private innerScale = 1;
  private disposed = false;

  constructor(options: BlockViewOptions) {
    this.state = options.state;
    this.faces = options.faces;

    this.root.name = 'BlockView';
    this.root.add(this.lift);
    this.lift.add(this.inner);
    this.inner.add(options.model);
    this.inner.add(this.faces.group);

    this.panels = findPanels(options.model);
    if (this.panels.length > 0) {
      // The model's material is shared by every block, so focus needs a copy of its own.
      this.material = this.panels[0].material.clone();
      this.original.copy(this.material.color);
      for (const panel of this.panels) panel.mesh.material = this.material;
    }

    this.bobber = new Bobber(this.inner, { amplitude: 0.06, frequency: 1.4, spin: 0 });
    this.bobber.enabled = false;

    this.faces.setLetter(this.state.letter);
    this.syncFromState();
  }

  /**
   * Draws the state. A carried block's state position is stale, so while
   * attached the anchor owns the transform and nothing is applied here.
   */
  syncFromState(): void {
    if (this.disposed || this.attached || this.state.carried) return;
    const p = this.state.position;
    this.root.position.set(p.x, p.y, p.z);
    // A resting block's world yaw is 0, and root is a direct child of the scene.
    this.root.rotation.set(0, 0, 0);
  }

  /** Carried: reparent under the anchor with the transform zeroed. Null: back to the remembered parent. */
  attachTo(anchor: THREE.Object3D | null): void {
    if (this.disposed) return;
    if (!this.parent) this.parent = this.root.parent;

    if (anchor) {
      this.attached = true;
      this.root.position.set(0, 0, 0);
      this.root.rotation.set(0, 0, 0);
      anchor.add(this.root);
      return;
    }

    this.attached = false;
    if (this.parent) this.parent.add(this.root);
    this.syncFromState();
  }

  /** Focus lights up and bobs; unfocusing returns the colour and stops the bob. */
  setFocused(on: boolean): void {
    if (this.disposed) return;
    this.focused = on;
    this.bobber.enabled = on;
    if (!this.material) return; // a model with no panels still bobs
    if (on) {
      // Part of the way at once so the block reads as lit immediately; update() eases the rest.
      this.material.color.lerp(GOLD, FOCUS_STEP);
    } else {
      this.material.color.copy(this.original);
    }
  }

  /** A quick "this one is sounding" pop: the inner group jumps up 0.18 m and falls back over 0.35 s. */
  pulse(): void {
    this.startHop(PULSE_HEIGHT, PULSE_DURATION, 1, 0);
  }

  /** Word made: three hops, 0.3 m high, 0.3 s each, starting after `delay` seconds. */
  celebrate(delay = 0): void {
    this.startHop(HOP_HEIGHT, HOP_DURATION, HOP_COUNT, delay);
  }

  private startHop(height: number, duration: number, count: number, delay: number): void {
    if (this.disposed) return;
    const wait = delay > 0 ? delay : 0;
    this.hopHeight = height;
    this.hopDuration = duration;
    this.hopDelay = wait;
    this.hopTime = 0;
    this.hopEnd = wait + duration * count;
    this.lift.position.y = 0;
  }

  update(dt: number): void {
    if (this.disposed || dt <= 0) return;
    this.bobber.update(dt);
    // Only the inner group grows, so root stays at the state position.
    this.innerScale = damp(this.innerScale, this.focused ? FOCUS_SCALE : 1, FOCUS_SCALE_RATE, dt);
    this.inner.scale.setScalar(this.innerScale);
    if (this.focused && this.material) this.material.color.lerp(GOLD, damp(0, 1, FOCUS_RATE, dt));

    if (this.hopEnd > 0) {
      this.hopTime += dt;
      if (this.hopTime > this.hopEnd) {
        this.hopEnd = 0;
        this.lift.position.y = 0;
      } else {
        // Hop shape starts and ends at 0, so the block never snaps off the ground.
        const elapsed = this.hopTime - this.hopDelay;
        if (elapsed >= 0) {
          const u = (elapsed % this.hopDuration) / this.hopDuration;
          this.lift.position.y = this.hopHeight * Math.sin(Math.PI * u);
        }
      }
    }
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.bobber.dispose();
    // Only the clone is ours; the model owns its panels' material and LetterFaces owns the decals.
    if (this.material) this.material.dispose();
    this.root.removeFromParent();
  }
}

/** The named cream panels, searched only in the model so the letter decals are never touched. */
function findPanels(model: THREE.Object3D): Panel[] {
  const panels: Panel[] = [];
  for (const name of FACE_NAMES) {
    const mesh = model.getObjectByName(name);
    if (!(mesh instanceof THREE.Mesh)) continue;
    const material = mesh.material;
    // An array material has no single colour to lerp.
    if (Array.isArray(material)) continue;
    if (
      material instanceof THREE.MeshStandardMaterial ||
      material instanceof THREE.MeshToonMaterial ||
      material instanceof THREE.MeshBasicMaterial
    ) {
      panels.push({ mesh, material });
    }
  }
  return panels;
}
