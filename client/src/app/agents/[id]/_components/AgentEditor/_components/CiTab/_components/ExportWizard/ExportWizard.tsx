/* ExportWizard — Export to CI as a modal dialog: Target -> Preview -> Configure -> Install. State and the
   preview/install/zip requests live in useExportWizard; each step is a child component. Escape and the
   Close button dismiss it, Tab stays inside, and the current step carries aria-current="step". */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Button, Modal } from "@devdigest/ui";
import type { Agent } from "@devdigest/shared";
import { useDialogKeys } from "@/lib/use-dialog-keys";
import { WIZARD_STEPS } from "./constants";
import { useExportWizard } from "./useExportWizard";
import { ConfigureStep } from "./_components/ConfigureStep";
import { InstallStep } from "./_components/InstallStep";
import { PreviewStep } from "./_components/PreviewStep";
import { StepIndicator } from "./_components/StepIndicator";
import { TargetStep } from "./_components/TargetStep";
import { s } from "./styles";

export function ExportWizard({ agent, onClose }: { agent: Agent; onClose: () => void }) {
  const t = useTranslations("ci.exportWizard");
  const w = useExportWizard(agent);
  const bodyRef = React.useRef<HTMLDivElement>(null);
  useDialogKeys(bodyRef, onClose);

  const last = w.step === WIZARD_STEPS.length - 1;
  const done = w.install.isSuccess || w.zip.isSuccess;
  const installLabel = w.method === "pr" ? t("install") : t("download");
  const pendingLabel = w.method === "pr" ? t("installing") : t("downloading");

  return (
    <Modal
      width={900}
      title={t("title")}
      subtitle={t("subtitle", { agentName: agent.name })}
      onClose={onClose}
      footer={
        <div style={s.footer}>
          <Button kind="secondary" onClick={w.back} disabled={w.step === 0 || w.submitting || done}>
            {t("back")}
          </Button>
          <span style={s.spacer} />
          {done ? (
            <Button kind="primary" onClick={onClose}>
              {t("close")}
            </Button>
          ) : last ? (
            <Button kind="primary" icon="Check" onClick={w.submit} disabled={!w.canSubmit} loading={w.submitting}>
              {w.submitting ? pendingLabel : installLabel}
            </Button>
          ) : (
            <Button kind="primary" onClick={w.next} disabled={!w.canContinue}>
              {t("continue")}
            </Button>
          )}
        </div>
      }
    >
      <div ref={bodyRef} style={s.body}>
        <StepIndicator labels={WIZARD_STEPS.map((k) => t(`steps.${k}`))} current={w.step} />
        {w.step === 0 && <TargetStep repos={w.repos} repoId={w.repoId} onRepo={w.setRepoId} />}
        {w.step === 1 && (
          <PreviewStep
            data={w.preview.data}
            pending={w.preview.isPending}
            error={w.preview.error}
            edited={w.edited}
            onEdit={w.setEdited}
          />
        )}
        {w.step === 2 && (
          <ConfigureStep
            triggers={w.triggers}
            onToggleTrigger={w.toggleTrigger}
            postAs={w.postAs}
            onPostAs={w.setPostAs}
            failOn={agent.ci_fail_on}
            workflowEdited={w.edited !== null}
          />
        )}
        {last && (
          <InstallStep
            repoName={w.repo?.full_name ?? ""}
            fileCount={w.preview.data?.files.length ?? 0}
            method={w.method}
            onMethod={w.setMethod}
            previewPending={w.preview.isPending}
            previewError={w.preview.error}
            violationCount={w.preview.data?.workflow_violations.length ?? 0}
            installResult={w.install.data}
            installError={w.install.error}
            zipDone={w.zip.isSuccess}
            zipError={w.zip.error}
          />
        )}
      </div>
    </Modal>
  );
}
