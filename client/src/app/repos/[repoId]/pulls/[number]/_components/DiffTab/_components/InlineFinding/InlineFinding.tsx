"use client";

import React from "react";
import type { FindingRecord } from "@devdigest/shared";
import { useFindingAction } from "@/lib/hooks/reviews";
import { FindingCard } from "../../../FindingCard";

interface InlineFindingProps {
  finding: FindingRecord;
  prId: string | null;
}

/** A FindingCard under its diff line, wired to accept/dismiss. */
export function InlineFinding({ finding, prId }: InlineFindingProps) {
  const action = useFindingAction();
  return (
    <FindingCard
      f={finding}
      defaultExpanded
      pending={action.isPending}
      onAction={(act, reply) =>
        action.mutate({ findingId: finding.id, action: act, reply, prId: prId ?? undefined })
      }
    />
  );
}
