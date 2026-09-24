/* PromptModalBody — fullscreen modal body for a prompt block: monospace text +
   a line search. Fixed height so the modal stays stable even when the search
   finds nothing. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { TextInput } from "@devdigest/ui";
import { s } from "../../styles";

/** Highlight every case-insensitive occurrence of `q` within a single line. */
function highlightLine(line: string, q: string): React.ReactNode {
  if (!q) return line;
  const lower = line.toLowerCase();
  const ql = q.toLowerCase();
  const parts: React.ReactNode[] = [];
  let i = 0;
  while (i <= line.length) {
    const idx = lower.indexOf(ql, i);
    if (idx === -1) {
      parts.push(line.slice(i));
      break;
    }
    if (idx > i) parts.push(line.slice(i, idx));
    parts.push(
      <mark key={idx} style={s.highlight}>
        {line.slice(idx, idx + q.length)}
      </mark>,
    );
    i = idx + q.length;
  }
  return parts;
}

export function PromptModalBody({ text }: { text: string }) {
  const t = useTranslations("runs");
  const [q, setQ] = React.useState("");
  const lines = React.useMemo(() => (text || "—").split("\n"), [text]);
  const ql = q.trim().toLowerCase();
  // Keep each line's original number as its key — the filtered list changes as you type.
  const shown = ql
    ? lines.map((line, n) => ({ line, n })).filter(({ line }) => line.toLowerCase().includes(ql))
    : [];
  return (
    <div style={s.modalBody}>
      <div style={s.modalSearch}>
        <TextInput
          value={q}
          onChange={setQ}
          placeholder={t("trace.prompt.search")}
          suffix={
            ql ? (
              <span style={s.matchCount}>
                {shown.length} / {lines.length}
              </span>
            ) : undefined
          }
        />
      </div>
      <div style={s.modalScroll}>
        {ql && shown.length === 0 ? (
          <div style={s.noMatches}>
            {t("trace.prompt.noMatches", { q: q.trim() })}
          </div>
        ) : (
          <pre
            className="mono"
            style={s.promptText}
          >
            {ql ? shown.map(({ line, n }) => <div key={n}>{highlightLine(line, q)}</div>) : text || "—"}
          </pre>
        )}
      </div>
    </div>
  );
}
