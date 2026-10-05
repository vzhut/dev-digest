import { z } from 'zod';
import { RiskSeverity } from '@devdigest/shared';

/**
 * The ONE structured LLM output of a brief generation (spec AC-17, D7).
 *
 * `BriefLlmOutput` carries the AC-17 bounds. Not every provider accepts every
 * JSON-Schema keyword (`maxLength`, `minItems`, `maximum` ...), so
 * `BriefLlmOutputWire` is the same shape without bounds: send the wire shape if
 * the provider rejects the bounded one, then run `BriefLlmOutput.safeParse` on
 * the result. A bound failure is a failed generation (AC-5), never a re-prompt.
 */
const RiskWire = z.object({
  kind: z.string(),
  title: z.string(),
  explanation: z.string(),
  severity: RiskSeverity,
  file_refs: z.array(z.string()),
});

const FocusWire = z.object({
  file: z.string(),
  line: z.number().int(),
  reason: z.string(),
});

export const BriefLlmOutputWire = z.object({
  summary: z.string(),
  risks: z.array(RiskWire),
  review_focus: z.array(FocusWire),
});

export const BriefLlmOutput = z.object({
  summary: z.string().min(1).max(600),
  risks: z.array(RiskWire.extend({ file_refs: z.array(z.string()).min(1).max(3) })).max(6),
  review_focus: z.array(FocusWire.extend({ line: z.number().int().min(1) })).max(6),
});
export type BriefLlmOutput = z.infer<typeof BriefLlmOutput>;
