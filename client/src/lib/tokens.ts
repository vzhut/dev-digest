/** Rough token count for a piece of text: characters / 4. An estimate, not a tokenizer. */
export function estimateTokens(text: string | null | undefined): number {
  return Math.ceil((text ?? "").length / 4);
}
