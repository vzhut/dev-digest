"use client";

import React from "react";
import { Icon, SEV, CategoryTag, ConfidenceNum, type Category } from "@devdigest/ui";
import type { FindingPreview } from "@devdigest/shared";
import { fileLineLabel } from "./helpers";
import { s } from "./styles";

/** One finding in the popover — read-only text by design: no buttons, no links.
 *  Accept/Reject live only on the Review runs finding cards. */
export function FindingPreviewItem({ finding: f }: { finding: FindingPreview }) {
  const meta = SEV[f.severity];
  const SevIcon = Icon[meta.icon];
  return (
    <div style={s.item}>
      <div style={s.itemTitleRow}>
        <span style={s.itemSeverity(meta.c, meta.bg)} title={meta.label}>
          <SevIcon size={12} />
        </span>
        <span style={s.itemTitleText}>
          <span style={s.itemTitle}>{f.title}</span>
          <span style={s.itemCategory}>
            <CategoryTag category={f.category as Category} />
          </span>
        </span>
      </div>
      <div style={s.itemMeta}>
        <span className="mono" style={s.itemFile}>
          {fileLineLabel(f)}
        </span>
        <ConfidenceNum value={f.confidence} />
      </div>
      {f.summary && <div style={s.itemSummary}>{f.summary}</div>}
    </div>
  );
}
