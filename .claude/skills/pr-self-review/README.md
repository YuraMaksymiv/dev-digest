# pr-self-review

**Version 1.0.0** · scope: whole repo · last reviewed 2026-09-21

A gate that reviews every open local change before a pull request is opened,
routes each changed file to the skills that apply to it, and refuses to proceed
when a confirmed CRITICAL finding was introduced by the diff.

## Files

| File | Purpose |
|---|---|
| [`SKILL.md`](SKILL.md) | The pipeline, severity contract, verdict format |
| [`routing.md`](routing.md) | The skill × path table — one row per skill |
| [`critical.md`](critical.md) | The closed list of what may block, with reasoning |
| `scripts/collect-diff.sh` | Four-bucket diff collection |
| `scripts/gates.sh` | Phase 1 deterministic checks |
| `scripts/check-shared-imports.cjs` | Statement-level `@devdigest/shared` runtime-import check |

## Honest scope

**This skill cannot block a merge on GitHub.** It blocks the local step before
the PR. Real merge blocking needs branch protection plus a required status check.
`SKILL.md` states this first, deliberately: a gate that overclaims is trusted once.

## Triggers

**Manual** — `/pr-self-review`, or any phrasing the description matches
("review my changes", "is this ready", "check before I push").

**Automatic** — a git `pre-push` hook. `gh` is **not installed** here and PRs are
opened in the browser, so `gh pr create` is not a usable interception point; the
push is the only reliable local choke point.

The hook is **not installed by default** — installing a git hook silently changes
how someone's `git push` behaves. To opt in:

```bash
cat > .git/hooks/pre-push <<'EOF'
#!/usr/bin/env bash
exec .claude/skills/pr-self-review/scripts/gates.sh
EOF
chmod +x .git/hooks/pre-push
```

Bypass is `git push --no-verify`. That is intentional: a gate with no escape
hatch gets deleted.

A third option is a `.claude/settings.json` `PreToolUse` hook on
`Bash(git push*)`, which makes the agent run the gate on itself. No settings file
exists in this repo yet, so that would create one — left as a decision.

## Phase 1 checks

Run: `scripts/gates.sh` (full, ~20–25s) or `--quick` (repo rules + secrets +
arch only, ~3s).

| Check | Fails when |
|---|---|
| migrations | an already-generated `.sql` was modified |
| lockfiles | a lockfile changed with no sibling `package.json` change |
| vendor/ui | an import reaches past the `@devdigest/ui` barrel |
| client shared imports | a runtime (non-type) import from `@devdigest/shared` in `client/` |
| vendor/shared drift | a server copy changed, its client twin differs and was not updated |
| secrets | a credential-shaped string in added lines |
| arch | `pnpm --dir server arch` reports a new violation |
| typecheck / tests | per touched package (`client`, `server`, `reviewer-core`) |

Every check was verified in both directions during development: green on the
clean tree, and firing on a deliberately introduced violation. Server
integration tests run only when the diff touches `server/src/db/` or a
repository — they boot a real Postgres and otherwise waste the time budget.

Two bugs found and fixed while building this, both worth knowing:

- `git diff -w --name-only` does **not** filter files — the whitespace options
  only affect hunk generation. `--numstat` does; `collect-diff.sh` uses it.
- `pnpm run test -- --exclude '<glob>'` does **not** reach vitest; the flag is
  swallowed and the full suite runs. `gates.sh` invokes `vitest` directly.

## Dependencies

- `onion-architecture` — owns `server/.dependency-cruiser.cjs`, which Phase 1 runs.
- The routed skills in [`routing.md`](routing.md).
- No new packages. Everything is git, node, and what the repo already installs.

## Changelog

### 1.0.0 — 2026-09-21

Initial version. Four-phase pipeline (collect/route → deterministic gates →
skill-routed review → verify blockers); the baseline rule (only findings
introduced by this diff may block) and the grounding rule (every finding cites a
diff line); `CRITICAL/WARNING/SUGGESTION` adopted from the product's own enum,
with an 8-entry closed CRITICAL list; 17-row routing table; verdict format;
mandatory draft PR description; recorded override. Two working scripts plus a
statement-level import check.

**Decisions taken** (open questions 1 and 4 in the original plan): only CRITICAL
blocks, and the product's three-tier enum is adopted verbatim rather than adding
a `BLOCKER` tier above it. A fourth tier would only be needed if CRITICAL became
advisory — which is precisely what the closed list is designed to prevent.

**Deferred:**

1. The `pre-push` hook is documented, not installed (opt-in above).
2. Phase 1 is not wired into CI. One step in `.github/workflows/server-unit.yml`
   would do it; Phase 2 in CI needs an API key and a token budget, so the LLM
   tier stays local by default.
3. No report caching by diff hash yet — planned as a re-run optimisation.
4. `.claude/settings.json` `PreToolUse` integration not created.

---

## Sources

The review-design rules here are drawn from the same material as the routed
skills; their full bibliographies are in
[`../onion-architecture/README.md`](../onion-architecture/README.md) and
[`../frontend-ui-architecture/README.md`](../frontend-ui-architecture/README.md).
What this skill adds is specific to gating:

- [Yagni](https://martinfowler.com/bliki/Yagni.html) — Martin Fowler, 2015-05-26.
  Cost of carry: "any abstraction that makes it harder to understand the code for
  current requirements is presumed guilty." The argument for a *closed* CRITICAL
  list rather than a growing one.
- [Mocks Aren't Stubs](https://martinfowler.com/articles/mocksArentStubs.html) —
  Fowler, 2007-01-02, and
  [Styles of unit testing](https://enterprisecraftsmanship.com/posts/styles-of-unit-testing/)
  — Vladimir Khorikov, 2016-06-09. Why Phase 1 leans on typecheck and real tests
  rather than on assertions about structure.
- [When to Mock](https://enterprisecraftsmanship.com/posts/when-to-mock/) —
  Khorikov, 2020-04-15. The managed/unmanaged distinction behind running
  Testcontainers-backed tests only when persistence could be affected.
- [Validation and Serialization](https://fastify.dev/docs/latest/Reference/Validation-and-Serialization/)
  — Fastify 5. Schemas validate shape, **not** security or business rules — the
  basis for `critical.md` #4.
- [Parse, don't validate](https://lexi-lambda.github.io/blog/2019/11/05/parse-don-t-validate/)
  — Alexis King, 2019-11-05. *Shotgun parsing* is the failure mode `critical.md`
  #4 looks for: input partly acted on before it is fully validated.
- [dependency-cruiser rules reference](https://github.com/sverweij/dependency-cruiser/blob/main/doc/rules-reference.md)
  — Sander Verweij. The `--ignore-known` baseline mechanism that makes "only new
  violations block" work.
- [git-diff](https://git-scm.com/docs/git-diff) — the `--diff-filter`,
  `--numstat` and `-w` semantics `collect-diff.sh` depends on, including the
  `--name-only` caveat noted above.
