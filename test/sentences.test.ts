import { test } from "node:test";
import assert from "node:assert/strict";
import {
  splitParagraphs,
  splitSentences,
  countWords,
  buildSentenceMap,
} from "../app/lib/stories/sentences.ts";

test("splitParagraphs splits on newlines and drops blanks", () => {
  assert.deepEqual(splitParagraphs("A.\n\nB.\nC."), ["A.", "B.", "C."]);
});

test("splitSentences keeps terminal punctuation attached", () => {
  assert.deepEqual(splitSentences("Aku makan. Kamu tidur!"), ["Aku makan.", "Kamu tidur!"]);
});

test("splitSentences keeps a trailing fragment with no terminal punctuation", () => {
  assert.deepEqual(splitSentences("Halo. Apa kabar"), ["Halo.", "Apa kabar"]);
});

test("splitSentences keeps a closing quote with the sentence", () => {
  assert.deepEqual(splitSentences('Dia bilang, "Halo." Lalu pergi.'), [
    'Dia bilang, "Halo."',
    "Lalu pergi.",
  ]);
});

test("Indonesian and English over-split dialogue CONSISTENTLY (indices align)", () => {
  const id = splitSentences('"Levy? Apa itu, Pak?"');
  const en = splitSentences('"Levy? What is that, sir?"');
  assert.equal(id.length, en.length); // same number of fragments → same indices
});

test("buildSentenceMap maps each word index to its sentence", () => {
  // 2 paragraphs: ["Aku makan nasi.", "Kamu tidur."] / ["Dia pergi."]
  const text = "Aku makan nasi. Kamu tidur.\nDia pergi.";
  const { sentences, wordToSentence } = buildSentenceMap(text);

  assert.equal(sentences.length, 3);
  assert.deepEqual(
    sentences.map((s) => [s.para, s.sentInPara]),
    [
      [0, 0],
      [0, 1],
      [1, 0],
    ],
  );
  // words: Aku(0) makan(1) nasi.(2) -> s0 ; Kamu(3) tidur.(4) -> s1 ; Dia(5) pergi.(6) -> s2
  assert.deepEqual(wordToSentence, [0, 0, 0, 1, 1, 2, 2]);
});

test("word count in the map equals the rendered whitespace token count", () => {
  const text = "Jadi gini ceritanya. Maya baru sampai.\n\"Wah, banyak nih,\" kata dia.";
  const { wordToSentence } = buildSentenceMap(text);
  const renderedWords = text.split(/\s+/).filter(Boolean).length;
  assert.equal(wordToSentence.length, renderedWords);
});
