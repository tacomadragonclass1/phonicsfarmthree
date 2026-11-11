# Task EVAL-001: fixed-step loop + a small Three.js component

Read `AGENTS.md` and `src/core/contracts.ts` first. Follow AGENTS.md exactly.

## Files you own (create these four, touch nothing else)
- `src/core/FixedStepLoop.ts`
- `src/world/Bobber.ts`
- `tests/fixedStepLoop.test.ts`
- `tests/bobber.test.ts`

## 1. `FixedStepLoop` (src/core/FixedStepLoop.ts)
`export class FixedStepLoop` constructed with `FixedStepOptions` from contracts.ts.
- Constructor throws `RangeError` if `step` is not finite or <= 0, or if
  `maxSubSteps` is not an integer >= 1.
- `tick(nowMs: number): void` -- advances the loop given a timestamp in
  MILLISECONDS (the value requestAnimationFrame passes). The first tick only
  records the time: it runs zero simulate calls and still calls render(0, 0).
  Later ticks add the elapsed time to an accumulator, call `simulate(step)`
  once per whole step (at most `maxSubSteps`; if more are owed, DROP the
  surplus time so the game does not spiral), then call
  `render(alpha, frameDt)` exactly once with `alpha = accumulator / step`.
- A negative or non-finite elapsed time counts as 0.
- If `simulate` or `render` throws, pass the error to `onError` (if given)
  and keep going; never let it escape `tick`. Without `onError`, swallow it.
- `start(): void` / `stop(): void` drive `tick` from `requestAnimationFrame`.
  `start` twice must not create two loops. After `stop` then `start`, the
  first tick again only records time (no huge catch-up step).
  The raf functions must be injectable for tests: the constructor takes an
  optional second argument
  `{ raf?: (cb: (t: number) => void) => number; caf?: (id: number) => void }`
  defaulting to the global requestAnimationFrame/cancelAnimationFrame.
- `readonly step: number` and `get running(): boolean`.

## 2. `Bobber` (src/world/Bobber.ts)
A tiny component that makes any THREE.Object3D hover and spin -- used later to
draw attention to a block.
`export class Bobber implements Updatable, Disposable`
- `constructor(target: THREE.Object3D, options?: { amplitude?: number; frequency?: number; spin?: number })`
  defaults: amplitude 0.08 m, frequency 1.2 Hz, spin 0.9 rad/s. Throws
  `RangeError` on a negative or non-finite option.
- It remembers the target's position.y and rotation.y at construction.
- `update(dt)`: advances internal time; sets
  `target.position.y = baseY + amplitude * sin(2*PI*frequency*time)` and
  `target.rotation.y = baseYaw + spin * time`. Only while `enabled`.
- `enabled: boolean` (default true). Setting it to false immediately restores
  the target's base y and yaw and resets internal time to 0.
- `dispose()`: restores the base y and yaw, and makes later `update` calls
  do nothing.
- It must never touch position.x/z or rotation.x/z.

## 3. Tests (vitest, Node environment -- no DOM, no WebGL)
Cover at least: first tick renders but does not simulate; 1/60 steps for a
100 ms frame; maxSubSteps clamping drops time; alpha range; an error in
simulate reaches onError and the next tick still works; start/stop with fake
raf; constructor validation. For Bobber: height after a quarter period equals
base + amplitude; yaw advances by spin*time; x/z untouched; disabling
restores; dispose restores and freezes; validation.

## Done when
`npm run typecheck` and `npm test` both pass. Then write your report.
