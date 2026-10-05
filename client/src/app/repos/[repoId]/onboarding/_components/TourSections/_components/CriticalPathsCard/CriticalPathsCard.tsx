"use client";

import { useTranslations } from "next-intl";
import type { Tour } from "@devdigest/shared";
import { s } from "../../styles";
import { SectionCard } from "../SectionCard";
import { OpenOnGitHubLink } from "../OpenOnGitHubLink";

export function CriticalPathsCard({ tour, repoFullName }: { tour: Tour; repoFullName: string }) {
  const t = useTranslations("onboarding.sections");
  return (
    <SectionCard id="critical-paths" title={t("critical-paths.title")}>
      {tour.critical_paths.length === 0 ? (
        <p style={s.dim}>{t("critical-paths.empty")}</p>
      ) : (
        <ul style={s.list}>
          {tour.critical_paths.map((p) => (
            <li key={p.path} style={s.row}>
              <span style={s.mono}>{p.path}</span>
              {p.reason ? <span>{p.reason}</span> : null}
              <span style={s.dim}>{p.computed_reason}</span>
              <OpenOnGitHubLink repoFullName={repoFullName} sha={tour.source_sha} path={p.path} />
            </li>
          ))}
        </ul>
      )}
    </SectionCard>
  );
}
