/* AddRepoView — add-repository screen body. URL only. API keys (OpenAI /
   Anthropic / GitHub PAT) are NOT entered here; they live in Settings → API
   Keys and don't change per repo. Escapable: Esc or the close button returns
   to the app. */
"use client";

import React from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Button, Icon, IconBtn, Kbd, TextInput, FormField } from "@devdigest/ui";
import { useAddRepo } from "@/lib/hooks/core";
import { apiErrorMessage } from "@/lib/api";
import { s } from "./styles";

export function AddRepoView() {
  const t = useTranslations("repos");
  const router = useRouter();
  const [repoUrl, setRepoUrl] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const addRepo = useAddRepo();

  const close = React.useCallback(() => router.push("/"), [router]);

  // Escapable (the footer advertises Esc — make it real).
  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [close]);

  const submit = async () => {
    if (!repoUrl.trim()) return;
    setError(null);
    try {
      const repo = await addRepo.mutateAsync(repoUrl.trim());
      router.push(`/repos/${repo.id}/pulls`);
    } catch (e) {
      setError(apiErrorMessage(e, t("add.error")));
    }
  };

  return (
    <div style={s.page}>
      <div style={s.brand}>
        <div style={s.brandMark}>
          <Icon.Layers size={17} style={s.brandIcon} />
        </div>
        <span style={s.brandName}>{t("add.brand")}</span>
      </div>

      <div style={s.card}>
        <div style={s.close}>
          <IconBtn icon="X" label={t("add.close")} onClick={close} />
        </div>

        <h1 style={s.title}>{t("add.title")}</h1>
        <p style={s.intro}>
          {t.rich("add.intro", {
            link: (chunks) => (
              <a
                href="/settings/api-keys"
                onClick={(e) => {
                  e.preventDefault();
                  router.push("/settings/api-keys");
                }}
                style={s.link}
              >
                {chunks}
              </a>
            ),
          })}
        </p>

        <FormField label={t("add.urlLabel")} hint={t("add.urlHint")}>
          <TextInput
            value={repoUrl}
            onChange={setRepoUrl}
            mono
            placeholder="https://github.com/owner/repo"
            onKeyDown={(e) => {
              if (e.key === "Enter") submit();
            }}
          />
        </FormField>

        {error && (
          <div style={s.error}>
            <Icon.XCircle size={16} style={s.errorIcon} />
            <span style={s.errorText}>{error}</span>
          </div>
        )}

        <div style={s.actions}>
          <Button kind="ghost" size="md" onClick={close}>
            {t("add.cancel")}
          </Button>
          <div style={s.spacer} />
          <Button
            kind="primary"
            size="md"
            icon="Plus"
            onClick={submit}
            disabled={!repoUrl.trim() || addRepo.isPending}
          >
            {addRepo.isPending ? t("add.submitting") : t("add.submit")}
          </Button>
        </div>
      </div>

      <p style={s.footer}>
        <Icon.Lock size={12} /> {t.rich("add.footer", { kbd: (chunks) => <Kbd>{chunks}</Kbd> })}
      </p>
    </div>
  );
}
