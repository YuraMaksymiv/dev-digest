/* SkillRailCard — one row of the /skills rail: type tile, name, the global
   enable switch, directive description, type + source, and how many agents
   link it. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Badge, Icon, IconBtn, Toggle } from "@devdigest/ui";
import type { SkillSummary } from "@devdigest/shared";
import { SOURCE_ICONS, TYPE_COLORS } from "../../../../constants";
import { s } from "./styles";

export function SkillRailCard({
  skill,
  active,
  onClick,
  onToggle,
  toggling,
  onDelete,
}: {
  skill: SkillSummary;
  active?: boolean;
  onClick?: () => void;
  /** Flips the skill's GLOBAL switch — omit to render the card read-only. */
  onToggle?: (enabled: boolean) => void;
  toggling?: boolean;
  /** Asks the rail to confirm a delete — omit to render the card read-only. */
  onDelete?: () => void;
}) {
  const t = useTranslations("skills");
  const color = TYPE_COLORS[skill.type];
  const SourceIcon = Icon[SOURCE_ICONS[skill.source]];

  return (
    <div onClick={onClick} style={s.card(!!active, skill.enabled)}>
      <div style={s.headerRow}>
        <span style={s.tile(color)}>
          <Icon.Sparkles size={14} />
        </span>
        <span className="mono" style={s.name}>
          {skill.name}
        </span>
        {onToggle && (
          // The switch must not open the editor underneath it.
          <span
            onClick={(e) => e.stopPropagation()}
            role="group"
            aria-label={t("listItem.toggleAria", { name: skill.name })}
          >
            <Toggle
              on={skill.enabled}
              onChange={(v) => !toggling && onToggle(v)}
              size={14}
            />
          </span>
        )}
        {onDelete && (
          // Deleting from the rail is what makes the action findable at all —
          // the editor's own Delete sits below the fold of the Config tab.
          <span onClick={(e) => e.stopPropagation()}>
            <IconBtn
              icon="Trash"
              size={24}
              danger
              label={t("listItem.deleteAria", { name: skill.name })}
              onClick={onDelete}
            />
          </span>
        )}
      </div>
      <div style={s.description}>{skill.description}</div>
      <div style={s.metaRow}>
        <Badge color={color}>{t(`listItem.type.${skill.type}`)}</Badge>
        <span style={s.source}>
          <SourceIcon size={11} />
          {t(`listItem.source.${skill.source}`)}
        </span>
        <span style={s.usage}>
          {skill.used_by > 0 ? t("page.usedBy", { count: skill.used_by }) : t("page.unused")}
        </span>
      </div>
    </div>
  );
}
