import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { CreateEvalCaseResponse, FindingRecord, ReviewRecord } from "@devdigest/shared";
import messages from "../../../../../../../../../../messages/en/prReview.json";
import { api } from "@/lib/api";
import { notify } from "@/lib/toast";
import { EvalCaseAction } from "./EvalCaseAction";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const FINDING = {
  id: "f1",
  review_id: "r1",
  title: "Hardcoded key",
  accepted_at: "2026-10-08T09:00:00Z",
  dismissed_at: null,
} as FindingRecord;

const review = (agent_id: string | null) => [{ id: "r1", agent_id }] as ReviewRecord[];

function renderAction(finding: FindingRecord, opts: { agentId?: string | null; links?: { finding_id: string; case_id: string; type: "must_find" | "must_not_flag" }[] }) {
  vi.spyOn(api, "get").mockResolvedValue(review(opts.agentId === undefined ? "a1" : opts.agentId));
  vi.spyOn(api, "getEvalCaseLinks").mockResolvedValue(opts.links ?? []);
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <NextIntlClientProvider locale="en" messages={{ prReview: messages }}>
        <EvalCaseAction finding={finding} prId="p1" />
      </NextIntlClientProvider>
    </QueryClientProvider>,
  );
}

const created = (flag: boolean) => ({ created: flag, case: { agent_id: "a1" } }) as CreateEvalCaseResponse;

describe("EvalCaseAction", () => {
  it("one click on an accepted finding sends exactly one create request and opens no dialog", async () => {
    const post = vi.spyOn(api, "createEvalCase").mockResolvedValue(created(true));
    const toast = vi.spyOn(notify, "success");
    renderAction(FINDING, {});
    const button = await screen.findByRole("button", { name: "Turn into eval case" });
    await waitFor(() => expect(button).toBeEnabled());
    fireEvent.click(button);
    await waitFor(() => expect(post).toHaveBeenCalledTimes(1));
    expect(post).toHaveBeenCalledWith("f1");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    await waitFor(() => expect(toast).toHaveBeenCalledWith("Eval case created"));
  });

  it("says the case already exists when the server returns created:false", async () => {
    vi.spyOn(api, "createEvalCase").mockResolvedValue(created(false));
    const toast = vi.spyOn(notify, "success");
    renderAction(FINDING, {});
    const button = await screen.findByRole("button", { name: "Turn into eval case" });
    await waitFor(() => expect(button).toBeEnabled());
    fireEvent.click(button);
    await waitFor(() => expect(toast).toHaveBeenCalledWith("An eval case already exists for this finding"));
  });

  it("is disabled with a described reason while the finding is undecided", async () => {
    const post = vi.spyOn(api, "createEvalCase");
    renderAction({ ...FINDING, accepted_at: null }, {});
    const button = await screen.findByRole("button", { name: "Turn into eval case" });
    expect(button).toBeDisabled();
    expect(button).toHaveAccessibleDescription("Accept or dismiss this finding first");
    fireEvent.click(button);
    expect(post).not.toHaveBeenCalled();
  });

  it("is disabled with a reason when no agent produced the finding", async () => {
    renderAction(FINDING, { agentId: null });
    const button = await screen.findByRole("button", { name: "Turn into eval case" });
    await waitFor(() => expect(button).toHaveAccessibleDescription("This finding has no producing agent"));
    expect(button).toBeDisabled();
  });

  it("shows the case type tag instead of the button once a case exists", async () => {
    renderAction(FINDING, { links: [{ finding_id: "f1", case_id: "c1", type: "must_not_flag" }] });
    expect(await screen.findByText("must_not_flag")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Turn into eval case" })).not.toBeInTheDocument();
  });
});
