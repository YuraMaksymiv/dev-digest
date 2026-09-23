/* ImportSkillModal — bring a skill body in from a URL or a local file.
   Two steps on purpose: fetch/read first, then edit and confirm. Nothing is
   persisted until POST /skills, the same preview-then-confirm flow the
   conventions extractor uses. */
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
} from "@devdigest/ui";
import type { SkillType } from "@devdigest/shared";
import { useCreateSkill, useImportSkillUrl } from "@/lib/hooks/skills";
import { SKILL_TYPES } from "@/lib/skill-types";
import { MAX_IMPORT_BYTES } from "../../../../constants";
import { s } from "./styles";

export interface ImportSkillModalProps {
  mode: "url" | "file";
  onClose: () => void;
}

export function ImportSkillModal({ mode, onClose }: ImportSkillModalProps) {
  const t = useTranslations("skills");
  const router = useRouter();
  const importUrl = useImportSkillUrl();
  const create = useCreateSkill();

  const [url, setUrl] = React.useState("");
  const [origin, setOrigin] = React.useState<string | null>(null);
  const [fileError, setFileError] = React.useState<string | null>(null);

  const [name, setName] = React.useState("");
  const [description, setDescription] = React.useState("");
  const [type, setType] = React.useState<SkillType>("custom");
  const [body, setBody] = React.useState("");

  const typeOptions = SKILL_TYPES.map((v) => ({ value: v, label: t(`listItem.type.${v}`) }));
  const loaded = body.length > 0;

  const fetchUrl = () =>
    importUrl.mutate(url.trim(), {
      onSuccess: (draft) => {
        setName(draft.name);
        setType(draft.type);
        setBody(draft.body);
        setOrigin(t("import.fetchedFrom", { url: draft.source_url }));
      },
    });

  const readFile = (file: File) => {
    setFileError(null);
    if (file.size > MAX_IMPORT_BYTES) return setFileError(t("import.fileTooLarge"));
    const reader = new FileReader();
    reader.onload = () => {
      const text = String(reader.result ?? "");
      if (text.trim().length === 0) return setFileError(t("import.fileEmpty"));
      setName(file.name.replace(/\.(md|markdown|txt)$/i, ""));
      setBody(text);
      setOrigin(t("import.readFrom", { name: file.name }));
    };
    reader.readAsText(file);
  };

  const submit = () =>
    create.mutate(
      {
        name: name.trim() || "imported-skill",
        description: description.trim(),
        type,
        body,
        // Both paths are an import as far as the Skills lab is concerned — the
        // rail shows this as "Imported" rather than "Manual".
        source: "imported_url",
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
      width={680}
      title={mode === "url" ? t("import.titleUrl") : t("import.titleFile")}
      subtitle={mode === "url" ? t("import.subtitleUrl") : t("import.subtitleFile")}
      onClose={onClose}
      footer={
        <div style={s.footer}>
          <Button kind="ghost" onClick={onClose} disabled={create.isPending}>
            {t("import.cancel")}
          </Button>
          <Button
            kind="primary"
            icon="Plus"
            onClick={submit}
            disabled={!loaded}
            loading={create.isPending}
          >
            {create.isPending ? t("import.creating") : t("import.create")}
          </Button>
        </div>
      }
    >
      <div style={s.body}>
        {!loaded &&
          (mode === "url" ? (
            <FormField label={t("import.urlLabel")} hint={t("import.urlHint")} required>
              <div style={s.fetchRow}>
                <div style={s.fetchInput}>
                  <TextInput value={url} onChange={setUrl} placeholder={t("import.urlPlaceholder")} mono />
                </div>
                <Button
                  kind="secondary"
                  icon="Link"
                  onClick={fetchUrl}
                  disabled={!url.trim()}
                  loading={importUrl.isPending}
                >
                  {importUrl.isPending ? t("import.fetching") : t("import.fetch")}
                </Button>
              </div>
              {importUrl.isError && (
                <div style={s.error}>
                  {importUrl.error instanceof Error
                    ? importUrl.error.message
                    : t("import.fetchFailed")}
                </div>
              )}
            </FormField>
          ) : (
            <FormField label={t("import.fileLabel")} hint={t("import.fileHint")} required>
              <input
                type="file"
                accept=".md,.markdown,.txt,text/markdown,text/plain"
                style={s.fileInput}
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) readFile(f);
                }}
              />
              {fileError && <div style={s.error}>{fileError}</div>}
            </FormField>
          ))}

        {loaded && (
          <>
            <div style={s.sourceNote}>
              <Icon.Check size={14} />
              <span>{origin}</span>
            </div>
            <FormField label={t("import.name")} required>
              <TextInput value={name} onChange={setName} mono />
            </FormField>
            <FormField label={t("import.description")}>
              <TextInput value={description} onChange={setDescription} />
            </FormField>
            <FormField label={t("import.type")}>
              <SelectInput
                value={type}
                onChange={(v) => setType(v as SkillType)}
                options={typeOptions}
              />
            </FormField>
            <FormField label={t("import.body")} required>
              <Textarea value={body} onChange={setBody} rows={14} mono />
            </FormField>
            {create.isError && <div style={s.error}>{t("import.createFailed")}</div>}
          </>
        )}
      </div>
    </Modal>
  );
}
