/* VersionsTab — the skill's append-only body history.

   Restore writes FORWARD: it saves the old body as a new version rather than
   rewinding the chain, so an eval run that scored v7 still points at the exact
   text it scored. That is why the button reads "Restore" but the result is
   "v13, same body as v7". */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Badge, Button, ErrorState, Skeleton } from "@devdigest/ui";
import type { Skill, SkillVersion } from "@devdigest/shared";
import { collapseUnchanged, diffLines, diffStat } from "@/lib/text-diff";
import { useSkillVersions, useUpdateSkill } from "../../../../../../lib/hooks/skills";
import { useToast } from "../../../../../../lib/toast";
import { firstLine } from "../../../../helpers";
import { s } from "./styles";

/** Renders one version's changes against the version before it. */
function VersionDiff({ before, after }: { before: string; after: string }) {
  const t = useTranslations("skills");
  const lines = React.useMemo(() => diffLines(before, after), [before, after]);
  const rows = React.useMemo(() => collapseUnchanged(lines), [lines]);

  if (lines.every((l) => l.kind === "ctx")) {
    return (
      <div style={s.diffPane}>
        <div style={s.identical}>{t("versions.identical")}</div>
      </div>
    );
  }

  return (
    <div style={s.diffPane}>
      {rows.map((r, i) => {
        if (r.kind === "gap") {
          return (
            <div key={`gap-${i}`} style={s.gap}>
              {t("versions.unchangedLines", { count: r.count })}
            </div>
          );
        }
        const [bg, color, sign] =
          r.kind === "add"
            ? ["var(--ok-bg)", "var(--text-primary)", "+"]
            : r.kind === "del"
              ? ["var(--crit-bg)", "var(--text-primary)", "−"]
              : ["transparent", "var(--text-secondary)", " "];
        return (
          <div key={i} style={s.diffLine(bg, color)}>
            <span style={s.gutter}>{r.newLine ?? r.oldLine}</span>
            <span style={s.sign}>{sign}</span>
            <span>{r.text || " "}</span>
          </div>
        );
      })}
    </div>
  );
}

export function VersionsTab({ skill }: { skill: Skill }) {
  const t = useTranslations("skills");
  const toast = useToast();
  const { data: versions, isLoading, isError, refetch } = useSkillVersions(skill.id);
  const update = useUpdateSkill();
  const [open, setOpen] = React.useState<number | null>(null);

  if (isLoading) {
    return (
      <div style={s.wrap}>
        <Skeleton height={140} />
      </div>
    );
  }
  if (isError) {
    return (
      <div style={s.wrap}>
        <ErrorState body={t("versions.loadError")} onRetry={() => refetch()} />
      </div>
    );
  }
  if (!versions || versions.length === 0) {
    return <div style={{ ...s.wrap, color: "var(--text-muted)" }}>{t("versions.empty")}</div>;
  }

  // Newest first from the API; the previous version is therefore the NEXT row.
  const previousOf = (index: number): SkillVersion | undefined => versions[index + 1];

  const restore = (v: SkillVersion) =>
    update.mutate(
      { id: skill.id, patch: { body: v.body } },
      {
        onSuccess: (data) =>
          toast.success(t("versions.restoredToast", { from: v.version, version: data.version })),
      },
    );

  return (
    <div style={s.wrap}>
      <p style={s.hint}>{t("versions.hint")}</p>
      {versions.map((v, index) => {
        const current = v.version === skill.version;
        const prev = previousOf(index);
        const stat = diffStat(diffLines(prev?.body ?? "", v.body));
        return (
          <div key={v.version}>
            <div style={s.row(current)}>
              <span className="mono" style={s.version(current)}>
                v{v.version}
              </span>
              <div style={s.summary}>
                <div style={s.note}>{firstLine(v.body)}</div>
                <div style={s.date}>{new Date(v.created_at).toLocaleString()}</div>
              </div>
              {prev && (
                <>
                  <span style={s.stat("var(--ok)")}>+{stat.added}</span>
                  <span style={s.stat("var(--crit)")}>−{stat.removed}</span>
                </>
              )}
              {current && <Badge color="var(--ok)">{t("versions.current")}</Badge>}
              <div style={s.actions}>
                <Button
                  kind="ghost"
                  size="sm"
                  icon="Eye"
                  active={open === v.version}
                  aria-label={t("versions.diffAria", { version: v.version })}
                  onClick={() => setOpen(open === v.version ? null : v.version)}
                >
                  {t("versions.diff")}
                </Button>
                {!current && (
                  <Button
                    kind="secondary"
                    size="sm"
                    icon="History"
                    disabled={update.isPending}
                    aria-label={t("versions.restoreAria", { version: v.version })}
                    onClick={() => restore(v)}
                  >
                    {t("versions.restore")}
                  </Button>
                )}
              </div>
            </div>
            {open === v.version && (
              <VersionDiff before={prev?.body ?? ""} after={v.body} />
            )}
          </div>
        );
      })}
    </div>
  );
}
