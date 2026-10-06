"use client";

import React from "react";
import { SectionLabel } from "@devdigest/ui";
import { IntentCard } from "./_components/IntentCard";
import { BlastRadius } from "./_components/BlastRadius";
import { PrBrief } from "./_components/PrBrief";
import { s } from "./styles";

interface OverviewTabProps {
  prBody: string | null | undefined;
  prId: string | null;
  repoId: string | null;
  repoFullName?: string | null;
  headSha?: string | null;
}

export function OverviewTab({ prBody, prId, repoId, repoFullName, headSha }: OverviewTabProps) {
  return (
    <>
      <PrBrief prId={prId} />

      <div style={s.briefGrid}>
        <IntentCard prId={prId} />
        <BlastRadius prId={prId} repoId={repoId} repoFullName={repoFullName} headSha={headSha} />
      </div>

      {prBody && (
        <section>
          <SectionLabel icon="MessageSquare">Description</SectionLabel>
          <div style={s.descriptionBox}>{prBody}</div>
        </section>
      )}
    </>
  );
}
