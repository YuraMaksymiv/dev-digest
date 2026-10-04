# specs/

Cross-module feature specifications — **only** specs for features that touch
two or more modules (`server/`, `client/`, `reviewer-core/`, `e2e/`, `mcp/`)
live here, as one file per feature. A feature confined to one module keeps
its spec in that module's own `specs/` folder.

Status lifecycle: `draft` (open `[NEEDS CLARIFICATION]` markers) →
`clarified` (no markers) → `approved` (set by a human) → `implemented`.

| Spec | Modules | Status |
|---|---|---|
| [project-context.md](project-context.md) — attach repo markdown docs to agents/skills, inject as untrusted `## Project context`, show in run trace | server, client, reviewer-core | implemented |
| [onboarding-generator.md](onboarding-generator.md) — per-repo Onboarding Tour: five typed sections from index facts, one LLM call, deterministic skeleton fallback | server, client | approved |
