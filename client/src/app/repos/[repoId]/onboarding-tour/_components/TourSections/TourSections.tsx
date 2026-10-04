/* TourSections — the five section bodies. All model text is rendered through
   the Markdown primitive (no raw HTML); paths and commands are plain text. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Button, Markdown } from "@devdigest/ui";
import type { OnboardingResponse } from "@devdigest/shared";
import { MermaidDiagram } from "@/components/mermaid-diagram";
import { openUrl } from "../../helpers";
import { s } from "../../styles";
import { CopyButton } from "../CopyButton";
import { SectionCard } from "../SectionCard";

type Tour = NonNullable<OnboardingResponse["tour"]>;

function OpenButton({ url, path }: { url: string | null; path: string }) {
  const t = useTranslations("onboarding");
  if (!url) return null;
  return (
    <a href={url} target="_blank" rel="noopener noreferrer" aria-label={t("actions.openAria", { path })} style={{ textDecoration: "none" }}>
      <Button kind="ghost" size="sm" iconRight="ExternalLink" tabIndex={-1}>
        {t("actions.open")}
      </Button>
    </a>
  );
}

export function TourSections({
  tour,
  source,
  fullName,
  sha,
}: {
  tour: Tour | null;
  source: OnboardingResponse["source"];
  fullName: string | undefined;
  sha: string | null;
}) {
  const t = useTranslations("onboarding");
  const empty = <p style={s.why}>{t("empty.section")}</p>;

  return (
    <>
      <SectionCard id="architecture">
        {tour ? (
          <>
            <Markdown>{tour.architecture.summary_md}</Markdown>
            {tour.architecture.diagram && (
              <div style={s.diagram} role="img" aria-label={t("diagramAria")}>
                <MermaidDiagram chart={tour.architecture.diagram} />
              </div>
            )}
          </>
        ) : (
          empty
        )}
      </SectionCard>

      <SectionCard id="critical-paths">
        {tour && tour.critical_paths.length > 0 ? (
          <ul style={s.rows}>
            {tour.critical_paths.map((p) => (
              <li key={p.path} style={s.row}>
                <div style={s.rowText}>
                  <span style={s.mono}>{p.path}</span>
                  <div style={s.why}>
                    <Markdown>{p.reason}</Markdown>
                  </div>
                </div>
                <OpenButton url={openUrl(fullName, sha, p.path)} path={p.path} />
              </li>
            ))}
          </ul>
        ) : (
          empty
        )}
      </SectionCard>

      <SectionCard id="run-locally">
        {tour && tour.run_steps.length > 0 ? (
          <ol style={s.rows}>
            {tour.run_steps.map((step, i) => (
              <li key={`${i}-${step.command}`} style={s.row}>
                <span style={s.index}>{i + 1}</span>
                <div style={s.rowText}>
                  <code style={s.mono}>{step.command}</code>
                  <div style={s.why}>
                    <Markdown>{step.note}</Markdown>
                  </div>
                </div>
                <CopyButton text={step.command} ariaLabel={t("actions.copyAria", { command: step.command })} />
              </li>
            ))}
          </ol>
        ) : (
          empty
        )}
      </SectionCard>

      <SectionCard id="reading-path">
        {tour && tour.reading_path.length > 0 ? (
          <ol style={s.rows}>
            {tour.reading_path.map((r, i) => (
              <li key={r.path} style={s.row}>
                <span style={s.index}>{i + 1}</span>
                <div style={s.rowText}>
                  <span style={s.mono}>{r.path}</span>
                  <div style={s.why}>
                    <Markdown>{r.why}</Markdown>
                  </div>
                </div>
                <span style={s.score} aria-label={t("empty.scoreAria", { score: r.score.toFixed(2) })}>
                  {r.score.toFixed(2)}
                </span>
                <OpenButton url={openUrl(fullName, sha, r.path)} path={r.path} />
              </li>
            ))}
          </ol>
        ) : (
          empty
        )}
      </SectionCard>

      <SectionCard id="first-tasks">
        {tour && tour.first_tasks.length > 0 ? (
          <>
            {source === "skeleton" && <p style={s.note}>{t("empty.unranked")}</p>}
            <ul style={s.rows}>
              {tour.first_tasks.map((task, i) => (
                <li key={`${i}-${task.title}`} style={s.row}>
                  <div style={s.rowText}>
                    <strong style={{ color: "var(--text-primary)" }}>{task.title}</strong>
                    <div style={s.why}>
                      <Markdown>{task.why}</Markdown>
                    </div>
                    {task.files.length > 0 && (
                      <div style={{ ...s.mono, marginTop: 6 }}>{task.files.join(", ")}</div>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          </>
        ) : (
          empty
        )}
      </SectionCard>
    </>
  );
}
