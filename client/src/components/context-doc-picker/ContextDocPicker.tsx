/* ContextDocPicker — attach a repo's markdown docs to ONE agent or skill, per
   repo. Every doc of the chosen repo is a row; the checkbox attaches it, and row
   order is the order of the docs inside the assembled `## Project context`
   block. Shared by the agent and skill Context tabs. */
"use client";

import React from "react";
import {
  Badge,
  Checkbox,
  ErrorState,
  Icon,
  IconBtn,
  Markdown,
  Modal,
  SelectInput,
  Skeleton,
  TextInput,
} from "@devdigest/ui";
import { useTranslations } from "next-intl";
import { useRepos } from "@/lib/hooks/core";
import {
  useContextAttachments,
  useContextDocContent,
  useContextDocs,
  useSetContextAttachments,
  type ContextOwnerKind,
} from "@/lib/hooks/project-context";
import { useActiveRepo } from "@/lib/repo-context";
import { useToast } from "@/lib/toast";
import { ROOT_COLORS } from "./constants";
import { SerializesAs } from "./SerializesAs";
import {
  attachedTokens,
  buildRows,
  countAttached,
  filterRows,
  moveRow,
  toggleRow,
  toPaths,
  type DocRowState,
} from "./helpers";
import { s } from "./styles";

export interface ContextDocPickerProps {
  kind: ContextOwnerKind;
  ownerId: string;
  title: string;
  hint: string;
  /** Extra explanatory content rendered under the list (e.g. the skill's block description). */
  footerNote?: React.ReactNode;
}

function PreviewModal({ repoId, path, onClose }: { repoId: string; path: string; onClose: () => void }) {
  const t = useTranslations("projectContext");
  const content = useContextDocContent(repoId, path);
  return (
    <Modal width={880} title={path} onClose={onClose}>
      <div style={s.modalBody}>
        {content.isLoading && <Skeleton height={120} />}
        {content.isError && <ErrorState body={t("picker.docLoadError")} onRetry={() => content.refetch()} />}
        {content.data && <Markdown>{content.data.content}</Markdown>}
      </div>
    </Modal>
  );
}

export function ContextDocPicker({ kind, ownerId, title, hint, footerNote }: ContextDocPickerProps) {
  const t = useTranslations("projectContext");
  const toast = useToast();
  const { repoId: activeRepoId } = useActiveRepo();
  const repos = useRepos();
  const [picked, setPicked] = React.useState<string | null>(null);

  const repoList = repos.data ?? [];
  const repoId =
    picked && repoList.some((r) => r.id === picked)
      ? picked
      : (repoList.find((r) => r.id === activeRepoId)?.id ?? repoList[0]?.id ?? null);

  const docs = useContextDocs(repoId);
  const attachments = useContextAttachments(kind, ownerId, repoId);
  const save = useSetContextAttachments(kind);

  const [rows, setRows] = React.useState<DocRowState[]>([]);
  const [query, setQuery] = React.useState("");
  const [dragIndex, setDragIndex] = React.useState<number | null>(null);
  const [dragOver, setDragOver] = React.useState<number | null>(null);
  const [failed, setFailed] = React.useState<DocRowState[] | null>(null);
  const [previewPath, setPreviewPath] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (docs.data && attachments.data) setRows(buildRows(docs.data.docs, attachments.data.attachments));
  }, [docs.data, attachments.data]);

  React.useEffect(() => {
    setFailed(null);
    setQuery("");
  }, [repoId]);

  const persist = (next: DocRowState[]) => {
    if (!repoId) return;
    setRows(next);
    setFailed(null);
    save.mutate(
      { ownerId, repo_id: repoId, paths: toPaths(next) },
      {
        onError: () => {
          // Revert to what the server holds; keep the attempt so Retry can resend it.
          if (docs.data && attachments.data) {
            setRows(buildRows(docs.data.docs, attachments.data.attachments));
          }
          setFailed(next);
          toast.error(t("picker.saveError"));
        },
      },
    );
  };

  const commitMove = (from: number, to: number) => persist(moveRow(rows, from, to));

  const repoSelect = repoList.length > 0 && (
    <div style={s.repoRow}>
      <label style={s.repoLabel}>{t("picker.repoLabel")}</label>
      <SelectInput
        value={repoId ?? ""}
        onChange={(v) => setPicked(v)}
        options={repoList.map((r) => ({ value: r.id, label: r.full_name }))}
      />
    </div>
  );

  if (repos.isLoading) {
    return (
      <div style={s.wrap}>
        <Skeleton height={44} />
      </div>
    );
  }
  if (repoId === null) {
    return (
      <div style={s.wrap}>
        <h2 style={s.h2}>{title}</h2>
        <p style={s.note}>{t("picker.noRepo")}</p>
      </div>
    );
  }

  const header = (
    <>
      {repoSelect}
      <div style={s.headerRow}>
        <h2 style={s.h2}>{title}</h2>
        {rows.length > 0 && (
          <Badge color="var(--accent)">
            {t("picker.attachedCount", { attached: countAttached(rows), total: rows.length })}
          </Badge>
        )}
        <div style={s.filter}>
          <TextInput value={query} onChange={setQuery} placeholder={t("picker.filterPlaceholder")} />
        </div>
      </div>
      <p style={s.hint}>{hint}</p>
    </>
  );

  if (docs.isLoading || attachments.isLoading) {
    return (
      <div style={s.wrap}>
        {header}
        <Skeleton height={44} />
        <Skeleton height={44} />
        <Skeleton height={44} />
      </div>
    );
  }
  if (docs.isError || attachments.isError) {
    return (
      <div style={s.wrap}>
        {header}
        <ErrorState
          body={t("picker.loadError")}
          onRetry={() => {
            docs.refetch();
            attachments.refetch();
          }}
        />
      </div>
    );
  }

  // Reordering past hidden neighbours would move a row somewhere the user
  // cannot see, so it is disabled while the filter is narrowing the list.
  const reorderable = query.trim() === "";
  const visible = filterRows(rows, query);
  const total = attachedTokens(rows);
  const cap = attachments.data?.limits.total_tokens ?? docs.data?.limits.total_tokens ?? 0;

  return (
    <div style={s.wrap}>
      {header}

      {failed && (
        <div style={s.errorBar} role="alert">
          <span>{t("picker.saveError")}</span>
          <button type="button" style={s.previewBtn} onClick={() => persist(failed)}>
            {t("picker.retry")}
          </button>
        </div>
      )}

      {docs.data?.reason === "not_cloned" && <p style={s.note}>{t("picker.notCloned")}</p>}
      {docs.data?.reason !== "not_cloned" && rows.length === 0 && <p style={s.note}>{t("picker.empty")}</p>}
      {rows.length > 0 && visible.length === 0 && (
        <p style={s.note}>{t("picker.noMatches", { q: query.trim() })}</p>
      )}

      {visible.map((row) => {
        const index = rows.findIndex((r) => r.path === row.path);
        return (
          <div
            key={row.path}
            draggable={reorderable}
            onDragStart={() => setDragIndex(index)}
            onDragOver={(e) => {
              e.preventDefault();
              setDragOver(index);
            }}
            onDragLeave={() => setDragOver((i) => (i === index ? null : i))}
            onDrop={() => {
              if (dragIndex !== null) commitMove(dragIndex, index);
              setDragIndex(null);
              setDragOver(null);
            }}
            onDragEnd={() => {
              setDragIndex(null);
              setDragOver(null);
            }}
            style={s.row(row.attached, dragOver === index)}
          >
            {reorderable && (
              <span style={s.handle} aria-hidden>
                <Icon.Menu size={14} />
              </span>
            )}
            <Checkbox checked={row.attached} onChange={(v) => persist(toggleRow(rows, row.path, v))} />
            <span className="mono" style={s.name}>
              {row.name}
            </span>
            {row.folder && (
              <span className="mono" style={s.folder}>
                {row.folder}
              </span>
            )}
            {row.missing && (
              <span title={t("picker.missingHint")}>
                <Badge color="var(--crit)" bg="var(--crit-bg)">
                  {t("picker.missing")}
                </Badge>
              </span>
            )}
            <span style={s.spacer} />
            {reorderable && (
              <span style={s.arrows}>
                <IconBtn
                  icon="ArrowUp"
                  size={24}
                  label={t("picker.moveUp", { name: row.name })}
                  onClick={() => commitMove(index, index - 1)}
                />
                <IconBtn
                  icon="ArrowDown"
                  size={24}
                  label={t("picker.moveDown", { name: row.name })}
                  onClick={() => commitMove(index, index + 1)}
                />
              </span>
            )}
            {row.rootType && <Badge color={ROOT_COLORS[row.rootType]}>{t(`picker.root.${row.rootType}`)}</Badge>}
            <button
              type="button"
              style={s.previewBtn}
              aria-label={t("picker.previewLabel", { name: row.name })}
              onClick={() => setPreviewPath(row.path)}
            >
              <Icon.Eye size={12} />
              {t("picker.preview")}
            </button>
          </div>
        );
      })}

      <div style={s.footer}>
        <span className="mono">{t("picker.tokensTotal", { count: total })}</span>
        <span style={s.spacer} />
        <span>{save.isPending ? t("picker.saving") : rows.length > 0 ? t("picker.autoSaved") : ""}</span>
      </div>
      {cap > 0 && total > cap && (
        <div style={s.overCap} role="status">
          {t("picker.overCap", { total, cap })}
        </div>
      )}
      <SerializesAs rows={rows} kind={kind} />
      {footerNote}

      {previewPath && <PreviewModal repoId={repoId} path={previewPath} onClose={() => setPreviewPath(null)} />}
    </div>
  );
}
