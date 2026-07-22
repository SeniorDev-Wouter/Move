# TypeScript conventions

House rules for non-UI TypeScript in TaskFlow: board logic, storage, data types,
and custom hooks. TaskFlow is a frontend-only React app (no backend/DB yet); the
"backend" domain is the pure logic and persistence layer.

## Types

- **`type` for data shapes** (Task, Priority, ColumnId, Board), reserve
  `interface` for things that are genuinely extended. Match whatever `types.ts`
  already does — don't mix styles.
- **No `any`.** Use `unknown` at boundaries (e.g. parsing `localStorage`) and
  narrow with a type guard before use.
- **Prefer union literals over enums** for closed sets (`type Priority = 'low' |
  'medium' | 'high'`) — they serialize cleanly to storage.
- **`readonly` / `as const`** for data that shouldn't mutate (the column
  definitions, priority order).
- Let inference do the work; annotate **exported** function signatures and public
  return types explicitly, not every local.

## Pure logic (board.ts)

- Board operations (move, reorder, change priority) must be **pure**: take the
  board in, return a new board — no mutation of inputs, no side effects, no
  reading `localStorage` from inside logic functions.
- Keep persistence (storage.ts) and React state (hooks) out of the pure logic;
  that separation is what makes `board.test.ts` simple.

## Storage / boundaries

- Treat `localStorage` as untrusted: parse into `unknown`, validate the shape,
  fall back to a fresh empty board on any parse/validation failure — never let a
  corrupt value throw at startup.
- Version the persisted shape if you change it, and migrate on load rather than
  wiping user data silently.

## Hooks

- Custom hooks (`useBoard`) own state + effects; components stay presentational.
- Return a stable, typed API from the hook (memoize handlers with `useCallback`
  when they're passed into `@dnd-kit`).

## Tests

- Every logic change to `board.ts`/`storage.ts` comes with a Vitest case in the
  matching `*.test.ts`. Test behavior (input board → output board), not
  internals.
- Never weaken or delete an existing test to make a change pass — fix the code.

## Don't

- No `console.log` left in committed code.
- No non-null assertions (`!`) to silence the compiler — narrow properly.
- Don't add runtime dependencies for things the standard library / existing deps
  already cover.
