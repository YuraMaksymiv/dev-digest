/* SkillRailCard — one row of the /skills rail: name, directive description,
   type chip and how many agents link it. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Badge } from "@devdigest/ui";
import type { SkillSummary } from "@devdigest/shared";
import { TYPE_COLORS } from "../../../../constants";
import { s } from "./styles";

export function SkillRailCard({
  skill,
  active,
  onClick,
}: {
  skill: SkillSummary;
  active?: boolean;
  onClick?: () => void;
}) {
  const t = useTranslations("skills");
  return (
    <div onClick={onClick} style={s.card(!!active, skill.enabled)}>
      <div style={s.headerRow}>
        <span className="mono" style={s.name}>
          {skill.name}
        </span>
      </div>
      <div style={s.description}>{skill.description}</div>
      <div style={s.metaRow}>
        <Badge color={TYPE_COLORS[skill.type]}>{t(`listItem.type.${skill.type}`)}</Badge>
        {!skill.enabled && <Badge color="var(--text-muted)">{t("preview.disabled")}</Badge>}
        <span style={s.usage}>
          {skill.used_by > 0 ? t("page.usedBy", { count: skill.used_by }) : t("page.unused")}
        </span>
      </div>
    </div>
  );
}
