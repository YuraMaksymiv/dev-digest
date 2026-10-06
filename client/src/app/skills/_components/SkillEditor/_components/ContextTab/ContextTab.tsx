/* ContextTab — the repo docs attached to this skill. Any agent using the skill
   inherits them; the grouped Serializes-as view shows how they reach the prompt. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import type { Skill } from "@devdigest/shared";
import { ContextDocPicker } from "@/components/context-doc-picker";

export function ContextTab({ skill }: { skill: Skill }) {
  const t = useTranslations("projectContext");
  return (
    <ContextDocPicker
      kind="skill"
      ownerId={skill.id}
      title={t("skillTab.title")}
      hint={t("skillTab.inherit")}
    />
  );
}
