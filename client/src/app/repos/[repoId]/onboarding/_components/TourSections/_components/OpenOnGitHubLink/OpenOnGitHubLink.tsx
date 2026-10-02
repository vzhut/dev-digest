"use client";

import { useTranslations } from "next-intl";
import { Icon } from "@devdigest/ui";
import { buildOpenUrl } from "../../helpers";
import { s } from "../../styles";

/** Open a tour path on GitHub at the tour's pinned commit (blob for a file, tree for a dir). */
export function OpenOnGitHubLink({
  repoFullName,
  sha,
  path,
  kind = "file",
}: {
  repoFullName: string;
  sha: string;
  path: string;
  kind?: "file" | "dir";
}) {
  const t = useTranslations("onboarding.sections");
  const href = buildOpenUrl(repoFullName, sha, path, kind);
  if (!href) return null;
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      style={s.link}
      aria-label={t("openAria", { path })}
    >
      {t("open")} <Icon.ExternalLink size={12} />
    </a>
  );
}
