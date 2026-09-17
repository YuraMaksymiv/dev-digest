# client/ — @devdigest/web

Next.js 15 studio UI (App Router) for DevDigest. Route map:
[README.md](README.md).

## Stack

Next.js 15 · React 19 · next-intl · TanStack Query · Recharts / mermaid ·
TypeScript 5.7.

## Commands

- `pnpm dev` — :3000
- `pnpm test` — vitest + jsdom (smoke-mounts the `/showcase` gallery)
- `pnpm typecheck` · `pnpm build`

## Map

- `src/app/` — route segments: `agents`, `onboarding`, `repos`, `settings`.
- `src/components/` — feature components: `diff-viewer`, `app-shell`,
  `page-shell`, `showcase`, `mermaid-diagram`.
- `src/lib/` — API client, hooks, repo context, theming, i18n glue.
- `src/vendor/ui/` — the `@devdigest/ui` design system (see its own
  [README.md](src/vendor/ui/README.md)).
- `src/vendor/shared/` — mirrored copy of `@devdigest/shared`; see root
  `CLAUDE.md` (can drift from the server's copy).

## Non-default conventions

- **Always import UI from `@devdigest/ui`** (the barrel `index.ts`) — never
  reach into a `vendor/ui/` layer file directly.
- Adding or changing a `@devdigest/ui` component → add it to the
  `/showcase` route, or the smoke test (`src/test/smoke.test.tsx`) fails CI.
- Visual tokens are CSS variables (`var(--accent)`, …) switched by
  `data-theme` — don't hard-code colors in components.

## Gotchas

- UI copy goes through next-intl (`messages/en/`), not literal strings.

## More

[docs/](docs/) · [specs/](specs/) · [INSIGHTS.md](INSIGHTS.md)
