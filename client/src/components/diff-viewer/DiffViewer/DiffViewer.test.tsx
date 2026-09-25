import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { PrFile } from "@/lib/types";
import messages from "../../../../messages/en/shell.json";
import prReview from "../../../../messages/en/prReview.json";
import { DiffViewer } from "./DiffViewer";

afterEach(cleanup);

const A: PrFile = { path: "src/a.ts", additions: 1, deletions: 0, patch: "@@ -0,0 +1 @@\n+const alphaLine = 1;" };
const B: PrFile = { path: "src/b.ts", additions: 1, deletions: 0, patch: "@@ -0,0 +1 @@\n+const betaLine = 2;" };

function ui(files: PrFile[]) {
  return (
    <NextIntlClientProvider locale="en" messages={{ shell: messages, prReview }}>
      <DiffViewer files={files} />
    </NextIntlClientProvider>
  );
}

describe("DiffViewer", () => {
  it("keeps a file's collapsed state attached to that file when the list reorders", () => {
    const view = render(ui([A, B]));
    expect(screen.getByText(/alphaLine/)).toBeInTheDocument();

    fireEvent.click(screen.getByText("src/a.ts")); // collapse a.ts
    expect(screen.queryByText(/alphaLine/)).not.toBeInTheDocument();

    view.rerender(ui([B, A])); // a new push reorders the files
    expect(screen.queryByText(/alphaLine/)).not.toBeInTheDocument();
    expect(screen.getByText(/betaLine/)).toBeInTheDocument();
  });
});
