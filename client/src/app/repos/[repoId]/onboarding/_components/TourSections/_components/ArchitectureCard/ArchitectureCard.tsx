"use client";

import { useTranslations } from "next-intl";
import type { Tour } from "@devdigest/shared";
import { MermaidDiagram } from "@/components/mermaid-diagram";
import { s } from "../../styles";
import { SectionCard } from "../SectionCard";
import { TourMarkdown } from "../TourMarkdown";

export function ArchitectureCard({ tour }: { tour: Tour }) {
  const t = useTranslations("onboarding.sections");
  const { summary_md, diagram, stack, structure, routes } = tour.architecture;

  return (
    <SectionCard id="architecture" title={t("architecture.title")}>
      {summary_md ? <TourMarkdown>{summary_md}</TourMarkdown> : null}

      {diagram ? (
        <MermaidDiagram
          chart={diagram}
          fallback={<p style={s.note}>{t("architecture.diagramFallback")}</p>}
        />
      ) : null}

      {stack.length > 0 ? (
        <>
          <h3 style={s.subhead}>{t("architecture.stack")}</h3>
          <ul style={s.list}>
            {stack.map((item) => (
              <li key={`${item.name}:${item.evidence_path}`} style={s.row}>
                <span>{item.name}</span>
                <span style={{ ...s.mono, ...s.dim }}>{item.evidence_path}</span>
              </li>
            ))}
          </ul>
        </>
      ) : null}

      {structure.length > 0 ? (
        <>
          <h3 style={s.subhead}>{t("architecture.structure")}</h3>
          <ul style={s.list}>
            {structure.map((item) => (
              <li key={item.path} style={s.row}>
                <span style={s.mono}>{item.path}</span>
                <span style={s.dim}>{t("architecture.fileCount", { count: item.files })}</span>
              </li>
            ))}
          </ul>
        </>
      ) : null}

      {routes.length > 0 ? (
        <>
          <h3 style={s.subhead}>{t("architecture.routes")}</h3>
          <ul style={s.list}>
            {routes.map((r) => (
              <li key={`${r.method}:${r.path}:${r.file}`} style={s.row}>
                <span style={s.mono}>
                  {r.method} {r.path}
                </span>
                <span style={{ ...s.mono, ...s.dim }}>{r.file}</span>
              </li>
            ))}
          </ul>
        </>
      ) : null}
    </SectionCard>
  );
}
