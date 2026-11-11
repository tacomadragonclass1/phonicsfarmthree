import type { InputSource, InputState } from '../core/contracts';
import type { EventTargetLike } from './InputManager';
import { clamp, limitLength2 } from '../core/math';

export interface PointerEventLike {
  pointerId: number;
  clientX: number;
  clientY: number;
}

export interface PointerEvents {
  pointerdown: PointerEventLike;
  pointermove: PointerEventLike;
  pointerup: PointerEventLike;
  pointercancel: PointerEventLike;
}

export interface PointerSourceOptions {
  /** Pixels of drag for a full walk. */
  dragRange?: number;
  /** A tap must not swing: the second finger has to travel this far first. */
  swingSlop?: number;
}

interface Drag {
  pointerId: number;
  originX: number;
  originY: number;
  offsetX: number;
  offsetY: number;
  /** Swing only: set once the pointer has passed the slop, then stays set. */
  engaged: boolean;
}

/** Walking stick and camera swing. The action comes from the on-screen button. */
export class PointerSource implements InputSource {
  private readonly target: EventTargetLike<PointerEvents>;
  private readonly dragRange: number;
  private readonly swingSlop: number;

  private walk: Drag | null = null;
  private swing: Drag | null = null;

  constructor(target: EventTargetLike<PointerEvents>, options?: PointerSourceOptions) {
    this.target = target;
    this.dragRange = options?.dragRange ?? 110;
    this.swingSlop = options?.swingSlop ?? 24;

    target.addEventListener('pointerdown', this.onDown);
    target.addEventListener('pointermove', this.onMove);
    target.addEventListener('pointerup', this.onUp);
    target.addEventListener('pointercancel', this.onUp);
  }

  private newDrag(event: PointerEventLike): Drag {
    return {
      pointerId: event.pointerId,
      originX: event.clientX,
      originY: event.clientY,
      offsetX: 0,
      offsetY: 0,
      engaged: false,
    };
  }

  private readonly onDown = (event: PointerEventLike): void => {
    // pointerType is not inspected: a mouse is the same path as a finger.
    if (this.walk) {
      if (this.swing) return; // further pointers are ignored
      this.swing = this.newDrag(event);
      return;
    }
    this.walk = this.newDrag(event);
  };

  private readonly onMove = (event: PointerEventLike): void => {
    const drag = this.walk?.pointerId === event.pointerId ? this.walk : this.swing;
    if (!drag || drag.pointerId !== event.pointerId) return;

    drag.offsetX = event.clientX - drag.originX;
    drag.offsetY = event.clientY - drag.originY;

    if (drag === this.walk) {
      // Drag the origin along behind the pointer so one long drag keeps steering.
      const length = Math.hypot(drag.offsetX, drag.offsetY);
      if (length > this.dragRange) {
        const scale = this.dragRange / length;
        drag.originX = event.clientX - drag.offsetX * scale;
        drag.originY = event.clientY - drag.offsetY * scale;
        drag.offsetX *= scale;
        drag.offsetY *= scale;
      }
    } else if (Math.hypot(drag.offsetX, drag.offsetY) > this.swingSlop) {
      drag.engaged = true;
    }
  };

  /** pointerup and pointercancel both end the pointer cleanly. */
  private readonly onUp = (event: PointerEventLike): void => {
    if (this.walk?.pointerId === event.pointerId) this.walk = null;
    else if (this.swing?.pointerId === event.pointerId) this.swing = null;
  };

  sample(out: InputState): void {
    if (this.walk) {
      const move = limitLength2(this.walk.offsetX / this.dragRange, this.walk.offsetY / this.dragRange, 1);
      out.moveX += move.x;
      out.moveY += move.y;
    }
    if (this.swing?.engaged) out.cameraYaw += clamp(this.swing.offsetX / this.dragRange, -1, 1);
    // action is never set here.
  }

  release(): void {
    this.walk = null;
    this.swing = null;
  }

  dispose(): void {
    this.target.removeEventListener('pointerdown', this.onDown);
    this.target.removeEventListener('pointermove', this.onMove);
    this.target.removeEventListener('pointerup', this.onUp);
    this.target.removeEventListener('pointercancel', this.onUp);
    this.release();
  }
}
