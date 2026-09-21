import { afterEach, describe, expect, it, vi } from "vitest";
import { apiFetch } from "./api";

const okResponse = () => new Response(JSON.stringify({ ok: true }), { status: 200 });

afterEach(() => vi.restoreAllMocks());

function sentHeaders(): Record<string, string> {
  const spy = vi.mocked(fetch);
  return (spy.mock.calls[0]![1] as RequestInit).headers as Record<string, string>;
}

describe("apiFetch content-type", () => {
  it("declares JSON for a string body", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(okResponse()));
    await apiFetch("/x", { method: "POST", body: JSON.stringify({ a: 1 }) });
    expect(sentHeaders()["content-type"]).toBe("application/json");
  });

  it("does NOT declare JSON for FormData, so the browser can set the multipart boundary", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(okResponse()));
    const form = new FormData();
    form.append("file", new File(["x"], "s.zip"));
    await apiFetch("/skills/import/preview", { method: "POST", body: form });
    expect(sentHeaders()["content-type"]).toBeUndefined();
  });

  it("sends no content-type when there is no body", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(okResponse()));
    await apiFetch("/x", { method: "DELETE" });
    expect(sentHeaders()["content-type"]).toBeUndefined();
  });
});
