# Agents — set map

Eleven specialized agents for this repo: `spec-creator` turns a feature
request into an approved spec first; `brainstorm` (optional, when a task
has genuinely multiple viable approaches) and `researcher` feed
`implementation-planner`, which feeds `implementer`, whose output is
checked by `plan-verifier`, `architecture-reviewer`, `security-reviewer`
and the `pr-self-review` skill, covered by `test-writer`, executed by
`test-runner`, and finally written up by `doc-writer`. This is an index, not a duplicate — the
full rule text for each agent lives in its own file.

## spec-creator

- **File**: [spec-creator.md](spec-creator.md)
- **Responsibility**: writes a feature spec for Spec-Driven Development
  before planning — analyzes the request and user-supplied design sources
  (text, Figma exports, existing code) for gaps, uncovered edge cases,
  cross-module interaction and UX improvements; asks blocking questions
  across six clarification categories; writes EARS acceptance criteria,
  NFRs, traceability and verification hints. Never guesses — unknowns are
  `[NEEDS CLARIFICATION]`.
- **Permissions (tools)**: `Read, Grep, Glob, Write, Edit` plus read-only
  devdigest-mcp (`get_conventions`, `get_blast_radius`, `get_findings`,
  `list_agents`; no `run_agent_on_pr`). Write is limited by prompt rule to
  one spec file and its `specs/README.md` index row — `<module>/specs/` for
  a single-module feature, root `specs/` for a multi-module one.
- **Model**: `sonnet`
- **Input**: Pass 1 — feature request + design sources. Pass 2 (resumed via
  SendMessage) — the user's answers and `researcher` report paths/abstracts.
- **Output**: Pass 1 — Discovery Report (blocking/non-blocking questions,
  design analysis, research requests; writes nothing). Pass 2 — the spec
  (`draft`/`clarified`) and a Spec Report with self-check results.
- **Explicitly out of scope**: implementation steps and skill assignment
  (`implementation-planner`), setting `approved` (user) or `implemented` (`doc-writer`),
  dispatching `researcher` itself (the orchestrator does that).
- **Sources its rules are grounded in**:
  - Existing specs (`server/specs/run-cost.md` — Summary/Current
    state/Decisions structure) and each `specs/README.md` Status index
  - EARS — Mavin et al., "Easy Approach to Requirements Syntax", RE'09
  - Root [../../CLAUDE.md](../../CLAUDE.md) conventions and "Multi-agent
    orchestration" rules for handing `researcher` reports over

## brainstorm

- **File**: [brainstorm.md](brainstorm.md)
- **Responsibility**: compares 2-3 candidate approaches to a task, with a
  complexity/performance/maintainability/risk tradeoff table, BEFORE a
  Implementation Plan is written — narrower and earlier than `implementation-planner`, which
  commits to and sequences one plan. Hands off to `implementation-planner` once a
  direction is chosen.
- **Permissions (tools)**: `Read, Grep, Glob` — read-only, no Write/Edit.
- **Model**: `sonnet`
- **Input**: a task with a genuine choice between approaches (build-vs-extend,
  more than one plausible owning module, more than one plausible data
  shape). On a task with only one reasonable approach, says so instead of
  manufacturing options.
- **Output**: an Option Comparison Report (markdown) — Question, 2-3 named
  Options (each grounded in existing code with file:line evidence),
  Tradeoff table, Recommendation with justification, Rejected alternatives,
  Handoff note.
- **Explicitly out of scope**: writing the Implementation Plan itself (`implementation-planner`'s
  job) and writing/editing any code (`implementer`'s job).
- **Sources its rules are grounded in**:
  - [../../CLAUDE.md](../../CLAUDE.md) — root repo map, "Do not touch" list
    (an option requiring a hand-edited migration or reaching into
    `client/src/vendor/ui/` internals is disqualified outright)
  - The [onion-architecture](../skills/onion-architecture/SKILL.md) and
    [frontend-ui-architecture](../skills/frontend-ui-architecture/SKILL.md)
    skills — a fitness check on each option, not the full review
  - `implementation-planner.md` — the closest analog this agent's structure and rule
    discipline (file:line evidence requirement) is modeled on

## implementation-planner

- **File**: [implementation-planner.md](implementation-planner.md)
- **Responsibility**: turns an existing spec (requirements with `AC-`/`NFR-`
  IDs) into a structured Implementation Plan before any code is written.
  Checks every AC against the real code (Clear / Ambiguous / Conflicting /
  Infeasible), raises targeted questions, recommends improvements, maps
  every task to the AC-IDs it satisfies and to the exact skill the
  `implementer` must apply, and ends by asking the user to choose
  multi-agent or single-agent execution. Never writes, rewrites or elicits
  requirements — that is `spec-creator`'s job.
- **Permissions (tools)**: `Read, Grep, Glob` — read-only, no Write/Edit.
- **Model**: `sonnet`
- **Input**: a `clarified`/`approved` spec with AC-IDs. Without AC-IDs, or a
  `draft` with blocking `[NEEDS CLARIFICATION]` markers, it returns
  "Blocked" and sends the work back to `spec-creator` instead of planning.
- **Output**: an Implementation Plan (markdown) — Goal & Scope,
  Requirements check, Questions, Recommendations, Modules affected,
  Constraints & conventions, Relevant INSIGHTS.md notes, Plan tasks (each
  with AC-IDs/module/skill/dependency), AC coverage, Test plan, Out of
  scope, Risks, Execution mode (multi- vs single-agent, for the user).
- **Explicitly out of scope**: spec/requirements authoring, architecture
  review and security review — separate agents/gates, not this one.
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
- **Responsibility**: executes an already-produced Implementation Plan (from
  `implementation-planner`, or given directly), usually one task group per
  instance — applies the skill assigned to each task, writes/edits code in
  `client/`, `server/`, `reviewer-core/`, `mcp/`, `e2e/`, runs **scoped**
  checks (`vitest related … --exclude '**/*.it.test.ts'`, truncated
  typecheck) once per task group. Full suites and integration tests are
  left to `test-runner`. Also has a fix mode for a reviewer's findings
  table.
- **Permissions (tools)**: `Read, Grep, Glob, Bash, Edit, Write`.
- **Model**: `sonnet`
- **Input**: the saved plan `<spec folder>/<slug>.plan.md` and the task
  group to execute — or, in fix mode, a findings table.
- **Output**: an Implementation Report (markdown) — Tasks completed
  (AC-IDs/files/skill), Commands run, Deviations, Self-check, a **Diff
  digest** (file → one-line change → AC-IDs, plus key hunks) that every
  review agent reads first, and fix-mode results.
- **Explicitly out of scope**: architecture review, security review, and
  running the `pr-self-review` skill — all of these are a later, separate
  gate.
- **Sources its rules are grounded in**:
  - [../../CLAUDE.md](../../CLAUDE.md) — naming conventions table, "Do not
    touch" list (migrations, lock files, `client/src/vendor/ui/`)
  - The Implementation Plan from `implementation-planner` — its Plan tasks
    table and Test plan are the direct source for which skill and which
    command to apply per task
  - Each touched module's own `CLAUDE.md` — the exact
    typecheck/test/`arch` commands

## test-writer

- **File**: [test-writer.md](test-writer.md)
- **Responsibility**: writes tests from the spec's ACs — every test named
  `AC-<n>: …` so `plan-verifier` can trace it — across the stack: React
  Testing Library conventions on `client/`, hermetic fakes on `mcp/`,
  deterministic `e2e/flows` when the Test plan names one, and this repo's
  actual backend conventions (Testcontainers fixture, shared adapter mocks,
  hermetic `reviewer-core/`) on `server/` and `reviewer-core/`, embedded directly since no dedicated backend-testing
  skill exists yet. Does not implement or fix application code — a test that
  needs a source change is reported, not patched around.
- **Permissions (tools)**: `Read, Grep, Glob, Bash, Edit, Write`.
- **Model**: `sonnet`
- **Input**: spec ACs + the plan's Test plan + implementer's Diff digest;
  or a specific unit to test.
- **Output**: a Test Report (markdown) — Tests written (AC-IDs covered), AC
  coverage table, Commands run & results, Coverage gaps,
  Deviations/blockers.
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

## security-reviewer

- **File**: [security-reviewer.md](security-reviewer.md)
- **Responsibility**: finds exploitable issues in a diff or module and
  assigns severity, wrapping the `security` skill (OWASP Top 10:2025,
  Secret Detection pattern table, confidence-tiered severity) the same way
  `architecture-reviewer` wraps `onion-architecture`/`frontend-ui-architecture`.
  Reports findings only; never fixes them.
- **Permissions (tools)**: `Read, Grep, Glob, Bash` — read-only, no
  Write/Edit.
- **Model**: `sonnet`
- **Input**: a diff, commit range, or module to review — typically one
  touching auth, input handling, or secrets.
- **Output**: a Security Review Report (markdown) — Findings table
  (rule, severity, file:line, exploit scenario, suggested fix), OWASP
  category tally, commands run, not-checked list.
- **Sources its rules are grounded in**:
  - The [security](../skills/security/SKILL.md) skill — OWASP Top 10:2025
    category table, Secret Detection pattern table, confidence-tiered
    severity philosophy
  - `reviewer-core/src/prompt.ts`'s `INJECTION_GUARD` and
    `docs/agent-prompts/security-reviewer.md`'s "Lethal trifecta" section —
    this repo's own conservative bar for that specific AI-agent risk
  - `architecture-reviewer.md` — the closest analog this agent's structure
    (and its `## Scope note` disambiguation pattern) is modeled on

## test-runner

- **File**: [test-runner.md](test-runner.md)
- **Responsibility**: runs the documented typecheck / unit /
  Docker-backed integration / arch / e2e commands for the given packages
  and returns a compact pass/fail table with at most 3 expanded failures —
  so no raw test log enters the orchestrator's or implementer's context.
  Never edits, diagnoses or fixes.
- **Permissions (tools)**: `Bash, Read, Grep`.
- **Model**: `haiku` — mechanical execution, no judgment.
- **Input**: packages + which checks (defaults per package).
- **Output**: a Test Run Report — results table, failures
  (`file:line`, test name, assertion), skipped checks with reason.
- **Why it exists**: subagents can't spawn subagents, so `implementer`
  can't delegate to it — instead `implementer` runs only scoped tests and
  the orchestrator calls `test-runner` once for the full + integration
  suites after all task groups.

## plan-verifier

- **File**: [plan-verifier.md](plan-verifier.md)
- **Responsibility**: independently verifies, one item at a time
  (DONE/NOT DONE/PARTIAL with evidence), in one of two modes: `tasks` —
  right after `implementer`, every plan task `T<n>` is in the code;
  `acceptance` — final gate, every spec `AC`/`NFR` has code **and** a
  passing test named with its AC-ID. Deliberately does **not**
  re-check code quality (`pr-self-review`'s job), architecture
  (`architecture-reviewer`'s job), or security (the `security` skill's job) —
  its only job is plan-to-code traceability, and it must never collapse that
  into generic review commentary.
- **Permissions (tools)**: `Read, Grep, Glob, Bash` — read-only, no
  Write/Edit. May run a plan step's own named test command as evidence, not
  as a broader quality pass.
- **Model**: `haiku` (`tasks` mode); the caller overrides to `sonnet` for
  `acceptance` mode.
- **Input**: mode + Implementation Plan (`tasks`) or spec (`acceptance`),
  the implementer's Diff digest, and for `acceptance` the latest
  `test-runner` report.
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
  turns an Implementation Plan, PR, or diff into module documentation with
  diagrams. Knows which of a module's two doc locations to use: flips a
  matching `specs/<topic>.md`'s Status to `implemented` rather than
  duplicating it, or writes a new `docs/<topic>.md` when no matching spec
  exists. Never touches `src/`.
- **Permissions (tools)**: `Read, Grep, Glob, Edit, Write` — no Bash by
  design; works from the given plan/diff/code, not from running commands.
- **Model**: `sonnet`
- **Input**: an Implementation Plan, PR description, or diff describing what was
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

Run manually: `spec-creator` → (you approve) → `implementation-planner` →
save the plan → **`/run-plan <plan.md>`** ([skill](../skills/run-plan/SKILL.md)),
which runs everything from `implementer` to `plan-verifier [acceptance]`,
including the architecture fix rounds. `test-writer` is currently left out
of `/run-plan` to save tokens; the full chain below shows where it slots back in.

```
spec-creator  pass 1 → Discovery Report ──(user answers ∥ researcher ×N)──▶ pass 2 → spec
        │     ⏸ user sets Status: approved
        ▼
brainstorm (optional, when there's a real choice of approach)
        ▼
implementation-planner → Implementation Plan (tasks → AC-IDs → skills)
        │     ⏸ user picks multi-/single-agent → plan saved as <spec folder>/<slug>.plan.md
        ▼   ── new chat from here on ──
implementer ×N  (contract group first, then parallel groups on disjoint files)
        ▼
test-runner        full suites + *.it.test.ts, once
        ▼
plan-verifier  [tasks]        NOT DONE / PARTIAL ──▶ implementer (fix mode)
        ▼
architecture-reviewer ∥ security-reviewer* ∥ pr-self-review (bugs, skill-routed)
        │     findings ──▶ implementer (fix mode) ──▶ rerun only the reviewer that found them (≤2 rounds)
        ▼     ⏸ optional checkpoint commit (user approves)
test-writer        tests named `AC-<n>: …`
        ▼
test-runner
        ▼
plan-verifier  [acceptance, model: sonnet]   every AC → code + passing AC-named test
        ▼
doc-writer → spec Status: implemented · engineering-insights end-of-session check
        ▼
/workflow-retro   manual only, same session → proposals + section in docs/retro/ledger.md
```

\* `security-reviewer` runs when the spec has a security NFR or the diff
touches auth, input handling, or secrets.

Why this order:

- `plan-verifier [tasks]` runs **before** tests and reviews — it is cheap,
  and sending unfinished tasks back first avoids writing tests and reviewing
  code that is about to change.
- Reviews run **before** `test-writer`, so review-driven fixes don't break
  freshly written tests. (Test-first is the stronger SDD variant for
  `server/`/`reviewer-core/`: run `test-writer` from the ACs before
  `implementer` and let `implementer` make them pass.)
- `architecture-reviewer` checks layering only; correctness bugs come from
  `pr-self-review`, which runs in the main session (it fans out its own
  subagents, which a subagent can't do).
- Every reviewer starts from the implementer's Diff digest instead of
  re-reading the touched files.
