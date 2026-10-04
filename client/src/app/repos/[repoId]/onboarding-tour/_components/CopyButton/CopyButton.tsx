/* CopyButton — copies text to the clipboard; never executes it. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Button } from "@devdigest/ui";
import { COPIED_RESET_MS } from "../../constants";

export function CopyButton({ text, ariaLabel }: { text: string; ariaLabel: string }) {
  const t = useTranslations("onboarding");
  const [copied, setCopied] = React.useState(false);
  const timer = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  React.useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  const copy = () => {
    void navigator.clipboard?.writeText(text);
    setCopied(true);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setCopied(false), COPIED_RESET_MS);
  };

  return (
    <Button kind="ghost" size="sm" icon={copied ? "Check" : "Copy"} onClick={copy} aria-label={ariaLabel}>
      {copied ? t("actions.copied") : t("actions.copy")}
    </Button>
  );
}
