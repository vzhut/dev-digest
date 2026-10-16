"use client";

import type { LogLine } from "@devdigest/ui";
import { useRunEvents } from "@/lib/hooks/reviews";
import { displayStatus, isLive, type DisplayStatus } from "./helpers";
import type { RunColumn } from "./types";

/** Live state of one child run: its SSE log tail and the displayed status. When the stream
    ends (the child settled) `onSettled` refetches the parent read. */
export function useAgentLive(
  column: RunColumn,
  onSettled: () => void,
): { status: DisplayStatus; log: LogLine[]; live: boolean } {
  const live = isLive(column.status);
  const { events } = useRunEvents(live ? [column.run_id] : [], { onSettled });
  const log: LogLine[] = events.map((e) => ({ t: e.t, k: e.kind as LogLine["k"], m: e.msg }));
  return { status: displayStatus(column.status, events.length > 0), log, live };
}
