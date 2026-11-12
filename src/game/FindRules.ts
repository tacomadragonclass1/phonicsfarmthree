import { Emitter } from '../core/Emitter';
import type {
  BlockState,
  EventSource,
  FindEvents,
  SoundPlayer,
  Unsubscribe,
} from '../core/contracts';

export interface FindRulesOptions {
  /** Live array of every block. */
  blocks: readonly BlockState[];
  sound: SoundPlayer;
  /** The block in Chuck's hands right now, or null. */
  carried: () => BlockState | null;
  /** Returns a number in [0, 1). Default Math.random. */
  random?: () => number;
  /** Sound keys. */
  askKey?: string;
  praiseKey?: string;
}

/**
 * The "find it" helper: she asks for a sound, the child brings a block, and
 * she says whether that was the one. No rendering, no audio of its own -- it
 * only asks the shared sound player to speak, and never listens to it.
 */
export class FindRules implements EventSource<FindEvents> {
  private readonly blocks: readonly BlockState[];
  private readonly sound: SoundPlayer;
  private readonly carriedFn: () => BlockState | null;
  private readonly random: () => number;
  private readonly askKey: string;
  private readonly praiseKey: string;
  private readonly emitter = new Emitter<FindEvents>();

  /** The letter she is waiting for, or null before the first request. */
  private currentLetter: string | null = null;
  /** The letter she last asked for, so she does not repeat it after a find. */
  private previousLetter: string | null = null;

  constructor(options: FindRulesOptions) {
    this.blocks = options.blocks;
    this.sound = options.sound;
    this.carriedFn = options.carried;
    this.random = options.random ?? Math.random;
    this.askKey = options.askKey ?? 'annette_find';
    this.praiseKey = options.praiseKey ?? 'annette_good';
  }

  get wanted(): string | null {
    return this.currentLetter;
  }

  /** Chuck pressed the action in front of her. */
  talk(): void {
    if (this.currentLetter === null) {
      const letter = this.chooseLetter();
      if (letter === null) return;
      this.currentLetter = letter;
      this.ask(letter);
      return;
    }

    const block = this.carriedFn();
    if (block === null) {
      this.ask(this.currentLetter);
      return;
    }

    if (block.letter === this.currentLetter) {
      this.sound.playSequence([this.praiseKey]);
      this.emitter.emit('found', { letter: this.currentLetter, blockId: block.id });
      this.previousLetter = this.currentLetter;
      this.currentLetter = null;
      return;
    }

    const wanted = this.currentLetter;
    const brought = block.letter;
    // She names the sound he brought, then asks for hers again.
    this.sound.playSequence([brought, this.askKey, wanted]);
    this.emitter.emit('tryAgain', { wanted, brought });
  }

  on<K extends keyof FindEvents>(event: K, listener: (payload: FindEvents[K]) => void): Unsubscribe {
    return this.emitter.on(event, listener);
  }

  private ask(letter: string): void {
    this.sound.playSequence([this.askKey, letter]);
    this.emitter.emit('asked', { letter });
  }

  private chooseLetter(): string | null {
    const distinct = [...new Set(this.blocks.map((block) => block.letter))].sort();
    const carried = this.carriedFn();
    const choices = carried === null ? distinct : distinct.filter((letter) => letter !== carried.letter);
    if (choices.length === 0) return null;

    // She will not ask for the same letter twice in a row unless it is the
    // only one there is.
    if (choices.length > 1 && this.previousLetter !== null) {
      const fresh = choices.filter((letter) => letter !== this.previousLetter);
      if (fresh.length > 0) return pick(fresh, this.random);
    }
    return pick(choices, this.random);
  }
}

function pick(choices: readonly string[], random: () => number): string {
  return choices[Math.floor(random() * choices.length)];
}
