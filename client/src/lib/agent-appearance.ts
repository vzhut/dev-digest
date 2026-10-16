/* A stable icon + colour per agent, so the same agent looks the same on every multi-agent
   surface. Known roles match on the lowercased name; anything else hashes into a palette. */
import type { IconName } from "@devdigest/ui";

export interface AgentAppearance {
  icon: IconName;
  color: string;
}

const KEYWORD_RULES: Array<{ match: RegExp; icon: IconName; color: string }> = [
  { match: /security/, icon: "Shield", color: "#ef4444" },
  { match: /performance/, icon: "Zap", color: "#f59e0b" },
  { match: /mentor|junior|general/, icon: "Lightbulb", color: "#3b82f6" },
  { match: /customer|\bapi\b|contract/, icon: "Users", color: "#8b5cf6" },
  { match: /architect/, icon: "Boxes", color: "#10b981" },
  { match: /\btest|quality/, icon: "FlaskConical", color: "#14b8a6" },
];

const FALLBACK_PALETTE = ["#6366f1", "#ec4899", "#0ea5e9", "#84cc16", "#f97316", "#a855f7"];

function hash(text: string): number {
  let h = 0;
  for (let i = 0; i < text.length; i++) h = (h * 31 + text.charCodeAt(i)) >>> 0;
  return h;
}

export function agentAppearance(agent: { id?: string | null; name: string }): AgentAppearance {
  const name = agent.name.toLowerCase();
  const rule = KEYWORD_RULES.find((r) => r.match.test(name));
  if (rule) return { icon: rule.icon, color: rule.color };
  const color = FALLBACK_PALETTE[hash(agent.id ?? agent.name) % FALLBACK_PALETTE.length] ?? "#6366f1";
  return { icon: "Cpu", color };
}
