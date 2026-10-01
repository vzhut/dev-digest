"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Icon } from "@devdigest/ui";
import { chevronFor } from "@/components/diff-viewer";
import type { DownstreamImpact } from "@devdigest/shared";
import { callerHref } from "../../helpers";
import { s } from "./styles";

/**
 * One group per changed symbol that has callers: the declaring file, its
 * callers as `file:line` links, then a separate Endpoints list and a
 * separate Cron / jobs list. Each group is collapsible — the first symbol
 * starts expanded, the rest start collapsed (P3.1) — so a PR with many
 * changed symbols doesn't dump every caller list open at once.
 */
export function SymbolList({
  downstream,
  repoFullName,
  indexRef,
}: {
  downstream: readonly DownstreamImpact[];
  repoFullName: string | null;
  indexRef: string;
}) {
  const t = useTranslations("blast");
  const [expanded, setExpanded] = React.useState<ReadonlySet<number>>(() => new Set([0]));

  const toggle = (index: number) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return next;
    });

  return (
    <ul style={s.list}>
      {downstream.map((d, index) => {
        const total = d.callers_total ?? d.callers.length;
        const open = expanded.has(index);
        return (
          <li key={d.symbol} style={s.item}>
            <button
              type="button"
              style={s.symbolRow}
              aria-expanded={open}
              onClick={() => toggle(index)}
            >
              <Icon.ChevronRight size={13} style={{ ...s.chevron, ...chevronFor(open) }} />
              <span className="mono" style={s.symbolName}>
                {d.symbol}
              </span>
              {d.file && (
                <span className="mono" style={s.symbolFile}>
                  {d.file}
                </span>
              )}
              <span style={s.count}>{t("callersShown", { shown: d.callers.length, total })}</span>
              <span style={s.srOnly}>{open ? t("tree.collapse", { symbol: d.symbol }) : t("tree.expand", { symbol: d.symbol })}</span>
            </button>

            {open && (
              <>
                <ul style={s.callerList}>
                  {d.callers.map((c) => {
                    const href = callerHref(repoFullName, indexRef, c.file, c.line);
                    return (
                      <li key={`${c.file}:${c.line}:${c.name}`} style={s.callerItem}>
                        {href ? (
                          <a
                            className="mono"
                            href={href}
                            target="_blank"
                            rel="noopener noreferrer"
                            aria-label={t("openAt", { file: c.file, line: c.line })}
                            style={s.callerLink}
                          >
                            {c.file}:{c.line}
                          </a>
                        ) : (
                          <span className="mono" style={s.callerText}>
                            {c.file}:{c.line}
                          </span>
                        )}
                        <span style={s.callerName}>{c.name}</span>
                      </li>
                    );
                  })}
                </ul>

                {d.endpoints_affected.length > 0 && (
                  <div style={s.section}>
                    <span style={s.sectionLabel}>{t("section.endpoints")}</span>
                    <ul style={s.list}>
                      {d.endpoints_affected.map((endpoint) => (
                        <li key={endpoint} className="mono" style={s.factItem}>
                          {endpoint}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {d.crons_affected.length > 0 && (
                  <div style={s.section}>
                    <span style={s.sectionLabel}>{t("section.crons")}</span>
                    <ul style={s.list}>
                      {d.crons_affected.map((cron) => (
                        <li key={cron} className="mono" style={s.factItem}>
                          {cron}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </>
            )}
          </li>
        );
      })}
    </ul>
  );
}
