import { Intent } from '@devdigest/shared';
import type { LLMProvider } from '@devdigest/shared';
import { MAX_ITEM_CHARS, MAX_LIST_ITEMS, MAX_SUMMARY_CHARS } from './constants.js';
import { buildIntentPrompt } from './prompt.js';
import type { IntentPromptInput, PromptComponent } from './types.js';

export interface DeriveIntentArgs {
  llm: LLMProvider;
  model: string;
  input: IntentPromptInput;
  /** OpenRouter session id (optional). */
  sessionId?: string;
}

export interface DeriveIntentResult {
  intent: Intent;
  usage: { tokensIn: number; tokensOut: number; costUsd: number | null };
  raw: string;
  attempts: number;
  /** Prompt component names + sizes, for logging. */
  components: PromptComponent[];
}

function capList(items: readonly string[] | null | undefined): string[] {
  return (items ?? [])
    .map((s) => s.trim().slice(0, MAX_ITEM_CHARS))
    .filter((s) => s.length > 0)
    .slice(0, MAX_LIST_ITEMS);
}

/**
 * CALL 1 — the intent classifier. The injected provider is the only side
 * effect. Provider errors propagate (the server's ensureFresh is fail-soft).
 * List/item caps are enforced here, not trusted to the model.
 */
export async function deriveIntent(args: DeriveIntentArgs): Promise<DeriveIntentResult> {
  const { messages, components } = buildIntentPrompt(args.input);
  const res = await args.llm.completeStructured<Intent>({
    model: args.model,
    schema: Intent,
    schemaName: 'Intent',
    messages,
    temperature: 0,
    maxRetries: 2,
    requireParameters: true,
    ...(args.sessionId ? { sessionId: args.sessionId } : {}),
  });
  const intent: Intent = {
    intent: res.data.intent.trim().slice(0, MAX_SUMMARY_CHARS),
    in_scope: capList(res.data.in_scope),
    out_of_scope: capList(res.data.out_of_scope),
    risk_areas: capList(res.data.risk_areas),
  };
  return {
    intent,
    usage: { tokensIn: res.tokensIn, tokensOut: res.tokensOut, costUsd: res.costUsd },
    raw: res.raw,
    attempts: res.attempts,
    components,
  };
}
