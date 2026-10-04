/* SectionCard — one collapsible tour card. Expanded on load; collapse state is local. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Icon } from "@devdigest/ui";
import { SECTION_ICONS, SECTION_LABEL_KEYS, anchorId, type SectionId } from "../../constants";
import { s } from "../../styles";

export function SectionCard({ id, children }: { id: SectionId; children: React.ReactNode }) {
  const t = useTranslations("onboarding");
  const [open, setOpen] = React.useState(true);
  const title = t(SECTION_LABEL_KEYS[id]);
  const Lead = Icon[SECTION_ICONS[id]];
  const Chevron = open ? Icon.ChevronDown : Icon.ChevronRight;
  const bodyId = `${anchorId(id)}-body`;

  return (
    <section id={anchorId(id)} style={s.card} aria-label={title}>
      <button
        type="button"
        style={s.cardHead}
        aria-expanded={open}
        aria-controls={bodyId}
        aria-label={t(open ? "actions.collapse" : "actions.expand", { title })}
        onClick={() => setOpen((v) => !v)}
      >
        <Lead size={16} />
        <span style={s.cardTitle}>{title}</span>
        <Chevron size={16} />
      </button>
      {open && (
        <div id={bodyId} style={s.cardBody}>
          {children}
        </div>
      )}
    </section>
  );
}
