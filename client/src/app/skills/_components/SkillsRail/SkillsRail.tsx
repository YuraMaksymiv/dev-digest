/* SkillsRail — the left column of both /skills routes: search, Add Skill, and
   one card per skill in the workspace. */
"use client";

import React from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Button, Dropdown, ErrorState, Skeleton, TextInput, EmptyState } from "@devdigest/ui";
import {
  useDeleteSkill,
  useSkillAgents,
  useSkills,
  useUpdateSkill,
} from "../../../../lib/hooks/skills";
import type { SkillSummary } from "@devdigest/shared";
import { filterSkills } from "../../helpers";
import { s } from "../../styles";
import { SkillRailCard } from "./_components/SkillRailCard";
import { NewSkillModal } from "./_components/NewSkillModal";
import { ImportSkillModal } from "./_components/ImportSkillModal";
import { DeleteSkillModal } from "../SkillEditor/_components/DeleteSkillModal";

export function SkillsRail({ activeId, tab }: { activeId?: string; tab: string }) {
  const t = useTranslations("skills");
  const router = useRouter();
  const { data: skills, isLoading, isError, refetch } = useSkills();
  const update = useUpdateSkill();
  const del = useDeleteSkill();
  const [deleting, setDeleting] = React.useState<SkillSummary | null>(null);
  // Only fetched once a delete is actually being confirmed — the modal names
  // the agents that lose the skill, and `used_by` is a count, not names.
  const { data: deletingAgents } = useSkillAgents(deleting?.id);
  const [creating, setCreating] = React.useState(false);
  const [importing, setImporting] = React.useState<"url" | "file" | null>(null);
  const [search, setSearch] = React.useState("");

  const list = filterSkills(skills ?? [], search);

  return (
    <div style={s.rail}>
      {creating && <NewSkillModal onClose={() => setCreating(false)} />}
      {importing && <ImportSkillModal mode={importing} onClose={() => setImporting(null)} />}
      {deleting && (
        <DeleteSkillModal
          skill={deleting}
          agents={deletingAgents ?? []}
          pending={del.isPending}
          onCancel={() => setDeleting(null)}
          onConfirm={() =>
            del.mutate(deleting.id, {
              onSuccess: () => {
                setDeleting(null);
                // The editor to the right is showing the row that just went away.
                if (deleting.id === activeId) router.push("/skills");
              },
            })
          }
        />
      )}
      <div style={s.railHeader}>
        <div style={s.railTitleRow}>
          <h1 style={s.h1}>{t("page.heading")}</h1>
          <Dropdown
            width={210}
            align="right"
            trigger={
              <Button kind="primary" size="sm" icon="Plus" iconRight="ChevronDown">
                {t("page.addSkill")}
              </Button>
            }
            items={[
              { label: t("page.menu.fromFile"), icon: "Upload", onClick: () => setImporting("file") },
              { label: t("page.menu.fromUrl"), icon: "Link", onClick: () => setImporting("url") },
              { divider: true },
              { label: t("page.menu.fromScratch"), icon: "Edit", onClick: () => setCreating(true) },
            ]}
          />
        </div>
        <TextInput value={search} onChange={setSearch} placeholder={t("page.searchPlaceholder")} />
      </div>

      <div style={s.railList}>
        {isLoading && (
          <>
            <Skeleton height={76} />
            <Skeleton height={76} />
            <Skeleton height={76} />
          </>
        )}
        {isError && <ErrorState body={t("page.loadError")} onRetry={() => refetch()} />}
        {!isLoading && !isError && (skills ?? []).length === 0 && (
          <EmptyState
            icon="Sparkles"
            title={t("page.empty.title")}
            body={t("page.empty.body")}
            cta={t("page.empty.cta")}
            onCta={() => setCreating(true)}
          />
        )}
        {list.map((sk) => (
          <SkillRailCard
            key={sk.id}
            skill={sk}
            active={sk.id === activeId}
            onClick={() => router.push(`/skills/${sk.id}?tab=${tab}`)}
            toggling={update.isPending}
            onToggle={(enabled) => update.mutate({ id: sk.id, patch: { enabled } })}
            onDelete={() => setDeleting(sk)}
          />
        ))}
      </div>
    </div>
  );
}
