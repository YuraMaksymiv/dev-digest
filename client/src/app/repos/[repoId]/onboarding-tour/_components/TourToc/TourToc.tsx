/* TourToc — "ON THIS PAGE" anchors that scroll to the five sections. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { SECTION_IDS, SECTION_LABEL_KEYS, anchorId } from "../../constants";
import { s } from "../../styles";

export function TourToc() {
  const t = useTranslations("onboarding");
  const go = (e: React.MouseEvent, id: (typeof SECTION_IDS)[number]) => {
    e.preventDefault();
    document.getElementById(anchorId(id))?.scrollIntoView?.({ behavior: "smooth", block: "start" });
  };
  return (
    <nav style={s.toc} aria-label={t("toc.label")}>
      <div style={s.tocLabel}>{t("toc.label")}</div>
      {SECTION_IDS.map((id) => (
        <a key={id} href={`#${anchorId(id)}`} style={s.tocLink} onClick={(e) => go(e, id)}>
          {t(SECTION_LABEL_KEYS[id])}
        </a>
      ))}
    </nav>
  );
}
