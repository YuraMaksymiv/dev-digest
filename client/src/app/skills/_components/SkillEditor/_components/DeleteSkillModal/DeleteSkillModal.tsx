/* DeleteSkillModal — names the agents that lose the skill before confirming.
   `agent_skills` cascades, so the links go silently otherwise. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Modal, Button, Chip } from "@devdigest/ui";
import type { Skill } from "@devdigest/shared";

export function DeleteSkillModal({
  skill,
  agents,
  pending,
  onCancel,
  onConfirm,
}: {
  skill: Skill;
  agents: Array<{ id: string; name: string }>;
  pending?: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const t = useTranslations("skills");
  return (
    <Modal
      width={520}
      title={t("editor.deleteConfirm.title")}
      onClose={onCancel}
      footer={
        <>
          <Button kind="secondary" size="sm" onClick={onCancel}>
            {t("editor.deleteConfirm.cancel")}
          </Button>
          <Button kind="danger" size="sm" icon="Trash" onClick={onConfirm} disabled={pending}>
            {t("editor.deleteConfirm.confirm")}
          </Button>
        </>
      }
    >
      <p style={{ fontSize: 13, color: "var(--text-secondary)" }}>
        {t("editor.deleteConfirm.body", { name: skill.name })}
      </p>
      {agents.length > 0 && (
        <div style={{ marginTop: 14 }}>
          <p style={{ fontSize: 13, color: "var(--text-secondary)", marginBottom: 8 }}>
            {t("editor.deleteConfirm.usedByWarning", { count: agents.length })}
          </p>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            {agents.map((a) => (
              <Chip key={a.id}>{a.name}</Chip>
            ))}
          </div>
        </div>
      )}
    </Modal>
  );
}
