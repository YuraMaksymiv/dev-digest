# skill-evals

Harness for skill evals. The **test cases themselves live inside each skill** so
they ship with it:

```
.claude/skills/<skill>/evals/
  evals.json          prompts, expected output, assertions (the answer key)
  fixtures/<NN-slug>/ input code each eval runs against, laid out as repo paths
```

This folder holds only the machinery around them:

| Path | Tracked | Role |
|---|---|---|
| `prepare.py` | yes | Lays out one iteration: snapshots the skill **without** `evals/`, copies each fixture into `eval-<id>-<name>/inputs/`, writes `eval_metadata.json` |
| `workspaces/<skill>/iteration-N/` | no (gitignored) | `eval-*/{with_skill,without_skill}/run-K/{outputs/,grading.json,timing.json}`, plus `benchmark.json` and viewer feedback. The `run-K/` level is what skill-creator's `aggregate_benchmark` expects |

```bash
python3 skill-evals/prepare.py onion-architecture 1
```

## Rules for fixtures

- No comments in fixture code that hint at the planted problems — the expected
  findings exist only in `evals.json`.
- A run under test may read `skill-snapshot/` and `inputs/` only. The snapshot
  excludes `evals/`, so the skill path never leads to the answer key; the
  `eval_metadata.json` beside `inputs/` must still be off-limits to the run.
- Include at least one conforming file per fixture so false positives are
  measurable.
