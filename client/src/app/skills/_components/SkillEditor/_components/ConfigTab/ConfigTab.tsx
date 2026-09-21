/* ConfigTab — the skill's own config: name, directive description, type, and
   the markdown body that becomes the prompt block. */
"use client";

import React from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Badge, Button, FormField, SelectInput, TextInput, Textarea, Toggle } from "@devdigest/ui";
import type { Skill, SkillType } from "@devdigest/shared";
import {
  useDeleteSkill,
  useSkillAgents,
  useUpdateSkill,
} from "../../../../../../lib/hooks/skills";
import { useToast } from "../../../../../../lib/toast";
import { approxTokens } from "../../../../helpers";
import { SKILL_TYPES } from "../../../../constants";
import { DeleteSkillModal } from "../DeleteSkillModal";
import { s } from "./styles";

export function ConfigTab({ skill }: { skill: Skill }) {
  const t = useTranslations("skills");
  const toast = useToast();
  const router = useRouter();
  const update = useUpdateSkill();
  const del = useDeleteSkill();
  const { data: agents } = useSkillAgents(skill.id);

  const [name, setName] = React.useState(skill.name);
  const [description, setDescription] = React.useState(skill.description);
  const [type, setType] = React.useState<SkillType>(skill.type);
  const [body, setBody] = React.useState(skill.body);
  const [confirming, setConfirming] = React.useState(false);

  // Reset the local form when the rail switches skills.
  React.useEffect(() => {
    setName(skill.name);
    setDescription(skill.description);
    setType(skill.type);
    setBody(skill.body);
  }, [skill.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const typeOptions = SKILL_TYPES.map((v) => ({ value: v, label: t(`listItem.type.${v}`) }));

  const save = () =>
    update.mutate(
      { id: skill.id, patch: { name, description, type, body } },
      { onSuccess: (data) => toast.success(t("editor.savedToast", { version: data.version })) },
    );

  /**
   * The Enabled toggle patches `enabled` ALONE on purpose: the server bumps the
   * version only on a content change, so sending the body along with it would
   * spawn a version identical to the last one.
   */
  const toggleEnabled = (enabled: boolean) => update.mutate({ id: skill.id, patch: { enabled } });

  const usedBy = agents?.length ?? 0;

  return (
    <div style={s.wrap}>
      {confirming && (
        <DeleteSkillModal
          skill={skill}
          agents={agents ?? []}
          pending={del.isPending}
          onCancel={() => setConfirming(false)}
          onConfirm={() =>
            del.mutate(skill.id, {
              onSuccess: () => {
                setConfirming(false);
                router.push("/skills");
              },
            })
          }
        />
      )}

      <div style={s.headerRow}>
        <Badge color="var(--text-secondary)" icon="Cpu">
          {usedBy > 0 ? t("editor.usedBy", { count: usedBy }) : t("editor.unused")}
        </Badge>
        <div style={s.enabledLabel}>
          <span style={s.enabledText}>{t("editor.enabled")}</span>
          <Toggle on={skill.enabled} onChange={toggleEnabled} size={16} />
        </div>
      </div>

      <FormField label={t("editor.name")} required>
        <TextInput value={name} onChange={setName} mono />
      </FormField>

      <FormField label={t("editor.type")}>
        <SelectInput value={type} onChange={(v) => setType(v as SkillType)} options={typeOptions} />
      </FormField>

      <FormField label={t("editor.description")} hint={t("editor.descriptionHint")}>
        <TextInput
          value={description}
          onChange={setDescription}
          placeholder={t("editor.descriptionPlaceholder")}
        />
      </FormField>

      <FormField
        label={t("editor.body")}
        hint={t("editor.bodyHint")}
        right={
          <span style={s.tokenHint}>{t("editor.tokenHint", { count: approxTokens(body) })}</span>
        }
      >
        <Textarea value={body} onChange={setBody} rows={18} mono />
      </FormField>

      <div style={s.actions}>
        <Button kind="primary" size="sm" icon="Check" onClick={save} disabled={update.isPending}>
          {update.isPending ? t("editor.saving") : t("editor.save")}
        </Button>
        <Button kind="secondary" size="sm" icon="Trash" onClick={() => setConfirming(true)}>
          {t("editor.delete")}
        </Button>
        <span style={s.enabledHint}>{t("editor.enabledHint")}</span>
      </div>
    </div>
  );
}
