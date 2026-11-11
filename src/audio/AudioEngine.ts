import type { Disposable } from '../core/contracts';
import type { ClipBackend, ClipHandle } from './PhonemeSequencer';

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
   * Fetch and decode every entry, in order, so the first failure is the one
   * reported. A clip that fails to load is never substituted.
   */
  async load(entries: Record<string, { url: string }>, baseUrl?: string): Promise<void> {
    for (const [key, entry] of Object.entries(entries)) {
      const url = baseUrl ? new URL(entry.url, baseUrl).href : entry.url;

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
