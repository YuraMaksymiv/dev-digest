/* SkillsRail — the left column of both /skills routes: search, Add Skill, and
   one card per skill in the workspace. */
"use client";

import React from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Button, Dropdown, ErrorState, Skeleton, TextInput, EmptyState } from "@devdigest/ui";
import { useSkills } from "../../../../lib/hooks/skills";
import { filterSkills } from "../../helpers";
import { s } from "../../styles";
import { SkillRailCard } from "./_components/SkillRailCard";
import { NewSkillModal } from "./_components/NewSkillModal";

export function SkillsRail({ activeId, tab }: { activeId?: string; tab: string }) {
  const t = useTranslations("skills");
  const router = useRouter();
  const { data: skills, isLoading, isError, refetch } = useSkills();
  const [creating, setCreating] = React.useState(false);
  const [search, setSearch] = React.useState("");

  const list = filterSkills(skills ?? [], search);

  return (
    <div style={s.rail}>
      {creating && <NewSkillModal onClose={() => setCreating(false)} />}
      <div style={s.railHeader}>
        <div style={s.railTitleRow}>
          <h1 style={s.h1}>{t("page.heading")}</h1>
          <Dropdown
            width={210}
            align="right"
            trigger={
              <Button kind="primary" size="sm" icon="Plus">
                {t("page.addSkill")}
              </Button>
            }
            items={[
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
          />
        ))}
      </div>
    </div>
  );
}
