"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Icon, Badge, MonoLink } from "@devdigest/ui";
import type { BlastRadius } from "@devdigest/shared";
import { callerHref, symbolKinds, symbolLabel } from "../../helpers";
import { s } from "./styles";

interface BlastTreeProps {
  blast: BlastRadius;
  repoFullName?: string | null;
  headSha?: string | null;
}

export function BlastTree({ blast, repoFullName, headSha }: BlastTreeProps) {
  const t = useTranslations("blast");
  const kinds = symbolKinds(blast);
  const [open, setOpen] = React.useState<Set<string>>(
    () => new Set(blast.downstream.slice(0, 1).map((d) => d.symbol)),
  );

  const toggle = (symbol: string) =>
    setOpen((prev) => {
      const next = new Set(prev);
      if (next.has(symbol)) next.delete(symbol);
      else next.add(symbol);
      return next;
    });

  return (
    <div style={s.list}>
      {blast.downstream.map((d) => {
        const isOpen = open.has(d.symbol);
        const Chevron = isOpen ? Icon.ChevronDown : Icon.ChevronRight;
        return (
          <div key={d.symbol}>
            <button
              type="button"
              style={{ ...s.symbolRow, ...(isOpen ? s.symbolRowOpen : null) }}
              aria-expanded={isOpen}
              onClick={() => toggle(d.symbol)}
            >
              <Chevron size={14} style={s.chevron} />
              <Icon.Code size={14} style={s.codeIcon} />
              <span className="mono" style={s.symbol}>
                {symbolLabel(d.symbol, kinds.get(d.symbol))}
              </span>
              <span style={s.count}>{t("callerCount", { count: d.callers.length })}</span>
            </button>

            {isOpen && (
              <div style={s.body}>
                <ul style={s.callers}>
                  {d.callers.map((c) => {
                    const href = callerHref(repoFullName, headSha, c.file, c.line);
                    const label = `${c.file}:${c.line}`;
                    return (
                      <li key={`${c.file}:${c.line}:${c.name}`} style={s.callerRow}>
                        <span style={s.tick} aria-hidden />
                        <Icon.CornerDownRight size={13} style={s.arrow} />
                        <span style={s.path} title={label}>
                          {href ? (
                            <MonoLink href={href}>{label}</MonoLink>
                          ) : (
                            <span className="mono">{label}</span>
                          )}
                        </span>
                      </li>
                    );
                  })}
                </ul>
                {(d.endpoints_affected.length > 0 || d.crons_affected.length > 0) && (
                  <div style={s.chips}>
                    {d.endpoints_affected.map((e) => (
                      <Badge key={`e:${e}`} mono icon="Globe" color="var(--accent-text)" bg="var(--accent-bg)">
                        {e}
                      </Badge>
                    ))}
                    {d.crons_affected.map((c) => (
                      <Badge key={`c:${c}`} mono icon="Clock" color="var(--warn)" bg="var(--warn-bg)">
                        {c}
                      </Badge>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
