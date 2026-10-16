import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { CiPreview } from "@devdigest/shared";
import { ApiError } from "@/lib/api";
import ci from "../../../../../../../../../../../../messages/en/ci.json";
import { PreviewStep } from "./PreviewStep";

afterEach(cleanup);

const data: CiPreview = {
  files: [
    { path: ".github/workflows/devdigest-review.yml", contents: "name: generated", editable: true },
    { path: ".devdigest/agents/sec.yaml", contents: "name: Sec", editable: false },
  ],
  workflow_violations: [],
  warnings: ["Another agent (Style) is already installed in this repository."],
};

function renderStep(props: Partial<React.ComponentProps<typeof PreviewStep>> = {}) {
  const onEdit = vi.fn();
  render(
    <NextIntlClientProvider locale="en" messages={{ ci }}>
      <PreviewStep data={data} pending={false} error={null} edited={null} onEdit={onEdit} {...props} />
    </NextIntlClientProvider>,
  );
  return onEdit;
}

describe("PreviewStep", () => {
  it("shows the workflow as the editable file first, other files read-only, and the preview warnings", () => {
    const onEdit = renderStep();
    const editor = screen.getByRole("textbox", { name: "Edit .github/workflows/devdigest-review.yml" });
    expect(editor).toHaveValue("name: generated");
    fireEvent.change(editor, { target: { value: "name: mine" } });
    expect(onEdit).toHaveBeenCalledWith("name: mine");
    expect(screen.getByRole("status")).toHaveTextContent("Another agent (Style) is already installed");

    fireEvent.click(screen.getByRole("button", { name: /\.devdigest\/agents\/sec\.yaml/ }));
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
    expect(screen.getByLabelText(".devdigest/agents/sec.yaml", { selector: "pre" })).toHaveTextContent("name: Sec");
  });

  it("shows the edited text instead of the generated one", () => {
    renderStep({ edited: "name: edited" });
    expect(screen.getByRole("textbox")).toHaveValue("name: edited");
  });

  it("shows a skeleton while generating and the error note on failure", () => {
    renderStep({ data: undefined, pending: true });
    expect(screen.getByRole("status", { name: "Generating…" })).toBeInTheDocument();
    cleanup();
    renderStep({ error: new ApiError("x", 400, "workflow_invalid") });
    expect(screen.getByRole("alert")).toHaveTextContent("didn't pass validation");
  });
});
