# PLAN — `pr-self-review` (superseded)

**Status: implemented in v1.0.0 on 2026-09-21.** Kept as the record of what was
planned versus what shipped. The live documents are [SKILL.md](SKILL.md),
[routing.md](routing.md), [critical.md](critical.md) and [README.md](README.md).

## Shipped

- Honest scope statement — a skill blocks the local step, not a GitHub merge
- Four-bucket diff collection — `scripts/collect-diff.sh`
- Four-phase pipeline, with Phase 3 verification of every candidate blocker
- The baseline rule and the grounding rule — [SKILL.md](SKILL.md)
- 17-row routing table — [routing.md](routing.md)
- 8-entry closed CRITICAL list, plus an explicit "not blocking" table — [critical.md](critical.md)
- Deterministic gates — `scripts/gates.sh`, `scripts/check-shared-imports.cjs`
- Verdict format, mandatory draft PR description, recorded override

## Open questions from the plan — resolved

1. *Block on WARNING too?* **No.** Only CRITICAL blocks.
2. *Install the `pre-push` hook by default?* **No** — documented as opt-in in
   [README.md](README.md). Silently changing someone's `git push` is not ours to do.
3. *Phase 2 in CI?* **Not yet** — Phase 1 is CI-ready; the LLM tier stays local
   until someone owns the token budget.
4. *Add a `BLOCKER` tier above CRITICAL?* **No** — the product's three-tier enum
   is adopted verbatim. A fourth tier is only needed if CRITICAL drifts into being
   advisory, which the closed list exists to prevent.

## Deferred

1. Wire Phase 1 into `.github/workflows/server-unit.yml`.
2. Cache reports by diff hash so a re-run on an unchanged diff replays.
3. `.claude/settings.json` `PreToolUse` hook on `Bash(git push*)`.
4. Measure the blocking tier's false-positive rate once it has been used in anger,
   and cut entries from [critical.md](critical.md) that misfire.
