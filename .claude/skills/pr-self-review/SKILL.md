---
name: pr-self-review
version: 1.0.0
description: "Self-review gate for DevDigest: reviews every open local change before a pull request is opened, routes each changed file to the skills that apply to it (UI skills on client files, backend architecture skills on server files), and refuses to proceed when a confirmed CRITICAL finding was introduced by the diff. Use this skill whenever the user is about to open, push, or prepare a pull request — including when they only say 'open a PR', 'push this', 'is this ready to merge', 'review my changes', 'check before I push', 'self review', or 'did I break anything' — and whenever they ask for a pre-merge or pre-PR check of uncommitted work. Covers diff collection across committed/staged/unstaged/untracked, deterministic gates (typecheck, tests, architecture, secrets, repo rules), skill-routed review, and the blocking verdict."
metadata:
  tags: code-review, pre-pr, gate, quality, diff, ci, git
---

# PR Self Review

Reviews everything you are about to put in a pull request, and blocks on
confirmed CRITICAL findings.

## What this can and cannot do — say this to the user

This skill **cannot block a merge on GitHub.** It blocks the local step before
the PR. Three layers exist; only the first is this skill:

| Layer | Mechanism | Blocks |
|---|---|---|
| 1. Local gate | this skill, manual or from a `pre-push` hook | the push / PR creation |
| 2. Agent-level | `.claude/settings.json` `PreToolUse` on `Bash(git push*)` | the agent's own push |
| 3. Real merge block | GitHub branch protection + required check | the merge button |

Do not tell the user their merge is blocked. Tell them what is wrong and that
they should not open the PR yet.

`gh` is **not installed** in this repo, so intercepting `gh pr create` is not a
usable trigger — see [`README.md`](README.md) for the `pre-push` hook (opt-in,
not installed by default).

## Reference files

- [`routing.md`](routing.md) — the skill × path table. Edit one row to add a skill.
- [`critical.md`](critical.md) — the closed list of what may block, with the
  reasoning for each entry. Read before promoting anything to CRITICAL.
- [`README.md`](README.md) — version, changelog, trigger setup, sources.

---

## Pipeline

Run the phases in order. Stop at the first phase that blocks.

### Phase 0 — collect and route

```bash
.claude/skills/pr-self-review/scripts/collect-diff.sh
```

Prints a bucket summary to stderr and the reviewable file list to stdout.
`--files` for paths only, `--json` for structured output, `--base REF` to
override the base.

It compares against `origin/main` (not a possibly-stale local `main`) and unions
four buckets — committed on this branch, staged, unstaged, untracked. Files whose
only change is whitespace are dropped; deleted files are excluded from review and
checked separately for broken importers.

Then resolve the skill set from [`routing.md`](routing.md) and **print the plan
before running it** — "23 files → 5 skills" — so a wrong route is visible
immediately.

**Size cap.** Above ~2 000 changed lines, review the highest-risk groups first,
say explicitly that coverage was partial, and never report a clean verdict on a
partially reviewed diff.

### Phase 1 — deterministic gates

```bash
.claude/skills/pr-self-review/scripts/gates.sh          # full
.claude/skills/pr-self-review/scripts/gates.sh --quick  # skip typecheck/tests
```

No LLM, no judgement. Seven checks: migrations immutability, lockfile
consistency, `vendor/ui` barrel, client `@devdigest/shared` type-only imports,
`vendor/shared` drift, secrets, and `pnpm --dir server arch`; then typecheck and
tests for each touched package. Full run is ~20–25s.

Exit 1 means at least one CRITICAL gate failed. **Stop here** — there is no point
paying for a review of code that does not compile. Report the failures and what
to fix.

Server integration tests run only when the diff touches `server/src/db/` or a
repository; otherwise unit tests only.

### Phase 2 — skill-routed review

One subagent per (skill × file group), fanned out in parallel. Each gets the
skill, the diff hunks for its files, and enough surrounding context to judge.

Tell each subagent, in these words or close to them:

- Review **only the changed lines** and what they affect. Pre-existing problems
  in untouched parts of the same file are out of scope.
- Every finding must cite `path:line` that **exists in the diff you were given**.
- Return severity per [`critical.md`](critical.md), a one-sentence claim, and a
  concrete failure scenario — inputs or state that lead to a wrong outcome.
- Say "no findings" rather than inventing something. An empty result is a
  perfectly good answer.

### Phase 3 — verify the blockers

Every candidate CRITICAL goes to a **fresh** subagent that did not produce it.
It must independently confirm the finding with evidence from the diff. Anything
unconfirmed is downgraded to WARNING, not dropped silently — say it was
downgraded.

Only the blocking tier gets this treatment. It is the tier that must not cry
wolf; WARNING and SUGGESTION are cheap to be wrong about.

### Phase 4 — verdict

---

## The two rules that make this usable

**Only findings introduced by this diff may block.** Non-negotiable. `arch`
alone has 26 pre-existing violations recorded in a baseline; blocking on
pre-existing debt would make every PR red and the gate would be switched off the
same day. Report pre-existing issues in a separate, clearly non-blocking section,
or not at all.

**Every finding cites a diff line.** A finding whose `path:line` is not in the
reviewed diff is dropped, not reported. This mirrors what the product itself does
to model output in `reviewer-core/src/grounding.ts`, and it is the cheapest
defence against confident nonsense.

## Severity

Use the product's own enum so the skill speaks the same language as the reviews
it sits beside: **`CRITICAL` / `WARNING` / `SUGGESTION`**. Map a skill's internal
HIGH/MEDIUM onto WARNING/SUGGESTION.

**Only CRITICAL blocks, and CRITICAL is a closed list** — see
[`critical.md`](critical.md). Do not invent a new CRITICAL category during a run.
If something feels like it should block and is not on the list, report it as
WARNING and say it is a candidate for the list.

## Verdict format

```
PR SELF REVIEW — L02 vs origin/main
Scope: 95 files (87 committed, 0 staged, 2 unstaged, 14 untracked) · 5 skills · 41s

BLOCKED — 1 critical
  CRITICAL  server/src/modules/pulls/routes.ts:263
            prFiles delete + insert run without a transaction; a failure between
            them leaves the PR detail empty.
            [onion-architecture] confirmed in phase 3

  WARNING   client/src/.../FindingsCell.tsx:44  inline style object …  (+3 more)

Pre-existing (not introduced here, not blocking): 26 arch violations

Next: fix the critical, or re-run with --override "<reason>".
```

When clean, say so plainly and produce the PR description (below).

## Always produce a draft PR description

Every run, blocked or not, ends with a draft PR body derived from the diff:
what changed, why, how it was verified, and anything the reviewer should look at
first. This is what makes the skill worth running even when the verdict is clean,
and adoption is what makes the gate useful at all.

## Override

```
/pr-self-review --override "<reason>"
```

An override requires a reason, and the reason is written into both the report and
the draft PR description. There is no silent bypass. A gate with no escape hatch
gets disabled; a gate whose escapes are invisible gets abused.

## Keeping the gate trusted

Trust is the whole asset. If the blocking tier produces false positives, people
stop reading it.

- Track overridden and false-positive CRITICALs in `server/INSIGHTS.md` or
  `client/INSIGHTS.md` via the `engineering-insights` skill.
- If a CRITICAL category produces a false positive more than once, cut it from
  [`critical.md`](critical.md) or demote it to WARNING.
- Never re-record the `arch` baseline to silence something this diff introduced.

## Checklist for the run itself

- [ ] Did Phase 0 print the routing plan before reviewing?
- [ ] Did Phase 1 pass, or was the run stopped there?
- [ ] Did every finding cite a line present in the diff?
- [ ] Was every CRITICAL confirmed by a second, fresh subagent?
- [ ] Were pre-existing issues kept out of the blocking set?
- [ ] Was a draft PR description produced?
- [ ] If coverage was partial (size cap), was that stated instead of a clean verdict?
