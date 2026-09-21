# PLAN — `onion-architecture` (superseded)

**Status: implemented in v1.0.0 on 2026-09-21.** This file is kept as the record
of what was planned and what actually shipped. The skill itself is the live
document — start at [SKILL.md](SKILL.md); sources are in [README.md](README.md).

## Shipped

- Layer map and the inward-dependency rule — [SKILL.md](SKILL.md) §1
- Two port locations (shared infrastructure vs module facade) — §2
- Module anatomy and the 9 rules — §3–4
- Decision procedure and new-module recipe — §5–6
- "When NOT to add layers" — §7
- Mechanical check + known-drift table — §8–9, review checklist §10
- Tool mechanics — [stack-mapping.md](stack-mapping.md)
- The contested decisions, with reasoning — [tradeoffs.md](tradeoffs.md)
- `pulls`-worked migration — [migration-playbook.md](migration-playbook.md)
- Enforcement: `server/.dependency-cruiser.cjs`, a 26-entry baseline, and the
  `arch` / `arch:all` / `arch:baseline` scripts in `server/package.json`

## Deferred — not done, decide separately

1. **Wire `arch` into CI.** The five existing workflows run typecheck/tests; none
   runs `arch`. One step in `server-unit.yml` would do it.
2. **Fix the drift itself.** 26 violations are baselined, not fixed. The
   highest-value item is the missing transactions (a correctness bug, see
   [SKILL.md](SKILL.md) §9), then migrating `pulls`.
3. **Add `Tx` / `DbOrTx` to `server/src/db/client.ts`.** The playbook and
   `stack-mapping.md` §3 assume these aliases; they do not exist yet.
4. **`AppError.statusCode`** — recorded as an open tension in
   [tradeoffs.md](tradeoffs.md) §4, deliberately not decided.
5. **Feed `arch` into `pr-self-review` Phase 1** once that skill is built.
