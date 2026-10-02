/**
 * Secret redaction for text that may reach a log or an API response. Shared by
 * modules/intent and modules/onboarding (moved out of intent/helpers.ts).
 */

/** Hard cap on the redacted output length. */
export const MAX_REDACTED_CHARS = 300;

/**
 * Mask credentials before an error text reaches a log or an API response: git
 * errors can print the clone URL with the token embedded (server/INSIGHTS.md),
 * provider errors can echo an Authorization header. Also drops URL query
 * strings and userinfo. Output is length-capped.
 */
export function redactSecrets(msg: string): string {
  return msg
    .replace(/x-access-token:[^@\s/]+@/gi, 'x-access-token:***@')
    .replace(/(https?:\/\/)[^\s/@:]+:[^\s/@]+@/gi, '$1***@')
    .replace(/\bBearer\s+[A-Za-z0-9._~+/=-]+/gi, 'Bearer ***')
    .replace(/\bBasic\s+[A-Za-z0-9+/]{12,}={0,2}/g, 'Basic ***') // Jira: base64(email:token)
    .replace(/\blin_api_[A-Za-z0-9]{10,}/g, 'lin_api_***') // Linear personal API key
    .replace(/\bgithub_pat_[A-Za-z0-9_]{10,}/g, 'github_pat_***')
    .replace(/\bgh[pousr]_[A-Za-z0-9]{10,}/g, 'gh*_***')
    .replace(/\bsk-[A-Za-z0-9_-]{10,}/g, 'sk-***')
    .replace(/(https?:\/\/[^\s?#"'`]+)\?[^\s"'`]*/gi, '$1?…')
    .slice(0, MAX_REDACTED_CHARS);
}
