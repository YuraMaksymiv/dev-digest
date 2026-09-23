/* ConventionCard — one extracted house rule with the code that proves it.
   Accept / reject / edit / delete all act on this candidate alone; the page
   owns the mutations so the card stays presentational. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import {
  Button,
  Chip,
  ConfidenceNum,
  FormField,
  IconBtn,
  ProgressBar,
  Textarea,
} from "@devdigest/ui";
import type { ConventionCandidate } from "@devdigest/shared";
import { CATEGORY_COLORS } from "../../constants";
import { confidenceColor, evidenceLabel, hasDistinctRationale } from "../../helpers";
import { s } from "./styles";

export interface ConventionCardProps {
  candidate: ConventionCandidate;
  onAccept: () => void;
  onReject: () => void;
  onSave: (patch: { rule: string; rationale: string }) => void;
  onDelete: () => void;
  busy?: boolean;
}

export function ConventionCard({
  candidate: c,
  onAccept,
  onReject,
  onSave,
  onDelete,
  busy,
}: ConventionCardProps) {
  const t = useTranslations("conventions");
  const [editing, setEditing] = React.useState(false);
  const [rule, setRule] = React.useState(c.rule);
  const [rationale, setRationale] = React.useState(c.rationale ?? "");

  const accent = CATEGORY_COLORS[c.category];

  const startEdit = () => {
    setRule(c.rule);
    setRationale(c.rationale ?? "");
    setEditing(true);
  };

  const save = () => {
    if (busy) return;
    onSave({ rule: rule.trim() || c.rule, rationale: rationale.trim() });
    setEditing(false);
  };

  return (
    <div style={s.card(accent, c.status === "rejected")}>
      <div style={s.topRow}>
        <div style={s.main}>
          {editing ? (
            <div style={s.editBlock}>
              <FormField label={t("card.ruleLabel")} required>
                <Textarea value={rule} onChange={setRule} rows={2} />
              </FormField>
              <FormField label={t("card.rationaleLabel")}>
                <Textarea
                  value={rationale}
                  onChange={setRationale}
                  rows={2}
                  placeholder={t("card.rationalePlaceholder")}
                />
              </FormField>
            </div>
          ) : (
            <>
              <div style={s.rule}>{c.rule}</div>
              {hasDistinctRationale(c) && <div style={s.rationale}>{c.rationale}</div>}
            </>
          )}

          <div style={s.meta}>
            <Chip color={accent}>{t(`card.category.${c.category}`)}</Chip>
            <ConfidenceNum value={c.confidence} />
          </div>
        </div>

        {!editing && (
          <div style={s.actions}>
            <Button
              kind={c.status === "accepted" ? "primary" : "secondary"}
              size="sm"
              icon="Check"
              full
              disabled={busy}
              aria-label={t("card.acceptAria", { rule: c.rule })}
              onClick={onAccept}
            >
              {c.status === "accepted" ? t("card.accepted") : t("card.accept")}
            </Button>
            <Button
              kind={c.status === "rejected" ? "danger" : "ghost"}
              size="sm"
              icon="X"
              full
              disabled={busy}
              aria-label={t("card.rejectAria", { rule: c.rule })}
              onClick={onReject}
            >
              {c.status === "rejected" ? t("card.rejected") : t("card.reject")}
            </Button>
          </div>
        )}
      </div>

      <div style={s.evidence}>
        <div style={s.evidenceHead}>
          <span>{t("card.detectedIn")}</span>
          <span>{evidenceLabel(c)}</span>
        </div>
        <pre style={s.snippet}>{c.evidence_snippet}</pre>
      </div>

      {editing ? (
        <div style={s.editActions}>
          <Button kind="ghost" size="sm" onClick={() => setEditing(false)}>
            {t("card.cancel")}
          </Button>
          <Button kind="primary" size="sm" onClick={save} disabled={busy}>
            {t("card.save")}
          </Button>
        </div>
      ) : (
        <div style={s.confidenceRow}>
          <span style={s.confidenceLabel}>{t("card.confidence")}</span>
          <div style={s.bar}>
            <ProgressBar value={c.confidence * 100} color={confidenceColor(c.confidence)} />
          </div>
          <div style={{ flex: 1 }} />
          <IconBtn
            icon="Edit"
            label={t("card.editAria", { rule: c.rule })}
            onClick={() => !busy && startEdit()}
          />
          <IconBtn
            icon="Trash"
            label={t("card.deleteAria", { rule: c.rule })}
            danger
            onClick={() => !busy && onDelete()}
          />
        </div>
      )}
    </div>
  );
}
