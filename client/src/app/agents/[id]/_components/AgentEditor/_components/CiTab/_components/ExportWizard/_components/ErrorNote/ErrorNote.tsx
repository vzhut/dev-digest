"use client";

import { useTranslations } from "next-intl";
import { apiErrorMessage } from "@/lib/api";
import { knownErrorCode } from "../../helpers";
import { s } from "./styles";

/** A failed wizard request: the message of the server's error code, else the server's own text. */
export function ErrorNote({ error }: { error: unknown }) {
  const t = useTranslations("ci.exportWizard");
  const code = knownErrorCode(error);
  return (
    <div role="alert" style={s.box}>
      {code ? t(`errors.${code}`) : apiErrorMessage(error, t("errors.generic"))}
    </div>
  );
}
