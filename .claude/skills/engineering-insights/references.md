# Engineering Insights — sources and rationale

Digest of the research collection this skill's design was built from. The
full collection lives in the session that created this skill; only what
directly shaped the design is kept here.

## Primary sources (must-read)

- **MindStudio — Self-Learning AI Skill System with Learnings.md + Wrap-Up
  Skill** — https://www.mindstudio.ai/blog/self-learning-ai-skill-system-learnings-md-wrap-up —
  source of the fixed section structure (What Works / What Doesn't Work /
  Codebase Patterns / Tool & Library Notes / Recurring Errors & Fixes /
  Session Notes / Open Questions), the vague-vs-useful examples, and the
  "manual wrap-up is unreliable" conclusion.
- **MindStudio — How to Build a Learnings Loop for Claude Code Skills** —
  https://www.mindstudio.ai/blog/how-to-build-learnings-loop-claude-code-skills —
  source of "forced active reading" at session start and the
  LEARNINGS.md ≠ CLAUDE.md ≠ chat replay distinction.
- **MindStudio — Compounding Knowledge Loop in Claude Code** —
  https://www.mindstudio.ai/blog/compounding-knowledge-loop-claude-code —
  the 5 hook types; `Stop` is the most important one for auto-capture —
  scoped to a later course lesson, not this iteration of the skill.
- **MindStudio — Self-Evolving Claude Code Memory with Obsidian + Hooks** —
  https://www.mindstudio.ai/blog/self-evolving-claude-code-memory-obsidian-hooks —
  source of the 4 base capture categories (Patterns · Mistakes · Decisions
  · Context), expanded here into 7 concrete rubrics.

## Related (self-improving CLAUDE.md, official Anthropic guidance)

- dev.to / Aviad Rozenhek — Self-Improving AI — compounding rules across
  sessions: https://dev.to/aviad_rozenhek_cba37e0660/self-improving-ai-one-prompt-that-makes-claude-learn-from-every-mistake-16ek
- dev.to / evoleinik — CLAUDE.md: Building Persistent Memory —
  https://dev.to/evoleinik/claudemd-building-persistent-memory-for-ai-coding-agents-5322 —
  source of the "monthly prune" rule and the "this is not a substitute for
  documentation" boundary.
- Anthropic — Lessons from building Claude Code: how we use skills —
  https://claude.com/blog/lessons-from-building-claude-code-how-we-use-skills
- Anthropic — Skill authoring best practices —
  https://platform.claude.com/docs/en/agents-and-tools/agent-skills/best-practices —
  source of the `description` requirements (third person, "what" + "when").

## Ready-made analogues (for comparison)

- glebis/claude-skills — retrospective skill —
  https://github.com/glebis/claude-skills
- mcpmarket — Lessons Learned (AI Development Retro) —
  https://mcpmarket.com/tools/skills/lessons-learned-retrospectives
- mcpmarket — CLAUDE.md Lessons Manager —
  https://mcpmarket.com/tools/skills/claude-md-lessons-manager —
  source of the duplicate-detection / rule-consolidation idea (the size
  guard in `SKILL.md`).

## Course arc

This skill is deliberately the L01 version: a plain skill with no hook,
relying on proactive triggering via its `description` and on explicit
`/engineering-insights` invocation. Known limitation: triggering isn't
guaranteed without a human or a hook. A later course lesson (a Stop hook,
automatic and reliable capture) closes exactly this gap.
