# Contributing to @particle-academy/fancy-3d-babylon

Notes for anyone, human or agent, working ON this package's code. How to USE the
package is in [AGENTS.md](./AGENTS.md); what it is, is in [README.md](./README.md).
`CLAUDE.md` is a symlink to this file, so Claude Code reads these notes when it
works in this repo.

## Build and test

```bash
npm run build   # tsup
npm run dev     # tsup --watch
npm run lint    # tsc --noEmit && eslint .
npm test        # vitest run
```

Sources are in `src/` (`index.ts` adapter, `engine.ts`, `react.tsx`,
`primitives.ts`, `layouts.ts`, `painters.ts`); tests are in `tests/`.

## Mirror of fancy-3d-three

This package and `fancy-3d-three` mirror each other's API and implement the
same `CanvasEngine` interface from `@particle-academy/fancy-3d`. Neither depends
on the other. A change to the public surface here usually wants its twin there.

## Changelog

Update `CHANGELOG.md` (Keep a Changelog, `[Unreleased]` at the top) in the same
commit as the change.
