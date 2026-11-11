import { describe, expect, it } from 'vitest';
import type { InputSource, InputState } from '../src/core/contracts';
import type { EventTargetLike } from '../src/input/InputManager';
import { InputManager } from '../src/input/InputManager';
import { ButtonSource } from '../src/input/ButtonSource';
import type { GamepadLike } from '../src/input/GamepadSource';
import { GamepadSource } from '../src/input/GamepadSource';
import type { KeyboardEventLike, KeyboardEvents } from '../src/input/KeyboardSource';
import { KeyboardSource } from '../src/input/KeyboardSource';
import type { PointerEventLike, PointerEvents } from '../src/input/PointerSource';
import { PointerSource } from '../src/input/PointerSource';

/** A dispatchable stand-in for window or the canvas. */
class FakeTarget<Events> implements EventTargetLike<Events> {
  private readonly listeners = new Map<string, Array<(event: unknown) => void>>();

  addEventListener<K extends keyof Events>(type: K, listener: (event: Events[K]) => void): void {
    const bucket = this.listeners.get(String(type)) ?? [];
    this.listeners.set(String(type), bucket);
    // Bivariant storage: dispatch always hands back the payload of this key.
    bucket.push(listener as (event: unknown) => void);
  }

  removeEventListener<K extends keyof Events>(type: K, listener: (event: Events[K]) => void): void {
    const bucket = this.listeners.get(String(type));
    if (!bucket) return;
    const index = bucket.indexOf(listener as (event: unknown) => void);
    if (index >= 0) bucket.splice(index, 1);
  }

  dispatch<K extends keyof Events>(type: K, event: Events[K]): void {
    for (const listener of [...(this.listeners.get(String(type)) ?? [])]) listener(event);
  }
}

interface FakeKeyEvent extends KeyboardEventLike {
  /** Records that the source asked the page not to scroll. */
  prevented: boolean;
}

function keyEvent(code: string, repeat = false): FakeKeyEvent {
  const event: FakeKeyEvent = {
    code,
    repeat,
    prevented: false,
    preventDefault(): void {
      event.prevented = true;
    },
  };
  return event;
}

function newState(): InputState {
  return { moveX: 0, moveY: 0, action: false, cameraYaw: 0 };
}

/** Sources add into a state the manager has zeroed, so tests zero it the same way. */
function sample(source: InputSource, out: InputState): InputState {
  out.moveX = 0;
  out.moveY = 0;
  out.action = false;
  out.cameraYaw = 0;
  source.sample(out);
  return out;
}

/** Buttons read the set live so a test can press and release the same pad. */
function fakePad(mapping: string, axes: number[], pressed: ReadonlySet<number>): GamepadLike {
  return {
    mapping,
    connected: true,
    axes,
    buttons: Array.from({ length: 16 }, (_, i) => ({ get pressed() { return pressed.has(i); } })),
  };
}

describe('KeyboardSource', () => {
  function setup(): { source: KeyboardSource; target: FakeTarget<KeyboardEvents>; out: InputState } {
    const target = new FakeTarget<KeyboardEvents>();
    return { source: new KeyboardSource(target), target, out: newState() };
  }

  it('maps each walk direction, arrows included', () => {
    const { source, target, out } = setup();
    const cases: Array<[string, number, number]> = [
      ['KeyW', 0, -1],
      ['ArrowUp', 0, -1],
      ['KeyS', 0, 1],
      ['ArrowDown', 0, 1],
      ['KeyA', -1, 0],
      ['ArrowLeft', -1, 0],
      ['KeyD', 1, 0],
      ['ArrowRight', 1, 0],
    ];
    for (const [code, x, y] of cases) {
      target.dispatch('keydown', keyEvent(code));
      sample(source, out);
      expect(out.moveX).toBe(x);
      expect(out.moveY).toBe(y);
      target.dispatch('keyup', keyEvent(code));
      sample(source, out);
      expect(out.moveX).toBe(0);
      expect(out.moveY).toBe(0);
    }
  });

  it('opposite keys cancel and a diagonal is not normalised', () => {
    const { source, target, out } = setup();
    target.dispatch('keydown', keyEvent('KeyW'));
    target.dispatch('keydown', keyEvent('KeyS'));
    sample(source, out);
    expect(out.moveY).toBe(0);

    target.dispatch('keyup', keyEvent('KeyS'));
    target.dispatch('keydown', keyEvent('KeyD'));
    sample(source, out);
    expect(out.moveX).toBe(1);
    expect(out.moveY).toBe(-1); // raw diagonal: normalising is the manager's job
  });

  it('latches the action for exactly one sample', () => {
    const { source, target, out } = setup();
    target.dispatch('keydown', keyEvent('KeyE'));
    sample(source, out);
    expect(out.action).toBe(true);
    sample(source, out);
    expect(out.action).toBe(false);

    target.dispatch('keydown', keyEvent('Space'));
    sample(source, out);
    expect(out.action).toBe(true);
    sample(source, out);
    expect(out.action).toBe(false);
  });

  it('ignores auto-repeat', () => {
    const { source, target, out } = setup();
    target.dispatch('keydown', keyEvent('KeyE', true));
    sample(source, out);
    expect(out.action).toBe(false);

    target.dispatch('keydown', keyEvent('KeyE'));
    sample(source, out);
    expect(out.action).toBe(true);
    target.dispatch('keydown', keyEvent('KeyE', true));
    sample(source, out);
    expect(out.action).toBe(false);
  });

  it('prevents the default for Space and the arrow keys only', () => {
    const { source, target, out } = setup();
    const space = keyEvent('Space');
    const arrow = keyEvent('ArrowUp');
    const letter = keyEvent('KeyW');
    target.dispatch('keydown', space);
    target.dispatch('keydown', arrow);
    target.dispatch('keydown', letter);
    sample(source, out);
    expect(space.prevented).toBe(true);
    expect(arrow.prevented).toBe(true);
    expect(letter.prevented).toBe(false);
  });

  it('camera keys are held, not latched, and KeyE is never a camera key', () => {
    const { source, target, out } = setup();
    target.dispatch('keydown', keyEvent('KeyQ'));
    sample(source, out);
    expect(out.cameraYaw).toBe(-1);
    sample(source, out);
    expect(out.cameraYaw).toBe(-1);

    target.dispatch('keydown', keyEvent('KeyC'));
    sample(source, out);
    expect(out.cameraYaw).toBe(0); // Q and C cancel
    target.dispatch('keyup', keyEvent('KeyQ'));
    sample(source, out);
    expect(out.cameraYaw).toBe(1);

    target.dispatch('keydown', keyEvent('KeyE'));
    sample(source, out);
    expect(out.cameraYaw).toBe(1);
    expect(out.action).toBe(true);
  });

  it('blur releases everything held', () => {
    const { source, target, out } = setup();
    target.dispatch('keydown', keyEvent('KeyD'));
    target.dispatch('keydown', keyEvent('KeyC'));
    target.dispatch('keydown', keyEvent('KeyE'));
    target.dispatch('blur', undefined);
    sample(source, out);
    expect(out.moveX).toBe(0);
    expect(out.cameraYaw).toBe(0);
    expect(out.action).toBe(false);
  });

  it('dispose stops delivery', () => {
    const { source, target, out } = setup();
    source.dispose();
    target.dispatch('keydown', keyEvent('KeyD'));
    sample(source, out);
    expect(out.moveX).toBe(0);
  });
});

describe('GamepadSource', () => {
  function setup(pads: Array<GamepadLike | null>): { source: GamepadSource; out: InputState } {
    return { source: new GamepadSource(() => pads), out: newState() };
  }

  it('applies the radial deadzone and rescales to full deflection', () => {
    const pressed = new Set<number>();
    const pads: Array<GamepadLike | null> = [fakePad('standard', [0.1, 0.05, 0, 0], pressed)];
    const { source, out } = setup(pads);

    sample(source, out);
    expect(out.moveX).toBe(0);
    expect(out.moveY).toBe(0);

    pads[0] = fakePad('standard', [0.5, 0, 0, 0], pressed);
    sample(source, out);
    expect(out.moveX).toBeCloseTo(0.375); // (0.5 - 0.2) / (1 - 0.2)

    pads[0] = fakePad('standard', [0.6, 0.8, 0, 0], pressed);
    sample(source, out);
    expect(out.moveX).toBeCloseTo(0.6);
    expect(out.moveY).toBeCloseTo(0.8);
    expect(Math.hypot(out.moveX, out.moveY)).toBeCloseTo(1);
  });

  it('rescales the right stick past its deadzone', () => {
    const pressed = new Set<number>();
    const pads: Array<GamepadLike | null> = [fakePad('standard', [0, 0, 0.2, 0], pressed)];
    const { source, out } = setup(pads);
    sample(source, out);
    expect(out.cameraYaw).toBe(0);

    pads[0] = fakePad('standard', [0, 0, -0.5, 0], pressed);
    sample(source, out);
    expect(out.cameraYaw).toBeCloseTo(-1 / 3); // (0.5 - 0.25) / (1 - 0.25)
  });

  it('the d-pad overrides the stick when pressed', () => {
    const pressed = new Set<number>([12]);
    const pads: Array<GamepadLike | null> = [fakePad('standard', [0.5, 0.5, 0, 0], pressed)];
    const { source, out } = setup(pads);
    sample(source, out);
    expect(out.moveX).toBe(0);
    expect(out.moveY).toBe(-1);

    pressed.clear();
    pressed.add(15);
    pressed.add(13);
    sample(source, out);
    expect(out.moveX).toBe(1);
    expect(out.moveY).toBe(1);
  });

  it('the action fires only on the sample where the button goes down', () => {
    const pressed = new Set<number>();
    const { source, out } = setup([fakePad('standard', [0, 0, 0, 0], pressed)]);

    sample(source, out);
    expect(out.action).toBe(false); // the first sample is the baseline

    pressed.add(0);
    sample(source, out);
    expect(out.action).toBe(true);
    sample(source, out);
    expect(out.action).toBe(false);

    pressed.delete(0);
    sample(source, out);
    expect(out.action).toBe(false);
    pressed.add(0);
    sample(source, out);
    expect(out.action).toBe(true);
  });

  it('an unplugged pad contributes nothing and a replug with the button held does not fire', () => {
    const pressed = new Set<number>([0]);
    const pad = fakePad('standard', [0.5, 0, 0, 0], pressed);
    const pads: Array<GamepadLike | null> = [pad];
    const { source, out } = setup(pads);

    sample(source, out);
    expect(out.action).toBe(false); // baseline, not an edge
    sample(source, out);
    expect(out.action).toBe(false);

    pads[0] = null;
    sample(source, out);
    expect(out.moveX).toBe(0);
    expect(out.action).toBe(false);

    // Replugged with the button still held: this sample only sets the baseline.
    pads[0] = pad;
    sample(source, out);
    expect(out.action).toBe(false);
    expect(out.moveX).toBeCloseTo(0.375);

    pressed.delete(0);
    sample(source, out);
    pressed.add(0);
    sample(source, out);
    expect(out.action).toBe(true);
  });

  it('prefers the first connected pad with the standard mapping', () => {
    const pressed = new Set<number>();
    const other = fakePad('unknown', [0.9, 0, 0, 0], pressed);
    const standard = fakePad('standard', [0.5, 0, 0, 0], pressed);
    const pads: Array<GamepadLike | null> = [null, other, standard];
    const { source, out } = setup(pads);

    sample(source, out);
    expect(out.moveX).toBeCloseTo(0.375); // the standard pad, not the first connected one

    pads[2] = null;
    sample(source, out);
    expect(out.moveX).toBeCloseTo(0.875); // falls back to the first connected pad
  });

  it('release resets the edge state', () => {
    const pressed = new Set<number>([0]);
    const { source, out } = setup([fakePad('standard', [0, 0, 0, 0], pressed)]);

    sample(source, out);
    expect(out.action).toBe(false); // first sample is the baseline
    pressed.delete(0);
    sample(source, out);
    pressed.add(0);
    sample(source, out);
    expect(out.action).toBe(true);

    // Held across the release: the edge is forgotten, so it cannot re-fire.
    source.release();
    sample(source, out);
    expect(out.action).toBe(false);
  });
});

describe('PointerSource', () => {
  function setup(options?: { dragRange?: number; swingSlop?: number }) {
    const target = new FakeTarget<PointerEvents>();
    return { source: new PointerSource(target, options), target, out: newState() };
  }

  function pointer(pointerId: number, clientX: number, clientY: number): PointerEventLike {
    return { pointerId, clientX, clientY };
  }

  it('drag distance becomes move, and the length is limited to 1', () => {
    const { source, target, out } = setup();
    target.dispatch('pointerdown', pointer(1, 0, 0));
    target.dispatch('pointermove', pointer(1, 55, 0));
    sample(source, out);
    expect(out.moveX).toBeCloseTo(0.5);

    target.dispatch('pointermove', pointer(1, 110, 110));
    sample(source, out);
    expect(Math.hypot(out.moveX, out.moveY)).toBeCloseTo(1);
    expect(out.moveX).toBeCloseTo(Math.SQRT1_2);

    target.dispatch('pointerup', pointer(1, 110, 110));
    sample(source, out);
    expect(out.moveX).toBe(0);
    expect(out.moveY).toBe(0);
  });

  it('the origin trails behind a long drag so it keeps steering', () => {
    const { source, target, out } = setup();
    target.dispatch('pointerdown', pointer(1, 0, 0));
    target.dispatch('pointermove', pointer(1, 0, 220)); // past dragRange: origin trails
    sample(source, out);
    expect(out.moveY).toBeCloseTo(1);

    // Back to 150: the trailed origin sits at 110, so the stick is only 40 px out.
    target.dispatch('pointermove', pointer(1, 0, 150));
    sample(source, out);
    expect(out.moveY).toBeCloseTo(40 / 110);
  });

  it('a tap never produces an action', () => {
    const { source, target, out } = setup();
    target.dispatch('pointerdown', pointer(1, 10, 10));
    target.dispatch('pointerup', pointer(1, 10, 10));
    sample(source, out);
    expect(out.action).toBe(false);
    expect(out.moveX).toBe(0);
    expect(out.moveY).toBe(0);
  });

  it('the second finger swings the camera only after the slop', () => {
    const { source, target, out } = setup();
    target.dispatch('pointerdown', pointer(1, 0, 0));
    target.dispatch('pointerdown', pointer(2, 200, 200));

    target.dispatch('pointermove', pointer(2, 210, 200)); // 10 px: inside the slop
    sample(source, out);
    expect(out.cameraYaw).toBe(0);

    target.dispatch('pointermove', pointer(2, 230, 200)); // 30 px: past the slop
    sample(source, out);
    expect(out.cameraYaw).toBeCloseTo(30 / 110);
    expect(out.moveX).toBe(0); // the swing finger does not walk

    target.dispatch('pointermove', pointer(2, 400, 200));
    sample(source, out);
    expect(out.cameraYaw).toBe(1); // clamped

    target.dispatch('pointerup', pointer(2, 400, 200));
    sample(source, out);
    expect(out.cameraYaw).toBe(0);

    // The walking finger is still held.
    target.dispatch('pointermove', pointer(1, 0, 110));
    sample(source, out);
    expect(out.moveY).toBe(1);
  });

  it('a third pointer is ignored', () => {
    const { source, target, out } = setup();
    target.dispatch('pointerdown', pointer(1, 0, 0));
    target.dispatch('pointerdown', pointer(2, 200, 200));
    target.dispatch('pointerdown', pointer(3, 300, 300));
    target.dispatch('pointermove', pointer(3, 380, 300));
    target.dispatch('pointermove', pointer(1, 0, 110));
    sample(source, out);
    expect(out.moveY).toBe(1);
    expect(out.cameraYaw).toBe(0); // finger 2 has not passed the slop

    target.dispatch('pointerup', pointer(3, 380, 300));
    target.dispatch('pointermove', pointer(2, 260, 200));
    sample(source, out);
    expect(out.cameraYaw).toBeCloseTo(60 / 110);
  });

  it('pointercancel ends each pointer cleanly', () => {
    const { source, target, out } = setup();
    target.dispatch('pointerdown', pointer(1, 0, 0));
    target.dispatch('pointerdown', pointer(2, 200, 200));
    target.dispatch('pointermove', pointer(1, 0, 110));
    target.dispatch('pointermove', pointer(2, 260, 200));

    target.dispatch('pointercancel', pointer(1, 0, 110));
    sample(source, out);
    expect(out.moveY).toBe(0);
    expect(out.cameraYaw).toBeCloseTo(60 / 110);

    target.dispatch('pointercancel', pointer(2, 260, 200));
    sample(source, out);
    expect(out.cameraYaw).toBe(0);
  });

  it('release clears both pointers', () => {
    const { source, target, out } = setup();
    target.dispatch('pointerdown', pointer(1, 0, 0));
    target.dispatch('pointerdown', pointer(2, 200, 200));
    target.dispatch('pointermove', pointer(1, 0, 110));
    target.dispatch('pointermove', pointer(2, 260, 200));
    source.release();
    sample(source, out);
    expect(out.moveY).toBe(0);
    expect(out.cameraYaw).toBe(0);
  });
});

describe('ButtonSource', () => {
  it('latches exactly one action across several presses', () => {
    const source = new ButtonSource();
    const out = newState();
    source.press();
    source.press();
    source.press();
    sample(source, out);
    expect(out.action).toBe(true);
    sample(source, out);
    expect(out.action).toBe(false);
  });

  it('release clears a latched press', () => {
    const source = new ButtonSource();
    const out = newState();
    source.press();
    source.release();
    sample(source, out);
    expect(out.action).toBe(false);
  });
});

describe('InputManager', () => {
  class FakeSource implements InputSource {
    released = 0;
    disposed = 0;

    constructor(readonly contribution: InputState) {}

    sample(out: InputState): void {
      out.moveX += this.contribution.moveX;
      out.moveY += this.contribution.moveY;
      out.cameraYaw += this.contribution.cameraYaw;
      if (this.contribution.action) out.action = true;
    }

    release(): void {
      this.released += 1;
    }

    dispose(): void {
      this.disposed += 1;
    }
  }

  const contribution = (moveX: number, moveY: number, action: boolean, cameraYaw: number): InputState => ({
    moveX,
    moveY,
    action,
    cameraYaw,
  });

  it('merges what every source adds', () => {
    const manager = new InputManager([
      new FakeSource(contribution(0.5, 0, false, 0.3)),
      new FakeSource(contribution(0, -0.5, true, 0.2)),
    ]);
    const out = manager.sample();
    expect(out.moveX).toBeCloseTo(0.5);
    expect(out.moveY).toBeCloseTo(-0.5);
    expect(out.action).toBe(true);
    expect(out.cameraYaw).toBeCloseTo(0.5);
  });

  it('limits the merged move to length 1 and clamps the camera', () => {
    const manager = new InputManager([new FakeSource(contribution(1, 1, false, 2))]);
    const out = manager.sample();
    expect(Math.hypot(out.moveX, out.moveY)).toBeCloseTo(1);
    expect(out.moveX).toBeCloseTo(Math.SQRT1_2);
    expect(out.cameraYaw).toBe(1);

    const second = new InputManager([new FakeSource(contribution(0, 0, false, -2))]);
    expect(second.sample().cameraYaw).toBe(-1);
  });

  it('zeroes the state each step and returns the same object every call', () => {
    const source = new FakeSource(contribution(1, 0, true, 1));
    const manager = new InputManager([source]);
    const first = manager.sample();
    expect(first.moveX).toBe(1);

    // A source that stops contributing must not keep the previous step's values.
    source.contribution.moveX = 0;
    source.contribution.action = false;
    source.contribution.cameraYaw = 0;
    const second = manager.sample();
    expect(second).toBe(first);
    expect(second.moveX).toBe(0);
    expect(second.action).toBe(false);
    expect(second.cameraYaw).toBe(0);
  });

  it('releaseAll and dispose reach every source', () => {
    const a = new FakeSource(contribution(0, 0, false, 0));
    const b = new FakeSource(contribution(0, 0, false, 0));
    const manager = new InputManager([a, b]);
    manager.releaseAll();
    expect(a.released).toBe(1);
    expect(b.released).toBe(1);
    manager.dispose();
    expect(a.disposed).toBe(1);
    expect(b.disposed).toBe(1);
  });
});
