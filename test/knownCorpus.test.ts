import { test } from "node:test";
import assert from "node:assert/strict";
import { buildKnownCorpus, formatKnownCorpus } from "../app/lib/stories/knownCorpus.ts";
import { indonesianSections } from "../app/[lang]/indonesian-data.ts";
import type { Section } from "../app/[lang]/types.ts";

test("collects headwords AND words that only appear in example sentences", () => {
  const sections: Section[] = [
    {
      id: "verbs",
      title: "Verbs",
      count: "1",
      note: "",
      subsections: [
        {
          title: "Daily",
          words: [
            // "nasi goreng" never appears as a headword — only inside the example.
            { word: "suka", eng: "like", examples: [{ target: "Aku suka nasi goreng.", eng: "I like fried rice." }] },
          ],
        },
      ],
    },
  ];

  const corpus = buildKnownCorpus(sections);
  const text = formatKnownCorpus(corpus);

  // Headword present.
  assert.ok(text.includes("suka"), "headword missing");
  // Example-sentence-only vocabulary present (the critical requirement).
  assert.ok(text.includes("nasi goreng"), "example-sentence vocab missing");
  assert.ok(text.includes("Aku suka nasi goreng."), "example target missing verbatim");
});

test("collects section-level words and pairs, not just subsection words", () => {
  const sections: Section[] = [
    {
      id: "adjectives",
      title: "Adjective Pairs",
      count: "1",
      note: "",
      pairs: [
        {
          left: { word: "besar", eng: "big" },
          right: { word: "kecil", eng: "small" },
          examples: [
            { target: "Rumahnya besar.", eng: "The house is big." },
            { target: "Kamarnya kecil.", eng: "The room is small." },
          ],
        },
      ],
      words: [
        { word: "panas", eng: "hot", examples: [{ target: "Hari ini panas.", eng: "Today is hot." }] },
      ],
    },
  ];

  const corpus = buildKnownCorpus(sections);
  const words = corpus.map((c) => c.word);
  assert.deepEqual(new Set(words), new Set(["besar", "kecil", "panas"]));

  const text = formatKnownCorpus(corpus);
  assert.ok(text.includes("Kamarnya kecil."), "pair example missing");
  assert.ok(text.includes("Hari ini panas."), "section-level word example missing");
});

test("real indonesian data produces a substantial corpus with example text", () => {
  const corpus = buildKnownCorpus(indonesianSections);
  // ~390 entries per the data file's own label; sanity-check it's in range.
  assert.ok(corpus.length > 250, `expected >250 entries, got ${corpus.length}`);
  assert.ok(
    corpus.every((e) => e.word.length > 0 && e.eng.length > 0),
    "every entry has a word and gloss",
  );
  // Every entry should carry at least one example sentence.
  assert.ok(
    corpus.every((e) => e.examples.length >= 1),
    "every entry has at least one example",
  );

  const text = formatKnownCorpus(corpus);
  // "nasi goreng" only appears inside example sentences in the real data.
  assert.ok(text.includes("nasi goreng"), "expected example-only phrase in real corpus");
});
