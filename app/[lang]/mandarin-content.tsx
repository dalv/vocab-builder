import VocabRenderer from "./vocab-renderer";
import { mandarinSections, mandarinTotalLabel } from "./mandarin-data";
import type { MasteryLevel } from "../lib/srs";

export default function MandarinContent({
  masteryMap = null,
}: {
  masteryMap?: Map<string, MasteryLevel> | null;
}) {
  return (
    <VocabRenderer
      sections={mandarinSections}
      totalLabel={mandarinTotalLabel}
      lang="mandarin"
      masteryMap={masteryMap}
    />
  );
}
