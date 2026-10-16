import { describe, expect, it, vi } from "vitest";
import { ApiError } from "@/lib/api";
import { KNOWN_ERROR_CODES } from "./constants";
import {
  buildRequest,
  configKey,
  isWorkflowFile,
  knownErrorCode,
  saveBlob,
  toggleTrigger,
  zipFileName,
} from "./helpers";

describe("toggleTrigger", () => {
  it("adds a trigger and keeps the canonical order", () => {
    expect(toggleTrigger(["synchronize"], "opened")).toEqual(["opened", "synchronize"]);
    expect(toggleTrigger(["opened", "synchronize"], "reopened")).toEqual(["opened", "synchronize", "reopened"]);
  });

  it("removes a trigger that is already on, down to an empty list", () => {
    expect(toggleTrigger(["opened", "synchronize"], "opened")).toEqual(["synchronize"]);
    expect(toggleTrigger(["opened"], "opened")).toEqual([]);
  });
});

describe("buildRequest", () => {
  const base = { repoId: "r1", triggers: ["opened"] as const, postAs: "pr_comment" as const };

  it("omits the workflow key when the generated one is sent", () => {
    const req = buildRequest({ ...base, workflow: null });
    expect(req).toEqual({ repo_id: "r1", triggers: ["opened"], post_as: "pr_comment" });
    expect("workflow" in req).toBe(false);
  });

  it("sends the edited workflow text as is, even when it is empty", () => {
    expect(buildRequest({ ...base, workflow: "name: x" }).workflow).toBe("name: x");
    expect(buildRequest({ ...base, workflow: "" }).workflow).toBe("");
  });
});

describe("configKey", () => {
  it("changes with the repo, the triggers and the post mode", () => {
    const k = configKey("r1", ["opened"], "github_review");
    expect(k).toBe("r1|opened|github_review");
    expect(configKey("r2", ["opened"], "github_review")).not.toBe(k);
    expect(configKey("r1", ["opened", "reopened"], "github_review")).not.toBe(k);
    expect(configKey("r1", ["opened"], "none")).not.toBe(k);
  });
});

describe("isWorkflowFile", () => {
  it("is true only under .github/workflows/", () => {
    expect(isWorkflowFile({ path: ".github/workflows/devdigest.yml" })).toBe(true);
    expect(isWorkflowFile({ path: ".devdigest/agents/security.yaml" })).toBe(false);
    expect(isWorkflowFile({ path: "docs/.github/workflows/x.yml" })).toBe(false);
  });
});

describe("knownErrorCode", () => {
  it.each(KNOWN_ERROR_CODES.map((c) => [c]))("recognises the server code %s", (code) => {
    expect(knownErrorCode(new ApiError("server text", 400, code))).toBe(code);
  });

  it("covers exactly the eight codes the server sends", () => {
    expect([...KNOWN_ERROR_CODES].sort()).toEqual(
      [
        "agent_not_exportable",
        "github_unavailable",
        "no_repository",
        "repo_not_accessible",
        "runner_bundle_missing",
        "token_missing",
        "token_permission_missing",
        "workflow_invalid",
      ].sort(),
    );
  });

  it("returns null for an unknown code, a missing code, or a non-ApiError", () => {
    expect(knownErrorCode(new ApiError("x", 500, "something_else"))).toBeNull();
    expect(knownErrorCode(new ApiError("x", 500))).toBeNull();
    expect(knownErrorCode(new Error("token_missing"))).toBeNull();
    expect(knownErrorCode(null)).toBeNull();
  });
});

describe("zipFileName", () => {
  it("slugifies the agent name", () => {
    expect(zipFileName("Security Reviewer v2!")).toBe("devdigest-ci-security-reviewer-v2.zip");
  });

  it("falls back to 'agent' when nothing usable is left", () => {
    expect(zipFileName("***")).toBe("devdigest-ci-agent.zip");
  });
});

describe("saveBlob", () => {
  it("downloads through a temporary link and releases the object URL", () => {
    const create = vi.fn().mockReturnValue("blob:fake");
    const revoke = vi.fn();
    Object.assign(URL, { createObjectURL: create, revokeObjectURL: revoke });
    const clicked: { href: string; download: string }[] = [];
    const click = vi
      .spyOn(HTMLAnchorElement.prototype, "click")
      .mockImplementation(function (this: HTMLAnchorElement) {
        clicked.push({ href: this.href, download: this.download });
      });

    saveBlob(new Blob(["zip"]), "out.zip");

    expect(clicked).toEqual([{ href: "blob:fake", download: "out.zip" }]);
    expect(revoke).toHaveBeenCalledWith("blob:fake");
    expect(document.querySelector("a[download]")).toBeNull();
    click.mockRestore();
  });
});
