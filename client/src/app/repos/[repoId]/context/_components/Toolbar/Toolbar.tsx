/* Toolbar — Preview tab, a disabled Edit tab (docs are authored in the repo),
   and the Reindex / Download actions of the Project Context page. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Button } from "@devdigest/ui";
import { s } from "../../styles";

export function Toolbar({
  reindexing,
  canDownload,
  onReindex,
  onDownload,
}: {
  reindexing: boolean;
  canDownload: boolean;
  onReindex: () => void;
  onDownload: () => void;
}) {
  const t = useTranslations("projectContext");
  return (
    <div style={s.toolbar}>
      <div role="tablist" aria-label={t("toolbar.viewLabel")} style={{ display: "flex", gap: 2 }}>
        <button type="button" role="tab" aria-selected="true" style={s.tab(true, false)}>
          {t("toolbar.preview")}
        </button>
        <button
          type="button"
          role="tab"
          aria-selected="false"
          aria-disabled="true"
          title={t("toolbar.editDisabled")}
          onClick={(e) => e.preventDefault()}
          style={s.tab(false, true)}
        >
          {t("toolbar.edit")}
        </button>
      </div>
      <span style={s.spacer} />
      <div style={s.toolbarActions}>
        <Button
          size="sm"
          icon="RefreshCw"
          loading={reindexing}
          aria-busy={reindexing}
          onClick={onReindex}
        >
          {t("toolbar.reindex")}
        </Button>
        <Button size="sm" icon="ArrowDown" disabled={!canDownload} onClick={onDownload}>
          {t("toolbar.download")}
        </Button>
      </div>
    </div>
  );
}
