# Agent assignments and local-model orchestration

Living document. Last revised 2026-11-11.

## How delegation works

```
architect (Claude Code / Fable)            local GPU
  writes docs/briefs/<ID>.md
  tools/delegate.sh <model> <brief> <ID> ──► opencode run --auto (headless)
                                               └► http://127.0.0.1:8090  Strata   (alias: strata)
                                               └► http://127.0.0.1:8081  llama.cpp (alias: q27)
  reviews the diff, runs typecheck + tests + hidden acceptance tests
  accepts, or writes a correction brief
```

- **Invocation:** `tools/delegate.sh strata docs/briefs/B-06.md B-06 [timeout-s]`
  from the repository root. Transcript, stderr and a summary land in
  `.agent-logs/<stamp>-<ID>-<model>.*` (git-ignored).
- **Local-only is enforced, not assumed.** opencode ships hosted
  `opencode/*-free` models that are reachable with no credentials. The
  project config `opencode.json` sets
  `enabled_providers: ["strata", "llamacpp"]`; `opencode models` run in this
  directory lists exactly the two local models. `delegate.sh` health-checks
  the endpoint and **aborts** if it is down — there is no fallback path.
- **Verified:** the first delegated run was matched against the Strata server
  log (one title call + three tool steps, 52 tok/s); the 27B run against
  llama-server's own timing log.
- **Permissions:** the project config allows edits and shell inside
  this repository and denies `sudo`, `git commit/push/reset/checkout/clean/stash`,
  `curl`, `wget`, web fetch and access outside the directory. The owner's
  global opencode config (ask-before-edit) is untouched.
- **Starting the models:** `strata-start --agent --no-browser` /
  `strata-stop`; `llm-qwen-opencode.sh q8 low` for the 27B.

## The two models cannot run together

One 16 GB card. Strata holds 15.5 GiB VRAM + ~40 GiB RAM; the 27B holds
15.0 GiB VRAM. `strata-start` stops llama-server by design. **All delegation
is serial**, and switching models costs ~30 s (Strata) or ~25 s (27B) of load
plus the stop.

## Model comparison — EVAL-001, 2026-11-11

Same brief (`docs/briefs/EVAL-001.md`), same starting tree, one run each:
a fixed-step loop, a small three.js component, tests, inside the scaffolded
repo with house rules and a contracts file it was told not to touch.
Graded by typecheck, the model's own tests, and 8 acceptance tests the
models never saw.

| | Strata — Qwen3.8-Flash-Next IQ2_XS | Qwen 3.8 27B IQ3_XXS (llama.cpp) |
|---|---|---|
| Wall clock | **450 s** | 1,227 s (2.7×) |
| Decode speed | ~52 tok/s | ~27 tok/s |
| Tokens generated | 21,424 | 29,851 |
| Tool calls | 27 | 27 |
| Peak context | 35.8k of 96k | 42.3k of 64k |
| Typecheck / own tests | clean / 17 pass | clean / 20 pass |
| Hidden acceptance tests | **8 / 8** | **8 / 8** |
| Stayed in its four files | yes | yes |
| Left contracts alone | yes | yes |
| Report quality | precise, flagged two ambiguities in the brief | precise, flagged its design choices |
| Deviations | ran `npm install --no-save` for a missing TypeScript platform binary and said so | none |
| Code read | cleaner; guards a throwing `onError`; honest comment on a world-yaw assumption | more defensive numerics (epsilon, clamped frame time); a throwing `onError` escapes `tick`; sub-step clamp can run one extra step |

**Verdict.** On this task the two are equal on correctness and instruction
adherence, and Strata is 2.7× faster with 50% more context. That is one
task, one run each — a lean, not a proof. Neither model was "automatically"
better: the larger one was not more correct and the faster one was not
sloppier.

## Assignments

| Kind of work | Model | Why |
|---|---|---|
| All implementation tasks by default (logic, input, audio, views, tools, tests) | **Strata** | Equal quality at 2.7× the speed; 96k context fits a brief + contracts + several source files. |
| Second attempt at a task Strata has failed twice | **27B** | An independent model is worth more than a third try by the same one. |
| Numerically delicate work (camera rig, character controller) — *review pass* | **27B** as a critic on Strata's diff when the architect's own review leaves doubt | Its eval code was the more numerically careful of the two. |
| Architecture, contracts, briefs, review, integration decisions, docs | Architect | Not delegated. |

Rules of engagement:
- One agent, one brief, a disjoint set of owned files. `contracts.ts` and
  the docs are never agent-editable.
- A task that fails review twice is re-decomposed, not retried a third time.
- Every ledger row in `PROGRESS.md` records the model that did the work.

## Known limits of the local agents (from this box's history)

- Strata reports what it observed reliably and invents *procedures* it has
  not seen; briefs therefore spell out algorithms and never ask it to recall
  an API from memory without pointing at the installed package.
- Tool results must stay lean; a session with several ~11k-token reads
  overruns 96k.
