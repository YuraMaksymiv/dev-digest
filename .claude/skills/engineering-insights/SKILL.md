---
name: engineering-insights
description: "Reads and writes each module's INSIGHTS.md as working memory for this repo (server, client, reviewer-core, e2e). MUST be used to read the relevant module's INSIGHTS.md before starting any work, as soon as the module is known from the request. MUST be used again at the end of a session to check whether anything substantial and not already captured happened — appending it only if so; if nothing substantial came up, or it's already covered, write nothing. Captures working patterns, dead ends, codebase/tool quirks, decisions with their reasoning, recurring errors and fixes, and open questions, each dated and evidenced. Also invoked explicitly as /engineering-insights."
---

# Engineering Insights

Reads and writes the `INSIGHTS.md` of the module (`server/`, `client/`,
`reviewer-core/`, `e2e/`) the work touches — so the next session doesn't
step on the same rake or rediscover the same decision. Append-only.

## Mandatory: read before starting work

The moment the request makes clear which module(s) the work concerns,
**before** writing code or investigating further, read that module's
`INSIGHTS.md` in full. This is not judgment-based — do it every session,
even for a request that looks simple, because the point is to catch a
known gotcha before repeating it. If the request spans multiple modules,
read all of them. If the module isn't clear from the request alone, read
`INSIGHTS.md` as soon as it becomes clear (e.g. after the first file you
open).

## Mandatory: check at the end of the session

At the end of the session — and always on explicit
`/engineering-insights` invocation — run this check, don't skip it:

1. Re-read the target module's `INSIGHTS.md` (you read it at the start;
   re-check now in case the session moved into territory you didn't
   anticipate, or ran long).
2. Ask: did anything **substantial** happen this session — a real problem,
   fix, decision, or discovery — that isn't already captured there?
   - Nothing substantial, or everything substantial is already covered by
     an existing entry → **write nothing**. Don't force an entry just to
     have done something; a no-op check is a normal, good outcome.
   - Something substantial and not yet captured → append it under the
     right heading, in the format below.
3. Never duplicate — if a close match already exists, extend it with a
   dated addendum only if there's genuinely new information, otherwise
   leave it alone.

## Optional: capture as you go

Mid-session, the moment something clearly non-obvious surfaces (see the
anti-banality test below), you may capture it immediately instead of
waiting for the end-of-session check — useful on long sessions where
details are easy to lose by wrap-up. This doesn't replace the mandatory
end-of-session check above.

## Where to write

Target file: `<module>/INSIGHTS.md`, `<module>` ∈ `{server, client,
reviewer-core, e2e}`.

- Infer the module from what the session actually touched (files edited/
  read, tests run).
- Work spanning multiple modules → write a separate entry into each
  affected `INSIGHTS.md`, phrased from that module's point of view — not a
  copy-paste of one text.
- A cross-cutting finding with no single owner (e.g. `@devdigest/shared`
  drift between `server/` and `client/`, or repo-wide tooling) → write it
  into the module most responsible for that concern (contract shape issues
  → `reviewer-core/INSIGHTS.md`, since it's the canonical consumer of
  `Review`/`Finding`/`Verdict`), and note in the entry that it's
  cross-cutting.
- No root-level `INSIGHTS.md` exists by design — don't create one.

## Categories (fixed sections in each INSIGHTS.md)

Append the entry under the matching `##` heading — create the heading if
it's missing, but never invent a new one:

| Heading | What goes here |
|---|---|
| `What Works` | A pattern that worked, worth repeating |
| `What Doesn't Work` | An approach that failed or is a trap — antipattern |
| `Codebase Patterns & Tool/Library Notes` | A non-obvious fact about this codebase, a library, or a tool's behavior here |
| `Decisions` | A design/architecture decision and the reason for it |
| `Recurring Errors & Fixes` | An error hit more than once (or likely to recur) and its fix |
| `Session Notes` | A dated note that doesn't fit the above but is worth keeping |
| `Open Questions` | Something unresolved worth flagging for a future session |

## Entry format

`- YYYY-MM-DD — <one-line gist>. <file:line evidence if applicable>.`

Actionable "cold": readable with no session context, no "as discussed
above" or pronouns referring back to something just said.

## Anti-banality test

Before writing, ask: "would anyone reading this code already know it?" If
yes, don't write it. See `examples.md` for vague-vs-useful pairs.

## Append-only — never overwrite existing content

- Insert with a targeted edit — add your entry right after the matching
  `##` heading (or after the last existing entry under it). **Never
  regenerate the whole file from scratch** to add one entry: a full-file
  rewrite means retyping every heading and every prior entry from memory,
  and anything you fail to reproduce exactly is silently gone.
- Never edit or delete an existing entry to "fix" it — add a new dated
  entry, and if it supersedes an old one, mark it inline as
  `(supersedes the YYYY-MM-DD entry above)`.
- Pruning stale entries is a separate periodic maintenance pass — don't do
  it as a side effect of an append, and don't do it at all unless the user
  asked for it.
- **After writing, verify nothing was lost.** Re-read the file: every
  heading and every entry that existed before your edit must still be
  there, unchanged, plus your addition. If anything looks missing or
  altered, stop and fix it before moving on — don't leave a silently
  truncated file behind.

## Size guard

If the target file already looks long (rule of thumb: past 200 entries, or
past ~300 lines) — flag it to the user instead of silently appending.
DevDigest doesn't yet have automatic pruning/splitting (that's a planned
later capability).
