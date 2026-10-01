/* BlastRadius — what a PR's changed symbols reach downstream (callers, endpoints,
   crons). Fetches its own data via useBlastRadius, like IntentCard. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { useQueryClient } from "@tanstack/react-query";
import { Icon, Badge, Button, EmptyState, ErrorState, MonoLink, Skeleton } from "@devdigest/ui";
import { blastRadiusKey, useBlastRadius } from "@/lib/hooks/blast";
import { useRepoIntelStatus, useResyncRepoIntel } from "@/lib/hooks/repo-intel";
import { blastStats, callerHref } from "./helpers";
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
        <Icon.Zap size={14} style={s.headerIcon} />
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
        <EmptyState icon="Zap" title={t("empty.title")} body={t("empty.body")} />
      ) : (
        <>
          <div style={s.stats}>
            {(["symbols", "callers", "endpoints", "crons"] as const).map((key) => (
              <div key={key}>
                <span style={s.statValue}>{stats[key]}</span>
                <span style={s.statLabel}>{t(`stat.${key}`)}</span>
              </div>
            ))}
          </div>
          <p style={s.summary}>{blast.summary}</p>

          {blast.downstream.map((d) => (
            <div key={d.symbol} style={s.group}>
              <div style={s.groupHeader}>
                <span className="mono" style={s.symbol}>
                  {d.symbol}
                </span>
                <Badge>{t("callerCount", { count: d.callers.length })}</Badge>
              </div>
              <ul style={s.callerList}>
                {d.callers.map((c) => {
                  const href = callerHref(repoFullName, headSha, c.file, c.line);
                  const label = `${c.file}:${c.line}`;
                  return (
                    <li key={`${c.file}:${c.line}:${c.name}`} style={s.callerRow}>
                      <span className="mono">{c.name}</span>
                      {href ? (
                        <MonoLink href={href}>{label}</MonoLink>
                      ) : (
                        <span className="mono">{label}</span>
                      )}
                    </li>
                  );
                })}
              </ul>
              {(d.endpoints_affected.length > 0 || d.crons_affected.length > 0) && (
                <div style={s.chips}>
                  {d.endpoints_affected.map((e) => (
                    <Badge key={`e:${e}`} mono icon="Globe">
                      {e}
                    </Badge>
                  ))}
                  {d.crons_affected.map((c) => (
                    <Badge key={`c:${c}`} mono icon="Clock">
                      {c}
                    </Badge>
                  ))}
                </div>
              )}
            </div>
          ))}
        </>
      )}
    </section>
  );
}
