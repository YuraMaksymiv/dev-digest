/* OnboardingTourView — the Onboarding Tour screen.

   Generation is a mutation (it can cost a model call) and fires on a click
   only. Two controls can start it (header button, banner button), so the
   double-click guard is a ref read at CLICK time, not the render-time pending
   flag. */
"use client";

import React from "react";
import { useParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { EmptyState, ErrorState, Skeleton } from "@devdigest/ui";
import { AppShell } from "@/components/app-shell";
import { RepoNotFound } from "@/components/repo-not-found";
import { ApiError } from "@/lib/api";
import { useGenerateOnboarding, useOnboarding } from "@/lib/hooks/onboarding";
import { useResyncRepoIntel } from "@/lib/hooks/repo-intel";
import { useActiveRepo, useRepoNotFound } from "@/lib/repo-context";
import { SECTION_IDS } from "../../constants";
import { s } from "../../styles";
import { TourBanner } from "../TourBanner";
import { TourHeader } from "../TourHeader";
import { TourSections } from "../TourSections";
import { TourToc } from "../TourToc";

export function OnboardingTourView() {
  const t = useTranslations("onboarding");
  const { repoId } = useParams<{ repoId: string }>();
  const { activeRepo } = useActiveRepo();
  const repoNotFound = useRepoNotFound(repoId);

  const { data, isLoading, isError, error, refetch } = useOnboarding(repoId);
  const generate = useGenerateOnboarding(repoId);
  const resync = useResyncRepoIntel(repoId);

  const generating = React.useRef(false);
  const runGenerate = () => {
    if (generating.current) return;
    generating.current = true;
    generate.mutate(undefined, {
      onSettled: () => {
        generating.current = false;
      },
    });
  };

  const indexRepo = () => {
    resync.mutate(undefined, { onSuccess: () => void refetch() });
  };

  const repoName = activeRepo?.full_name?.split("/").pop() ?? t("page.repoFallback");
  const crumb = [{ label: t("page.crumbWorkspace") }, { label: t("page.crumbOnboarding") }];

  if (repoNotFound) {
    return (
      <AppShell crumb={crumb}>
        <RepoNotFound />
      </AppShell>
    );
  }

  const noClone = data?.banner?.kind === "no_clone";
  const requestFailed = generate.isError;

  return (
    <AppShell crumb={crumb}>
      <div style={s.page}>
        <TourHeader repoName={repoName} data={data} regenerating={generate.isPending} onGenerate={runGenerate} />

        <div style={s.layout}>
          <TourToc />
          <div style={s.main}>
            {isLoading && (
              <div role="status" aria-busy="true" style={s.main}>
                {SECTION_IDS.map((id) => (
                  <div key={id} style={{ ...s.card, ...s.skeletonCard }} data-testid="tour-skeleton">
                    <Skeleton width="40%" height={16} />
                    <Skeleton height={12} />
                    <Skeleton width="80%" height={12} />
                  </div>
                ))}
              </div>
            )}

            {isError && (
              <ErrorState
                title={t("loadError.title")}
                body={error instanceof ApiError ? error.message : t("unknownError")}
                onRetry={() => void refetch()}
              />
            )}

            {data && noClone && (
              <div style={s.state}>
                <EmptyState
                  icon="Folder"
                  title={t("noClone.title")}
                  body={t("noClone.body")}
                  cta={resync.isPending ? t("noClone.indexing") : t("noClone.cta")}
                  onCta={indexRepo}
                  ctaLoading={resync.isPending}
                />
              </div>
            )}

            {data && !noClone && (
              <>
                <TourBanner
                  banner={data.banner}
                  requestFailed={requestFailed}
                  busy={generate.isPending}
                  onAction={runGenerate}
                />
                <TourSections
                  tour={data.tour}
                  source={data.source}
                  fullName={activeRepo?.full_name}
                  sha={data.index.last_indexed_sha}
                />
              </>
            )}
          </div>
        </div>
      </div>
    </AppShell>
  );
}
