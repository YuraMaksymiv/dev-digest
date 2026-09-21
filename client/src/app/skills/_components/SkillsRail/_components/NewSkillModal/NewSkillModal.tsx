/* NewSkillModal — create a skill from scratch. Name + type + description; the
   body starts from a small template and is written in the editor. */
"use client";

import React from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Modal, Button, FormField, TextInput, SelectInput } from "@devdigest/ui";
import type { SkillType } from "@devdigest/shared";
import { useCreateSkill } from "../../../../../../lib/hooks/skills";
import { SKILL_TYPES } from "../../../../constants";
import { s } from "./styles";

export function NewSkillModal({ onClose }: { onClose: () => void }) {
  const t = useTranslations("skills");
  const router = useRouter();
  const create = useCreateSkill();
  const [name, setName] = React.useState("");
  const [description, setDescription] = React.useState("");
  const [type, setType] = React.useState<SkillType>("custom");

  const typeOptions = SKILL_TYPES.map((v) => ({ value: v, label: t(`listItem.type.${v}`) }));

  const submit = () =>
    create.mutate(
      {
        name: name.trim() || t("new.defaultName"),
        description: description.trim(),
        type,
        body: t("new.defaultBody"),
      },
      {
        onSuccess: (skill) => {
          onClose();
          router.push(`/skills/${skill.id}?tab=config`);
        },
      },
    );

  return (
    <Modal
      width={560}
      title={t("new.title")}
      subtitle={t("new.subtitle")}
      onClose={onClose}
      footer={
        <div style={s.footer}>
          <Button kind="ghost" onClick={onClose}>
            {t("new.cancel")}
          </Button>
          <Button kind="primary" icon="Plus" onClick={submit} disabled={create.isPending}>
            {create.isPending ? t("new.creating") : t("new.create")}
          </Button>
        </div>
      }
    >
      <div style={s.body}>
        <FormField label={t("editor.name")} required>
          <TextInput value={name} onChange={setName} mono placeholder={t("new.namePlaceholder")} />
        </FormField>
        <FormField label={t("editor.type")}>
          <SelectInput value={type} onChange={(v) => setType(v as SkillType)} options={typeOptions} />
        </FormField>
        <FormField label={t("editor.description")} hint={t("editor.descriptionHint")}>
          <TextInput
            value={description}
            onChange={setDescription}
            placeholder={t("new.descriptionPlaceholder")}
          />
        </FormField>
      </div>
    </Modal>
  );
}
