"use client";

import { useTranslations } from "next-intl";
import { Icon } from "@devdigest/ui";
import type { Tour } from "@devdigest/shared";
import { useToast } from "@/lib/toast";
import { s } from "../../styles";
import { SectionCard } from "../SectionCard";

/** Commands are only displayed and copied, never run by DevDigest. */
export function RunLocallyCard({ tour }: { tour: Tour }) {
  const t = useTranslations("onboarding.sections");
  const toast = useToast();

  async function copy(command: string) {
    try {
      await navigator.clipboard.writeText(command);
      toast.success(t("run-locally.copied"));
    } catch {
      toast.error(t("run-locally.copyFailed"));
    }
  }

  return (
    <SectionCard id="run-locally" title={t("run-locally.title")}>
      {tour.run_locally.length === 0 ? (
        <p style={s.dim}>{t("run-locally.empty")}</p>
      ) : (
        <>
          <p style={s.note}>{t("run-locally.notice")}</p>
          <ul style={s.list}>
            {tour.run_locally.map((c) => (
              <li key={`${c.source_path}:${c.command}`} style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                <div style={s.row}>
                  <code style={{ ...s.mono, ...s.command }}>{c.command}</code>
                  <button
                    type="button"
                    style={s.iconButton}
                    aria-label={t("run-locally.copyAria", { command: c.command })}
                    onClick={() => void copy(c.command)}
                  >
                    <Icon.Copy size={14} />
                  </button>
                </div>
                <span style={s.dim}>
                  {t("run-locally.from", { path: c.source_path })}
                  {c.note ? ` · ${c.note}` : ""}
                </span>
              </li>
            ))}
          </ul>
        </>
      )}
    </SectionCard>
  );
}
