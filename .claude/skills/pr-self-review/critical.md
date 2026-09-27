# What may block — the closed list

A finding may be marked CRITICAL **only** if it matches one of the entries below.
Everything else caps at WARNING.

The list is closed on purpose. A blocking tier that grows by judgement stops
being predictable, and an unpredictable gate gets bypassed. If something feels
like it should block and is not here, report it as WARNING, say it is a candidate,
and add it deliberately in a later version.

Every entry has to satisfy three tests:

1. **Objective** — two reviewers would agree it is present.
2. **Introduced by this diff** — not pre-existing debt.
3. **Worth stopping for** — shipping it is worse than the delay.

---

## 1. A Phase 1 gate failed

`typecheck`, tests, or `pnpm --dir server arch`.

Objective by construction, and `arch` compares against a baseline so only *new*
violations count. Code that does not compile or whose tests fail is not a
judgement call.

## 2. A "Do not touch" rule from root `CLAUDE.md` was broken

- A file under `server/src/db/migrations/` that already existed was **modified**
  (including `meta/_journal.json` and snapshots). Adding a newly generated
  migration is normal; editing an applied one silently desynchronises every
  database that already ran it.
- A lockfile changed with no matching `package.json` change.
- An import reaches into a `client/src/vendor/ui/` layer file instead of the
  `@devdigest/ui` barrel.

These are repo rules with no exceptions and a mechanical check each.

## 3. A secret in added lines

Provider keys, GitHub tokens, AWS keys, private keys, Slack tokens.

Blocking is cheap; the alternative is a rotation and a history rewrite. False
positives are possible (a fixture that looks like a key) — that is what
`--override` is for, and such a case is worth recording.

## 4. Security: authorization, injection, unvalidated input reaching the database

Specifically: a new route with no `getContext()` / workspace scoping; a query
built by string concatenation from request input; request data reaching a write
without passing a schema.

Note the boundary this depends on: Fastify's own docs say schemas validate shape
and type, **not** security or business rules. A schema proving `prId` is a uuid
does not prove the caller may see that PR.

## 5. Data-loss risk

- A destructive migration (`DROP`, `TRUNCATE`, a narrowing `ALTER`) with no guard.
- A `delete`-then-`insert` sequence with no transaction.

The second is not hypothetical here: `server/src/modules/repo-intel/repository.ts`
does exactly this in `replaceEdges`, `replaceFileRank` and `replaceFileFacts`,
and `pulls/routes.ts` does it for `prFiles` / `prCommits`. Those are pre-existing
and therefore **not** blocking — but a *new* one is.

## 6. Contract drift between the vendored `shared` copies

A file changed under `server/src/vendor/shared/` whose `client/src/vendor/shared/`
twin differs and was not updated in the same change.

The two copies are duplicated, not symlinked, and **five files already differ**.
So the check is scoped to files this diff touches: it prevents new drift rather
than demanding the existing drift be fixed first.

## 7. Client build breaker: a runtime import from `@devdigest/shared`

A value (non-`import type`) import or re-export from `@devdigest/shared` in
`client/`. It pulls `vendor/shared/index.ts` into the webpack bundle, whose
`./contracts/*.js` re-exports Next cannot resolve — the build fails.

Checked statement-level, not line-level: these imports are routinely multi-line,
and a line-based grep false-positives on `export type { … } from …`.

## 8. A new `@devdigest/ui` component not registered in `/showcase`

`client/src/test/smoke.test.tsx` mounts the showcase gallery, so an unregistered
component fails CI. Catching it locally saves a red pipeline; it is objective and
has a one-line fix.

---

## Explicitly NOT blocking

Common candidates, and why they stay at WARNING:

| Candidate | Why not |
|---|---|
| Architecture violations that are pre-existing | The `arch` baseline holds 26 of them. Blocking would red every PR. |
| Missing tests for new code | Real, but judgement-dependent. WARNING, and say what to test. |
| Component over N lines, file over N lines | A proxy, not a defect. The owning skill decides. |
| Naming and convention drift | Worth fixing, never worth stopping a PR. |
| Performance suspicions without a measurement | Unfalsifiable in a diff review. |
| A hard-coded color or a literal UI string | Real bugs in theming/i18n, but recoverable in a follow-up. |
| `AppError.statusCode` style transport leakage | Recorded as an open question in `onion-architecture/tradeoffs.md` §4 — undecided, so it cannot block. |

## Changing this list

Adding an entry needs: the three tests above, a mechanical check where one is
possible, and a line in the `README.md` changelog. Removing an entry needs
evidence — a false positive that cost someone time is sufficient and should be
acted on quickly.
