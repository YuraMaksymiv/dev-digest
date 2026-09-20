# Anatomy of a feature component

What every UI addition in `client/` looks like, so a new one reads like the
existing ones. Rules live in `client/CLAUDE.md`; this is the worked shape.

## Folder

Route segments stay thin — the page resolves data and picks a tab, features live
in colocated `_components/`:

```
app/repos/[repoId]/pulls/_components/FindingsCell/
  FindingsCell.tsx        the component ("use client")
  index.ts                barrel: export { X, X as default } from "./X"
  styles.ts               style objects (optional)
  FindingsCell.test.tsx   colocated test (optional but expected)
  constants.ts helpers.ts pure data/derivations (optional)
```

Children of a feature component nest one level deeper
(`_components/<Parent>/_components/<Child>/`).

## Styling

Tailwind is imported but **unused** in components. Everything is an inline
`style={}` object pointing at CSS variables, extracted into `styles.ts` as a
const `s` (`satisfies CSSProperties`, or a function for state-dependent styles):

```ts
export const s = {
  cell: { display: "flex", gap: 4 } satisfies CSSProperties,
  row: (hover: boolean): CSSProperties => ({ background: hover ? "var(--bg-surface)" : "transparent" }),
} as const;
```

Colors are always tokens (`var(--crit)`, `var(--text-muted)`) — never literals —
because the theme switches on `data-theme`. Severity tokens: `--crit` / `--warn`
/ `--sugg` / `--info`, each with a `-bg` pair.

Border gotcha: never mix the `border`/`borderColor` shorthand with a longhand
like `borderLeftColor` in the same object — React warns when one updates on a
rerender (`FindingCard/styles.ts`).

## Copy

No literal strings: `useTranslations("<namespace>")` with the namespace file at
`client/messages/en/<namespace>.json`. `src/i18n/request.ts` merges every file in
that folder automatically, so a feature adds its own JSON without touching shared
code. ICU plurals are used where a count is rendered.

## Reuse before building

Import from the `@devdigest/ui` barrel only (`Badge`, `SeverityBadge`, `Chip`,
`Toggle`, `Tabs`, `EmptyState`, `ConfidenceNum`, `MonoLink`, `Icon`, …). Adding
or changing a `@devdigest/ui` component means adding it to `/showcase`, or the
smoke test fails CI.

## State

No global store. TanStack Query owns server state (`src/lib/hooks/`); UI state is
`React.useState`, except what should survive a reload or be shareable — that goes
in the URL via `useSearchParams` + `router.replace` (`?tab=`, `?trace=`,
`?status=`).

## Accessibility that the e2e suite depends on

Flows locate controls by role + accessible name. A button whose content is a
badge is named by that badge's text, so give action controls an explicit
`aria-label` describing what the click does. Uppercase-looking labels are
`textTransform: uppercase` — the DOM text keeps its original casing.

## Tests

Vitest + jsdom + React Testing Library, colocated as `<Name>.test.tsx`. House
pattern: `afterEach(cleanup)`, a module-level fixture, a `renderWithIntl` helper
wrapping the tree in `NextIntlClientProvider` with the **real** messages file,
`fireEvent` (no `userEvent` in this repo), text/role queries, no test ids.
