/* IntentCard — renders the server-derived PR intent (A4). Fetches its own
   data via usePrIntent, mirroring how DiffTab calls useSmartDiff itself. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Icon, Badge, ConfidenceNum, Button, EmptyState, Skeleton } from "@devdigest/ui";
import type { IntentCategory } from "@devdigest/shared";
import { usePrIntent, useRederiveIntent } from "@/lib/hooks/reviews";
import { INTENT_CATEGORY_ICON } from "./constants";
import { s } from "./styles";

export function IntentCard({ prId }: { prId: string | null }) {
  const t = useTranslations("brief");
  const { data: intent, isLoading } = usePrIntent(prId);
  const rederive = useRederiveIntent(prId);

  if (isLoading) {
    return (
      <div style={s.wrap}>
        <Skeleton height={14} width={140} style={{ marginBottom: 14 }} />
        <Skeleton height={40} style={{ marginBottom: 16 }} />
        <Skeleton height={70} />
      </div>
    );
  }

  if (!intent) {
    return (
      <div style={s.wrap}>
        <EmptyState
          icon="Target"
          title={t("intentCard.emptyTitle")}
          body={t("intentCard.emptyBody")}
          cta={rederive.isPending ? t("intentCard.rechecking") : t("intentCard.recheck")}
          onCta={() => rederive.mutate()}
          ctaLoading={rederive.isPending}
        />
      </div>
    );
  }

  const category = intent.category as IntentCategory;
  const missingIssue = intent.sources?.linked_issue === "unavailable";
  const missingContent = intent.sources?.linked_content === "unavailable";

  return (
    <section style={s.wrap}>
      <div style={s.headerRow}>
        <Icon.Target size={14} style={s.headerIcon} />
        <span style={s.headerLabel}>{t("block.intent")}</span>
        <div style={s.headerRight}>
          <Badge icon={INTENT_CATEGORY_ICON[category]}>{t(`intentCard.category.${category}`)}</Badge>
          <ConfidenceNum value={intent.confidence} />
          <Button
            kind="ghost"
            size="sm"
            icon="RefreshCw"
            loading={rederive.isPending}
            onClick={() => rederive.mutate()}
          >
            {rederive.isPending ? t("intentCard.rechecking") : t("intentCard.recheck")}
          </Button>
        </div>
      </div>

      <p style={s.intentText}>{intent.intent}</p>

      <div style={s.columns}>
        <div>
          <div style={s.columnLabel}>{t("intentCard.inScope")}</div>
          {intent.in_scope.length > 0 ? (
            <ul style={s.list}>
              {intent.in_scope.map((item, i) => (
                <li key={i}>{item}</li>
              ))}
            </ul>
          ) : (
            <div style={s.muted}>{t("intentCard.nothingNoted")}</div>
          )}
        </div>
        <div>
          <div style={s.columnLabel}>{t("intentCard.outOfScope")}</div>
          {intent.out_of_scope.length > 0 ? (
            <ul style={s.list}>
              {intent.out_of_scope.map((item, i) => (
                <li key={i}>{item}</li>
              ))}
            </ul>
          ) : (
            <div style={s.muted}>{t("intentCard.nothingNoted")}</div>
          )}
        </div>
      </div>

      {(missingIssue || missingContent) && (
        <div style={s.warningRow}>
          <Icon.AlertTriangle size={14} style={{ flexShrink: 0, marginTop: 1 }} />
          <span>
            {missingIssue && t("intentCard.missingIssueHint")}
            {missingIssue && missingContent && " "}
            {missingContent && t("intentCard.missingContentHint")}
          </span>
        </div>
      )}
    </section>
  );
}
