/* SerializesAs — what the model receives: the attached docs grouped under
   Specifications / Docs / Insights, numbered in prompt order with per-group
   token subtotals. Missing docs and empty groups are left out. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { groupSerialized, type DocRowState } from "./helpers";
import { s } from "./styles";

export function SerializesAs({ rows, kind }: { rows: DocRowState[]; kind: "agent" | "skill" }) {
  const t = useTranslations("projectContext");
  const groups = groupSerialized(rows);
  if (groups.length === 0) return null;
  return (
    <section style={s.serializes} aria-label={t("serializes.title")}>
      <div style={s.serializesTitle}>{t("serializes.title")}</div>
      {groups.map((g) => (
        <div key={g.group} style={s.serializesGroup} data-testid={`serializes-${g.group}`}>
          <div style={s.serializesHead}>
            <span>{t(`serializes.group.${g.group}`)}</span>
            <span className="mono" style={{ fontWeight: 400, color: "var(--text-muted)" }}>
              {t("serializes.subtotal", { count: g.tokens })}
            </span>
          </div>
          {g.entries.map((e) => (
            <div key={e.path} style={s.serializesRow}>
              <span className="mono" style={s.serializesOrder}>
                {e.order}
              </span>
              <span className="mono">{e.path}</span>
              <span style={{ flex: 1 }} />
              <span className="mono" style={{ color: "var(--text-muted)" }}>
                {t("serializes.tokens", { count: e.tokens })}
              </span>
            </div>
          ))}
        </div>
      ))}
      <p style={s.serializesNote}>{t(kind === "agent" ? "serializes.noteAgent" : "serializes.noteSkill")}</p>
    </section>
  );
}
