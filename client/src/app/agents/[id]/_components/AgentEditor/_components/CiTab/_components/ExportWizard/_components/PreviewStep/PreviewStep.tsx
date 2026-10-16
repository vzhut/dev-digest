"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Badge, Icon, Skeleton } from "@devdigest/ui";
import type { CiPreview } from "@devdigest/shared";
import { isWorkflowFile } from "../../helpers";
import { ErrorNote } from "../ErrorNote";
import { s } from "./styles";

/** Step 2: the files that will be created. Only the workflow is editable; the runner is shown as a size note. */
export function PreviewStep({
  data,
  pending,
  error,
  edited,
  onEdit,
}: {
  data: CiPreview | undefined;
  pending: boolean;
  error: unknown;
  /** The edited workflow text; null while the generated one is untouched. */
  edited: string | null;
  onEdit: (text: string) => void;
}) {
  const t = useTranslations("ci.exportWizard");
  const [selected, setSelected] = React.useState<string | null>(null);

  if (error) return <ErrorNote error={error} />;
  if (pending || !data) {
    return (
      <div role="status" aria-label={t("generating")}>
        <Skeleton height={300} />
      </div>
    );
  }

  const file = data.files.find((f) => f.path === selected) ?? data.files.find(isWorkflowFile) ?? data.files[0];
  const editable = file !== undefined && isWorkflowFile(file);
  return (
    <div style={s.wrap}>
      <div style={s.panes}>
        <nav aria-label={t("filesToCreate")} style={s.tree}>
          <div style={s.treeHead}>{t("filesToCreate")}</div>
          <ul style={s.list}>
            {data.files.map((f) => (
              <li key={f.path}>
                <button
                  type="button"
                  style={s.row(f.path === file?.path)}
                  aria-current={f.path === file?.path ? "true" : undefined}
                  onClick={() => setSelected(f.path)}
                >
                  <Icon.FileText size={13} />
                  <span className="mono">{f.path}</span>
                </button>
              </li>
            ))}
          </ul>
        </nav>
        {file && (
          <div style={s.viewer}>
            <div style={s.viewerHead}>
              <span className="mono" style={s.path}>
                {file.path}
              </span>
              {editable && (
                <Badge color="var(--text-muted)" icon="Edit">
                  {t("editable")}
                </Badge>
              )}
            </div>
            {editable ? (
              <textarea
                className="mono"
                style={s.code}
                aria-label={t("workflowEditorLabel", { path: file.path })}
                spellCheck={false}
                value={edited ?? file.contents}
                onChange={(e) => onEdit(e.target.value)}
              />
            ) : (
              <pre className="mono" style={s.code} tabIndex={0} aria-label={file.path}>
                {file.contents}
              </pre>
            )}
          </div>
        )}
      </div>

      {data.workflow_violations.length > 0 && (
        <div role="alert" style={s.violations}>
          <strong>{t("violationsTitle")}</strong>
          <ul style={s.notes}>
            {data.workflow_violations.map((v, i) => (
              <li key={`${v.rule}-${i}`}>
                <span className="mono">{v.rule}</span> — {v.message}
              </li>
            ))}
          </ul>
        </div>
      )}
      {data.warnings.length > 0 && (
        <div role="status" style={s.warnings}>
          <ul style={s.notes}>
            {data.warnings.map((w, i) => (
              <li key={i}>{w}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
