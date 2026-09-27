/* PreviewTab — the body exactly as the agent receives it. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Card, Markdown } from "@devdigest/ui";
import type { Skill } from "@devdigest/shared";

export function PreviewTab({ skill }: { skill: Skill }) {
  const t = useTranslations("skills");
  return (
    <div style={{ padding: "20px 28px 40px", maxWidth: 940 }}>
      <p style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 14 }}>
        {t("editor.previewNotice")}
      </p>
      <Card>
        <div style={{ padding: "4px 4px 8px" }}>
          <div className="mono" style={{ fontSize: 13, fontWeight: 600, marginBottom: 10 }}>
            ### {skill.name}
          </div>
          <Markdown>{skill.body}</Markdown>
        </div>
      </Card>
    </div>
  );
}
