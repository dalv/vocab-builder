import VocabRenderer from "./vocab-renderer";
import { mandarinSections, mandarinTotalLabel } from "./mandarin-data";

export default function MandarinContent() {
  return (
    <VocabRenderer
      sections={mandarinSections}
      totalLabel={mandarinTotalLabel}
    />
  );
}
