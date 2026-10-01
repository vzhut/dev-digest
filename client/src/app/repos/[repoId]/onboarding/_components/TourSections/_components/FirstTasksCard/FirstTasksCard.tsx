"use client";

import { useTranslations } from "next-intl";
import { Badge } from "@devdigest/ui";
import type { Tour } from "@devdigest/shared";
import { s } from "../../styles";
import { SectionCard } from "../SectionCard";
import { OpenOnGitHubLink } from "../OpenOnGitHubLink";

export function FirstTasksCard({ tour, repoFullName }: { tour: Tour; repoFullName: string }) {
  const t = useTranslations("onboarding.sections");
  const needsLlm = tour.mode === "skeleton" || tour.first_tasks.length === 0;

  return (
    <SectionCard id="first-tasks" title={t("first-tasks.title")}>
      {needsLlm ? (
        <p style={s.note}>{t("first-tasks.needsLlm")}</p>
      ) : (
        <ul style={s.list}>
          {tour.first_tasks.map((task) => (
            <li key={`${task.path}:${task.title}`} style={s.row}>
              <span>{task.title}</span>
              <span style={{ ...s.mono, ...s.dim }}>{task.path}</span>
              <Badge>{t(`first-tasks.complexity.${task.complexity}`)}</Badge>
              <OpenOnGitHubLink
                repoFullName={repoFullName}
                sha={tour.source_sha}
                path={task.path}
                kind={task.path_kind}
              />
            </li>
          ))}
        </ul>
      )}
    </SectionCard>
  );
}
