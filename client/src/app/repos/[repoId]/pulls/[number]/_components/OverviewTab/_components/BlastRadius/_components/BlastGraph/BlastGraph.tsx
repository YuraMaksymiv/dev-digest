"use client";

import React from "react";
import { useTranslations } from "next-intl";
import type { BlastRadius } from "@devdigest/shared";
import { buildBlastGraph, type GraphNode, type GraphNodeKind } from "../../helpers";
import { GRAPH } from "../../constants";
import { NODE_COLOR, s } from "./styles";

interface BlastGraphProps {
  blast: BlastRadius;
  repoFullName?: string | null;
  headSha?: string | null;
}

const LEGEND: GraphNodeKind[] = ["symbol", "caller", "endpoint", "cron"];
const LEGEND_KEY: Record<GraphNodeKind, string> = {
  symbol: "symbol",
  caller: "callers",
  endpoint: "endpoints",
  cron: "crons",
};

function Node({ node }: { node: GraphNode }) {
  const x = node.x - GRAPH.nodeWidth / 2;
  const y = node.y - GRAPH.nodeHeight / 2;
  const box = (
    <g>
      <title>{node.title}</title>
      <rect
        x={x}
        y={y}
        width={GRAPH.nodeWidth}
        height={GRAPH.nodeHeight}
        rx={7}
        style={{ fill: "var(--bg-elevated)", stroke: NODE_COLOR[node.kind], strokeWidth: 1.5 }}
      />
      <text className="mono" x={node.x} y={node.y} style={s.nodeText} textAnchor="middle" dominantBaseline="central">
        {node.label}
      </text>
    </g>
  );
  return node.href ? (
    <a href={node.href} target="_blank" rel="noopener noreferrer" aria-label={node.title}>
      {box}
    </a>
  ) : (
    box
  );
}

export function BlastGraph({ blast, repoFullName, headSha }: BlastGraphProps) {
  const t = useTranslations("blast");
  const layout = React.useMemo(() => buildBlastGraph(blast, repoFullName, headSha), [blast, repoFullName, headSha]);
  const byId = new Map(layout.nodes.map((n) => [n.id, n]));
  const kinds = new Set(layout.nodes.map((n) => n.kind));

  if (layout.nodes.length === 0) {
    return <p style={s.empty}>{t("graph.empty")}</p>;
  }

  return (
    <div>
      <svg
        role="img"
        aria-label={t("graph.ariaLabel")}
        viewBox={`0 0 ${layout.width} ${layout.height}`}
        style={s.svg}
      >
        {layout.edges.map((e) => {
          const a = byId.get(e.from);
          const b = byId.get(e.to);
          if (!a || !b) return null;
          const x1 = a.x + GRAPH.nodeWidth / 2;
          const x2 = b.x - GRAPH.nodeWidth / 2;
          const mx = (x1 + x2) / 2;
          return (
            <path
              key={`${e.from}→${e.to}`}
              d={`M ${x1} ${a.y} C ${mx} ${a.y}, ${mx} ${b.y}, ${x2} ${b.y}`}
              style={s.edge}
            />
          );
        })}
        {layout.nodes.map((n) => (
          <Node key={n.id} node={n} />
        ))}
      </svg>
      <div style={s.legend}>
        {LEGEND.filter((k) => kinds.has(k)).map((k) => (
          <span key={k} style={s.legendItem}>
            <span style={{ ...s.dot, background: NODE_COLOR[k] }} />
            {t(`graph.legend.${LEGEND_KEY[k]}`)}
          </span>
        ))}
      </div>
    </div>
  );
}
