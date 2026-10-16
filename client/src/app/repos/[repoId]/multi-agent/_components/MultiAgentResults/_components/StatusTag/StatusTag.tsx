/* StatusTag — small coloured status line for an agent that has not finished successfully. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import type { DisplayStatus } from "../../helpers";
import { STATUS_COLOR } from "./constants";
import { s } from "./styles";

export function StatusTag({ status }: { status: DisplayStatus }) {
  const t = useTranslations("multiAgent.results.status");
  if (status === "done") return null;
  return (
    <span style={s.tag(STATUS_COLOR[status])}>
      <span aria-hidden style={s.dot(STATUS_COLOR[status])} />
      {t(status)}
    </span>
  );
}
