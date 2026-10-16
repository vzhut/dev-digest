"use client";

import React from "react";
import type { Agent, CiPostAs, CiTrigger } from "@devdigest/shared";
import { useCiInstall, useCiPreview, useCiZip } from "@/lib/hooks/ci";
import { useActiveRepo } from "@/lib/repo-context";
import {
  DEFAULT_POST_AS,
  DEFAULT_TRIGGERS,
  WIZARD_STEPS,
  type InstallMethod,
} from "./constants";
import { buildRequest, configKey, saveBlob, toggleTrigger, zipFileName } from "./helpers";

/** What the last preview was generated from: the config (regenerates the workflow) and the edited text. */
interface LoadedPreview {
  config: string;
  edited: string | null;
}

/** State and actions of the Export to CI wizard: Target -> Preview -> Configure -> Install. */
export function useExportWizard(agent: Agent) {
  const { repos, repoId: activeRepoId } = useActiveRepo();
  const [step, setStep] = React.useState(0);
  const [pickedRepoId, setPickedRepoId] = React.useState<string | null>(null);
  const [triggers, setTriggers] = React.useState<CiTrigger[]>([...DEFAULT_TRIGGERS]);
  const [postAs, setPostAs] = React.useState<CiPostAs>(DEFAULT_POST_AS);
  const [edited, setEdited] = React.useState<string | null>(null);
  const [loaded, setLoaded] = React.useState<LoadedPreview | null>(null);
  const [method, setMethod] = React.useState<InstallMethod>("pr");

  const preview = useCiPreview(agent.id);
  const install = useCiInstall(agent.id);
  const zip = useCiZip(agent.id, (blob) => saveBlob(blob, zipFileName(agent.name)));

  // The picked repo wins, then the shell's active repo, then the first connected one.
  const repoId =
    pickedRepoId ?? (repos.some((r) => r.id === activeRepoId) ? activeRepoId : null) ?? repos[0]?.id ?? null;
  const repo = repos.find((r) => r.id === repoId) ?? null;

  const loadPreview = (nextRepoId: string, workflow: string | null, config: string) => {
    setLoaded({ config, edited: workflow });
    preview.mutate(buildRequest({ repoId: nextRepoId, triggers, postAs, workflow }));
  };

  /** Make the preview match the current choices: a new config regenerates (dropping edits), edited text revalidates. */
  const syncPreview = () => {
    if (!repoId) return;
    const config = configKey(repoId, triggers, postAs);
    if (loaded === null || loaded.config !== config) {
      setEdited(null);
      loadPreview(repoId, null, config);
    } else if (loaded.edited !== edited) {
      loadPreview(repoId, edited, config);
    }
  };

  const configChanged = loaded !== null && repoId !== null && loaded.config !== configKey(repoId, triggers, postAs);
  const canContinue =
    step === 0 ? repoId !== null : step === 1 ? preview.isSuccess : step === 2 ? triggers.length > 0 : false;

  const next = () => {
    if (!canContinue || step >= WIZARD_STEPS.length - 1) return;
    syncPreview();
    setStep(step + 1);
  };
  const back = () => setStep(Math.max(0, step - 1));

  const violations = preview.data?.workflow_violations.length ?? 0;
  const submitting = install.isPending || zip.isPending;
  // A PR is blocked by workflow violations; the zip path stays available (the server still rejects invalid YAML).
  const canSubmit =
    preview.isSuccess && !submitting && !install.isSuccess && (method === "zip" || violations === 0);

  const submit = () => {
    if (!repoId) return;
    const request = buildRequest({ repoId, triggers, postAs, workflow: edited });
    if (method === "pr") install.mutate(request);
    else zip.mutate(request);
  };

  return {
    step,
    repos,
    repoId,
    repo,
    setRepoId: setPickedRepoId,
    triggers,
    toggleTrigger: (t: CiTrigger) => setTriggers((cur) => toggleTrigger(cur, t)),
    postAs,
    setPostAs,
    edited,
    setEdited,
    /** The user changed the triggers/post mode/repo after the preview: Continue will regenerate and drop edits. */
    configChanged,
    method,
    setMethod,
    preview,
    install,
    zip,
    canContinue,
    canSubmit,
    submitting,
    next,
    back,
    submit,
  };
}
