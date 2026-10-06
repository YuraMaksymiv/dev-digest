/* ContextView — read-only browser for a repo's project docs (specs/, docs/,
   insights/): file list with search, markdown preview, and how many agents use
   the selected doc. Docs are authored in the repo, never here. */
"use client";

import React from "react";
import { useParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { EmptyState, ErrorState, Icon, IconBtn, Markdown, Skeleton, TextInput } from "@devdigest/ui";
import { AppShell } from "@/components/app-shell";
import { RepoNotFound } from "@/components/repo-not-found";
import { useContextDocContent, useContextDocs, useReindexProjectContext } from "@/lib/hooks/project-context";
import { useToast } from "@/lib/toast";
import { useActiveRepo, useRepoNotFound } from "@/lib/repo-context";
import { downloadName, filterDocs, pickSelected, saveMarkdown, splitPath } from "../../helpers";
import { s } from "../../styles";
import { Toolbar } from "../Toolbar";

export function ContextView() {
  const t = useTranslations("projectContext");
  const { repoId } = useParams<{ repoId: string }>();
  const { activeRepo } = useActiveRepo();
  const repoNotFound = useRepoNotFound(repoId);

  const docs = useContextDocs(repoId);
  const [query, setQuery] = React.useState("");
  const [selectedPath, setSelectedPath] = React.useState<string | null>(null);

  const all = docs.data?.docs ?? [];
  const visible = filterDocs(all, query);
  const selected = pickSelected(visible, selectedPath);
  const content = useContextDocContent(repoId, selected?.path);
  const toast = useToast();
  const reindex = useReindexProjectContext(repoId, () => toast.error(t("page.reindexError")));
  const canDownload = !!selected && !!content.data && !content.isLoading && !content.isError;

  const crumb = [
    ...(activeRepo ? [{ label: activeRepo.full_name }] : []),
    { label: t("page.crumb") },
  ];

  if (repoNotFound) {
    return (
      <AppShell crumb={crumb}>
        <RepoNotFound />
      </AppShell>
    );
  }

  const notCloned = docs.data?.reason === "not_cloned";
  const empty = !docs.isLoading && !docs.isError && !notCloned && all.length === 0;

  const renderRailBody = () => {
    if (docs.isLoading) {
      return (
        <div style={s.railNote}>
          <Skeleton height={28} />
        </div>
      );
    }
    if (docs.isError || notCloned || empty) return null;
    if (visible.length === 0) return <p style={s.railNote}>{t("page.noMatches", { q: query.trim() })}</p>;
    return visible.map((d) => {
      const { name, folder } = splitPath(d.path);
      return (
        <button
          key={d.path}
          type="button"
          style={s.item(d.path === selected?.path)}
          onClick={() => setSelectedPath(d.path)}
        >
          <Icon.FileText size={14} />
          <span className="mono">{name}</span>
          {folder && (
            <span className="mono" style={s.itemFolder}>
              {folder}
            </span>
          )}
        </button>
      );
    });
  };

  const renderMain = () => {
    if (docs.isError) {
      return (
        <div style={s.center}>
          <ErrorState body={t("page.loadError")} onRetry={() => docs.refetch()} />
        </div>
      );
    }
    if (notCloned) {
      return (
        <div style={s.center}>
          <EmptyState icon="GitBranch" title={t("page.notCloned.title")} body={t("page.notCloned.body")} />
        </div>
      );
    }
    if (empty) {
      return (
        <div style={s.center}>
          <EmptyState icon="FileText" title={t("page.empty.title")} body={t("page.empty.body")} />
        </div>
      );
    }
    if (!selected) {
      return <div style={s.center}>{!docs.isLoading && <p style={s.railNote}>{t("page.selectPrompt")}</p>}</div>;
    }
    return (
      <>
        <div style={s.mainHead}>
          <span className="mono" style={s.fileName}>
            {selected.path}
          </span>
          <span style={s.spacer} />
          <span style={s.usedBy}>
            <Icon.Cpu size={14} />
            {t("page.usedBy", { count: selected.used_by })}
          </span>
        </div>
        <div style={s.body}>
          {content.isLoading && <Skeleton height={120} />}
          {content.isError && <ErrorState body={t("page.docLoadError")} onRetry={() => content.refetch()} />}
          {content.data && <Markdown>{content.data.content}</Markdown>}
        </div>
      </>
    );
  };

  return (
    <AppShell crumb={crumb}>
      <div style={s.layout}>
        <aside style={s.rail}>
          <div style={s.railHead}>
            <div style={s.railTitle}>{t("page.railTitle")}</div>
            <div className="mono" style={s.railHint}>
              {t("page.railHint")}
            </div>
            <div style={s.railTools}>
              <div style={{ flex: 1 }}>
                <TextInput value={query} onChange={setQuery} placeholder={t("page.searchPlaceholder")} />
              </div>
              <IconBtn icon="RefreshCw" size={28} label={t("page.refresh")} onClick={() => docs.refetch()} />
            </div>
          </div>
          <div style={s.railList}>{renderRailBody()}</div>
          {docs.data && !notCloned && (
            <div style={s.railFoot}>
              <div>
                {t("page.indexed", {
                  files: docs.data.total_files,
                  tokens: docs.data.total_tokens,
                })}
              </div>
              {docs.data.truncated && (
                <div>{t("page.truncated", { shown: all.length, total: docs.data.total_files })}</div>
              )}
            </div>
          )}
        </aside>
        <main style={s.main}>
          <Toolbar
            reindexing={reindex.running}
            canDownload={canDownload}
            onReindex={reindex.start}
            onDownload={() => {
              if (selected && content.data) saveMarkdown(downloadName(selected.path), content.data.content);
            }}
          />
          {renderMain()}
        </main>
      </div>
    </AppShell>
  );
}
