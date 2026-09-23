/* CreateSkillModal — confirm the skill the server assembled from the accepted
   conventions. The draft arrives already merged; everything here is editable,
   and nothing exists until POST /skills succeeds. */
"use client";

import React from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import {
  Button,
  FormField,
  Icon,
  Modal,
  SelectInput,
  TextInput,
  Textarea,
  Toggle,
} from "@devdigest/ui";
import type { ConventionSkillDraft, SkillType } from "@devdigest/shared";
import { useAgents } from "@/lib/hooks/agents";
import { useCreateSkill, useLinkAgentSkill } from "@/lib/hooks/skills";
import { SKILL_TYPES } from "@/lib/skill-types";
import { s } from "./styles";

export interface CreateSkillModalProps {
  draft: ConventionSkillDraft;
  repoName: string;
  onClose: () => void;
}

/** Sentinel for "link nothing" — a select cannot carry an empty option value. */
const NO_AGENT = "none";

export function CreateSkillModal({ draft, repoName, onClose }: CreateSkillModalProps) {
  const t = useTranslations("conventions");
  const router = useRouter();
  const { data: agents } = useAgents();
  const create = useCreateSkill();
  const link = useLinkAgentSkill();

  const [name, setName] = React.useState(draft.name);
  const [description, setDescription] = React.useState(draft.description);
  const [type, setType] = React.useState<SkillType>(draft.type);
  const [enabled, setEnabled] = React.useState(true);
  const [body, setBody] = React.useState(draft.body);
  const [agentId, setAgentId] = React.useState(NO_AGENT);

  const typeOptions = SKILL_TYPES.map((v) => ({ value: v, label: t(`modal.types.${v}`) }));
  const agentOptions = [
    { value: NO_AGENT, label: t("modal.noAgent") },
    ...(agents ?? []).map((a) => ({ value: a.id, label: a.name })),
  ];

  const pending = create.isPending || link.isPending;

  const submit = async () => {
    // `mutateAsync` rejects on failure; the mutations' own `isError` state
    // drives the message below, so swallow it rather than leaving an
    // unhandled rejection in the console.
    try {
      await createAndLink();
    } catch {
      /* surfaced by create.isError / link.isError */
    }
  };

  const createAndLink = async () => {
    const skill = await create.mutateAsync({
      name: name.trim() || draft.name,
      description: description.trim(),
      type,
      body,
      enabled,
      // Not `manual`: this body was assembled by a scan, and the Skills lab
      // should be able to tell the two apart.
      source: "extracted",
    });
    // Awaited, not a per-call `onSettled`: closing this modal unmounts the
    // component, and React Query drops an unmounted caller's callbacks — the
    // navigation would silently never happen.
    if (agentId !== NO_AGENT) {
      await link.mutateAsync({ agentId, skillId: skill.id });
    }
    onClose();
    router.push(`/skills/${skill.id}?tab=config`);
  };

  return (
    <Modal
      width={720}
      title={t("modal.title")}
      subtitle={draft.name}
      onClose={onClose}
      footer={
        <div style={s.footer}>
          <Button kind="ghost" onClick={onClose} disabled={pending}>
            {t("modal.cancel")}
          </Button>
          <Button
            kind="primary"
            icon="Sparkles"
            onClick={() => void submit()}
            loading={pending}
          >
            {pending ? t("modal.creating") : t("modal.create")}
          </Button>
        </div>
      }
    >
      <div style={s.body}>
        <div style={s.banner}>
          <Icon.Link size={14} />
          <span>
            {t("modal.mergedFrom", { count: draft.convention_ids.length, repo: repoName })}
          </span>
        </div>

        <FormField label={t("modal.name")} required>
          <TextInput value={name} onChange={setName} mono />
        </FormField>

        <FormField label={t("modal.description")}>
          <TextInput value={description} onChange={setDescription} />
        </FormField>

        <div style={s.row}>
          <div style={s.rowItem}>
            <FormField label={t("modal.type")}>
              <SelectInput
                value={type}
                onChange={(v) => setType(v as SkillType)}
                options={typeOptions}
              />
            </FormField>
          </div>
          <div style={s.rowItem}>
            <FormField label={t("modal.enabled")} hint={t("modal.enabledHint")}>
              <Toggle on={enabled} onChange={setEnabled} />
            </FormField>
          </div>
        </div>

        <FormField label={t("modal.linkAgent")} hint={t("modal.linkAgentHint")}>
          <SelectInput value={agentId} onChange={setAgentId} options={agentOptions} />
        </FormField>

        <FormField label={t("modal.body")} required>
          <Textarea value={body} onChange={setBody} rows={14} mono />
        </FormField>

        {(create.isError || link.isError) && <div style={s.error}>{t("modal.failed")}</div>}
      </div>
    </Modal>
  );
}
