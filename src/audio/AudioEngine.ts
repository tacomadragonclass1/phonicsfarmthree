import type { Disposable } from '../core/contracts';
import type { ClipBackend, ClipHandle } from './PhonemeSequencer';
import { playChime } from './Chime';

const NOOP_HANDLE: ClipHandle = { stop: () => {} };

/**
 * Web Audio backend for the phoneme clips. One master gain, one source node per
 * play, so a stopped clip never looks like a clip that finished.
 */
export class AudioEngine implements ClipBackend, Disposable {
  private readonly context: AudioContext;
  private readonly master: GainNode;
  private readonly buffers = new Map<string, AudioBuffer>();
  private disposed = false;

  constructor(context?: AudioContext) {
    this.context = context ?? new AudioContext();
    this.master = this.context.createGain();
    this.master.gain.value = 1;
    this.master.connect(this.context.destination);
  }

  /**
   * Fetch and decode every entry, all at once: one after another the clips cost
   * a network round trip each before the game could start. If several fail, the
   * one reported is the first in the list. A clip that fails is never substituted.
   */
  async load(entries: Record<string, { url: string }>, baseUrl?: string): Promise<void> {
    const results = await Promise.allSettled(
      Object.entries(entries).map(([key, entry]) => this.loadOne(key, entry.url, baseUrl)),
    );
    for (const result of results) {
      if (result.status === 'rejected') throw result.reason;
    }
  }

  private async loadOne(key: string, entryUrl: string, baseUrl?: string): Promise<void> {
    const url = baseUrl ? new URL(entryUrl, baseUrl).href : entryUrl;

    let bytes: ArrayBuffer;
    try {
      const response = await fetch(url);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      bytes = await response.arrayBuffer();
    } catch (error) {
      throw new Error(`AudioEngine: could not fetch ${url}: ${reason(error)}`);
    }

    try {
      this.buffers.set(key.toLowerCase(), await this.context.decodeAudioData(bytes));
    } catch (error) {
      throw new Error(`AudioEngine: could not decode ${url}: ${reason(error)}`);
    }
  }

  /** Call from a user gesture; browsers start the context silent until then. */
  async unlock(): Promise<boolean> {
    if (this.disposed) return false;
    if (this.context.state !== 'running') {
      await this.context.resume();
    }
    return this.context.state === 'running';
  }

  get state(): AudioContextState {
    return this.context.state;
  }

  has(key: string): boolean {
    return this.buffers.has(key.toLowerCase());
  }

  /** A suspended context still schedules: the browser starts it once resumed. */
  play(key: string, onEnded: () => void): ClipHandle {
    const buffer = this.buffers.get(key.toLowerCase());
    if (!buffer || this.disposed) return NOOP_HANDLE;

    const source = this.context.createBufferSource();
    source.buffer = buffer;
    source.connect(this.master);
    source.onended = () => {
      source.disconnect();
      onEnded();
    };
    source.start();

    let stopped = false;
    return {
      stop: () => {
        if (stopped) return;
        stopped = true;
        // Detach first: a manual stop must not be reported as a natural end.
        source.onended = null;
        source.stop();
        source.disconnect();
      },
    };
  }

  /** A synthesised bell: there is no bell recording in the manifest. */
  chime(frequency?: number): void {
    if (this.disposed) return;
    // AudioContext and GainNode satisfy Chime's structural types, so no cast.
    playChime(this.context, this.master, { frequency });
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.buffers.clear();
    this.master.disconnect();
    void this.context.close();
  }
}

function reason(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
