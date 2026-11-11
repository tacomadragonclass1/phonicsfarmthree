import type { EventSource, Unsubscribe } from './contracts';

/** Void-payload events may be emitted with no second argument. */
type EmitArgs<Events, K extends keyof Events> = Events[K] extends void ? [] : [Events[K]];

/**
 * Method syntax is bivariant, which is what lets a listener registered for one
 * key be stored in a map shared by all keys. Dispatch always passes the payload
 * of the key the listener was registered for.
 */
interface StoredListener {
  handle(payload: unknown): void;
}

export class Emitter<Events> implements EventSource<Events> {
  private readonly listeners = new Map<keyof Events, StoredListener[]>();

  on<K extends keyof Events>(event: K, listener: (payload: Events[K]) => void): Unsubscribe {
    const stored: StoredListener = { handle: listener };
    const bucket = this.listeners.get(event) ?? [];
    bucket.push(stored);
    this.listeners.set(event, bucket);

    let unsubscribed = false;
    return () => {
      // Unsubscribing twice must not remove a different listener's slot.
      if (unsubscribed) return;
      unsubscribed = true;
      const current = this.listeners.get(event);
      if (!current) return;
      const index = current.indexOf(stored);
      if (index >= 0) current.splice(index, 1);
    };
  }

  emit<K extends keyof Events>(event: K, ...args: EmitArgs<Events, K>): void {
    const bucket = this.listeners.get(event);
    if (!bucket || bucket.length === 0) return;

    // Snapshot: listeners added during this emit run on the next one.
    const snapshot = [...bucket];
    const payload: unknown = args[0];
    let firstError: unknown = undefined;
    let failed = false;

    for (const stored of snapshot) {
      // A listener removed by an earlier listener in this same emit is skipped.
      if (!(this.listeners.get(event) ?? []).includes(stored)) continue;
      try {
        stored.handle(payload);
      } catch (error) {
        // One bad listener must not stop the others; the first error is rethrown
        // after all of them have had their turn.
        if (!failed) {
          failed = true;
          firstError = error;
        }
      }
    }

    if (failed) throw firstError;
  }

  clear(): void {
    this.listeners.clear();
  }
}
