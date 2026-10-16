import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { NextIntlClientProvider } from "next-intl";
import type { Agent, CiInstallation, CiPreview, Repo } from "@devdigest/shared";
import { ApiError } from "@/lib/api";
import agents from "../../../../../../../../../../messages/en/agents.json";
import ci from "../../../../../../../../../../messages/en/ci.json";
import { ExportWizard } from "./ExportWizard";

const mocks = vi.hoisted(() => ({
  ciPreview: vi.fn(),
  ciInstall: vi.fn(),
  ciZip: vi.fn(),
  repos: [] as unknown[],
}));

vi.mock("@/lib/api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api")>()),
  api: { ciPreview: mocks.ciPreview, ciInstall: mocks.ciInstall, ciZip: mocks.ciZip },
}));
vi.mock("@/lib/repo-context", () => ({
  useActiveRepo: () => ({ repos: mocks.repos, repoId: "r1", setRepoId: () => {}, activeRepo: null, reposLoaded: true }),
}));

const WORKFLOW_PATH = ".github/workflows/devdigest-review.yml";

const repo = (id: string, full_name: string): Repo => ({
  id,
  workspace_id: "w1",
  owner: full_name.split("/")[0]!,
  name: full_name.split("/")[1]!,
  full_name,
  default_branch: "main",
  clone_path: null,
  last_polled_at: null,
  created_by: null,
});

const agent = {
  id: "a1",
  name: "Security Reviewer",
  description: "",
  provider: "openrouter",
  model: "m",
  system_prompt: "p",
  enabled: true,
  version: 2,
  strategy: "single-pass",
  ci_fail_on: "critical",
  repo_intel: true,
} as Agent;

const preview = (over: Partial<CiPreview> = {}): CiPreview => ({
  files: [
    { path: WORKFLOW_PATH, contents: "name: generated", editable: true },
    { path: ".devdigest/agents/security-reviewer.yaml", contents: "name: Security Reviewer", editable: false },
  ],
  workflow_violations: [],
  warnings: [],
  ...over,
});

const installation: CiInstallation = {
  id: "i1",
  agent_id: "a1",
  repo: "acme/payments-api",
  repo_id: "r1",
  target_type: "gha",
  installed_at: "2026-10-01T00:00:00Z",
  manifest_version: 2,
  workflow_version: 1,
  current_workflow_version: 1,
  pr_url: "https://github.com/acme/payments-api/pull/7",
  status: "pending",
};

const onClose = vi.fn();

function renderWizard() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <NextIntlClientProvider locale="en" messages={{ ci, agents }}>
        <ExportWizard agent={agent} onClose={onClose} />
      </NextIntlClientProvider>
    </QueryClientProvider>,
  );
}

const cont = () => screen.getByRole("button", { name: "Continue" });
const currentStep = () => screen.getByRole("listitem", { current: "step" });
const FORK_NOTE = /Pull requests from forks are skipped/;

/** Target -> Preview (waits for the generated files). */
async function toPreview() {
  fireEvent.click(cont());
  await screen.findByRole("textbox", { name: `Edit ${WORKFLOW_PATH}` });
}

async function toConfigure() {
  await toPreview();
  fireEvent.click(cont());
}

async function toInstall() {
  await toConfigure();
  fireEvent.click(cont());
}

beforeEach(() => {
  mocks.ciPreview.mockReset().mockResolvedValue(preview());
  mocks.ciInstall.mockReset();
  mocks.ciZip.mockReset();
  mocks.repos = [repo("r1", "acme/payments-api"), repo("r2", "acme/web")];
  onClose.mockReset();
});
afterEach(cleanup);

describe("ExportWizard", () => {
  it("walks Target -> Preview -> Configure -> Install and shows the PR link after a successful install", async () => {
    mocks.ciInstall.mockResolvedValue({ installation, pr_url: "https://github.com/acme/payments-api/pull/7" });
    renderWizard();

    expect(currentStep()).toHaveTextContent("Target");
    expect(screen.getByRole("button", { name: "Back" })).toBeDisabled();
    expect(screen.getByLabelText(/Target repository/)).toHaveValue("r1");

    await toPreview();
    expect(currentStep()).toHaveTextContent("Preview");
    expect(mocks.ciPreview).toHaveBeenCalledTimes(1);
    expect(mocks.ciPreview).toHaveBeenCalledWith("a1", {
      repo_id: "r1",
      triggers: ["opened", "synchronize"],
      post_as: "github_review",
    });
    expect(screen.getByRole("textbox", { name: `Edit ${WORKFLOW_PATH}` })).toHaveValue("name: generated");

    fireEvent.click(cont());
    expect(currentStep()).toHaveTextContent("Configure");
    expect(screen.getByText(FORK_NOTE)).toBeInTheDocument();
    expect(screen.getByText(/A REQUEST_CHANGES review verdict alone does not block a merge/)).toBeInTheDocument();
    expect(screen.getByText(/mark the DevDigest Review check as required/)).toBeInTheDocument();
    expect(screen.getByText("OPENROUTER_API_KEY")).toBeInTheDocument();
    expect(screen.getByText("required — cannot be checked from DevDigest")).toBeInTheDocument();
    expect(screen.getByText("Block on critical (recommended)")).toBeInTheDocument();

    fireEvent.click(cont());
    expect(currentStep()).toHaveTextContent("Install");
    expect(screen.getByText(FORK_NOTE)).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: /Open a PR with these files/ })).toBeChecked();
    expect(screen.getByText(/titled “Add DevDigest CI review” with the 2 generated files/)).toBeInTheDocument();
    // nothing changed after the first preview, so no second preview request
    expect(mocks.ciPreview).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole("button", { name: "Install" }));
    const link = await screen.findByRole("link", { name: "View pull request" });
    expect(link).toHaveAttribute("href", "https://github.com/acme/payments-api/pull/7");
    expect(mocks.ciInstall).toHaveBeenCalledWith("a1", {
      repo_id: "r1",
      triggers: ["opened", "synchronize"],
      post_as: "github_review",
    });
    expect(screen.getByText(/A pull request is ready in acme\/payments-api/)).toBeInTheDocument();

    // the footer's primary action replaces Install with Close (the header X has the same name)
    expect(screen.queryByRole("button", { name: "Install" })).not.toBeInTheDocument();
    fireEvent.click(screen.getAllByRole("button", { name: "Close" }).at(-1)!);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("renders no link when the server answers with a non-https PR url", async () => {
    mocks.ciInstall.mockResolvedValue({ installation, pr_url: "javascript:alert(1)" });
    renderWizard();
    await toInstall();
    fireEvent.click(screen.getByRole("button", { name: "Install" }));
    await screen.findByText(/A pull request is ready in/);
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
  });

  it("disables Continue on the Target step when no repository is connected", () => {
    mocks.repos = [];
    renderWizard();
    expect(screen.getByText(/Connect a repository first/)).toBeInTheDocument();
    expect(cont()).toBeDisabled();
  });

  it("lets the user pick another repo, and sends it in the preview request", async () => {
    renderWizard();
    fireEvent.change(screen.getByLabelText(/Target repository/), { target: { value: "r2" } });
    await toPreview();
    expect(mocks.ciPreview).toHaveBeenCalledWith("a1", expect.objectContaining({ repo_id: "r2" }));
  });

  it("re-previews with the edited workflow text, and regenerates (dropping the edit) after a config change", async () => {
    renderWizard();
    await toPreview();
    fireEvent.change(screen.getByRole("textbox", { name: `Edit ${WORKFLOW_PATH}` }), { target: { value: "name: edited" } });

    fireEvent.click(cont());
    await waitFor(() => expect(mocks.ciPreview).toHaveBeenCalledTimes(2));
    expect(mocks.ciPreview).toHaveBeenLastCalledWith("a1", {
      repo_id: "r1",
      triggers: ["opened", "synchronize"],
      post_as: "github_review",
      workflow: "name: edited",
    });
    expect(screen.getByText(/You edited the workflow\. Changing the triggers or the post mode regenerates it/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "pull_request:reopened" }));
    fireEvent.click(cont());
    await waitFor(() => expect(mocks.ciPreview).toHaveBeenCalledTimes(3));
    expect(mocks.ciPreview).toHaveBeenLastCalledWith("a1", {
      repo_id: "r1",
      triggers: ["opened", "synchronize", "reopened"],
      post_as: "github_review",
    });
  });

  it("blocks Continue on Configure until at least one trigger is on, and sends the chosen post mode", async () => {
    renderWizard();
    await toConfigure();

    const opened = screen.getByRole("button", { name: "pull_request:opened" });
    const sync = screen.getByRole("button", { name: "pull_request:synchronize" });
    expect(opened).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(opened);
    fireEvent.click(sync);
    expect(screen.getByRole("alert")).toHaveTextContent("Pick at least one trigger.");
    expect(cont()).toBeDisabled();

    fireEvent.click(opened);
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(cont()).toBeEnabled();

    fireEvent.click(screen.getByRole("radio", { name: /PR comment/ }));
    fireEvent.click(cont());
    await waitFor(() => expect(mocks.ciPreview).toHaveBeenCalledTimes(2));
    expect(mocks.ciPreview).toHaveBeenLastCalledWith("a1", {
      repo_id: "r1",
      triggers: ["opened"],
      post_as: "pr_comment",
    });
  });

  it("blocks the PR path while the workflow has violations, but keeps the .zip path available", async () => {
    mocks.ciPreview.mockResolvedValue(
      preview({ workflow_violations: [{ rule: "forbidden_trigger", message: "pull_request_target is not allowed" }] }),
    );
    mocks.ciZip.mockResolvedValue(new Blob(["zip"]));
    const create = vi.fn().mockReturnValue("blob:fake");
    const revoke = vi.fn();
    const originalUrl = { create: URL.createObjectURL, revoke: URL.revokeObjectURL };
    Object.assign(URL, { createObjectURL: create, revokeObjectURL: revoke });
    const downloads: string[] = [];
    const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (this: HTMLAnchorElement) {
      downloads.push(this.download);
    });

    try {
    renderWizard();
    await toPreview();
    expect(screen.getByRole("alert")).toHaveTextContent("This workflow breaks DevDigest's safety rules");
    expect(screen.getByRole("alert")).toHaveTextContent("forbidden_trigger");
    expect(screen.getByRole("alert")).toHaveTextContent("pull_request_target is not allowed");

    fireEvent.click(cont());
    fireEvent.click(cont());
    expect(screen.getByRole("alert")).toHaveTextContent("1 workflow problem blocks the pull request");
    expect(screen.getByRole("button", { name: "Install" })).toBeDisabled();

    const zipOption = screen.getByRole("radio", { name: /Download a \.zip/ });
    expect(zipOption).toBeEnabled();
    fireEvent.click(zipOption);
    expect(screen.queryByText(/workflow problem blocks/)).not.toBeInTheDocument();
    const download = screen.getByRole("button", { name: "Download .zip" });
    expect(download).toBeEnabled();

    fireEvent.click(download);
    await screen.findByText(/The \.zip was downloaded/);
    expect(mocks.ciInstall).not.toHaveBeenCalled();
    expect(mocks.ciZip).toHaveBeenCalledTimes(1);
    expect(downloads).toEqual(["devdigest-ci-security-reviewer.zip"]);
    expect(revoke).toHaveBeenCalledWith("blob:fake");
    // after a successful export the only way on is Close: going back would be a dead end
    expect(screen.getByRole("button", { name: "Back" })).toBeDisabled();
    } finally {
      click.mockRestore();
      Object.assign(URL, { createObjectURL: originalUrl.create, revokeObjectURL: originalUrl.revoke });
    }
  });

  it("shows the message of the server's error code when the install fails", async () => {
    mocks.ciInstall.mockRejectedValue(new ApiError("raw 403", 403, "token_permission_missing"));
    renderWizard();
    await toInstall();
    fireEvent.click(screen.getByRole("button", { name: "Install" }));

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("The GitHub token lacks permission");
    expect(alert).not.toHaveTextContent("raw 403");
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
    // the user can retry or switch to the zip
    expect(screen.getByRole("button", { name: "Install" })).toBeEnabled();
  });

  it("shows the preview error on the Preview step and keeps Continue disabled", async () => {
    mocks.ciPreview.mockRejectedValue(new ApiError("bundle", 500, "runner_bundle_missing"));
    renderWizard();
    fireEvent.click(cont());

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("runner bundle isn't built");
    expect(cont()).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Back" }));
    expect(currentStep()).toHaveTextContent("Target");
  });

  it("closes on Escape", () => {
    renderWizard();
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    fireEvent.keyDown(document, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
