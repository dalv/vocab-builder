import VocabRenderer from "./vocab-renderer";
import { indonesianSections, indonesianTotalLabel } from "./indonesian-data";

export default function IndonesianContent() {
  return (
    <VocabRenderer
      sections={indonesianSections}
      totalLabel={indonesianTotalLabel}
    />
  );
}
