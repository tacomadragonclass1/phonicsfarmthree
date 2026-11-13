import type { InputSource, InputState } from '../core/contracts';

export interface GamepadButtonLike {
  pressed: boolean;
}

export interface GamepadLike {
  /** Slot number; with `id` it says which physical pad this is. */
  index?: number;
  id?: string;
  mapping: string;
  connected: boolean;
  axes: ArrayLike<number>;
  buttons: ArrayLike<GamepadButtonLike>;
}

export type GamepadReader = () => ArrayLike<GamepadLike | null>;

/** Standard mapping: axes 0/1 left stick, 2/3 right stick. */
const LEFT_DEADZONE = 0.2;
const RIGHT_DEADZONE = 0.25;
const DPAD = { up: 12, down: 13, left: 14, right: 15 };
/**
 * Xbox layout. A (0) jumps; B (1) or the right trigger (7) picks up, puts down and
 * uses things. The right stick swings and tilts the camera, the bumpers zoom
 * (LB 4 out, RB 5 in) and pressing the right stick (11) puts the camera back.
 */
const JUMP_BUTTON = 0;
const ACTION_BUTTONS = [1, 7];
const ZOOM_OUT_BUTTON = 4;
const ZOOM_IN_BUTTON = 5;
const CAMERA_RESET_BUTTON = 11;

/** Where the right stick, its click, the bumpers and the right trigger are read from. */
export interface PadLayout {
  name: string;
  rightX: number;
  rightY: number;
  resetButton: number;
  zoomOutButton: number;
  zoomInButton: number;
  actionButtons: readonly number[];
  /** An axis that also counts as the action when pulled, or -1. */
  actionAxis: number;
  /** D-pad: buttons 12 to 15, two axes (x, y), or not read at all. */
  dpad: 'buttons' | readonly [number, number] | 'none';
}

const STANDARD_LAYOUT: PadLayout = {
  name: 'standard',
  rightX: 2,
  rightY: 3,
  resetButton: CAMERA_RESET_BUTTON,
  zoomOutButton: ZOOM_OUT_BUTTON,
  zoomInButton: ZOOM_IN_BUTTON,
  actionButtons: ACTION_BUTTONS,
  actionAxis: -1,
  dpad: 'buttons',
};

/**
 * A pad the browser does not recognise (mapping is "") is passed through in the
 * driver's own order, and there are two of those for an Xbox pad. They cannot be
 * told apart by name, only by where the triggers are: a trigger rests at -1, which
 * a stick never does.
 *
 * "Triggers in the middle": left stick 0 1, right stick X 2, triggers 3 4, right
 * stick Y 5. Seen with the stock Xbox pad; reading axis 3 as the stick there made
 * the camera run on its own, because axis 3 is a trigger resting at -1.
 */
const TRIGGERS_MIDDLE_LAYOUT: PadLayout = {
  name: 'unrecognised pad, triggers on axes 3 and 4',
  rightX: 2,
  rightY: 5,
  resetButton: 14,
  zoomOutButton: 6,
  zoomInButton: 7,
  actionButtons: [1],
  actionAxis: 4,
  dpad: [6, 7],
};

/** "Triggers outside": left stick 0 1, left trigger 2, right stick 3 4, right trigger 5. */
const TRIGGERS_OUTSIDE_LAYOUT: PadLayout = {
  name: 'unrecognised pad, triggers on axes 2 and 5',
  rightX: 3,
  rightY: 4,
  resetButton: 10,
  zoomOutButton: ZOOM_OUT_BUTTON,
  zoomInButton: ZOOM_IN_BUTTON,
  actionButtons: [1],
  actionAxis: 5,
  dpad: [6, 7],
};

/**
 * Until the triggers show where they are, an unrecognised pad is read with the
 * right stick's X only (axis 2 in both layouts above would be wrong for one of
 * them, but axis 2 is what worked before any of this): nothing that might be a
 * trigger is ever read as a stick.
 */
const UNKNOWN_LAYOUT: PadLayout = {
  name: 'unrecognised pad, waiting to see the triggers',
  rightX: 2,
  rightY: -1,
  resetButton: -1,
  zoomOutButton: -1,
  zoomInButton: -1,
  actionButtons: [1],
  actionAxis: -1,
  dpad: 'none',
};

const AT_REST = -0.9;

/** `current` is what was decided on earlier samples of this pad, or null. A decision is kept. */
export function detectLayout(pad: GamepadLike, current: PadLayout | null): PadLayout {
  if (pad.mapping === 'standard') return STANDARD_LAYOUT;
  if (current !== null && current !== UNKNOWN_LAYOUT) return current;
  const axis = (index: number): number => pad.axes[index] ?? 0;
  if (pad.axes.length >= 6) {
    if (axis(3) < AT_REST && axis(4) < AT_REST) return TRIGGERS_MIDDLE_LAYOUT;
    if (axis(2) < AT_REST && axis(5) < AT_REST) return TRIGGERS_OUTSIDE_LAYOUT;
    return UNKNOWN_LAYOUT;
  }
  // Four axes and no triggers among them: two sticks, in the usual order.
  return STANDARD_LAYOUT;
}

/** Rescaled so the edge of the deadzone reads 0 and full deflection reads 1. */
function rescale(value: number, deadzone: number): number {
  const magnitude = Math.abs(value);
  if (magnitude <= deadzone) return 0;
  return Math.sign(value) * (magnitude - deadzone) / (1 - deadzone);
}

/** Polls on sample: the Gamepad API has no events for sticks. */
export class GamepadSource implements InputSource {
  private readonly getGamepads: GamepadReader;

  /**
   * Which pad the previous sample read; null means "no baseline yet". Kept as a key,
   * not the object: Chrome hands back a fresh snapshot object on every poll, so comparing
   * objects made every sample look like a newly plugged pad and no press ever fired.
   */
  private padKey: string | null = null;
  private actionWasPressed = false;
  private jumpWasPressed = false;
  private resetWasPressed = false;
  private layout: PadLayout | null = null;

  constructor(getGamepads: GamepadReader) {
    this.getGamepads = getGamepads;
  }

  private pickPad(): GamepadLike | null {
    const pads = this.getGamepads();
    let first: GamepadLike | null = null;
    for (let i = 0; i < pads.length; i++) {
      const pad = pads[i];
      if (!pad || !pad.connected) continue;
      if (pad.mapping === 'standard') return pad;
      if (!first) first = pad;
    }
    return first;
  }

  private pressed(pad: GamepadLike, index: number): boolean {
    return Boolean(pad.buttons[index]?.pressed);
  }

  sample(out: InputState): void {
    const pad = this.pickPad();
    if (!pad) {
      // Unplugged: nothing to report, and the baseline is forgotten so a
      // re-plug with the button already held cannot fire an action.
      this.padKey = null;
      this.actionWasPressed = false;
      this.jumpWasPressed = false;
      this.resetWasPressed = false;
      return;
    }

    // First sample after a pad appears only establishes the edge baseline.
    const key = `${pad.index ?? 0}|${pad.id ?? ''}`;
    const isNewPad = this.padKey !== key;
    this.padKey = key;

    if (isNewPad) this.layout = null;
    const layout = detectLayout(pad, this.layout);
    this.layout = layout;
    const isPressed = layout.actionButtons.some((index) => this.pressed(pad, index))
      || (layout.actionAxis >= 0 && (pad.axes[layout.actionAxis] ?? 0) > 0.5);
    if (isNewPad) this.actionWasPressed = isPressed;
    else if (isPressed && !this.actionWasPressed) out.action = true;
    this.actionWasPressed = isPressed;

    const jumpPressed = this.pressed(pad, JUMP_BUTTON);
    if (isNewPad) this.jumpWasPressed = jumpPressed;
    else if (jumpPressed && !this.jumpWasPressed) out.jump = true;
    this.jumpWasPressed = jumpPressed;

    const resetPressed = this.pressed(pad, layout.resetButton);
    if (isNewPad) this.resetWasPressed = resetPressed;
    else if (resetPressed && !this.resetWasPressed) out.cameraReset = true;
    this.resetWasPressed = resetPressed;

    let dpadX = 0;
    let dpadY = 0;
    if (layout.dpad === 'buttons') {
      dpadX = (this.pressed(pad, DPAD.right) ? 1 : 0) - (this.pressed(pad, DPAD.left) ? 1 : 0);
      dpadY = (this.pressed(pad, DPAD.down) ? 1 : 0) - (this.pressed(pad, DPAD.up) ? 1 : 0);
    } else if (layout.dpad !== 'none') {
      dpadX = Math.round(pad.axes[layout.dpad[0]] ?? 0);
      dpadY = Math.round(pad.axes[layout.dpad[1]] ?? 0);
    }
    if (dpadX !== 0 || dpadY !== 0) {
      out.moveX += dpadX;
      out.moveY += dpadY;
    } else {
      const x = pad.axes[0] ?? 0;
      const y = pad.axes[1] ?? 0;
      const length = Math.hypot(x, y);
      if (length > LEFT_DEADZONE) {
        // Radial: the whole vector is scaled by how far past the deadzone it is.
        const scale = (length - LEFT_DEADZONE) / ((1 - LEFT_DEADZONE) * length);
        out.moveX += x * scale;
        out.moveY += y * scale;
      }
    }

    out.cameraYaw += rescale(pad.axes[layout.rightX] ?? 0, RIGHT_DEADZONE);
    // Stick up reads negative. Up looks up, which means the camera itself comes
    // down toward the ground; down looks down from above.
    if (layout.rightY >= 0) out.cameraPitch += rescale(pad.axes[layout.rightY] ?? 0, RIGHT_DEADZONE);
    out.cameraZoom += (this.pressed(pad, layout.zoomInButton) ? 1 : 0) - (this.pressed(pad, layout.zoomOutButton) ? 1 : 0);
  }

  release(): void {
    this.padKey = null;
    this.actionWasPressed = false;
    this.jumpWasPressed = false;
    this.resetWasPressed = false;
    this.layout = null;
  }

  dispose(): void {
    this.release();
  }
}
