import type { Disposable } from '../core/contracts';

/** Only the parts of a pointer event the HUD uses. */
export interface PointerEventLike {
  preventDefault(): void;
  stopPropagation(): void;
}

/** The few document members used -- injected so this runs in Node tests. */
export interface ElLike {
  className: string;
  textContent: string;
  /** Only the width is used: the progress fill. */
  style: { width: string };
  setAttribute(name: string, value: string): void;
  appendChild(child: ElLike): void;
  remove(): void;
  addEventListener(type: string, listener: (event: PointerEventLike) => void): void;
  removeEventListener(type: string, listener: (event: PointerEventLike) => void): void;
  classList: {
    add(name: string): void;
    remove(name: string): void;
    toggle(name: string, on: boolean): void;
  };
}

export interface DocLike {
  createElement(tag: string): ElLike;
}

/** The three things the overlay can be; only one is on screen at a time. */
type OverlayKind = 'loading' | 'start' | 'error';

export interface HudOptions {
  /** The `#ui` layer: the button and one overlay at a time. */
  root: ElLike;
  doc: DocLike;
  onAction: () => void;
}

/** The whole on-screen UI: one button, one overlay. */
export class Hud implements Disposable {
  private readonly root: ElLike;
  private readonly doc: DocLike;
  private readonly onAction: () => void;
  private readonly action: ElLike;
  private readonly actionListener: (event: PointerEventLike) => void;
  private overlay: ElLike | null = null;
  private panel: ElLike | null = null;
  private fill: ElLike | null = null;
  private overlayKind = '';
  private tray: ElLike | null = null;
  private newestMedal: ElLike | null = null;
  private readonly medalLetters = new Set<string>();
  private disposed = false;

  constructor(options: HudOptions) {
    this.root = options.root;
    this.doc = options.doc;
    this.onAction = options.onAction;

    this.action = this.doc.createElement('button');
    this.action.className = 'action-button';
    this.action.classList.add('is-hidden'); // shown only once the game can act
    this.action.setAttribute('aria-label', 'Action');
    this.actionListener = (event) => {
      // pointerdown, not click: no 300 ms wait, and it works while another finger steers.
      event.preventDefault();
      event.stopPropagation();
      this.onAction();
    };
    this.action.addEventListener('pointerdown', this.actionListener);
    this.root.appendChild(this.action);
  }

  showLoading(done: number, total: number): void {
    if (this.disposed) return;
    const panel = this.ensurePanel('loading');
    const fill = this.fill ?? this.makeFill(panel);
    const fraction = total > 0 ? Math.min(1, Math.max(0, done / total)) : 0;
    fill.style.width = `${Math.round(fraction * 100)}%`;
  }

  /** Shows the big play button; resolves when it is pressed (a user gesture -- audio can unlock). */
  waitForStart(): Promise<void> {
    if (this.disposed) return Promise.resolve();
    const panel = this.ensurePanel('start');
    const button = this.doc.createElement('button');
    button.className = 'start-button';
    button.setAttribute('aria-label', 'Play');
    panel.appendChild(button);
    return new Promise<void>((resolve) => {
      button.addEventListener('pointerdown', (event) => {
        event.preventDefault();
        event.stopPropagation();
        this.hideOverlay();
        resolve();
      });
    });
  }

  /** Stays until the page is reloaded. */
  showError(message: string): void {
    if (this.disposed) return;
    const panel = this.ensurePanel('error');
    panel.textContent = message;
  }

  hideOverlay(): void {
    this.removeOverlay();
  }

  setActionReady(ready: boolean): void {
    this.action.classList.toggle('is-ready', ready);
  }

  setActionVisible(visible: boolean): void {
    this.action.classList.toggle('is-hidden', !visible);
  }

  /** A medal for a found letter, added to the top-right tray. */
  addMedal(letter: string): void {
    if (this.disposed) return;
    const key = letter.toLowerCase();
    if (this.medalLetters.has(key)) return; // one medal per letter
    this.medalLetters.add(key);

    const tray = this.tray ?? this.makeTray();
    if (this.newestMedal) this.newestMedal.classList.remove('is-new');

    const medal = this.doc.createElement('div');
    medal.className = 'medal';
    medal.classList.add('is-new');
    const glyph = this.doc.createElement('span');
    glyph.textContent = key;
    medal.appendChild(glyph);
    tray.appendChild(medal);
    this.newestMedal = medal;
  }

  /** The village game started again: every medal goes. */
  clearMedals(): void {
    this.medalLetters.clear();
    if (this.tray) this.tray.remove();
    this.tray = null;
    this.newestMedal = null;
  }

  get medalCount(): number {
    return this.medalLetters.size;
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.action.removeEventListener('pointerdown', this.actionListener);
    this.removeOverlay();
    if (this.tray) this.tray.remove();
    this.tray = null;
    this.newestMedal = null;
    this.action.remove();
  }

  /** The centred panel, made once per kind so repeat calls do not rebuild it. */
  private ensurePanel(kind: OverlayKind): ElLike {
    if (this.overlay && this.overlayKind === kind && this.panel) return this.panel;

    this.removeOverlay();
    const overlay = this.doc.createElement('div');
    overlay.className = 'overlay';
    overlay.setAttribute('role', kind === 'error' ? 'alert' : 'status');
    const panel = this.doc.createElement('div');
    panel.className = 'overlay-panel';
    overlay.appendChild(panel);
    this.root.appendChild(overlay);

    this.overlay = overlay;
    this.panel = panel;
    this.overlayKind = kind;
    return panel;
  }

  private makeFill(panel: ElLike): ElLike {
    const track = this.doc.createElement('div');
    track.className = 'progress';
    const fill = this.doc.createElement('div');
    fill.className = 'progress-fill';
    track.appendChild(fill);
    panel.appendChild(track);
    this.fill = fill;
    return fill;
  }

  private makeTray(): ElLike {
    const tray = this.doc.createElement('div');
    tray.className = 'medal-tray';
    tray.setAttribute('aria-label', 'Letters found');
    this.root.appendChild(tray);
    this.tray = tray;
    return tray;
  }

  private removeOverlay(): void {
    if (!this.overlay) return;
    this.overlay.remove();
    this.overlay = null;
    this.panel = null;
    this.fill = null;
  }
}
