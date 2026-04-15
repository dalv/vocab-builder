import type { Section, WordEntry, PairEntry, Example } from "../[lang]/types";
import { indonesianSections } from "../[lang]/indonesian-data";
import { mandarinSections } from "../[lang]/mandarin-data";

export type Lang = "indonesian" | "mandarin";

/**
 * A single flash card. IDs are deterministic and stable — derived from the
 * static data files — so review state in the DB keeps pointing at the right
 * card even as the data files get edited, as long as (lang, section id,
 * kind, identifier) is preserved.
 */
export type Card = {
  id: string;
  lang: Lang;
  sectionId: string;
  // Front: what we show the user to prompt recall (English).
  front: string;
  frontExample: string;
  // Back: the answer (target language).
  back: string;
  backPinyin?: string;
  backExample: string;
  backExamplePinyin?: string;
  tag?: string;
};

function sectionsFor(lang: Lang): Section[] {
  return lang === "indonesian" ? indonesianSections : mandarinSections;
}

function wordToCard(lang: Lang, sectionId: string, w: WordEntry): Card {
  const ex: Example = w.examples[0];
  return {
    id: `${lang}:${sectionId}:word:${w.word}`,
    lang,
    sectionId,
    front: w.eng,
    frontExample: ex.eng,
    back: w.word,
    backPinyin: w.pinyin,
    backExample: ex.target,
    backExamplePinyin: ex.pinyin,
    tag: w.tag,
  };
}

function pairSideToCard(
  lang: Lang,
  sectionId: string,
  p: PairEntry,
  side: "left" | "right",
): Card {
  const s = p[side];
  const ex: Example = p.examples[side === "left" ? 0 : 1];
  return {
    id: `${lang}:${sectionId}:pair:${side}:${s.word}`,
    lang,
    sectionId,
    front: s.eng,
    frontExample: ex.eng,
    back: s.word,
    backPinyin: s.pinyin,
    backExample: ex.target,
    backExamplePinyin: ex.pinyin,
  };
}

export function getAllCards(lang: Lang): Card[] {
  const out: Card[] = [];
  for (const section of sectionsFor(lang)) {
    const collectFrom = (words?: WordEntry[], pairs?: PairEntry[]) => {
      if (words) for (const w of words) out.push(wordToCard(lang, section.id, w));
      if (pairs) {
        for (const p of pairs) {
          out.push(pairSideToCard(lang, section.id, p, "left"));
          out.push(pairSideToCard(lang, section.id, p, "right"));
        }
      }
    };
    collectFrom(section.words, section.pairs);
    if (section.subsections) {
      for (const sub of section.subsections) {
        collectFrom(sub.words, sub.pairs);
      }
    }
  }
  return out;
}

/**
 * Map of card id → Card, built once per lang. Handy for hydrating DB rows
 * (which only store the id) back into full card objects.
 */
export function getCardMap(lang: Lang): Map<string, Card> {
  const m = new Map<string, Card>();
  for (const c of getAllCards(lang)) m.set(c.id, c);
  return m;
}
