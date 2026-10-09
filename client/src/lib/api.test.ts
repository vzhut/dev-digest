import { afterEach, describe, expect, it, vi } from "vitest";
import { api, apiFetch } from "./api";

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

describe("eval calls", () => {
  it("encode every interpolated id, send no body for a run of all cases and a JSON body for a subset", async () => {
    const fetchMock = vi.fn().mockImplementation(async () => okResponse());
    vi.stubGlobal("fetch", fetchMock);
    await api.getEvalRun("a/b?c");
    await api.startEvalRun("ag1");
    await api.startEvalRun("ag/1", ["c1"]);
    const urls = fetchMock.mock.calls.map((c) => String(c[0]));
    expect(urls[0]).toMatch(/\/eval-runs\/a%2Fb%3Fc$/);
    expect(urls[2]).toMatch(/\/agents\/ag%2F1\/eval-runs$/);
    const init = (i: number) => fetchMock.mock.calls[i]![1] as RequestInit;
    expect(init(1).body).toBeUndefined();
    expect((init(1).headers as Record<string, string>)["content-type"]).toBeUndefined();
    expect(JSON.parse(init(2).body as string)).toEqual({ case_ids: ["c1"] });
  });
});
