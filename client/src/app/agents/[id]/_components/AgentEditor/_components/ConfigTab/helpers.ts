import type { Agent } from "@devdigest/shared";

/** The editable fields of an agent — exactly what Save sends as the patch. */
export type AgentForm = Pick<
  Agent,
  "name" | "description" | "provider" | "model" | "system_prompt" | "strategy" | "ci_fail_on" | "repo_intel" | "enabled"
>;

/** Initial form state for an agent. */
export function formFromAgent(agent: Agent): AgentForm {
  return {
    name: agent.name,
    description: agent.description,
    provider: agent.provider,
    model: agent.model,
    system_prompt: agent.system_prompt,
    strategy: agent.strategy,
    ci_fail_on: agent.ci_fail_on,
    repo_intel: agent.repo_intel,
    enabled: agent.enabled,
  };
}
