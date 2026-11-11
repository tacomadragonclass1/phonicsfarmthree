import { describe, expect, it } from 'vitest';
import type { SoundEvents, Unsubscribe } from '../src/core/contracts';
import { Emitter } from '../src/core/Emitter';

interface Carried {
  pickedUp: string;
  dropped: void;
}

describe('Emitter', () => {
  it('calls listeners in subscription order', () => {
    const emitter = new Emitter<Carried>();
    const seen: string[] = [];
    emitter.on('pickedUp', (block) => seen.push(`first:${block}`));
    emitter.on('pickedUp', () => seen.push('second'));
    emitter.on('pickedUp', (block) => seen.push(`third:${block}`));

    emitter.emit('pickedUp', 'block_a');
    expect(seen).toEqual(['first:block_a', 'second', 'third:block_a']);
  });

  it('listeners for a void payload may be emitted with no second argument', () => {
    const emitter = new Emitter<SoundEvents>();
    const seen: Array<string | void> = [];
    emitter.on('letterStarted', (key) => seen.push(key));
    emitter.on('sequenceFinished', (payload) => seen.push(payload));

    emitter.emit('letterStarted', 'a');
    emitter.emit('sequenceFinished'); // no argument: this must compile
    expect(seen).toEqual(['a', undefined]);
  });

  it('does not deliver a payload to listeners of another event', () => {
    const emitter = new Emitter<Carried>();
    const seen: string[] = [];
    emitter.on('pickedUp', (block) => seen.push(`picked:${block}`));
    emitter.on('dropped', () => seen.push('dropped'));
    emitter.emit('pickedUp', 'b1');
    expect(seen).toEqual(['picked:b1']);
  });

  it('unsubscribe stops delivery, and calling it twice is harmless', () => {
    const emitter = new Emitter<Carried>();
    const seen: string[] = [];
    const offFirst = emitter.on('pickedUp', (block) => seen.push(`first:${block}`));
    emitter.on('pickedUp', (block) => seen.push(`second:${block}`));

    emitter.emit('pickedUp', 'x');
    offFirst();
    emitter.emit('pickedUp', 'y');
    expect(seen).toEqual(['first:x', 'second:x', 'second:y']);

    // A second call must not remove the other listener.
    offFirst();
    emitter.emit('pickedUp', 'z');
    expect(seen).toEqual(['first:x', 'second:x', 'second:y', 'second:z']);
  });

  it('unsubscribing during an emit stops that listener for the rest of the emit', () => {
    const emitter = new Emitter<Carried>();
    const seen: string[] = [];
    const offSecond: Unsubscribe = emitter.on('pickedUp', (block) => {
      seen.push(`second:${block}`);
      offSecond();
    });
    emitter.on('pickedUp', (block) => seen.push(`third:${block}`));

    emitter.emit('pickedUp', 'x');
    expect(seen).toEqual(['second:x', 'third:x']);
    emitter.emit('pickedUp', 'y');
    expect(seen).toEqual(['second:x', 'third:x', 'third:y']);
  });

  it('a listener removed during an emit is not called later in that emit', () => {
    const emitter = new Emitter<Carried>();
    const seen: string[] = [];
    let offThird: Unsubscribe = () => {};
    emitter.on('pickedUp', () => {
      seen.push('first');
      offThird();
    });
    emitter.on('pickedUp', () => seen.push('second'));
    offThird = emitter.on('pickedUp', () => seen.push('third'));

    emitter.emit('pickedUp', 'x');
    expect(seen).toEqual(['first', 'second']);
  });

  it('a listener added during an emit is not called until the next emit', () => {
    const emitter = new Emitter<Carried>();
    const seen: string[] = [];
    emitter.on('pickedUp', () => {
      seen.push('first');
      emitter.on('pickedUp', () => seen.push('added'));
    });
    emitter.on('pickedUp', () => seen.push('second'));

    emitter.emit('pickedUp', 'x');
    expect(seen).toEqual(['first', 'second']);
    // Next emit: the listener added during the first emit runs last, in the
    // subscription order it joined.
    emitter.emit('pickedUp', 'y');
    expect(seen).toEqual(['first', 'second', 'first', 'second', 'added']);
  });

  it('a throwing listener does not stop the others; the first error is rethrown after all ran', () => {
    const emitter = new Emitter<Carried>();
    const seen: string[] = [];
    const first = new Error('first listener blew up');
    const second = new Error('second listener blew up');

    emitter.on('pickedUp', () => {
      seen.push('first');
      throw first;
    });
    emitter.on('pickedUp', () => {
      seen.push('second');
      throw second;
    });
    emitter.on('pickedUp', () => seen.push('third'));

    expect(() => emitter.emit('pickedUp', 'x')).toThrow(first);
    expect(seen).toEqual(['first', 'second', 'third']);

    // The emitter is still usable afterwards, and the first error is still the
    // one reported.
    expect(() => emitter.emit('pickedUp', 'y')).toThrow(first);
    expect(seen).toEqual(['first', 'second', 'third', 'first', 'second', 'third']);
  });

  it('rethrows a non-Error value thrown by a listener', () => {
    const emitter = new Emitter<Carried>();
    emitter.on('pickedUp', () => {
      throw 'plain string';
    });
    expect(() => emitter.emit('pickedUp', 'x')).toThrow('plain string');
  });

  it('clear removes every listener for every event', () => {
    const emitter = new Emitter<Carried>();
    const seen: string[] = [];
    emitter.on('pickedUp', (block) => seen.push(`picked:${block}`));
    emitter.on('dropped', () => seen.push('dropped'));
    emitter.clear();

    emitter.emit('pickedUp', 'x');
    emitter.emit('dropped');
    expect(seen).toEqual([]);

    // A listener registered after clear still works.
    emitter.on('dropped', () => seen.push('dropped again'));
    emitter.emit('dropped');
    expect(seen).toEqual(['dropped again']);
  });

  it('emitting with no listeners does nothing', () => {
    const emitter = new Emitter<Carried>();
    expect(() => emitter.emit('pickedUp', 'x')).not.toThrow();
    expect(() => emitter.emit('dropped')).not.toThrow();
  });

  it('the same listener registered twice is called twice, and each unsubscribe is independent', () => {
    const emitter = new Emitter<Carried>();
    const seen: string[] = [];
    const listener = (block: string) => seen.push(block);
    const off1 = emitter.on('pickedUp', listener);
    const off2 = emitter.on('pickedUp', listener);

    emitter.emit('pickedUp', 'x');
    expect(seen).toEqual(['x', 'x']);

    off1();
    emitter.emit('pickedUp', 'y');
    expect(seen).toEqual(['x', 'x', 'y']);
    off2();
    emitter.emit('pickedUp', 'z');
    expect(seen).toEqual(['x', 'x', 'y']);
  });
});
