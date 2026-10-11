#!/usr/bin/env python3
"""Lay out one eval iteration for a skill whose test cases live in .claude/skills/<skill>/evals/.

The skill is snapshotted WITHOUT its evals/ folder and each fixture is copied into its
eval dir, so a run under test can never read evals.json (expected findings) or reach
the fixtures through the skill path.

usage: python3 skill-evals/prepare.py <skill-name> <iteration>
"""
import json
import shutil
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent


def main() -> None:
    skill, iteration = sys.argv[1], int(sys.argv[2])
    skill_dir = ROOT / ".claude" / "skills" / skill
    evals_dir = skill_dir / "evals"
    spec = json.loads((evals_dir / "evals.json").read_text())

    out = ROOT / "skill-evals" / "workspaces" / skill / f"iteration-{iteration}"
    out.mkdir(parents=True, exist_ok=True)

    snapshot = out / "skill-snapshot"
    shutil.rmtree(snapshot, ignore_errors=True)
    shutil.copytree(skill_dir, snapshot, ignore=shutil.ignore_patterns("evals"))

    for ev in spec["evals"]:
        eval_dir = out / f"eval-{ev['id']}-{ev['name']}"
        inputs = eval_dir / "inputs"
        shutil.rmtree(inputs, ignore_errors=True)
        for rel in ev.get("files", []):
            shutil.copytree(evals_dir / rel, inputs, dirs_exist_ok=True)
        (eval_dir / "eval_metadata.json").write_text(json.dumps({
            "eval_id": ev["id"],
            "eval_name": ev["name"],
            "prompt": ev["prompt"],
            "assertions": [a["text"] for a in ev.get("assertions", [])],
        }, indent=2) + "\n")
        print(eval_dir.relative_to(ROOT))
    print(snapshot.relative_to(ROOT))


if __name__ == "__main__":
    main()
