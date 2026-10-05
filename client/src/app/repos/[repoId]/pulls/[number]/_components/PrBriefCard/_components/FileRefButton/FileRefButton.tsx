"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { parseFileRef } from "../../helpers";
import { s } from "../../styles";

/**
 * A file reference the user can open in Files changed. A path that is not in the
 * PR's diff (it can come from the model or the blast map) stays on Overview and
 * shows "File not in this PR's diff" next to the reference. `children` replaces
 * the default label when the reference is part of a longer line.
 */
export function FileRefButton({
  fileRef,
  diffPaths,
  onOpenInDiff,
  children,
}: {
  fileRef: string;
  diffPaths: ReadonlySet<string>;
  onOpenInDiff: (file: string, line: number) => void;
  children?: React.ReactNode;
}) {
  const t = useTranslations("brief");
  const [missing, setMissing] = React.useState(false);
  const { file, line, label } = parseFileRef(fileRef);

  function open() {
    if (diffPaths.has(file)) {
      setMissing(false);
      onOpenInDiff(file, line ?? 1);
    } else {
      setMissing(true);
    }
  }

  return (
    <>
      <button
        type="button"
        style={s.refButton}
        aria-label={t("ref.open", { target: label })}
        onClick={open}
      >
        {children ?? label}
      </button>
      {missing && (
        <span role="status" style={s.refNote}>
          {t("ref.notInDiff")}
        </span>
      )}
    </>
  );
}
