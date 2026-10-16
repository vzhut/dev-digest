import { afterEach, describe, expect, it, vi } from "vitest";
import { API_BASE, ApiError, api } from "./api";

afterEach(() => vi.unstubAllGlobals());

const request = {
  repo_id: "11111111-1111-4111-8111-111111111111",
  triggers: ["opened" as const],
  post_as: "github_review" as const,
};

function stubFetch(res: Response) {
  const fetchMock = vi.fn().mockResolvedValue(res);
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });

describe("export-to-CI api calls", () => {
  it("ciPreview and ciInstall POST the request as JSON to the encoded agent path", async () => {
    const fetchMock = stubFetch(json({ files: [], workflow_violations: [], warnings: [] }));
    await api.ciPreview("a/1", request);
    fetchMock.mockResolvedValueOnce(json({ installation: {}, pr_url: null }));
    await api.ciInstall("a/1", request);

    const [previewUrl, previewInit] = fetchMock.mock.calls[0]!;
    expect(previewUrl).toBe(`${API_BASE}/agents/a%2F1/ci/preview`);
    expect(previewInit.method).toBe("POST");
    expect(JSON.parse(previewInit.body)).toEqual(request);
    expect(previewInit.headers["content-type"]).toBe("application/json");
    expect(fetchMock.mock.calls[1]![0]).toBe(`${API_BASE}/agents/a%2F1/ci/install`);
  });

  it("ciZip resolves with the binary body as a Blob, untouched by JSON parsing", async () => {
    const bytes = new Uint8Array([0x50, 0x4b, 0x03, 0x04]);
    const fetchMock = stubFetch(new Response(bytes, { status: 200, headers: { "content-type": "application/zip" } }));

    const blob = await api.ciZip("a1", request);

    expect(fetchMock.mock.calls[0]![0]).toBe(`${API_BASE}/agents/a1/ci/zip`);
    expect(blob).toBeInstanceOf(Blob);
    const read = await new Promise<ArrayBuffer>((resolve) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as ArrayBuffer);
      reader.readAsArrayBuffer(blob);
    });
    expect(new Uint8Array(read)).toEqual(bytes);
  });

  it("ciZip maps a server error to ApiError with the server's code and message", async () => {
    stubFetch(json({ error: { code: "workflow_invalid", message: "bad yaml" } }, 422));
    await expect(api.ciZip("a1", request)).rejects.toMatchObject({
      name: "ApiError",
      status: 422,
      code: "workflow_invalid",
      message: "bad yaml",
    });
  });

  it("ciZip reports a network failure as ApiError status 0", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("fetch failed")));
    const err = await api.ciZip("a1", request).catch((e) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect(err.status).toBe(0);
    expect(err.code).toBe("network_error");
  });

  it("ciInstallations GETs the encoded agent path", async () => {
    const fetchMock = stubFetch(json([]));
    await expect(api.ciInstallations("a b")).resolves.toEqual([]);
    expect(fetchMock.mock.calls[0]![0]).toBe(`${API_BASE}/agents/a%20b/ci/installations`);
    expect(fetchMock.mock.calls[0]![1]?.method).toBeUndefined();
  });

  it("ciSyncRuns POSTs without a body (and so without a JSON content-type)", async () => {
    const fetchMock = stubFetch(json({ runs: [], accepted: 0, duplicates: 0, rejected: 0 }));
    const result = await api.ciSyncRuns();
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe(`${API_BASE}/ci/runs/sync`);
    expect(init.method).toBe("POST");
    expect(init.body).toBeUndefined();
    expect(init.headers["content-type"]).toBeUndefined();
    expect(result.runs).toEqual([]);
  });
});
