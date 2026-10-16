/* ColumnsView — the agents side by side as a grid. Up to MAX_FIT_COLUMNS share the width;
   more scroll horizontally. */
"use client";

import React from "react";
import type { RunColumn } from "../../types";
import { AgentColumn } from "./_components/AgentColumn";
import { s } from "./styles";

export function ColumnsView({
  columns,
  ranAt,
  now,
  onSettled,
  onViewTrace,
}: {
  columns: RunColumn[];
  ranAt: string;
  now: number;
  onSettled: () => void;
  onViewTrace: (runId: string) => void;
}) {
  return (
    <div style={s.wrap}>
      <div style={s.grid(columns.length)}>
        {columns.map((c) => (
          <AgentColumn key={c.run_id} column={c} ranAt={ranAt} now={now} onSettled={onSettled} onViewTrace={onViewTrace} />
        ))}
      </div>
    </div>
  );
}
