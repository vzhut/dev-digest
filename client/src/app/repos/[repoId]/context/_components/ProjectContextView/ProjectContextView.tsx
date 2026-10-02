/* Project Context view — /repos/:repoId/context. Two panes: the left lists the repo's
   Markdown docs (path + type) with the search roots, refresh / roots-editor toolbar and
   the totals footer; the right previews the selected doc (read-only) with its
   "Used by N agents" count. The first doc is auto-selected. */
"use client";

import React from "react";
import { useParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { Button, Icon, EmptyState, ErrorState, Modal, Skeleton } from "@devdigest/ui";
import { AppShell } from "@/components/app-shell";
import { DocPreview } from "@/components/doc-preview";
import { RepoNotFound } from "@/components/repo-not-found";
import { useActiveRepo, useRepoNotFound } from "@/lib/repo-context";
import { apiErrorMessage } from "@/lib/api";
import { relativeTime } from "@/lib/relative-time";
import { useContextDocs } from "@/lib/hooks/context";
import { SKELETON_ROWS } from "./constants";
import { areaOf, areaTone, effectiveSelection, splitPath } from "./helpers";
import { s } from "./styles";
import { DocEditor } from "./_components/DocEditor";
import { RootsEditor } from "./_components/RootsEditor";

export function ProjectContextView() {
  const t = useTranslations("context.page");
  const tType = useTranslations("context.checklist.type");
  const params = useParams<{ repoId: string }>();
  const repoId = params.repoId;
  const { activeRepo } = useActiveRepo();
  const repoNotFound = useRepoNotFound(repoId);
  const { data, isLoading, isError, error, refetch, isFetching } = useContextDocs(repoId);
  const [selected, setSelected] = React.useState<string | null>(null);
  const [editingRoots, setEditingRoots] = React.useState(false);
  // Path being edited (null = preview). Deriving "editing" from the path drops edit mode when the selection moves.
  const [editPath, setEditPath] = React.useState<string | null>(null);
  const [dirty, setDirty] = React.useState(false);
  const previewTabRef = React.useRef<HTMLButtonElement>(null);
  const editTabRef = React.useRef<HTMLButtonElement>(null);
  const [pendingLeave, setPendingLeave] = React.useState<(() => void) | null>(null);

  const repoName = activeRepo?.full_name ?? repoId;
  const crumb = [{ label: repoName, mono: true }, { label: t("title") }];

  if (repoNotFound) {
    return (
      <AppShell crumb={crumb}>
        <RepoNotFound />
      </AppShell>
    );
  }

  const files = data?.files ?? [];
  const selectedDoc = effectiveSelection(files, selected);
  const editing = !!selectedDoc && editPath === selectedDoc.path;
  const refreshing = isFetching && !isLoading;
  const hasList = !isLoading && !isError && data?.status === "ok" && files.length > 0;

  /** Runs `action`, first asking to discard when the editor holds unsaved changes. */
  function guard(action: () => void) {
    if (editing && dirty) setPendingLeave(() => action);
    else action();
  }
  const leaveEdit = () => {
    setEditPath(null);
    setDirty(false);
  };
  const select = (path: string) =>
    guard(() => {
      leaveEdit();
      setSelected(path);
    });

  /** Roving-tabindex arrow keys: Left/Right/Home/End move between the two tabs and activate the target. */
  function onTabKeyDown(e: React.KeyboardEvent, current: "preview" | "edit") {
    const key = e.key;
    if (key !== "ArrowLeft" && key !== "ArrowRight" && key !== "Home" && key !== "End") return;
    e.preventDefault();
    const target = key === "Home" || (key === "ArrowLeft" && current === "edit") ? "preview"
      : key === "End" || key === "ArrowRight" ? "edit" : current;
    if (target === current || !selectedDoc) return;
    (target === "preview" ? previewTabRef : editTabRef).current?.focus();
    if (target === "preview") guard(leaveEdit);
    else setEditPath(selectedDoc.path);
  }

  let list: React.ReactNode = null;
  let right: React.ReactNode;
  if (isLoading) {
    list = (
      <div style={s.leftBand} role="status" aria-label={t("title")}>
        {Array.from({ length: SKELETON_ROWS }).map((_, i) => (
          <Skeleton key={i} height={36} />
        ))}
      </div>
    );
    right = <div style={s.rightBand}><Skeleton height={120} /></div>;
  } else if (isError) {
    right = (
      <div style={s.rightBand}>
        <ErrorState title={t("error.title")} body={apiErrorMessage(error, "")} onRetry={() => refetch()} />
      </div>
    );
  } else if (data?.status === "not_cloned") {
    right = (
      <div style={s.rightBand}>
        <EmptyState icon="FileText" title={t("notCloned.title")} body={t("notCloned.body")} />
      </div>
    );
  } else if (files.length === 0) {
    right = (
      <div style={s.rightBand}>
        <EmptyState icon="FileText" title={t("empty.title")} body={t("empty.body", { roots: (data?.roots ?? []).join(", ") })} />
      </div>
    );
  } else {
    list = (
      <ul style={s.list}>
        {files.map((f) => {
          const active = f.path === selectedDoc?.path;
          const { dir, base } = splitPath(f.path);
          const area = areaOf(f.path);
          return (
            <li key={f.path}>
              <button
                type="button"
                aria-pressed={active}
                aria-current={active ? "true" : undefined}
                aria-label={f.path}
                onClick={() => select(f.path)}
                style={{ ...s.rowButton, ...(active ? s.rowButtonActive : null) }}
              >
                <span style={s.rowIcon}>
                  <Icon.FileText size={14} />
                </span>
                <span style={s.rowPath}>
                  <span className="mono" style={s.rowBase}>
                    {base}
                  </span>
                  {dir && (
                    <span className="mono" style={s.rowDir}>
                      {dir}
                    </span>
                  )}
                </span>
                <span title={tType(f.type)} style={{ ...s.rowTag, ...areaTone(area) }}>
                  {area}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    );
    right = selectedDoc ? (
      <>
        <div style={s.rightHeader}>
          <span className="mono" style={s.headerPath}>
            <span style={s.headerDir}>{splitPath(selectedDoc.path).dir}</span>
            {splitPath(selectedDoc.path).base}
          </span>
          <div role="tablist" aria-label={t("viewTabs")} style={s.tabs}>
            <button
              type="button"
              ref={previewTabRef}
              role="tab"
              aria-selected={!editing}
              tabIndex={editing ? -1 : 0}
              onKeyDown={(e) => onTabKeyDown(e, "preview")}
              onClick={() => guard(leaveEdit)}
              style={{ ...s.tab, ...(!editing ? s.tabActive : null) }}
            >
              {t("preview")}
            </button>
            <button
              type="button"
              ref={editTabRef}
              role="tab"
              aria-selected={editing}
              tabIndex={editing ? 0 : -1}
              onKeyDown={(e) => onTabKeyDown(e, "edit")}
              onClick={() => setEditPath(selectedDoc.path)}
              style={{ ...s.tab, ...(editing ? s.tabActive : null) }}
            >
              {t("edit.tab")}
            </button>
          </div>
          <span style={s.usedBy}>
            <Icon.Cpu size={14} />
            {t("usedBy", { count: selectedDoc.used_by_agents })}
          </span>
        </div>
        <div style={s.rightScroll}>
          {editing ? (
            <DocEditor
              key={selectedDoc.path}
              repoId={repoId}
              path={selectedDoc.path}
              onDirtyChange={setDirty}
              onCancel={() => guard(leaveEdit)}
              onSaved={leaveEdit}
            />
          ) : (
            <DocPreview repoId={repoId} path={selectedDoc.path} hideTitle />
          )}
        </div>
      </>
    ) : null;
  }

  return (
    <AppShell crumb={crumb}>
      <div style={s.page}>
        <aside style={s.left} aria-label={t("title")}>
          <div style={s.leftHeader}>
            <h1 style={s.smallCaps}>{t("title")}</h1>
            {data && data.roots.length > 0 && (
              <p className="mono" style={s.rootsLine}>
                {data.roots.join(", ")}
              </p>
            )}
          </div>
          <div style={s.toolbar}>
            <button
              type="button"
              aria-label={refreshing ? t("refreshing") : t("refresh")}
              title={t("refresh")}
              disabled={refreshing}
              onClick={() => refetch()}
              style={s.iconButton}
            >
              <span style={refreshing ? s.spin : undefined}>
                <Icon.RefreshCw size={15} />
              </span>
            </button>
            {data && (
              <button
                type="button"
                aria-label={t("roots.toggle")}
                title={t("roots.toggle")}
                aria-expanded={editingRoots}
                onClick={() => setEditingRoots((v) => !v)}
                style={{ ...s.iconButton, ...(editingRoots ? s.iconButtonActive : null) }}
              >
                <Icon.Settings size={15} />
              </button>
            )}
          </div>
          {data && editingRoots && (
            <div style={s.rootsEditorBand}>
              <RootsEditor key={data.roots.join("\n")} repoId={repoId} roots={data.roots} />
            </div>
          )}
          <div style={s.listScroll}>{list}</div>
          {data && (
            <div style={s.footer}>
              {t("footer", { files: files.length, tokens: data.total_tokens, ago: relativeTime(data.scanned_at) })}
            </div>
          )}
        </aside>
        <section style={s.right} aria-label={hasList ? t("preview") : undefined}>
          {right}
        </section>
      </div>
      {pendingLeave && (
        <Modal
          width={440}
          title={t("edit.discard.title")}
          onClose={() => setPendingLeave(null)}
          footer={
            <div style={s.confirmFooter}>
              <Button kind="tertiary" onClick={() => setPendingLeave(null)}>
                {t("edit.discard.keep")}
              </Button>
              <Button
                kind="primary"
                onClick={() => {
                  const action = pendingLeave;
                  setPendingLeave(null);
                  action();
                }}
              >
                {t("edit.discard.discard")}
              </Button>
            </div>
          }
        >
          <p style={s.confirmBody}>{t("edit.discard.body")}</p>
        </Modal>
      )}
    </AppShell>
  );
}
