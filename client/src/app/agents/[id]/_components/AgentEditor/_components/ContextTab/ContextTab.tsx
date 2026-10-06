/* ContextTab — the repo docs attached to this agent (a Project context block
   in every run). The picker owns the repo choice, order and persistence. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import type { Agent } from "@devdigest/shared";
import { ContextDocPicker } from "@/components/context-doc-picker";

export function ContextTab({ agent }: { agent: Agent }) {
  const t = useTranslations("projectContext");
  return (
    <ContextDocPicker
      kind="agent"
      ownerId={agent.id}
      title={t("agentTab.title")}
      hint={t("agentTab.hint")}
    />
  );
}
