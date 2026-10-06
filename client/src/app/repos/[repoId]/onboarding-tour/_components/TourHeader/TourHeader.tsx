/* TourHeader — title, index/refresh subtitle, usage + stale chips, action buttons. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Button, Chip } from "@devdigest/ui";
import type { OnboardingResponse } from "@devdigest/shared";
import { formatCost, formatTokenCount } from "@/lib/format-cost";
import { COPIED_RESET_MS } from "../../constants";
import { relativeTime, totalTokens } from "../../helpers";
import { s } from "../../styles";

export function TourHeader({
  repoName,
  data,
  regenerating,
  onGenerate,
}: {
  repoName: string;
  data: OnboardingResponse | undefined;
  regenerating: boolean;
  onGenerate: () => void;
}) {
  const t = useTranslations("onboarding");
  const [linkCopied, setLinkCopied] = React.useState(false);
  const timer = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  React.useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  const share = () => {
    void navigator.clipboard?.writeText(window.location.href);
    setLinkCopied(true);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setLinkCopied(false), COPIED_RESET_MS);
  };

  const subtitle = data
    ? data.generated_at
      ? t("page.subtitle", {
          indexed: formatTokenCount(data.index.files_indexed),
          total: formatTokenCount(data.index.files_total),
          when: relativeTime(data.generated_at),
        })
      : t("page.subtitleNever", {
          indexed: formatTokenCount(data.index.files_indexed),
          total: formatTokenCount(data.index.files_total),
        })
    : null;

  const generated = data?.source === "llm";
  const label = regenerating
    ? t("actions.regenerating")
    : generated
      ? t("actions.regenerate")
      : t("actions.generate");

  return (
    <div style={s.headerRow}>
      <div style={s.headerText}>
        <h1 style={s.h1}>
          {t("page.headingPrefix")}
          <span style={s.repoName}>{repoName}</span>
        </h1>
        {subtitle && <p style={s.subtitle}>{subtitle}</p>}
        {data && (data.usage || data.stale) && (
          <div style={s.chips}>
            {data.usage && (
              <Chip icon="Cpu">
                {t("page.usage", {
                  model: data.usage.model,
                  tokens: formatTokenCount(totalTokens(data.usage)),
                  cost: formatCost(data.usage.cost_usd),
                })}
              </Chip>
            )}
            {data.stale && (
              <span title={t("page.staleTitle")}>
                <Chip icon="Clock">{t("page.stale")}</Chip>
              </span>
            )}
          </div>
        )}
      </div>
      <div style={s.actions}>
        <Button kind="secondary" icon="Link" onClick={share}>
          {linkCopied ? t("actions.linkCopied") : t("actions.shareLink")}
        </Button>
        {data && data.source !== "none" && (
          <Button kind="primary" icon="RefreshCw" disabled={regenerating} onClick={onGenerate}>
            {label}
          </Button>
        )}
      </div>
    </div>
  );
}
