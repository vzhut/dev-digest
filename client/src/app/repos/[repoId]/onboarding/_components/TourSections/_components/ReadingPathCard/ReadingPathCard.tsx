"use client";

import { useTranslations } from "next-intl";
import type { Tour } from "@devdigest/shared";
import { s } from "../../styles";
import { SectionCard } from "../SectionCard";
import { OpenOnGitHubLink } from "../OpenOnGitHubLink";

export function ReadingPathCard({ tour, repoFullName }: { tour: Tour; repoFullName: string }) {
  const t = useTranslations("onboarding.sections");
  return (
    <SectionCard id="reading-path" title={t("reading-path.title")}>
      {!tour.index.hotness_available ? <p style={s.note}>{t("reading-path.hotnessNote")}</p> : null}
      {tour.reading_path.length === 0 ? (
        <p style={s.dim}>{t("reading-path.empty")}</p>
      ) : (
        <ol style={{ ...s.list, paddingLeft: 0 }}>
          {tour.reading_path.map((p) => (
            <li key={p.path} style={s.row}>
              <span style={s.mono}>{p.path}</span>
              {p.why ? <span>{p.why}</span> : null}
              <span style={s.dim}>{p.computed_reason}</span>
              <OpenOnGitHubLink repoFullName={repoFullName} sha={tour.source_sha} path={p.path} />
            </li>
          ))}
        </ol>
      )}
    </SectionCard>
  );
}
