/* Home view — sends the user to the first repo's PR list, or offers onboarding if there are no repos. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { EmptyState, Button, Skeleton } from "@devdigest/ui";
import { AppShell } from "@/components/app-shell";
import { PageContainer } from "@/components/page-shell";
import { useRepos } from "@/lib/hooks/core";
import { s } from "./styles";

export function HomeView() {
  const t = useTranslations("repos");
  const router = useRouter();
  const { data: repos, isLoading, isError } = useRepos();

  React.useEffect(() => {
    if (repos && repos.length > 0) {
      router.replace(`/repos/${repos[0]!.id}/pulls`);
    }
  }, [repos, router]);

  return (
    <AppShell crumb={[{ label: t("home.crumb") }]}>
      <PageContainer title={t("home.title")} subtitle={t("home.subtitle")}>
        {isLoading ? (
          <div style={s.loading}>
            <Skeleton height={20} width={240} />
            <Skeleton height={48} />
            <Skeleton height={48} />
          </div>
        ) : isError || !repos || repos.length === 0 ? (
          <EmptyState
            icon="GitBranch"
            title={t("home.emptyTitle")}
            body={t("home.emptyBody")}
            cta={t("home.emptyCta")}
            onCta={() => router.push("/onboarding")}
          />
        ) : (
          <div>
            <p style={s.redirectNote}>{t("home.redirecting")}</p>
            <Button kind="primary" onClick={() => router.push(`/repos/${repos[0]!.id}/pulls`)}>
              {t("home.open", { name: repos[0]!.full_name })}
            </Button>
          </div>
        )}
      </PageContainer>
    </AppShell>
  );
}
