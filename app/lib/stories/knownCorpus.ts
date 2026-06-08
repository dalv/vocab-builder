import type { Section, WordEntry, PairEntry } from "../../[lang]/types";

/**
 * One known-vocabulary entry handed to the model: a headword + its gloss + the
 * example sentences the learner has studied. The example sentences are the
 * point — every word and phrase appearing inside them is treated as already
 * familiar, NOT just the headword.
 */
export type CorpusEntry = {
  word: string;
  eng: string;
  examples: { target: string; eng: string }[];
};

function wordEntryToCorpus(w: WordEntry): CorpusEntry {
  return {
    word: w.word,
    eng: w.eng,
    examples: w.examples.map((ex) => ({ target: ex.target, eng: ex.eng })),
  };
}

function pairEntryToCorpus(p: PairEntry): CorpusEntry[] {
  // A pair is two headwords (left/right), each with its own example sentence.
  return [
    {
      word: p.left.word,
      eng: p.left.eng,
      examples: [{ target: p.examples[0].target, eng: p.examples[0].eng }],
    },
    {
      word: p.right.word,
      eng: p.right.eng,
      examples: [{ target: p.examples[1].target, eng: p.examples[1].eng }],
    },
  ];
}

/**
 * Flatten the static vocabulary into a flat list of known entries.
 *
 * Mirrors the traversal in `app/lib/cards.ts:getAllCards` so the corpus and the
 * flashcard deck stay in lock-step: words and pairs are collected from BOTH the
 * section level and every subsection. Pure (no I/O) so it can be unit-tested
 * against hand-built sections.
 */
export function buildKnownCorpus(sections: Section[]): CorpusEntry[] {
  const out: CorpusEntry[] = [];

  const collect = (words?: WordEntry[], pairs?: PairEntry[]) => {
    if (words) for (const w of words) out.push(wordEntryToCorpus(w));
    if (pairs) for (const p of pairs) out.push(...pairEntryToCorpus(p));
  };

  for (const section of sections) {
    collect(section.words, section.pairs);
    if (section.subsections) {
      for (const sub of section.subsections) collect(sub.words, sub.pairs);
    }
  }

  return out;
}

/**
 * Render the corpus as the plain-text block injected into the system prompt.
 *
 * Headwords carry their English gloss; every example sentence is emitted
 * VERBATIM (Indonesian + English) so the model sees the affixed/colloquial
 * forms in context and can recognise them as familiar. We deliberately do NOT
 * tokenize or stem — the sentences go in whole.
 */
export type SentencePair = { indo: string; eng: string };

/**
 * Flat list of every example sentence (Indonesian + English) across the whole
 * vocabulary, de-duplicated by the Indonesian text. This is the pool the
 * "Sentences" study style samples from at random.
 */
export function allExampleSentences(sections: Section[]): SentencePair[] {
  const seen = new Set<string>();
  const out: SentencePair[] = [];
  for (const entry of buildKnownCorpus(sections)) {
    for (const ex of entry.examples) {
      const indo = ex.target.trim();
      if (!indo || seen.has(indo)) continue;
      seen.add(indo);
      out.push({ indo, eng: ex.eng.trim() });
    }
  }
  return out;
}

export function formatKnownCorpus(entries: CorpusEntry[]): string {
  const lines: string[] = [];
  for (const e of entries) {
    lines.push(`- ${e.word} — ${e.eng}`);
    for (const ex of e.examples) {
      lines.push(`    e.g. ${ex.target} (${ex.eng})`);
    }
  }
  return lines.join("\n");
}
