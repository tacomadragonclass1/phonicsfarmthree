import { Emitter } from '../core/Emitter';
import type { SoundEvents, SoundPlayer, Unsubscribe } from '../core/contracts';

/** A clip that has been handed to the backend. `stop()` must not call `onEnded`. */
export interface ClipHandle {
  stop(): void;
}

/** One clip per key. Keys are looked up exactly as given. */
export interface ClipBackend {
  has(key: string): boolean;
  play(key: string, onEnded: () => void): ClipHandle;
}

/**
 * A listener may ask for a new sequence from inside an event. Without a bound,
 * a listener that re-triggers on every event would recurse forever, so
 * re-entrant `playSequence` calls past this depth are ignored.
 */
const MAX_REENTRANCY = 8;

/** The game's one voice: clips play strictly one after another. */
export class PhonemeSequencer implements SoundPlayer {
  private readonly backend: ClipBackend;
  private readonly emitter = new Emitter<SoundEvents>();
  private readonly queue: string[] = [];
  private currentHandle: ClipHandle | null = null;
  /** Id of the clip whose `onEnded` is still live; 0 means none. */
  private currentClip = 0;
  private nextClip = 0;
  private active = false;
  private depth = 0;

  constructor(backend: ClipBackend) {
    this.backend = backend;
  }

  get busy(): boolean {
    return this.active;
  }

  on<K extends keyof SoundEvents>(event: K, listener: (payload: SoundEvents[K]) => void): Unsubscribe {
    return this.emitter.on(event, listener);
  }

  playSequence(keys: readonly string[]): void {
    if (this.depth >= MAX_REENTRANCY) return;
    this.depth += 1;
    try {
      this.stopInternal();

      const queued = keys.map((key) => key.toLowerCase()).filter((key) => this.backend.has(key));
      if (queued.length === 0) return;

      this.queue.push(...queued);
      this.active = true;
      this.startNext();
    } finally {
      this.depth -= 1;
    }
  }

  stop(): void {
    this.stopInternal();
  }

  /** Emits `sequenceCancelled` only when something was actually playing. */
  private stopInternal(): void {
    const wasActive = this.active;
    this.currentClip = 0; // any onEnded still in flight is now stale

    const handle = this.currentHandle;
    this.currentHandle = null;
    if (handle) handle.stop();

    this.queue.length = 0;
    this.active = false;
    if (wasActive) this.emitter.emit('sequenceCancelled');
  }

  private startNext(): void {
    const key = this.queue.shift();
    if (key === undefined) return;

    const clip = ++this.nextClip;
    this.currentClip = clip;
    // The handle is stored before the event fires so a listener that replaces
    // the sequence can stop this clip.
    this.currentHandle = this.backend.play(key, () => this.onEnded(clip));
    this.emitter.emit('letterStarted', key);
  }

  private onEnded(clip: number): void {
    // A stopped or replaced clip must not advance the sequence.
    if (clip !== this.currentClip) return;

    this.currentClip = 0;
    this.currentHandle = null;
    if (this.queue.length > 0) {
      this.startNext();
      return;
    }

    // busy is false inside the listener, so it can start a new sequence.
    this.active = false;
    this.emitter.emit('sequenceFinished');
  }
}
