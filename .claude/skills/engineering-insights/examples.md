# Engineering Insights — worked examples

Vague (don't write like this) vs useful (write like this). Source of the
pattern — see `references.md`.

---

## 1. General examples

**Vague:**
> Promises can be tricky.

**Useful:**
> - 2026-05-14 — `Promise.all()` on the ingest pipeline times out after
>   ~30 items under load; switch to `Promise.allSettled()` with batches of
>   10. `src/ingest/pipeline.ts:112`.

**Vague:**
> Be careful with async in checkout.

**Useful:**
> - 2026-05-14 — Checkout-flow state always goes through Zustand
>   (`cartStore.ts`), because 3 components share the cart — local
>   `useState` in any of them desyncs the item count.

---

## 2. Examples under DevDigest's rubrics (illustrative, for format only)

### What Works
> - 2026-05-14 — The grounding gate (`reviewer-core/src/grounding.ts`)
>   already catches hallucinated locations before anything is persisted —
>   don't try to duplicate that check in `server/src/modules/reviews`,
>   trust `groundFindings()`'s output.

### What Doesn't Work
> - 2026-05-14 — Don't assume `server/src/vendor/shared` and
>   `client/src/vendor/shared` are identical — they're copies, not a
>   symlink, and have already drifted (`adapters.ts`, several
>   `contracts/*.ts`). A contract change has to be mirrored into both by
>   hand.

### Codebase Patterns & Tool/Library Notes
> - 2026-05-14 — `pnpm --dir server db:migrate` never runs automatically,
>   not on `pnpm dev`, not on server start — after any schema change in
>   `server/src/db/schema/*` you must run the migration by hand, or you'll
>   hit `relation ... does not exist`.

### Decisions
> - 2026-05-14 — The score is computed deterministically from findings that
>   survived the grounding gate, not taken from the LLM's response
>   (`reviewer-core/src/review/run.ts`) — so the model can't inflate its
>   own score with hallucinated findings.

### Recurring Errors & Fixes
> - 2026-05-14 — `vector` type error during `db:migrate` → the pgvector
>   extension is enabled by migration `0000`; make sure migrations are
>   running against the Docker Postgres from `docker-compose.yml`, not some
>   other local DB.

### Session Notes
> - 2026-05-14 — Had to reread `e2e/README.md` twice: flows 02/04/05 break
>   against a dev DB with multiple repos, because they follow the redirect
>   to the *first* repo. The hermetic runner (`../scripts/e2e.sh`) is the
>   right way to run this locally, not a plain `npm test`.

### Open Questions
> - 2026-05-14 — Unclear whether `client/src/vendor/shared` and
>   `server/src/vendor/shared` are meant to be kept in sync by a script, or
>   whether the divergence is intentional (different contract subsets for
>   different course lessons) — check with the course author before writing
>   a sync script.

---

## What makes an entry "useful" instead of "vague"

- Names a concrete file/function/library, not an abstract category
  ("Promise.all() in pipeline.ts", not "async").
- Gives an action or a reason that applies without remembering the session
  ("switch to allSettled with batches of 10", not "be careful").
- Reads "cold": someone (or some agent) who never saw this session
  understands the point from one line.
