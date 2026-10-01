"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Icon } from "@devdigest/ui";
import { s } from "../../styles";

/** One collapsible tour section. Starts expanded; the heading is focusable for the nav list. */
export function SectionCard({
  id,
  title,
  children,
}: {
  id: string;
  title: string;
  children: React.ReactNode;
}) {
  const t = useTranslations("onboarding.sections");
  const [open, setOpen] = React.useState(true);
  const bodyId = `${id}-body`;

  return (
    <section id={id} aria-labelledby={`${id}-heading`} style={s.card}>
      <div style={s.header}>
        <button
          type="button"
          style={s.toggle}
          aria-expanded={open}
          aria-controls={bodyId}
          aria-label={t("toggle", { title })}
          onClick={() => setOpen((v) => !v)}
        >
          {open ? <Icon.ChevronDown size={16} /> : <Icon.ChevronRight size={16} />}
        </button>
        <h2 id={`${id}-heading`} tabIndex={-1} style={s.heading}>
          {title}
        </h2>
      </div>
      <div id={bodyId} hidden={!open} style={s.body}>
        {children}
      </div>
    </section>
  );
}
