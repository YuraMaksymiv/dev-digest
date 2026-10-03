---
name: run-plan
description: "Runs the Spec-Driven implementation pipeline for an already-approved spec and an already-written Implementation Plan: implementer(s) → test-runner → plan-verifier [tasks] → architecture review with fix iterations → final tests → plan-verifier [acceptance]. Does NOT write specs (spec-creator) or plans (implementation-planner) — those are run manually first. Invoked only explicitly as /run-plan."
argument-hint: "<plan.md> [--mode multi|single] [--rounds N] [--design <path>…] [-- extra requirements]"
disable-model-invocation: true
---

# /run-plan — implement a planned spec

You are the **orchestrator**. You never write application code yourself:
every code change goes through `implementer`, every check through an
agent. Your job is to sequence agents, pass them file paths + short
abstracts (not full reports), triage findings, and stop at the pause
points.

Arguments: `$ARGUMENTS`

## 0. Preflight — stop on any failure

1. **Parse arguments.**
   - `<plan.md>` (required) — `<spec folder>/<slug>.plan.md`, saved after
     `implementation-planner`. The spec is the sibling `<slug>.md`; if it
     isn't there, ask for its path.
   - `--mode multi|single` — execution mode. If absent, use the plan's
     "Execution mode" recommendation and confirm it with the user once.
   - `--rounds N` — max architecture fix rounds (default **3**).
   - `--design <path>` (repeatable) — design sources (images, exported
     Figma frames, text). Passed to `implementer` only for UI tasks.
   - Text after `--` — extra requirements.
2. **Spec status** must be `approved` (or `clarified` if the user confirms).
   A `:blocking` `[NEEDS CLARIFICATION]` left in the spec → stop.
3. **Extra requirements vs spec.** The spec is the source of truth. An extra
   requirement that only clarifies an existing AC goes to the implementer
   as a note on that AC. One that **adds or changes behaviour** (a new AC)
   → stop and tell the user to run `spec-creator` and re-plan; don't
   implement unspecified scope.
4. **Git.** Report the current branch and `git status --short`. Never switch
   branches, commit or push without the user's approval. A dirty tree is
   reported, not cleaned.
5. Create the run folder `<scratchpad>/run-plan-<slug>/`. Every agent report is
   saved there as `NN-<agent>.md`; you keep only a ≤10-line abstract of each.

## 1. Implement

- **single** → one `implementer` (plan mode) over all tasks in order.
- **multi** → first the contract group (`@devdigest/shared` in both copies,
  DB schema + `db:generate`) **alone**; then the remaining task groups the
  plan marks parallel, one `implementer` each, in a single message. Groups
  that share a file run sequentially.

Each implementer prompt: plan path, the task IDs it owns, spec path, extra
notes per AC, design paths (UI tasks only), and the instruction to end with
its Diff digest. Model: the agent's default (`sonnet`).

If an implementer reports a **deviation** (plan conflicts with the code),
stop and show it to the user — re-planning is `implementation-planner`'s
job.

## 2. Test gate

`test-runner` (`haiku`) on all touched packages: typecheck, unit tests,
`*.it.test.ts` when `server/src/db/**` or a repository changed, `arch` when
imports crossed modules. Failures → `implementer` in **fix mode** with the
failure table → `test-runner` on the same scope. Max 2 rounds, then stop
and ask.

## 3. Task verification

`plan-verifier`, mode `tasks` (default `haiku`), with the plan path and all
Diff digests. NOT DONE / PARTIAL rows → `implementer` fix mode → rerun
`plan-verifier` on **those rows only**. Max 2 rounds.

## 4. Architecture review + fix iterations

Round loop, `r = 1 … --rounds`:

1. **Review.** `architecture-reviewer` with `model: "sonnet"` (pass it
   explicitly). Round 1 gets every Diff digest; round ≥2 gets only the
   fix-mode digest plus the still-open findings ("verify these are fixed;
   check only the files these fixes touched for new violations").
   In round 1 only, also run `security-reviewer` (`model: "sonnet"`) in the
   same message **if** the spec has a security NFR or the diff touches
   auth, input handling, or secrets.
2. **Triage** (you, no agent) into one findings table, each row with an ID
   `F<n>` kept stable across rounds:
   - **fix** — introduced by this diff and severity error/high/warning;
   - **baseline** — pre-existing (`arch` baseline / "Known drift") → list
     for the user, never fix here;
   - **suggestion** — low severity / style → list for the user, don't fix
     unless they ask.
3. **Exit** if there are no **fix** rows.
4. **Fix.** `implementer` fix mode with only the **fix** rows, grouped by
   file. A row it marks **disputed** goes to the user with both sides —
   don't loop on it.
5. **Re-test** with `test-runner`, scoped to the packages the fixes touched.
6. **Stop early and ask the user** if a finding reappears after being
   marked fixed, if a fix introduces a new finding of the same rule in the
   same file twice in a row (oscillation), or if `r` reaches `--rounds`
   with fix rows still open.

## 5. Final gate

1. `test-runner`: full suites for every touched package, plus
   `*.it.test.ts` for `server/` when Docker is up.
2. `plan-verifier`, mode `acceptance`, `model: "sonnet"`, with the spec
   path, the Diff digests and the test-runner report. Tell it
   **"test-writer was skipped"**: an AC is DONE on code evidence plus
   passing related tests; a missing AC-named test is noted in Gap, not
   counted as PARTIAL.
3. NOT DONE → one `implementer` fix round, then verify those rows again. If
   still open, report them — don't loop.

## 6. Report and stop

Print, and save as `<run folder>/report.md`:

```markdown
## /run-plan — <spec title>
**Spec**: <path> · **Plan**: <path> · **Mode**: multi|single · **Branch**: <name>

| Phase | Result | Rounds |
|---|---|---|
| Implement | N tasks, M files | — |
| Tests | pass/fail | n |
| Tasks verification | x DONE / y open | n |
| Architecture review | x fixed / y disputed / z open | n |
| Acceptance | x DONE / y PARTIAL / z NOT DONE | — |

### Needs your decision
- disputed findings, open rows, deviations — or "none"

### Not fixed by design
- baseline violations · suggestions

### Next (manual)
- checkpoint commit (needs your approval)
- `/pr-self-review` before the PR (also catches logic bugs — routing row 18)
- `doc-writer` → spec Status `implemented`
- `engineering-insights` end-of-session check
```

## Rules

- `test-writer` is **not** part of this pipeline for now (token budget).
- Never run `spec-creator` or `implementation-planner` from here.
- Pass reports as path + abstract; never paste a full report into the next
  agent's prompt.
- Every loop has a cap; when it's hit, stop and ask — never silently
  continue or silently give up.
- Never commit, push, switch branches, run `arch:baseline`, or edit
  migrations / lock files.
