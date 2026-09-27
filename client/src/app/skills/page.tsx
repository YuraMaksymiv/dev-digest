/* Route: /skills — the Skills lab. Rail on the left, a prompt to pick one on
   the right. Selecting a skill routes to /skills/[id], which renders the same
   rail beside the editor. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { EmptyState } from "@devdigest/ui";
import { AppShell } from "../../components/app-shell";
import { SkillsRail } from "./_components/SkillsRail";
import { DEFAULT_TAB } from "./constants";
import { s } from "./styles";

export default function SkillsPage() {
  const t = useTranslations("skills");
  const crumb = [{ label: t("page.crumbLab") }, { label: t("page.crumbSkills") }];

  return (
    <AppShell crumb={crumb}>
      <div style={s.split}>
        <SkillsRail tab={DEFAULT_TAB} />
        <div style={s.placeholder}>
          <EmptyState
            icon="Sparkles"
            title={t("page.selectPrompt.title")}
            body={t("page.selectPrompt.body")}
          />
        </div>
      </div>
    </AppShell>
  );
}
