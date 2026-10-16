"use client";

import { Icon } from "@devdigest/ui";
import { s } from "./styles";

/** Numbered progress of the wizard; the current step carries aria-current="step". */
export function StepIndicator({ labels, current }: { labels: readonly string[]; current: number }) {
  return (
    <ol style={s.list}>
      {labels.map((label, i) => (
        <li key={label} style={s.item(i < labels.length - 1)} aria-current={i === current ? "step" : undefined}>
          <span style={s.dot(i < current ? "done" : i === current ? "current" : "todo")} aria-hidden="true">
            {i < current ? <Icon.Check size={13} /> : i + 1}
          </span>
          <span style={s.label(i <= current, i === current)}>{label}</span>
          {i < labels.length - 1 && <span style={s.line(i < current)} aria-hidden="true" />}
        </li>
      ))}
    </ol>
  );
}
