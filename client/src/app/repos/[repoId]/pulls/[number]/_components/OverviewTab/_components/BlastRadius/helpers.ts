import type { BlastRadius } from "@devdigest/shared";
import { githubBlobUrl } from "@/lib/github-urls";
import { CALLABLE_KINDS, GRAPH } from "./constants";

export interface BlastStats {
  symbols: number;
  callers: number;
  endpoints: number;
  crons: number;
}

export function blastStats(blast: BlastRadius): BlastStats {
  const endpoints = new Set<string>();
  const crons = new Set<string>();
  let callers = 0;
  for (const d of blast.downstream) {
    callers += d.callers.length;
    d.endpoints_affected.forEach((e) => endpoints.add(e));
    d.crons_affected.forEach((c) => crons.add(c));
  }
  return { symbols: blast.changed_symbols.length, callers, endpoints: endpoints.size, crons: crons.size };
}

/** Pinned to the PR head so the line stays accurate; plain text when we can't build a link. */
export function callerHref(
  repoFullName: string | null | undefined,
  headSha: string | null | undefined,
  file: string,
  line: number,
): string | undefined {
  if (!repoFullName || !headSha) return undefined;
  return githubBlobUrl(repoFullName, headSha, file, line);
}

export function symbolKinds(blast: BlastRadius): Map<string, string> {
  return new Map(blast.changed_symbols.map((cs) => [cs.name, cs.kind]));
}

export function symbolLabel(name: string, kind: string | undefined): string {
  return kind && CALLABLE_KINDS.has(kind) ? `${name}()` : name;
}

export function truncate(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

export type GraphNodeKind = "symbol" | "caller" | "endpoint" | "cron";

export interface GraphNode {
  id: string;
  kind: GraphNodeKind;
  label: string;
  title: string;
  x: number;
  y: number;
  href?: string;
}

export interface GraphEdge {
  from: string;
  to: string;
}

export interface BlastGraphLayout {
  nodes: GraphNode[];
  edges: GraphEdge[];
  width: number;
  height: number;
}

/**
 * Three columns: changed symbol → caller → endpoint/cron. The contract only
 * attributes endpoints per symbol group, so caller→endpoint edges link every
 * caller of a group to every endpoint of that group ("may depend on").
 */
export function buildBlastGraph(
  blast: BlastRadius,
  repoFullName?: string | null,
  headSha?: string | null,
): BlastGraphLayout {
  const kinds = symbolKinds(blast);
  type Pending = Omit<GraphNode, "x" | "y">;
  const symbols: Pending[] = [];
  const callers: Pending[] = [];
  const targets: Pending[] = [];
  const seen = new Set<string>();
  const edgeKeys = new Set<string>();
  const edges: GraphEdge[] = [];

  const addNode = (col: Pending[], node: Pending) => {
    if (seen.has(node.id)) return;
    seen.add(node.id);
    col.push(node);
  };
  const addEdge = (from: string, to: string) => {
    const key = `${from}→${to}`;
    if (edgeKeys.has(key)) return;
    edgeKeys.add(key);
    edges.push({ from, to });
  };

  for (const d of blast.downstream) {
    const symbolId = `s:${d.symbol}`;
    const symbolText = symbolLabel(d.symbol, kinds.get(d.symbol));
    addNode(symbols, { id: symbolId, kind: "symbol", label: truncate(symbolText, GRAPH.labelMax), title: symbolText });

    const targetIds = [
      ...d.endpoints_affected.map((e) => {
        addNode(targets, { id: `e:${e}`, kind: "endpoint", label: truncate(e, GRAPH.labelMax), title: e });
        return `e:${e}`;
      }),
      ...d.crons_affected.map((c) => {
        addNode(targets, { id: `c:${c}`, kind: "cron", label: truncate(c, GRAPH.labelMax), title: c });
        return `c:${c}`;
      }),
    ];

    for (const c of d.callers) {
      const callerId = `f:${c.file}:${c.name}`;
      const name = c.name || (c.file.split("/").pop() ?? c.file);
      addNode(callers, {
        id: callerId,
        kind: "caller",
        label: truncate(name, GRAPH.labelMax),
        title: `${name} — ${c.file}:${c.line}`,
        href: callerHref(repoFullName, headSha, c.file, c.line),
      });
      addEdge(symbolId, callerId);
      targetIds.forEach((t) => addEdge(callerId, t));
    }
  }

  const [x0, x1, x2] = GRAPH.columnCenters;
  const columns: Array<[Pending[], number]> = [
    [symbols, x0],
    [callers, x1],
    [targets, x2],
  ];
  const rows = Math.max(1, symbols.length, callers.length, targets.length);
  const height = rows * GRAPH.rowPitch + GRAPH.padY * 2;
  const nodes = columns.flatMap(([col, x]) => {
    const offset = ((rows - col.length) * GRAPH.rowPitch) / 2;
    return col.map((n, row) => ({
      ...n,
      x,
      y: GRAPH.padY + offset + row * GRAPH.rowPitch + GRAPH.rowPitch / 2,
    }));
  });

  return { nodes, edges, width: GRAPH.width, height };
}
