/* PrBrief — the PR's Why + Risk Brief (summary, risk areas, review focus).
   Generation costs a model call, so it only ever starts from a click; the
   click-time ref guard stops a second request before the pending re-render
   commits. All model text is rendered as plain text. */
"use client";

import React from "react";
import { useParams, useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Icon, Button, EmptyState, Skeleton } from "@devdigest/ui";
import { useBrief, useGenerateBrief } from "@/lib/hooks/brief";
import { formatCost } from "@/lib/format-cost";
import { SEVERITY_COLOR } from "./constants";
import { diffHref } from "./helpers";
import { s } from "./styles";

export function PrBrief({ prId }: { prId: string | null }) {
  const t = useTranslations("brief");
  const router = useRouter();
  const params = useParams<{ repoId: string; number: string }>();
  const { data: brief, isLoading, isError, refetch } = useBrief(prId);
  const generate = useGenerateBrief(prId);
  const inFlight = React.useRef(false);

  const run = async () => {
    if (inFlight.current) return;
    inFlight.current = true;
    try {
      await generate.mutateAsync();
    } catch {
      // surfaced through generate.isError
    } finally {
      inFlight.current = false;
    }
  };

  const header = (right?: React.ReactNode) => (
    <div style={s.headerRow}>
      <Icon.Sparkles size={14} style={s.headerIcon} />
      <span style={s.headerLabel}>{t("prBrief.title")}</span>
      {right && <div style={s.headerRight}>{right}</div>}
    </div>
  );

  const errorRow = generate.isError && (
    <div style={s.errorRow} role="alert">
      <Icon.AlertTriangle size={14} style={s.iconNoShrink} />
      <span>{t("prBrief.error")}</span>
      <Button kind="ghost" size="sm" onClick={run}>
        {t("prBrief.retry")}
      </Button>
    </div>
  );

  if (isLoading || (generate.isPending && !brief)) {
    return (
      <div style={s.wrap} aria-busy="true">
        {header()}
        <Skeleton height={40} style={s.skeletonGap} />
        <Skeleton height={70} />
      </div>
    );
  }

  if (isError && !brief) {
    return (
      <div style={s.wrap}>
        {header()}
        <div style={s.errorRow} role="alert">
          <Icon.AlertTriangle size={14} style={s.iconNoShrink} />
          <span>{t("prBrief.loadError")}</span>
          <Button kind="ghost" size="sm" onClick={() => refetch()}>
            {t("prBrief.retry")}
          </Button>
        </div>
      </div>
    );
  }

  if (!brief) {
    return (
      <div style={s.wrap}>
        {errorRow}
        <EmptyState
          icon="Sparkles"
          title={t("prBrief.emptyTitle")}
          body={t("prBrief.emptyBody")}
          cta={t("prBrief.generate")}
          onCta={run}
          ctaLoading={generate.isPending}
        />
      </div>
    );
  }

  const open = (file: string) => router.push(diffHref(params.repoId, params.number, file));

  return (
    <section style={s.wrap}>
      {header(
        <>
          <span style={s.costChip}>{t("prBrief.cost", { cost: formatCost(brief.cost_usd) })}</span>
          <Button
            kind="ghost"
            size="sm"
            icon="RefreshCw"
            loading={generate.isPending}
            onClick={run}
          >
            {generate.isPending ? t("prBrief.refreshing") : t("prBrief.refresh")}
          </Button>
        </>,
      )}

      {brief.stale && (
        <div style={s.banner} role="status">
          <Icon.AlertTriangle size={14} style={s.bannerIcon} />
          <span>{t("prBrief.stale")}</span>
        </div>
      )}
      {errorRow}

      <div style={s.section}>
        <div style={s.sectionLabel}>{t("prBrief.summaryLabel")}</div>
        <p style={s.summary}>{brief.summary}</p>
      </div>

      <div style={s.section}>
        <div style={s.sectionLabel}>{t("prBrief.risksLabel")}</div>
        {brief.risks.length === 0 ? (
          <div style={s.muted}>{t("prBrief.noRisks")}</div>
        ) : (
          <ul style={s.list}>
            {brief.risks.map((r, i) => {
              const c = SEVERITY_COLOR[r.severity];
              return (
                <li key={i} style={s.riskItem}>
                  <div style={s.riskHead}>
                    <span
                      style={{
                        ...s.chip,
                        background: c.bg,
                        color: c.fg,
                        fontWeight: 600,
                      }}
                    >
                      {t(`prBrief.severity.${r.severity}`)}
                    </span>
                    <span style={s.riskTitle}>{r.title}</span>
                  </div>
                  <div style={s.riskText}>{r.explanation}</div>
                  {r.file_refs.length > 0 && (
                    <div style={s.fileRefs}>
                      {r.file_refs.map((f) => (
                        <span key={f} className="mono" style={s.fileRef}>
                          {f}
                        </span>
                      ))}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <div style={s.section}>
        <div style={s.sectionLabel}>{t("prBrief.focusLabel")}</div>
        {brief.review_focus.length === 0 ? (
          <div style={s.muted}>{t("prBrief.noFocus")}</div>
        ) : (
          <ul style={s.list}>
            {brief.review_focus.map((f, i) => (
              <li key={i}>
                <button
                  type="button"
                  style={s.focusBtn}
                  aria-label={
                    f.line != null
                      ? t("prBrief.focusOpenAriaLine", { file: f.file, line: f.line })
                      : t("prBrief.focusOpenAria", { file: f.file })
                  }
                  onClick={() => open(f.file)}
                >
                  <span className="mono" style={s.focusFile}>
                    {f.line != null ? `${f.file}:${f.line}` : f.file}
                  </span>
                  <span style={s.focusReason}>{f.reason}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {brief.missing_inputs.length > 0 && (
        <div style={s.chips}>
          <span style={s.costChip}>{t("prBrief.missingLabel")}</span>
          {brief.missing_inputs.map((m) => (
            <span key={m} style={s.chip}>
              {t(`prBrief.missing.${m}`)}
            </span>
          ))}
        </div>
      )}
    </section>
  );
}
