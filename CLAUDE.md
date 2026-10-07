# Crop Crawler — conventions for coding agents

Hold-to-crawl idle/merge farming game (robot caterpillar). TypeScript + Vite + Three.js + Capacitor 8.

## Layout
- `src/game/`, `src/shared/` — **pure, deterministic** simulation & helpers. No `three`, DOM, `Date.now`,
  `Math.random`, `performance`. Randomness via `game/rng.ts` on `state.rng`; time only via `Sim.step(dt)`.
  Enforced by `tsconfig.pure.json` (no DOM lib) and `src/architecture.test.ts`.
- `src/render/` — Three.js views. Must not import `ui/`, `platform/`, `app/`.
- `src/ui/` — vanilla DOM overlay. Must not import `three`.
- `src/platform/` — ads, storage, consent, audio, haptics, i18n, lifecycle.
- `src/app/` — composition root (the only place wiring everything together).

## Code style
- Relative imports use the `.ts` extension (Node runs `scripts/*.ts` directly via type stripping).
- Erasable TypeScript only: no `enum`, `namespace`, or constructor parameter properties.
- All balance numbers live in `src/game/config.ts`. Run `npm run balance` after changing them.
- Text shown to players goes through `t()` (`src/platform/i18n`); add keys to both `en.ts` and `de.ts`.

## Commands
- `npm run dev` — dev server (devstub ads, `?debug=1` hooks)
- `npm run typecheck && npm test` — types + unit tests
- `npm run e2e` — Playwright (pinned 1.56.1 to match /opt/pw-browsers)
- `npm run balance -- --profile all` — headless pacing report
- `npm run build:{web,native,crazygames,youtube}` — flavors → `dist/<mode>`
- `npm run android:debug` — needs Android SDK (`scripts/setup-android-sdk.sh`)
