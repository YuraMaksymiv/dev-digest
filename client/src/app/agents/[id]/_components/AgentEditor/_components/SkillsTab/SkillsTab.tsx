/* SkillsTab — which of the workspace's skills this agent uses, and in what
   order. Every skill is a row; the checkbox is the PER-AGENT switch, so muting
   one here leaves it untouched for every other agent. Order is the order the
   blocks appear in the assembled prompt. */
"use client";

import React from "react";
import {
  Badge,
  Checkbox,
  ErrorState,
  Icon,
  IconBtn,
  Skeleton,
  TextInput,
} from "@devdigest/ui";
import { useTranslations } from "next-intl";
import type { Agent } from "@devdigest/shared";
import { useAgentSkills, useSetAgentSkills, useSkills } from "../../../../../../../lib/hooks/skills";
import { useToast } from "../../../../../../../lib/toast";
import {
  buildRows,
  countEnabled,
  filterRows,
  moveRow,
  toggleRow,
  toPayload,
  type SkillRowState,
} from "./helpers";
import { TYPE_COLORS } from "./constants";
import { s } from "./styles";

export function SkillsTab({ agent }: { agent: Agent }) {
  const t = useTranslations("agents");
  const toast = useToast();
  const all = useSkills();
  const linked = useAgentSkills(agent.id);
  const setSkills = useSetAgentSkills();

  const [rows, setRows] = React.useState<SkillRowState[]>([]);
  const [query, setQuery] = React.useState("");
  const [dragIndex, setDragIndex] = React.useState<number | null>(null);
  const [dragOver, setDragOver] = React.useState<number | null>(null);

  // Rebuild from the server whenever either side settles (including after a
  // save invalidates them). Local `rows` is the optimism in between.
  React.useEffect(() => {
    if (all.data && linked.data) setRows(buildRows(all.data, linked.data));
  }, [all.data, linked.data]);

  const persist = (next: SkillRowState[]) => {
    setRows(next);
    setSkills.mutate(
      { agentId: agent.id, skills: toPayload(next) },
      { onError: () => toast.error(t("skills.saveError")) },
    );
  };

  const commitMove = (from: number, to: number) => persist(moveRow(rows, from, to));

  if (all.isLoading || linked.isLoading) {
    return (
      <div style={s.wrap}>
        <Skeleton height={44} />
        <Skeleton height={44} />
        <Skeleton height={44} />
      </div>
    );
  }
  if (all.isError || linked.isError) {
    return (
      <div style={s.wrap}>
        <ErrorState
          body={t("skills.loadError")}
          onRetry={() => {
            all.refetch();
            linked.refetch();
          }}
        />
      </div>
    );
  }

  // Reordering past hidden neighbours would move a row somewhere the user
  // cannot see, so it is disabled while the filter is narrowing the list.
  const reorderable = query.trim() === "";
  const visible = filterRows(rows, query);

  return (
    <div style={s.wrap}>
      <div style={s.headerRow}>
        <h2 style={s.h2}>{t("skills.title")}</h2>
        <Badge color="var(--accent)">
          {t("skills.enabledCount", { linked: countEnabled(rows), total: rows.length })}
        </Badge>
        <div style={s.filter}>
          <TextInput value={query} onChange={setQuery} placeholder={t("skills.filterPlaceholder")} />
        </div>
      </div>
      <p style={s.hint}>{t("skills.orderHint")}</p>

      {rows.length === 0 && <p style={s.globalHint}>{t("skills.emptyBody")}</p>}

      {visible.map((row) => {
        const index = rows.findIndex((r) => r.id === row.id);
        const struck = !row.globallyEnabled;
        return (
          <div
            key={row.id}
            draggable={reorderable}
            onDragStart={() => setDragIndex(index)}
            onDragOver={(e) => {
              // Without preventDefault the drop event never fires.
              e.preventDefault();
              setDragOver(index);
            }}
            onDragLeave={() => setDragOver((i) => (i === index ? null : i))}
            onDrop={() => {
              if (dragIndex !== null) commitMove(dragIndex, index);
              setDragIndex(null);
              setDragOver(null);
            }}
            onDragEnd={() => {
              setDragIndex(null);
              setDragOver(null);
            }}
            style={s.row(row.enabled && row.globallyEnabled, dragOver === index)}
          >
            {reorderable && (
              <span style={s.handle} aria-hidden>
                <Icon.Menu size={14} />
              </span>
            )}
            <Checkbox
              checked={row.enabled}
              onChange={
                struck ? undefined : (v) => persist(toggleRow(rows, row.id, v))
              }
            />
            <span className="mono" style={s.name(struck)}>
              {row.name}
            </span>
            {struck && <span style={s.globalHint}>{t("skills.disabledGlobally")}</span>}
            <span style={s.spacer} />
            {reorderable && (
              <span style={s.arrows}>
                <IconBtn
                  icon="ArrowUp"
                  size={24}
                  label={t("skills.moveUp", { name: row.name })}
                  onClick={() => commitMove(index, index - 1)}
                />
                <IconBtn
                  icon="ArrowDown"
                  size={24}
                  label={t("skills.moveDown", { name: row.name })}
                  onClick={() => commitMove(index, index + 1)}
                />
              </span>
            )}
            <Badge color={TYPE_COLORS[row.type]}>{t(`skills.type.${row.type}`)}</Badge>
          </div>
        );
      })}

      <div style={s.footer}>
        {setSkills.isPending ? t("skills.saving") : rows.length > 0 ? t("skills.autoSaved") : ""}
      </div>
    </div>
  );
}
