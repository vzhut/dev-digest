"use client";

import { useTranslations } from "next-intl";
import { SECTION_IDS } from "../../../TourSections";
import { s } from "./styles";

/** "On this page" nav: a click scrolls, focuses the heading and sets the fragment (AC-3). */
export function TourToc({ activeId, onSelect }: { activeId: string | null; onSelect: (id: string) => void }) {
  const t = useTranslations("onboarding");
  return (
    <nav aria-label={t("page.toc.label")} style={s.nav}>
      <p style={s.label} aria-hidden="true">
        {t("page.toc.label")}
      </p>
      <ul style={s.list}>
        {SECTION_IDS.map((id) => (
          <li key={id}>
            <a
              href={`#${id}`}
              aria-current={activeId === id ? "location" : undefined}
              onClick={(e) => {
                e.preventDefault();
                onSelect(id);
              }}
              style={{ ...s.link, ...(activeId === id ? s.linkActive : null) }}
            >
              {t(`sections.${id}.title`)}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  );
}
