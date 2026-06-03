/**
 * Sentence segmentation used to map a tapped Indonesian word to the matching
 * English sentence in the stored translation — WITHOUT re-translating.
 *
 * The trick: split the Indonesian story and the English translation with the
 * exact same rules. As long as both are split the same way, the Nth sentence of
 * paragraph P on the Indonesian side corresponds to the Nth sentence of
 * paragraph P on the English side. Even when the splitter over-segments (e.g.
 * a `?` inside dialogue), it does so on BOTH sides, so the indices still align.
 */

export type SentenceInfo = {
  text: string; // the sentence text (Indonesian side)
  para: number; // 0-based paragraph index
  sentInPara: number; // 0-based sentence index within its paragraph
};

/** Split text into non-empty paragraphs on blank lines / newlines. */
export function splitParagraphs(text: string): string[] {
  return text
    .split(/\n+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

/**
 * Split a paragraph into sentences, keeping terminal punctuation (and any
 * trailing closing quote/bracket) attached. A trailing fragment with no
 * terminal punctuation is kept as its own sentence.
 */
export function splitSentences(paragraph: string): string[] {
  const matches = paragraph.match(/[^.!?]+[.!?]+["'”’)\]]*|\S[^.!?]*$/g);
  return (matches ?? []).map((s) => s.trim()).filter(Boolean);
}

/** Count whitespace-delimited word tokens (matches alignment.ts tokenization). */
export function countWords(sentence: string): number {
  const t = sentence.trim();
  return t ? t.split(/\s+/).length : 0;
}

/**
 * Build, for a story text:
 *  - `sentences`: every sentence in reading order, with its paragraph position
 *  - `wordToSentence`: global word index → index into `sentences`
 *
 * The global word order matches the whitespace tokenization used to render and
 * highlight the story, so a rendered word's index looks up its sentence here.
 */
export function buildSentenceMap(text: string): {
  sentences: SentenceInfo[];
  wordToSentence: number[];
} {
  const sentences: SentenceInfo[] = [];
  const wordToSentence: number[] = [];

  splitParagraphs(text).forEach((para, p) => {
    splitSentences(para).forEach((sent, sentInPara) => {
      const sentenceIndex = sentences.length;
      sentences.push({ text: sent, para: p, sentInPara });
      const n = countWords(sent);
      for (let k = 0; k < n; k++) wordToSentence.push(sentenceIndex);
    });
  });

  return { sentences, wordToSentence };
}
