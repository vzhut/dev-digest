import { githubBlobUrl, githubTreeUrl } from "@/lib/github-urls";

const FULL_NAME_RE = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/;
const SHA_RE = /^[0-9a-f]{7,64}$/i;

/**
 * The only URL shapes the tour may open: https://github.com/<full_name>/{blob|tree}/<sha>/<path>.
 * Returns null (render no link) if the repo name or sha doesn't look like what
 * we expect, so repo/model-derived text can never steer the link elsewhere.
 */
export function buildOpenUrl(
  repoFullName: string,
  sha: string,
  path: string,
  kind: "file" | "dir",
): string | null {
  if (!FULL_NAME_RE.test(repoFullName) || !SHA_RE.test(sha) || !path) return null;
  // `.`/`..` segments would be normalised by the browser to a different github.com page.
  if ([...repoFullName.split("/"), ...path.split("/")].some((seg) => seg === "." || seg === "..")) return null;
  return kind === "dir"
    ? githubTreeUrl(repoFullName, sha, path)
    : githubBlobUrl(repoFullName, sha, path);
}
