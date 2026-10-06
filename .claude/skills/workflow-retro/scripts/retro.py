#!/usr/bin/env python3
"""Metrics + problem signals for one Claude Code session's subagents.

Deep mode of the workflow-retro skill (run manually only).

Usage:
  retro.py [--session ID] [--project-dir DIR] [--json OUT]

Reads ~/.claude/projects/<cwd-slug>/<session>.jsonl and
<session>/subagents/agent-*.jsonl (+ .meta.json). Prints a markdown summary;
--json writes the full data (incl. per-agent final report excerpts) for the
qualitative pass.
"""
import argparse
import collections
import datetime as dt
import glob
import json
import os
import re
import shlex
import subprocess
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
FORBIDDEN = [
    (r"arch:baseline", "ran arch:baseline"),
    (r"\bgit\s+(commit|push|checkout|switch|reset\s+--hard)\b", "git write/branch op"),
    (r"\bdb:migrate\b", "ran db:migrate"),
    (r"docker\s+compose\s+down\s+-v", "docker compose down -v"),
]
READ_ONLY_TYPES = {"implementation-planner", "planner", "brainstorm", "researcher",
                   "architecture-reviewer", "security-reviewer", "plan-verifier",
                   "test-runner", "Explore", "Plan"}
MODULES = ["server", "client", "reviewer-core", "e2e", "mcp"]
READERS = {"cat", "head", "tail", "sed", "less", "nl", "bat"}


def bash_reads(cmd, root):
    """File paths read by cat/head/tail/sed/… in a shell command (existing files only)."""
    out = []
    for seg in re.split(r"[|;&]+|\n", cmd):
        try:
            words = shlex.split(seg)
        except ValueError:
            continue
        if not words or os.path.basename(words[0]) not in READERS:
            continue
        args = words[1:]
        if words[0] == "sed" and args:
            args = [w for w in args if not w.startswith("-")][1:]
        for w in args:
            if w.startswith("-") or w.isdigit():
                continue
            full = w if os.path.isabs(w) else os.path.join(root, w)
            if os.path.isfile(full):
                out.append(rel(os.path.realpath(full), root) if full.startswith(root) else w)
    return out


def bash_writes(cmd, root):
    """Targets of > / >> / tee / sed -i in a shell command (heredoc bodies ignored)."""
    lines, kept, skip_to = cmd.split("\n"), [], None
    for line in lines:
        if skip_to is not None:
            if line.strip() == skip_to:
                skip_to = None
            continue
        kept.append(line)
        m = re.search(r"<<-?\s*['\"]?(\w+)['\"]?", line)
        if m:
            skip_to = m.group(1)
    out = []
    for seg in re.split(r"[|;&]+|\n", "\n".join(kept)):
        try:
            words = shlex.split(seg)
        except ValueError:
            continue
        for i, w in enumerate(words):
            if w in (">", ">>") and i + 1 < len(words):
                out.append(words[i + 1])
            elif w.startswith(">") and len(w.lstrip(">")) > 0 and not w.startswith(">&"):
                out.append(w.lstrip(">"))
        if words and words[0] == "tee":
            out += [w for w in words[1:] if not w.startswith("-")]
        if len(words) > 2 and words[0] == "sed" and any(w.startswith("-i") for w in words[1:3]):
            out.append(words[-1])
    res = []
    for w in out:
        if not w or w.startswith(("/dev/", "$", "&")) or ("/" not in w and "." not in w):
            continue
        full = w if os.path.isabs(w) else os.path.join(root, w)
        res.append(rel(full, root))
    return res


def git_changed(root):
    try:
        out = subprocess.run(["git", "-C", root, "status", "--porcelain"], capture_output=True, text=True).stdout
    except OSError:
        return set()
    return {line[3:].split(" -> ")[-1].strip() for line in out.splitlines() if line.strip()}


def ts(s):
    return dt.datetime.fromisoformat(s.replace("Z", "+00:00"))


def load(path):
    rows = []
    with open(path) as f:
        for line in f:
            try:
                rows.append(json.loads(line))
            except json.JSONDecodeError:
                pass
    return rows


def rel(p, root):
    if not isinstance(p, str):
        return None
    p = p.strip("'\"")
    if root and p.startswith(root + "/"):
        p = p[len(root) + 1:]
    return p


def price_for(model, prices):
    for key, val in prices.items():
        if key != "_note" and model and model.startswith(key):
            return val
    return None


def usage_and_tools(rows, root):
    usage = {}
    models = collections.Counter()
    tools = collections.Counter()
    reads, writes, bash = [], [], []
    errors = []
    texts = []
    big = []
    tool_names = {}
    for r in rows:
        if r.get("type") == "assistant":
            m = r.get("message", {})
            mid = m.get("id") or r.get("requestId") or r.get("uuid")
            if m.get("usage"):
                usage[mid] = m["usage"]
            if m.get("model") and not m["model"].startswith("<"):
                models[m["model"]] += 1
            for b in m.get("content") or []:
                if b.get("type") == "tool_use":
                    name, inp = b.get("name"), b.get("input") or {}
                    tools[name] += 1
                    tool_names[b.get("id")] = name
                    if name == "Read":
                        reads.append(rel(inp.get("file_path"), root))
                    elif name in ("Edit", "Write", "NotebookEdit"):
                        writes.append(rel(inp.get("file_path"), root))
                    elif name == "Bash":
                        cmd = inp.get("command", "")
                        bash.append(cmd)
                        reads.extend(bash_reads(cmd, root))
                        writes.extend(bash_writes(cmd, root))
                elif b.get("type") == "text" and b.get("text", "").strip():
                    texts.append(b["text"])
        elif r.get("type") == "user":
            c = r.get("message", {}).get("content")
            if isinstance(c, list):
                for b in c:
                    if b.get("type") == "tool_result":
                        body = b.get("content")
                        size = len(body) if isinstance(body, str) else sum(len(x.get("text", "")) for x in body or [] if isinstance(x, dict))
                        big.append((size, tool_names.get(b.get("tool_use_id"), "?")))
                    if b.get("type") == "tool_result" and b.get("is_error"):
                        body = b.get("content")
                        if isinstance(body, list):
                            body = " ".join(x.get("text", "") for x in body if isinstance(x, dict))
                        errors.append(f"{tool_names.get(b.get('tool_use_id'), '?')}: {str(body)[:160]}")
    tot = collections.Counter()
    for u in usage.values():
        tot["input"] += u.get("input_tokens", 0)
        tot["cache_read"] += u.get("cache_read_input_tokens", 0)
        cc = u.get("cache_creation") or {}
        c1h = cc.get("ephemeral_1h_input_tokens", 0)
        tot["cache_write_1h"] += c1h
        tot["cache_write_5m"] += u.get("cache_creation_input_tokens", 0) - c1h
        tot["output"] += u.get("output_tokens", 0)
    big = [f"{n}: {sz//1000}k chars" for sz, n in sorted(big, reverse=True)[:3] if sz >= 5000]
    return dict(tot), models, tools, [x for x in reads if x], [x for x in writes if x], bash, errors, texts, len(usage), big


def cost(tot, model, prices):
    p = price_for(model, prices)
    if not p:
        return None
    return round((tot.get("input", 0) * p["input"] + tot.get("output", 0) * p["output"]
                  + tot.get("cache_read", 0) * p["cache_read"]
                  + tot.get("cache_write_5m", 0) * p["cache_write_5m"]
                  + tot.get("cache_write_1h", 0) * p["cache_write_1h"]) / 1e6, 4)


def hit(tot):
    denom = tot.get("input", 0) + tot.get("cache_read", 0) + tot.get("cache_write_5m", 0) + tot.get("cache_write_1h", 0)
    return round(100 * tot.get("cache_read", 0) / denom) if denom else 0


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--session")
    ap.add_argument("--project-dir")
    ap.add_argument("--root", default=os.getcwd())
    ap.add_argument("--json")
    a = ap.parse_args()

    root = os.path.realpath(a.root)
    pdir = a.project_dir or os.path.expanduser("~/.claude/projects/" + re.sub(r"[^A-Za-z0-9]", "-", root))
    if a.session:
        main_path = os.path.join(pdir, a.session + ".jsonl")
    else:
        cands = sorted(glob.glob(os.path.join(pdir, "*.jsonl")), key=os.path.getmtime)
        if not cands:
            sys.exit(f"no transcripts in {pdir}")
        main_path = cands[-1]
    session = os.path.basename(main_path)[:-6]
    prices = json.load(open(os.path.join(HERE, "prices.json")))

    main_rows = load(main_path)
    spawn_order, resumes, results = [], collections.Counter(), {}
    for r in main_rows:
        if r.get("type") == "assistant":
            for b in r.get("message", {}).get("content") or []:
                if b.get("type") == "tool_use" and b.get("name") == "Agent":
                    spawn_order.append(b.get("id"))
                if b.get("type") == "tool_use" and b.get("name") == "SendMessage":
                    resumes[str((b.get("input") or {}).get("to"))] += 1
        t = r.get("toolUseResult")
        if isinstance(t, dict) and t.get("agentId"):
            results[t["agentId"]] = t

    agents = []
    for mp in glob.glob(os.path.join(pdir, session, "subagents", "agent-*.jsonl")):
        aid = os.path.basename(mp)[len("agent-"):-6]
        meta_p = mp[:-6] + ".meta.json"
        meta = json.load(open(meta_p)) if os.path.exists(meta_p) else {}
        rows = load(mp)
        if not rows:
            continue
        tot, models, tools, reads, writes, bash, errors, texts, nreq, big = usage_and_tools(rows, root)
        first = rows[0].get("message", {}).get("content")
        prompt_chars = len(first) if isinstance(first, str) else sum(len(x.get("text", "")) for x in first or [] if isinstance(x, dict))
        model = (results.get(aid) or {}).get("resolvedModel") or (models.most_common(1)[0][0] if models else "?")
        start, end = ts(rows[0]["timestamp"]), ts(rows[-1]["timestamp"])
        final = texts[-1] if texts else ""
        rep_cmds = [c for c, n in collections.Counter(bash).items() if n >= 3]
        agents.append({
            "id": aid, "type": meta.get("agentType", "?"), "description": meta.get("description", ""),
            "order": spawn_order.index(meta.get("toolUseId")) + 1 if meta.get("toolUseId") in spawn_order else None,
            "model": model, "tokens": tot, "requests": nreq,
            "total_tokens": sum(tot.values()), "cache_hit_pct": hit(tot), "cost_usd": cost(tot, model, prices),
            "start": start.isoformat(), "end": end.isoformat(), "duration_s": round((end - start).total_seconds()),
            "tools": dict(tools), "tool_calls": sum(tools.values()), "tool_errors": errors[:8], "tool_error_count": len(errors),
            "reads": reads, "writes": sorted(set(writes)), "bash_forbidden": sorted({lbl for c in bash for pat, lbl in FORBIDDEN if re.search(pat, c)}),
            "repeated_commands": rep_cmds[:5], "largest_tool_outputs": big, "prompt_chars": prompt_chars, "resumed_by_orchestrator": resumes.get(aid, 0) + resumes.get(meta.get("description"), 0),
            "asks_questions": bool(re.search(r"(?im)^#+\s*(questions|blocked|open questions)|\?\s*$", final)),
            "final_report_excerpt": final[:1500],
        })
    agents.sort(key=lambda x: x["start"])
    for i, ag in enumerate(agents, 1):
        ag["order"] = ag["order"] or i

    main_only = [r for r in main_rows if not r.get("isSidechain") and r.get("timestamp")]
    if agents:
        w0, w1 = min(ts(x["start"]) for x in agents), max(ts(x["end"]) for x in agents)
        window = [r for r in main_only if w0 <= ts(r["timestamp"]) <= w1 + dt.timedelta(minutes=10)]
    else:
        window = main_only
    otot, omodels, otools, oreads, owrites, obash, oerr, _, oreq, _ = usage_and_tools(window, root)
    stot, smodels, *_ = usage_and_tools(main_only, root)
    omodel = omodels.most_common(1)[0][0] if omodels else "?"
    orchestrator = {"model": omodel, "tokens": otot, "total_tokens": sum(otot.values()), "cache_hit_pct": hit(otot),
                    "cost_usd": cost(otot, omodel, prices), "tool_calls": sum(otools.values()), "requests": oreq,
                    "scope": "from first subagent start to last subagent end + 10 min",
                    "whole_session_tokens": sum(stot.values()), "whole_session_cost_usd": cost(stot, omodel, prices)}

    # parallelism
    events = sorted([(ts(x["start"]), 1) for x in agents] + [(ts(x["end"]), -1) for x in agents])
    cur = peak = 0
    for _, d in events:
        cur += d
        peak = max(peak, cur)
    if agents:
        span = (max(ts(x["end"]) for x in agents) - min(ts(x["start"]) for x in agents)).total_seconds()
        busy = sum(x["duration_s"] for x in agents)
        parallel = round(busy / span, 2) if span else 1.0
    else:
        span, parallel = 0, 0

    # problem signals
    by_file = collections.defaultdict(collections.Counter)
    for ag in agents:
        for p in ag["reads"]:
            by_file[p][f'{ag["type"]}#{ag["order"]}'] += 1
    for p in oreads:
        by_file[p]["orchestrator"] += 1
    dup_reads = sorted(([p, dict(c)] for p, c in by_file.items() if len(c) >= 2 or max(c.values()) >= 3),
                       key=lambda x: -sum(x[1].values()))[:15]

    all_reads = {p for ag in agents for p in ag["reads"]} | set(oreads)
    all_writes = {p for ag in agents for p in ag["writes"]} | set(owrites) | git_changed(root)
    signals = []
    for ag in agents:
        if ag["type"] in READ_ONLY_TYPES and ag["writes"]:
            signals.append(f'scope: read-only {ag["type"]}#{ag["order"]} wrote {ag["writes"][:3]}')
        if ag["type"] == "spec-creator" and any("/specs/" not in "/" + w and not w.startswith("specs/") for w in ag["writes"]):
            signals.append(f'scope: spec-creator#{ag["order"]} wrote outside specs/')
        if ag["type"] == "test-writer" and any("/src/" in w and ".test." not in w for w in ag["writes"]):
            signals.append(f'scope: test-writer#{ag["order"]} edited non-test source')
        if ag["type"] == "doc-writer" and any("/src/" in w for w in ag["writes"]):
            signals.append(f'scope: doc-writer#{ag["order"]} touched src/')
        for lbl in ag["bash_forbidden"]:
            signals.append(f'forbidden: {ag["type"]}#{ag["order"]} {lbl}')
        if ag["resumed_by_orchestrator"]:
            signals.append(f're-asked: {ag["type"]}#{ag["order"]} resumed {ag["resumed_by_orchestrator"]}x via SendMessage')
        if ag["asks_questions"]:
            signals.append(f're-asked: {ag["type"]}#{ag["order"]} ended with questions/blocked')
        if ag["tool_error_count"] >= 3:
            signals.append(f'struggle: {ag["type"]}#{ag["order"]} {ag["tool_error_count"]} tool errors')
        if ag["largest_tool_outputs"] and int(ag["largest_tool_outputs"][0].split(": ")[1].split("k")[0]) >= 20:
            signals.append(f'waste: {ag["type"]}#{ag["order"]} pulled large tool output ({ag["largest_tool_outputs"][0]})')
        if ag["prompt_chars"] >= 8000:
            signals.append(f'waste: {ag["type"]}#{ag["order"]} got a {ag["prompt_chars"]//1000}k-char prompt (pass path + abstract instead)')
        if ag["repeated_commands"]:
            signals.append(f'struggle: {ag["type"]}#{ag["order"]} repeated a command ≥3x')
    touched = {m for m in MODULES if any(w.startswith(m + "/") for w in all_writes)}
    for m in sorted(touched):
        if f"{m}/INSIGHTS.md" not in all_reads:
            signals.append(f"skipped: {m}/ changed but {m}/INSIGHTS.md never read")
    if touched and not any(w.endswith("INSIGHTS.md") for w in all_writes):
        signals.append("skipped: no INSIGHTS.md updated this run (fine only if nothing new was learned)")
    s_sh = any(w.startswith("server/src/vendor/shared/") for w in all_writes)
    c_sh = any(w.startswith("client/src/vendor/shared/") for w in all_writes)
    if s_sh != c_sh:
        signals.append("skipped: only one @devdigest/shared copy edited — server/client mirrors may drift")
    types = [x["type"] for x in agents]
    if "implementer" in types and "plan-verifier" not in types:
        signals.append("skipped: implementer ran but plan-verifier did not")
    if "implementer" in types and not ({"test-runner", "test-writer"} & set(types)):
        signals.append("skipped: no test-runner/test-writer after implementer")

    total_cost = sum(x["cost_usd"] or 0 for x in agents) + (orchestrator["cost_usd"] or 0)
    total_tokens = sum(x["total_tokens"] for x in agents) + orchestrator["total_tokens"]
    data = {"session": session, "transcript": main_path, "agents": agents, "orchestrator": orchestrator,
            "parallelism": {"peak_concurrent": peak, "busy_over_wall": parallel, "wall_s": round(span)},
            "total_cost_usd": round(total_cost, 4), "total_tokens": total_tokens,
            "duplicate_reads": dup_reads, "signals": signals, "price_note": prices.get("_note")}

    if a.json:
        with open(a.json, "w") as f:
            json.dump(data, f, indent=1, default=str)

    k = lambda n: f"{n/1000:.0f}k" if n >= 1000 else str(n)
    usd = lambda v: "—" if v is None else f"${v:.2f}"
    print(f"## Workflow retro — session `{session[:8]}` · {len(agents)} subagents\n")
    print("| # | Agent | Model | Tokens | Cache hit | Time | Tools (err) | Cost |")
    print("|---|---|---|---|---|---|---|---|")
    for x in agents:
        print(f'| {x["order"]} | {x["type"]} — {x["description"][:40]} | {x["model"].replace("claude-", "")} | '
              f'{k(x["total_tokens"])} | {x["cache_hit_pct"]}% | {x["duration_s"]//60}m{x["duration_s"]%60:02d}s | '
              f'{x["tool_calls"]} ({x["tool_error_count"]}) | {usd(x["cost_usd"])} |')
    o = orchestrator
    print(f'| — | orchestrator (during workflow) | {o["model"].replace("claude-", "")} | {k(o["total_tokens"])} | '
          f'{o["cache_hit_pct"]}% | — | {o["tool_calls"]} | {usd(o["cost_usd"])} |')
    print(f'\n**Total**: {k(total_tokens)} tokens · {usd(total_cost)} · peak {peak} agents in parallel · '
          f'busy/wall {parallel} over {round(span)//60}m · whole session incl. non-workflow turns: '
          f'{k(o["whole_session_tokens"])} / {usd(o["whole_session_cost_usd"])}\n')
    if dup_reads:
        print("**Files read by several agents**: " + "; ".join(
            f'`{p}` ×{sum(c.values())} ({", ".join(c)})' for p, c in dup_reads[:6]))
    print("\n**Signals**:")
    for s in signals or ["none"]:
        print(f"- {s}")


if __name__ == "__main__":
    main()
