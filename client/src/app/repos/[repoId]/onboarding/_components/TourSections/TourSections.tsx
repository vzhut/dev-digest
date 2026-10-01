"use client";

import type { Tour } from "@devdigest/shared";
import { s } from "./styles";
import { ArchitectureCard } from "./_components/ArchitectureCard";
import { CriticalPathsCard } from "./_components/CriticalPathsCard";
import { RunLocallyCard } from "./_components/RunLocallyCard";
import { ReadingPathCard } from "./_components/ReadingPathCard";
import { FirstTasksCard } from "./_components/FirstTasksCard";

/** The five tour cards, in reading order. `repoFullName` builds the Open links. */
export function TourSections({ tour, repoFullName }: { tour: Tour; repoFullName: string }) {
  return (
    <div style={s.stack}>
      <ArchitectureCard tour={tour} />
      <CriticalPathsCard tour={tour} repoFullName={repoFullName} />
      <RunLocallyCard tour={tour} />
      <ReadingPathCard tour={tour} repoFullName={repoFullName} />
      <FirstTasksCard tour={tour} repoFullName={repoFullName} />
    </div>
  );
}
