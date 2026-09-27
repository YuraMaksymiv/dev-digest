/* ConventionsView — the conventions triage screen. Scan the repo, accept or
   reject what the scan proposed, then merge the accepted set into a skill.

   The scan is a mutation, never a query: it costs a model call, so it fires on
   a click and nowhere else. */
"use client";

import React from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { Button, Chip, EmptyState, ErrorState, Skeleton } from "@devdigest/ui";
import type { ConventionSkillDraft } from "@devdigest/shared";
import { AppShell } from "@/components/app-shell";
import { RepoNotFound } from "@/components/repo-not-found";
import { ApiError } from "@/lib/api";
import {
  useConventionSkillDraft,
  useConventions,
  useDeleteConvention,
  useExtractConventions,
  usePatchConvention,
} from "@/lib/hooks/conventions";
import { useActiveRepo, useRepoNotFound } from "@/lib/repo-context";
import { DEFAULT_FILTER, STATUS_FILTERS, type StatusFilter } from "../../constants";
import { countByStatus, filterByStatus } from "../../helpers";
import { s } from "../../styles";
import { ConventionCard } from "../ConventionCard";
import { CreateSkillModal } from "../CreateSkillModal";

const SKELETON_CARDS = 3;

export function ConventionsView() {
  const t = useTranslations("conventions");
  const { repoId } = useParams<{ repoId: string }>();
  const search = useSearchParams();
  const router = useRouter();
  const { activeRepo } = useActiveRepo();
  const repoNotFound = useRepoNotFound(repoId);

  const { data, isLoading, isError, error, refetch } = useConventions(repoId);
  const extract = useExtractConventions();
  const patch = usePatchConvention();
  const remove = useDeleteConvention();
  const buildDraft = useConventionSkillDraft();
  const [draft, setDraft] = React.useState<ConventionSkillDraft | null>(null);

  // Two controls start a scan — the header button and the empty state's CTA —
  // and both are visible at once on a first visit. Each disables itself once
  // `isPending` renders, but a second click landing before that commit would
  // bill a second scan, so the guard is a ref read at CLICK time rather than
  // the pending flag captured at render time.
  const scanning = React.useRef(false);
  const runScan = () => {
    if (scanning.current) return;
    scanning.current = true;
    extract.mutate(repoId, {
      onSettled: () => {
        scanning.current = false;
      },
    });
  };

  // The filter belongs in the URL: a maintainer working through the pending
  // pile should be able to reload, or share the link, without losing it.
  const filter = (search.get("status") ?? DEFAULT_FILTER) as StatusFilter;
  const setFilter = (next: StatusFilter) => {
    const sp = new URLSearchParams(search.toString());
    sp.set("status", next);
    router.replace(`/repos/${repoId}/conventions?${sp.toString()}`);
  };

  const candidates = data ?? [];
  const counts = countByStatus(candidates);
  const shown = filterByStatus(candidates, filter);
  const repoName = activeRepo?.full_name ?? t("page.repoFallback");
  const shortName = activeRepo?.full_name?.split("/").pop() ?? repoName;
  const scan = extract.data;

  const crumb = [{ label: t("page.crumbLab") }, { label: t("page.crumbConventions") }];

  if (repoNotFound) {
    return (
      <AppShell crumb={crumb}>
        <RepoNotFound />
      </AppShell>
    );
  }

  return (
    <AppShell crumb={crumb}>
      <div style={s.page}>
        <div style={s.headerRow}>
          <div style={s.headerText}>
            <h1 style={s.h1}>
              {t("page.headingPrefix")}
              <span style={s.repoName}>{shortName}</span>
            </h1>
            <p style={s.subtitle}>{t("page.subtitle")}</p>
            {scan && (
              <p style={s.scanSummary}>
                {t("page.scanSummary", {
                  proposed: scan.proposed,
                  kept: scan.candidates.filter((c) => c.status === "pending").length,
                  ungrounded: scan.dropped_ungrounded,
                  duplicate: scan.dropped_duplicate,
                })}
              </p>
            )}
            {scan && (
              <p style={s.scanSummary}>
                {t("page.sampledFiles", {
                  count: scan.sampled_files.length,
                  model: scan.model,
                })}
              </p>
            )}
          </div>
          <Button
            kind="secondary"
            icon="RefreshCw"
            loading={extract.isPending}
            onClick={runScan}
          >
            {extract.isPending ? t("page.scanning") : t("page.rescan")}
          </Button>
        </div>

        {buildDraft.isError && <div style={s.error}>{t("modal.buildFailed")}</div>}

        {extract.isError && (
          <div style={s.error}>
            <ErrorState
              title={t("page.extractionFailed")}
              body={extract.error instanceof ApiError ? extract.error.message : undefined}
              onRetry={runScan}
            />
          </div>
        )}

        {candidates.length > 0 && (
          <div style={s.toolbar}>
            {STATUS_FILTERS.map((f) => (
              <Chip key={f} active={filter === f} count={counts[f]} onClick={() => setFilter(f)}>
                {t(`page.filters.${f}`)}
              </Chip>
            ))}
            <div style={s.toolbarSpacer} />
            <span style={s.acceptedCount}>
              {t("page.acceptedCount", { accepted: counts.accepted, total: counts.all })}
            </span>
            <Button
              kind="primary"
              icon="Sparkles"
              disabled={counts.accepted === 0}
              loading={buildDraft.isPending}
              onClick={() => buildDraft.mutate(repoId, { onSuccess: setDraft })}
            >
              {t("page.createSkill")}
            </Button>
          </div>
        )}

        {isLoading ? (
          <div style={s.list}>
            {Array.from({ length: SKELETON_CARDS }).map((_, i) => (
              <Skeleton key={i} height={160} />
            ))}
          </div>
        ) : isError ? (
          <ErrorState
            title={t("page.loadError")}
            body={error instanceof ApiError ? error.message : undefined}
            onRetry={() => refetch()}
          />
        ) : candidates.length === 0 ? (
          <EmptyState
            icon="ListChecks"
            title={t("page.empty.title")}
            body={t("page.empty.body")}
            cta={t("page.empty.cta")}
            ctaLoading={extract.isPending}
            onCta={runScan}
          />
        ) : shown.length === 0 ? (
          <EmptyState
            icon="ListChecks"
            title={t("page.emptyFiltered.title")}
            body={t("page.emptyFiltered.body")}
          />
        ) : (
          <div style={s.list}>
            {shown.map((c) => (
              <ConventionCard
                key={c.id}
                candidate={c}
                busy={patch.isPending || remove.isPending}
                onAccept={() =>
                  patch.mutate({ repoId, id: c.id, patch: { status: "accepted" } })
                }
                onReject={() =>
                  patch.mutate({ repoId, id: c.id, patch: { status: "rejected" } })
                }
                onSave={(p) => patch.mutate({ repoId, id: c.id, patch: p })}
                onDelete={() => remove.mutate({ repoId, id: c.id })}
              />
            ))}
          </div>
        )}
      </div>

      {draft && (
        <CreateSkillModal draft={draft} repoName={shortName} onClose={() => setDraft(null)} />
      )}
    </AppShell>
  );
}
