# Agents — set map

Seven specialized agents for this repo: `researcher` and `planner` feed
`implementer`, whose output is checked by `test-writer`,
`architecture-reviewer`, and `plan-verifier`, and finally written up by
`doc-writer`. This is an index, not a duplicate — the full rule text for
each agent lives in its own file.

## planner

- **File**: [planner.md](planner.md)
- **Responsibility**: turns a task (feature/bugfix/refactor) into a
  structured Development Plan before any code is written. Identifies affected
  modules, pulls constraints and notes from `INSIGHTS.md`, and — critically —
  assigns each plan step the exact skill the `implementer` must apply.
- **Permissions (tools)**: `Read, Grep, Glob` — read-only, no Write/Edit.
- **Model**: `sonnet`
- **Input**: a task description (goal, scope, constraints). If the task is
  vague, the agent asks clarifying questions first instead of planning
  blind.
- **Output**: a Development Plan (markdown) — Goal & Scope, Modules affected,
  Constraints & conventions, Relevant INSIGHTS.md notes, Plan steps (mapped
  to module/skill/dependency), Skill map, Test plan, Out of scope, Open
  questions/risks.
- **Explicitly out of scope**: architecture review and security review —
  separate agents/gates, not this one.
- **Sources its rules are grounded in**:
  - [../../CLAUDE.md](../../CLAUDE.md) — root repo map, non-default
    conventions, "Do not touch" list
  - Each module's own `CLAUDE.md` (`server/`, `client/`, `reviewer-core/`,
    `e2e/`) — the exact test/typecheck commands the plan must cite
  - Each affected module's `INSIGHTS.md`, read via the
    [engineering-insights](../skills/engineering-insights/SKILL.md) skill
  - The [onion-architecture](../skills/onion-architecture/SKILL.md)
    (server/, reviewer-core/) and
    [frontend-ui-architecture](../skills/frontend-ui-architecture/SKILL.md)
    (client/) skills — architectural constraints applied to every step in
    the corresponding module

## implementer

- **File**: [implementer.md](implementer.md)
- **Responsibility**: executes an already-produced Development Plan (from
  `planner`, or given directly) — applies the skill assigned to each step,
  writes/edits code in `client/`, `server/`, `reviewer-core/`, runs the
  existing test/typecheck/arch-check commands for the touched packages.
  Verifies only that its own diff matches the plan.
- **Permissions (tools)**: `Read, Grep, Glob, Bash, Edit, Write`.
- **Model**: `sonnet`
- **Input**: a Development Plan (goal, affected modules, ordered steps, a
  skill per step). Without a plan, or with a step missing an assigned skill,
  the agent stops and asks rather than guessing.
- **Output**: an Implementation Report (markdown) — Steps completed
  (files/skill), Commands run & results, Deviations from plan, Self-check
  (diff vs. plan, typecheck/tests), Deferred to review agents.
- **Explicitly out of scope**: architecture review, security review, and
  running the `pr-self-review` skill — all of these are a later, separate
  gate.
- **Sources its rules are grounded in**:
  - [../../CLAUDE.md](../../CLAUDE.md) — naming conventions table, "Do not
    touch" list (migrations, lock files, `client/src/vendor/ui/`)
  - The Development Plan from `planner` — its Skill map and Test plan are
    the direct source for which skill and which command to apply per step
  - Each touched module's own `CLAUDE.md` — the exact
    typecheck/test/`arch` commands

## test-writer

- **File**: [test-writer.md](test-writer.md)
- **Responsibility**: writes tests for a component/route/service/helper
  across both sides of the stack — React Testing Library conventions on
  `client/`, and this repo's actual backend conventions (Testcontainers
  fixture, shared adapter mocks, hermetic `reviewer-core/`) on `server/` and
  `reviewer-core/`, embedded directly since no dedicated backend-testing
  skill exists yet. Does not implement or fix application code — a test that
  needs a source change is reported, not patched around.
- **Permissions (tools)**: `Read, Grep, Glob, Bash, Edit, Write`.
- **Model**: `sonnet`
- **Input**: a specific unit to test (component/route/service/helper), or an
  Implementation Report from `implementer` naming what needs coverage.
- **Output**: a Test Report (markdown) — Tests written, Commands run &
  results, Coverage gaps, Deviations/blockers.
- **Sources its rules are grounded in**:
  - The [react-testing-library](../skills/react-testing-library/SKILL.md)
    skill — frontend query/behavior conventions
  - Root [../../CLAUDE.md](../../CLAUDE.md) naming table for the frontend
    (colocated `<Name>.test.tsx`) — noted as **stale for the backend**,
    where tests actually live flat under `server/test/` and
    `reviewer-core/test/`, not colocated in `src/`
  - Existing backend test precedent: `server/test/pulls-status.test.ts`
    (hermetic unit), `server/test/reviews.it.test.ts` (Docker-gated
    integration pattern), `server/test/helpers/pg.ts` (shared Testcontainers
    fixture), `server/src/adapters/mocks.ts` (shared adapter mocks),
    `reviewer-core/CLAUDE.md` (always-hermetic rule)

## architecture-reviewer

- **File**: [architecture-reviewer.md](architecture-reviewer.md)
- **Responsibility**: checks a diff or module for layering/dependency-
  direction violations — the mechanical `onion-architecture` rules plus its
  review-only points on `server/`/`reviewer-core/`, and a manual
  `frontend-ui-architecture` check on `client/`. Runs the server's
  dependency-cruiser scripts and reports findings only; never fixes them and
  never runs `arch:baseline` (that would silently accept new violations into
  the baseline).
- **Permissions (tools)**: `Read, Grep, Glob, Bash` — read-only, no
  Write/Edit.
- **Model**: `sonnet`
- **Input**: a diff, commit range, or module to review.
- **Output**: an Architecture Review Report (markdown) — Findings table
  (rule, severity, from/to, new-vs-baseline, why it matters, suggested
  direction), frontend layering notes, commands run, not-checked list.
- **Sources its rules are grounded in**:
  - The [onion-architecture](../skills/onion-architecture/SKILL.md) skill —
    mechanically-enforced rules vs. review-only rules, its "Known drift"
    baseline list
  - The
    [frontend-ui-architecture](../skills/frontend-ui-architecture/SKILL.md)
    skill — client/ layer map and review checklist (no automated tool)
  - `server/.dependency-cruiser.cjs` (the actual rule set: name/severity/
    comment/from/to) and `server/package.json`'s `arch`/`arch:all`/
    `arch:baseline` scripts
  - `server/.dependency-cruiser-known-violations.json` — the exact
    file-to-file violation shape the tool emits (no line numbers)

## plan-verifier

- **File**: [plan-verifier.md](plan-verifier.md)
- **Responsibility**: independently verifies that finished code satisfies
  every item of a Development Plan or requirements list — one item at a
  time, DONE/NOT DONE/PARTIAL with evidence. Deliberately does **not**
  re-check code quality (`pr-self-review`'s job), architecture
  (`architecture-reviewer`'s job), or security (the `security` skill's job) —
  its only job is plan-to-code traceability, and it must never collapse that
  into generic review commentary.
- **Permissions (tools)**: `Read, Grep, Glob, Bash` — read-only, no
  Write/Edit. May run a plan step's own named test command as evidence, not
  as a broader quality pass.
- **Model**: `sonnet`
- **Input**: a Development Plan (or explicit numbered requirements list) and
  the diff/code it produced.
- **Output**: a Verification Report (markdown) — a forced per-item table
  (Status + Evidence + Gap) and a counts-only verdict summary; no free-text
  "overall assessment" or suggestions section is allowed.
- **Sources its rules are grounded in**:
  - `implementer.md`'s own self-check ("Diff matches plan: yes/no, per
    step") — identified as self-graded and non-independent, the gap this
    agent fills
  - `.claude/skills/pr-self-review/SKILL.md`'s "fresh subagent confirms"
    pattern for CRITICAL findings — the same independence principle applied
    here to plan traceability
  - `.claude/skills/pr-self-review/routing.md` and
    `docs/agent-prompts/general-reviewer.md` — read to establish the
    explicit non-overlap boundary (code-quality judgment is theirs, not
    this agent's)

## doc-writer

- **File**: [doc-writer.md](doc-writer.md)
- **Responsibility**: documents functionality that's already been built —
  turns a Development Plan, PR, or diff into module documentation with
  diagrams. Knows which of a module's two doc locations to use: flips a
  matching `specs/<topic>.md`'s Status to `implemented` rather than
  duplicating it, or writes a new `docs/<topic>.md` when no matching spec
  exists. Never touches `src/`.
- **Permissions (tools)**: `Read, Grep, Glob, Edit, Write` — no Bash by
  design; works from the given plan/diff/code, not from running commands.
- **Model**: `sonnet`
- **Input**: a Development Plan, PR description, or diff describing what was
  built, plus the module(s) it touched.
- **Output**: updated/new files under a module's `docs/` or `specs/` (with
  its index `README.md` updated to match) and a Doc Report (markdown) —
  files written/updated, index-updated flags, diagrams added, open
  questions.
- **Sources its rules are grounded in**:
  - Each module's `docs/README.md` ("deeper reference docs... one file per
    topic, listed below") and `specs/README.md` (feature specs with a
    Status column) — e.g. `server/docs/README.md`, `server/specs/README.md`
  - The root [docs/agent-prompts/README.md](../../docs/agent-prompts/README.md)
    — a distinct bullet-list/"source of truth" convention, used only for
    built-in review-agent prompts
  - The [mermaid-diagram](../skills/mermaid-diagram/SKILL.md) skill for
    embedded diagrams

## researcher

- **File**: [researcher.md](researcher.md)
- **Responsibility**: investigates a specific question — inside the repo
  (code, tests, config, git history) and/or externally (official docs,
  standards, changelogs) — and returns a structured report with evidence and
  sources. Never invokes `/deep-research` or equivalents.
- **Permissions (tools)**: `Read, Grep, Glob, Bash, WebFetch, WebSearch` — no
  Write/Edit.
- **Model**: `sonnet`
- **Input**: a concrete research question plus mode (repo/external/both). On
  a vague request, asks clarifying questions first.
- **Output**: a Findings report (markdown) — Question, Findings, Evidence
  (`file:line` or URL with access date), Not found / could not verify. For
  dual-mode requests, separate `## Repository research` / `## External
  research` sections.

## Typical flow

```
researcher (as needed, independent)
        │
        ▼
   planner  →  Development Plan (with Skill map)
        │
        ▼
 implementer →  Implementation Report
        │
        ▼
 test-writer  →  Test Report (adds coverage for the change)
        │
        ├───────────────────┐
        ▼                   ▼
architecture-reviewer   plan-verifier
        │                   │
        └─────────┬─────────┘
                   ▼
              doc-writer  →  updated docs/ or specs/
                   │
                   ▼
   (separate gate: pr-self-review, security review — not in these agents)
```

`architecture-reviewer` and `plan-verifier` are independent, read-only checks
and can run in either order or in parallel once `test-writer` is done;
`doc-writer` runs last, once the change is verified clean.
