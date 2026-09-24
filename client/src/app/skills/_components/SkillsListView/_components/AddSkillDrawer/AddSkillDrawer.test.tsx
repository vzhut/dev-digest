import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent, waitFor } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { SkillImportPreview } from "@devdigest/shared";
import messages from "../../../../../../../messages/en/skills.json";
import { AddSkillDrawer } from "./AddSkillDrawer";

const previewMutate = vi.fn();
const confirmMutate = vi.fn();
const firstCall = () => confirmMutate.mock.calls[0]?.[0] ?? {};
vi.mock("@/lib/hooks/skills", () => ({
  useImportPreview: () => ({ mutateAsync: previewMutate, isPending: false }),
  useConfirmImport: () => ({ mutateAsync: confirmMutate, isPending: false }),
}));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const PREVIEW: SkillImportPreview = {
  name: "sec-rules",
  description: "d",
  type: "security",
  body: "# b",
  included_files: ["SKILL.md"],
  ignored_files: ["run.sh"],
  name_taken: false,
};

function setup(onClose = vi.fn()) {
  render(
    <NextIntlClientProvider locale="en" messages={{ skills: messages }}>
      <AddSkillDrawer open onClose={onClose} />
    </NextIntlClientProvider>,
  );
  return onClose;
}

async function uploadFile(preview: SkillImportPreview) {
  previewMutate.mockResolvedValue(preview);
  const input = screen.getByLabelText("Choose a .md or .zip file") as HTMLInputElement;
  fireEvent.change(input, { target: { files: [new File(["x"], "s.zip")] } });
  await screen.findByText("run.sh");
}

describe("AddSkillDrawer", () => {
  it("is import-only: a file picker, no manual form", () => {
    setup();
    expect(screen.getByLabelText("Choose a .md or .zip file")).toBeInTheDocument();
    expect(screen.queryByText("Skill body (Markdown)")).toBeNull();
  });

  it("renders nothing when closed", () => {
    const { container } = render(
      <NextIntlClientProvider locale="en" messages={{ skills: messages }}>
        <AddSkillDrawer open={false} onClose={() => {}} />
      </NextIntlClientProvider>,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("lists included vs ignored files and confirms without persisting on cancel", async () => {
    const onClose = setup();
    await uploadFile(PREVIEW);
    expect(screen.getByText("SKILL.md")).toBeInTheDocument();
    expect(screen.getByText(/not imported, not executed/)).toBeInTheDocument();
    expect(screen.getByText(/saved disabled/)).toBeInTheDocument();

    fireEvent.click(screen.getByText("Cancel"));
    expect(confirmMutate).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
  });

  it("confirms an import", async () => {
    confirmMutate.mockResolvedValue({});
    const onClose = setup();
    await uploadFile(PREVIEW);
    fireEvent.click(screen.getByText("Confirm import"));
    await waitFor(() => expect(confirmMutate).toHaveBeenCalled());
    expect(firstCall()).toMatchObject({ name: "sec-rules", body: "# b" });
    expect(firstCall().on_conflict).toBeUndefined();
    await waitFor(() => expect(onClose).toHaveBeenCalled());
  });

  it("name taken: blocks unchanged name, allows update-existing", async () => {
    confirmMutate.mockResolvedValue({});
    setup();
    await uploadFile({ ...PREVIEW, name_taken: true });
    expect(screen.getByText(/already exists/)).toBeInTheDocument();
    expect(screen.getByText("Confirm import").closest("button")).toBeDisabled();
    fireEvent.click(screen.getByLabelText(/Update the existing skill/));
    fireEvent.click(screen.getByText("Update existing skill"));
    await waitFor(() =>
      expect(confirmMutate).toHaveBeenCalledWith(expect.objectContaining({ name: "sec-rules", on_conflict: "update" })),
    );
  });
});
