import { describe, expect, it } from 'vitest';
import { Hud, type DocLike, type ElLike, type PointerEventLike } from '../src/ui/Hud';

/** A stand-in for a DOM element: only the members Hud uses. */
class FakeEl implements ElLike {
  className = '';
  textContent = '';
  style = { width: '' };
  readonly classes = new Set<string>();
  readonly attrs = new Map<string, string>();
  readonly children: FakeEl[] = [];
  parent: FakeEl | null = null;
  private readonly listeners = new Map<string, Array<(event: PointerEventLike) => void>>();
  readonly classList = {
    add: (name: string): void => {
      this.classes.add(name);
    },
    remove: (name: string): void => {
      this.classes.delete(name);
    },
    toggle: (name: string, on: boolean): void => {
      if (on) this.classes.add(name);
      else this.classes.delete(name);
    },
  };

  constructor(readonly tag: string) {}

  setAttribute(name: string, value: string): void {
    this.attrs.set(name, value);
  }

  appendChild(child: ElLike): void {
    // The HUD only ever appends elements this fake created.
    if (!(child instanceof FakeEl)) throw new Error('appended a non-fake element');
    this.children.push(child);
    child.parent = this;
  }

  remove(): void {
    if (!this.parent) return;
    const index = this.parent.children.indexOf(this);
    if (index >= 0) this.parent.children.splice(index, 1);
    this.parent = null;
  }

  addEventListener(type: string, listener: (event: PointerEventLike) => void): void {
    const bucket = this.listeners.get(type) ?? [];
    bucket.push(listener);
    this.listeners.set(type, bucket);
  }

  removeEventListener(type: string, listener: (event: PointerEventLike) => void): void {
    const bucket = this.listeners.get(type);
    if (!bucket) return;
    const index = bucket.indexOf(listener);
    if (index >= 0) bucket.splice(index, 1);
  }

  dispatch(type: string, event: PointerEventLike): void {
    for (const listener of [...(this.listeners.get(type) ?? [])]) listener(event);
  }
}

class FakePointerEvent implements PointerEventLike {
  prevented = false;
  stopped = false;

  preventDefault(): void {
    this.prevented = true;
  }

  stopPropagation(): void {
    this.stopped = true;
  }
}

class FakeDoc implements DocLike {
  readonly created: FakeEl[] = [];

  createElement(tag: string): FakeEl {
    const el = new FakeEl(tag);
    this.created.push(el);
    return el;
  }
}

function findAll(doc: FakeDoc, className: string): FakeEl[] {
  return doc.created.filter((element) => element.className.split(' ').includes(className));
}

function find(doc: FakeDoc, className: string): FakeEl {
  const matches = findAll(doc, className);
  if (!matches.length) throw new Error(`no element with class "${className}"`);
  return matches[matches.length - 1];
}

function makeHud(): { hud: Hud; doc: FakeDoc; root: FakeEl; presses: { count: number } } {
  const doc = new FakeDoc();
  const root = new FakeEl('div');
  const presses = { count: 0 };
  const hud = new Hud({ root, doc, onAction: () => { presses.count += 1; } });
  return { hud, doc, root, presses };
}

describe('Hud', () => {
  it('loading creates one overlay and updates the same bar on repeat calls', () => {
    const { hud, doc, root } = makeHud();
    hud.showLoading(1, 4);
    const overlay = find(doc, 'overlay');
    const bar = find(doc, 'progress-fill');
    expect(overlay.attrs.get('role')).toBe('status');
    expect(bar.style.width).toBe('25%');

    hud.showLoading(3, 4);
    expect(findAll(doc, 'overlay').length).toBe(1);
    expect(bar.style.width).toBe('75%');
    expect(root.children).toEqual([find(doc, 'action-button'), overlay]);
  });

  it('waitForStart resolves only after the start button is pressed, then removes the overlay', async () => {
    const { hud, doc, root } = makeHud();
    hud.showLoading(4, 4);
    const loading = find(doc, 'overlay');

    const started = hud.waitForStart();
    const overlay = find(doc, 'overlay');
    const startButton = find(doc, 'start-button');
    expect(overlay).not.toBe(loading);

    let resolved = false;
    started.then(() => {
      resolved = true;
    });
    expect(resolved).toBe(false);

    startButton.dispatch('pointerdown', new FakePointerEvent());
    await started;
    expect(resolved).toBe(true);
    expect(overlay.parent).toBeNull();
    expect(root.children).toEqual([find(doc, 'action-button')]);
  });

  it('showError replaces any overlay and sets role alert', () => {
    const { hud, doc, root } = makeHud();
    hud.showLoading(1, 2);
    const loading = find(doc, 'overlay');

    hud.showError('Something went wrong. Please reload the page.');
    const error = find(doc, 'overlay');
    expect(error).not.toBe(loading);
    expect(loading.parent).toBeNull();
    expect(error.attrs.get('role')).toBe('alert');
    expect(root.children).toEqual([find(doc, 'action-button'), error]);
    expect(error.children[0].textContent).toBe('Something went wrong. Please reload the page.');
  });

  it('action button pointerdown calls onAction once and prevents default', () => {
    const { hud, doc, presses } = makeHud();
    hud.setActionVisible(true);
    const button = find(doc, 'action-button');
    expect(button.attrs.get('aria-label')).toBe('Action');

    const event = new FakePointerEvent();
    button.dispatch('pointerdown', event);
    expect(presses.count).toBe(1);
    expect(event.prevented).toBe(true);
    expect(event.stopped).toBe(true);
  });

  it('the action button starts hidden and setActionReady toggles the class', () => {
    const { hud, doc } = makeHud();
    const button = find(doc, 'action-button');
    expect(button.classes.has('is-hidden')).toBe(true);

    hud.setActionVisible(true);
    expect(button.classes.has('is-hidden')).toBe(false);

    hud.setActionReady(true);
    expect(button.classes.has('is-ready')).toBe(true);
    hud.setActionReady(false);
    expect(button.classes.has('is-ready')).toBe(false);
  });

  it('the first medal creates the tray', () => {
    const { hud, doc, root } = makeHud();
    hud.addMedal('A');

    const tray = find(doc, 'medal-tray');
    expect(tray.attrs.get('aria-label')).toBe('Letters found');
    expect(root.children).toEqual([find(doc, 'action-button'), tray]);

    const medal = find(doc, 'medal');
    expect(medal.parent).toBe(tray);
    expect(medal.classes.has('is-new')).toBe(true);
    expect(medal.children[0].tag).toBe('span');
    expect(medal.children[0].textContent).toBe('a');
    expect(hud.medalCount).toBe(1);
  });

  it('a second letter adds a medal and moves is-new to it', () => {
    const { hud, doc } = makeHud();
    hud.addMedal('a');
    const first = find(doc, 'medal');

    hud.addMedal('t');
    const medals = findAll(doc, 'medal');
    expect(medals.length).toBe(2);
    expect(medals[1]).not.toBe(first);
    expect(medals[1].children[0].textContent).toBe('t');
    expect(first.classes.has('is-new')).toBe(false);
    expect(medals[1].classes.has('is-new')).toBe(true);
    expect(hud.medalCount).toBe(2);
  });

  it('a repeat letter adds nothing', () => {
    const { hud, doc } = makeHud();
    hud.addMedal('a');
    hud.addMedal('a');

    expect(findAll(doc, 'medal').length).toBe(1);
    expect(hud.medalCount).toBe(1);
  });

  it('clearMedals empties the tray, and the same letter can be won again', () => {
    const { hud, doc } = makeHud();
    hud.addMedal('a');
    hud.addMedal('t');
    hud.clearMedals();
    expect(hud.medalCount).toBe(0);
    expect(findAll(doc, 'medal').filter((medal) => medal.parent?.parent != null).length).toBe(0);

    hud.addMedal('a');
    expect(hud.medalCount).toBe(1);
  });

  it('dispose removes the tray', () => {
    const { hud, doc, root } = makeHud();
    hud.addMedal('a');
    const tray = find(doc, 'medal-tray');

    hud.dispose();
    expect(tray.parent).toBeNull();
    expect(root.children.length).toBe(0);
  });

  it('dispose removes everything it added', () => {
    const { hud, doc, root, presses } = makeHud();
    hud.showLoading(1, 2);
    hud.dispose();

    expect(root.children.length).toBe(0);
    const button = find(doc, 'action-button');
    expect(button.parent).toBeNull();
    button.dispatch('pointerdown', new FakePointerEvent());
    expect(presses.count).toBe(0);
  });
});
