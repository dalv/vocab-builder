import VocabRenderer from "./vocab-renderer";
import { indonesianSections, indonesianTotalLabel } from "./indonesian-data";
import type { MasteryLevel } from "../lib/srs";

export default function IndonesianContent({
  masteryMap = null,
}: {
  masteryMap?: Map<string, MasteryLevel> | null;
}) {
  return (
    <VocabRenderer
      sections={indonesianSections}
      totalLabel={indonesianTotalLabel}
      lang="indonesian"
      masteryMap={masteryMap}
    />
  );
}
