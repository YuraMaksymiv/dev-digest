/* BlastRadius — what a PR's changed symbols reach downstream (callers, endpoints,
   crons). Fetches its own data via useBlastRadius, like IntentCard. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { useQueryClient } from "@tanstack/react-query";
import { Icon, Button, EmptyState, ErrorState, Skeleton } from "@devdigest/ui";
import { blastRadiusKey, useBlastRadius } from "@/lib/hooks/blast";
import { useRepoIntelStatus, useResyncRepoIntel } from "@/lib/hooks/repo-intel";
import { blastStats } from "./helpers";
import { BLAST_VIEWS, STAT_ICON, STAT_KEYS, type BlastView } from "./constants";
import { BlastTree } from "./_components/BlastTree";
import { BlastGraph } from "./_components/BlastGraph";
import { s } from "./styles";

interface BlastRadiusProps {
  prId: string | null;
  repoId: string | null;
  repoFullName?: string | null;
  headSha?: string | null;
}

export function BlastRadius({ prId, repoId, repoFullName, headSha }: BlastRadiusProps) {
  const t = useTranslations("blast");
  const qc = useQueryClient();
  const { data: blast, isLoading, isError, refetch } = useBlastRadius(prId);
  const resync = useResyncRepoIntel(repoId);
  const [view, setView] = React.useState<BlastView>("tree");

  // A resync is async (202): the index row's updatedAt advancing is the completion signal.
  const [baseline, setBaseline] = React.useState<string | null>(null);
  const resyncing = baseline !== null;
  const { data: indexState } = useRepoIntelStatus(repoId, resyncing);
  React.useEffect(() => {
    if (baseline !== null && indexState && indexState.updatedAt !== baseline) {
      setBaseline(null);
      qc.invalidateQueries({ queryKey: blastRadiusKey(prId) });
    }
  }, [baseline, indexState, prId, qc]);

  const startResync = () => {
    setBaseline(indexState?.updatedAt ?? "");
    resync.mutate(undefined, { onError: () => setBaseline(null) });
  };

  if (isLoading) {
    return (
      <div style={s.wrap}>
        <Skeleton height={14} width={140} style={{ marginBottom: 14 }} />
        <Skeleton height={28} style={{ marginBottom: 16 }} />
        <Skeleton height={70} />
      </div>
    );
  }

  if (isError || !blast) {
    return (
      <div style={s.wrap}>
        <ErrorState title={t("loadError")} onRetry={() => refetch()} />
      </div>
    );
  }

  const stats = blastStats(blast);
  const hasCallers = blast.downstream.length > 0;
  const showEmpty = !blast.degraded && stats.symbols === 0;

  return (
    <section style={s.wrap}>
      <div style={s.headerRow}>
        <Icon.Workflow size={14} style={s.headerIcon} />
        <span style={s.headerLabel}>{t("title")}</span>
      </div>

      {blast.degraded && (
        <div style={s.notice} role="status">
          <Icon.AlertTriangle size={14} style={{ flexShrink: 0, marginTop: 2 }} />
          <div style={s.noticeBody}>
            <div style={s.noticeTitle}>{t("degraded.title")}</div>
            <div>{t(`degraded.hint.${blast.reason ?? "no_data"}`)}</div>
            {hasCallers && <div>{t("degraded.bestEffort")}</div>}
          </div>
          {repoId && (
            <Button
              kind="ghost"
              size="sm"
              icon="RefreshCw"
              loading={resyncing}
              onClick={startResync}
            >
              {resyncing ? t("degraded.resyncing") : t("degraded.resync")}
            </Button>
          )}
        </div>
      )}

      {showEmpty ? (
        <EmptyState icon="Workflow" title={t("empty.title")} body={t("empty.body")} />
      ) : (
        <>
          <div style={s.statsRow}>
            <div style={s.stats}>
              {STAT_KEYS.map((key) => {
                const I = Icon[STAT_ICON[key]];
                return (
                  <span key={key} style={s.stat}>
                    <I size={14} style={s.statIcon} />
                    <span style={s.statValue}>{stats[key]}</span>
                    <span>{t(`stat.${key}`)}</span>
                  </span>
                );
              })}
            </div>
            {hasCallers && (
              <div role="group" aria-label={t("view.label")} style={s.toggle}>
                {BLAST_VIEWS.map((v) => (
                  <button
                    key={v}
                    type="button"
                    aria-pressed={view === v}
                    onClick={() => setView(v)}
                    style={{ ...s.toggleBtn, ...(view === v ? s.toggleBtnOn : null) }}
                  >
                    {t(`view.${v}`)}
                  </button>
                ))}
              </div>
            )}
          </div>

          {!hasCallers ? (
            <p style={s.muted}>{t("noDownstream", { count: stats.symbols })}</p>
          ) : view === "tree" ? (
            <BlastTree blast={blast} repoFullName={repoFullName} headSha={headSha} />
          ) : (
            <BlastGraph blast={blast} repoFullName={repoFullName} headSha={headSha} />
          )}
        </>
      )}
    </section>
  );
}
