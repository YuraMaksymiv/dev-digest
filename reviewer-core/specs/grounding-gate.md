# Spec — the citation grounding gate

Status: **implemented** (`src/grounding.ts`). This is the invariant the whole
product leans on, so it is specified rather than left to the prompt.

## Problem

An LLM asked to review a diff will occasionally produce a finding that is
well-written, plausible, and about a line that does not exist in the change —
or a file the PR never touched. A reviewer who is burned by that twice stops
trusting every finding, including the true ones.

## Rule

A finding is **kept** only if it is anchored to something real in the unified
diff:

| Finding kind | Requirement |
|---|---|
| default (diff-finding) | `[start_line, end_line]` intersects a hunk of that file, on the new side |
| `secret_leak`, `lethal_trifecta`, `phantom`, `hook` | the file appears in the diff (full-file scanners aren't hunk-bound) |

`buildLineIndex(diff)` builds `file → Set<line>` from each hunk's
`newLineNumbers`, falling back to the declared `newStart`/`newLines` range when
a parser didn't provide them. Line order is normalised, so a finding with
`start_line > end_line` still grounds.

## Output

`groundFindings()` returns `{ kept, dropped }`, where each dropped entry carries
the reason. Dropped findings are **not** silently lost: they go into the run
trace so a user can see what the model claimed and why it was rejected.
`groundingSummary()` formats the `"N/M passed"` string the run history shows.

## Consequences elsewhere

- Persisted findings are post-gate, so every count the UI shows (severity pills,
  the list's FINDINGS column, blockers) is a count of *grounded* findings.
- A model that hallucinates aggressively shows up as a low grounding ratio in
  the trace rather than as noise in the review.

## Tests

`test/grounding.test.ts` covers hunk intersection, the full-file exemption, a
finding on a file outside the diff, and the summary string.
