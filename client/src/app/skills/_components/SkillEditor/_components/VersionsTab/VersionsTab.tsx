/* VersionsTab — the skill's append-only body history. Read-only: restoring an
   old body is its own increment (it has to write forward, not rewind). */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Badge, Card, ErrorState, Skeleton, Markdown } from "@devdigest/ui";
import type { Skill } from "@devdigest/shared";
import { useSkillVersions } from "../../../../../../lib/hooks/skills";
import { firstLine } from "../../../../helpers";

export function VersionsTab({ skill }: { skill: Skill }) {
  const t = useTranslations("skills");
  const { data: versions, isLoading, isError, refetch } = useSkillVersions(skill.id);
  const [open, setOpen] = React.useState<number | null>(null);

  if (isLoading) return <div style={{ padding: 28 }}><Skeleton height={140} /></div>;
  if (isError) {
    return (
      <div style={{ padding: 28 }}>
        <ErrorState body={t("versions.loadError")} onRetry={() => refetch()} />
      </div>
    );
  }
  if (!versions || versions.length === 0) {
    return <div style={{ padding: 28, color: "var(--text-muted)" }}>{t("versions.empty")}</div>;
  }

  return (
    <div style={{ padding: "20px 28px 40px", maxWidth: 940 }}>
      <p style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 14 }}>
        {t("versions.hint")}
      </p>
      {versions.map((v) => (
        <div key={v.version} style={{ marginBottom: 10 }}>
          <Card>
            <button
              onClick={() => setOpen(open === v.version ? null : v.version)}
              aria-label={`v${v.version}`}
              aria-expanded={open === v.version}
              style={{
                width: "100%",
                display: "flex",
                alignItems: "center",
                gap: 10,
                background: "none",
                border: "none",
                padding: 4,
                cursor: "pointer",
                textAlign: "left",
                color: "var(--text-primary)",
              }}
            >
              <span className="mono" style={{ fontSize: 13, fontWeight: 600 }}>
                v{v.version}
              </span>
              {v.version === skill.version && (
                <Badge color="var(--accent)">{t("versions.current")}</Badge>
              )}
              <span style={{ fontSize: 12, color: "var(--text-secondary)", flex: 1 }}>
                {firstLine(v.body)}
              </span>
              <span style={{ fontSize: 11, color: "var(--text-muted)" }}>
                {new Date(v.created_at).toLocaleString()}
              </span>
            </button>
            {open === v.version && (
              <div style={{ padding: "10px 4px 4px", borderTop: "1px solid var(--border)" }}>
                <Markdown>{v.body}</Markdown>
              </div>
            )}
          </Card>
        </div>
      ))}
    </div>
  );
}
