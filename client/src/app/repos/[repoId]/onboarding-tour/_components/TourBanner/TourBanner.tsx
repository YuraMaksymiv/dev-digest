/* TourBanner — honest status line for skeleton / failed states, plus Retry/Generate. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Button } from "@devdigest/ui";
import type { OnboardingResponse } from "@devdigest/shared";
import { s } from "../../styles";

type Banner = NonNullable<OnboardingResponse["banner"]>;

export function TourBanner({
  banner,
  requestFailed,
  busy,
  onAction,
}: {
  banner: Banner | null;
  requestFailed: boolean;
  busy: boolean;
  onAction: () => void;
}) {
  const t = useTranslations("onboarding");
  if (!banner && !requestFailed) return null;

  let message: string;
  let actionLabel: string;
  if (requestFailed) {
    message = t("banner.requestFailed");
    actionLabel = t("actions.retry");
  } else if (banner!.kind === "index_degraded") {
    message = banner!.reason
      ? t("banner.index_degraded", { reason: banner!.reason })
      : t("banner.index_degradedNoReason");
    actionLabel = t("actions.retry");
  } else {
    message = t(`banner.${banner!.kind}`);
    actionLabel = banner!.kind === "not_generated" ? t("actions.generate") : t("actions.retry");
  }

  return (
    <div role={requestFailed ? "alert" : "status"} style={{ ...s.banner, ...(requestFailed ? s.bannerError : null) }}>
      <span style={s.bannerText}>{message}</span>
      <Button kind="secondary" size="sm" disabled={busy} onClick={onAction}>
        {actionLabel}
      </Button>
    </div>
  );
}
