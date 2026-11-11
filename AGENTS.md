# phonicsfarmthree -- rules for implementation agents

You are an implementation agent working in this repository. An architect
assigns you one task at a time through a brief. Do that task and nothing else.

## Hard rules
- Work ONLY inside this repository. Never touch `..`.
- Edit ONLY the files your brief lists under "Files you own". Never edit
  `src/core/contracts.ts`, `package.json`, `tsconfig.json`, `vite.config.ts`,
  `opencode.json`, `AGENTS.md` or anything in `docs/`.
- No new dependencies. Available: `three`, `@dimforge/rapier3d-compat`,
  `vitest`, `typescript`, `vite`.
- Never run git commit / push / reset / checkout. Never use sudo.
- Before you finish, run `npm run typecheck` and `npm test` and fix what you
  broke. Do not weaken, skip or delete a test to make it pass.
- If the brief is impossible or contradicts the code, STOP and say so in your
  report. Do not invent a workaround that changes a contract.

## Keep your context small (a session that fills up is lost)
- Never print a minified or generated file. `node_modules/**/*.mjs`, `*.cjs`,
  `*.wasm*` and `package-lock.json` are off limits for cat/grep; read the
  `.d.ts` declarations instead.
- Pipe every search through `| cut -c1-240 | head -40`.
- Run one test file at a time (`npx vitest run tests/<file>`) and pipe test
  output through `| tail -30`.
- Scratch scripts go in `.agent-logs/` and are deleted before you finish.

## Code style
- TypeScript, strict. No `any`, no `@ts-ignore`, no non-null `!` unless a
  comment says why it is safe.
- ES modules, named exports, one main class or function group per file.
- Import three as `import * as THREE from 'three'`.
- Gameplay logic must be testable in Node without a browser: keep DOM,
  WebGL and audio access behind constructor-injected dependencies.
- Units are metres and seconds. Y is up. Characters face their local +Z.
- ALL yaw maths is in WORLD space. Never assign a world angle to a local
  rotation of a node whose parent may be rotated.
- Comments say WHY, briefly. No banner comments, no restating the code.
- Small files. Prefer plain functions and small classes over frameworks.

## Report format (your final message)
1. Files created/changed.
2. Output tail of `npm run typecheck` and `npm test`.
3. Anything you were unsure of or deliberately left out.
Keep it under 25 lines. Do not paste whole files.
