import type { MultiAgentRunDetail } from "@devdigest/shared";

export type RunColumn = MultiAgentRunDetail["columns"][number];
export type RunConflict = MultiAgentRunDetail["conflicts"][number];
export type RunTake = RunConflict["takes"][number];
