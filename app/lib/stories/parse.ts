export type GeneratedStory = {
  title: string;
  story: string;
  translation_en: string;
};

// Sentinel markers for the model→server contract. We deliberately do NOT use
// JSON: the story is prose full of dialogue quotes ("...") and newlines, which
// routinely produce invalid JSON when the model forgets to escape them. Marker
// delimiters are immune to that — the field bodies can contain anything.
const TITLE = "@@TITLE@@";
const STORY = "@@STORY@@";
const TRANSLATION = "@@TRANSLATION@@";
const DIALOGUE = "@@DIALOGUE@@";
const TURN_SEP = "|||";

export const OUTPUT_FORMAT_INSTRUCTIONS = `Return your answer in EXACTLY this format, with these literal marker lines and
nothing before or after them (no markdown, no code fences):

${TITLE}
<short English title>
${STORY}
<the Indonesian story>
${TRANSLATION}
<a faithful English translation>`;

function section(raw: string, from: string, to: string | null): string {
  const start = raw.indexOf(from);
  if (start === -1) return "";
  const bodyStart = start + from.length;
  const end = to ? raw.indexOf(to, bodyStart) : -1;
  const slice = end === -1 ? raw.slice(bodyStart) : raw.slice(bodyStart, end);
  return slice.trim();
}

/**
 * Parse the marker-delimited model output. Tolerant: strips stray code fences,
 * then carves out each field by its marker. The story body may contain quotes,
 * newlines, punctuation — anything except the marker lines themselves.
 */
export function parseStoryOutput(raw: string): GeneratedStory {
  const cleaned = raw.replace(/```[a-z]*\n?/gi, "").trim();

  const title = section(cleaned, TITLE, STORY);
  const story = section(cleaned, STORY, TRANSLATION);
  const translation_en = section(cleaned, TRANSLATION, null);

  if (!story) {
    throw new Error("Model output missing a non-empty story section");
  }
  return {
    title: title || "Untitled",
    story,
    translation_en,
  };
}

// ---------------------------- Sentences -----------------------------------

const SENTENCES = "@@SENTENCES@@";

export type SentencePairOut = { indo: string; eng: string };

export const SENTENCES_OUTPUT_FORMAT_INSTRUCTIONS = `Return ONLY this — no markdown, no code fences, no numbering:

${SENTENCES}
Then ONE line per sentence, each in this exact pipe format:

<Indonesian sentence> ${TURN_SEP} <English translation>

No blank lines, no extra commentary.`;

/**
 * Parse the marker-delimited generated sentences. Tolerant of a missing marker,
 * stray code fences, and leading list numbering/bullets. Skips malformed lines.
 */
export function parseSentencesOutput(raw: string): SentencePairOut[] {
  const cleaned = raw.replace(/```[a-z]*\n?/gi, "").trim();
  const body = cleaned.includes(SENTENCES) ? section(cleaned, SENTENCES, null) : cleaned;

  const out: SentencePairOut[] = [];
  for (const line of body.split(/\n+/)) {
    const trimmed = line.trim();
    if (!trimmed || !trimmed.includes(TURN_SEP)) continue;
    const parts = trimmed.split(TURN_SEP).map((s) => s.trim());
    if (parts.length < 2) continue;
    const indo = parts[0].replace(/^\s*(?:\d+[.)]|[-*•])\s*/, "").trim();
    const eng = parts.slice(1).join(` ${TURN_SEP} `).trim();
    if (indo && eng) out.push({ indo, eng });
  }
  if (!out.length) throw new Error("No parseable sentences in output");
  return out;
}

// ----------------------------- Podcast ------------------------------------

export type PodcastTurn = {
  gender: "F" | "M";
  speaker: string;
  text: string; // Indonesian line
  en: string; // English translation of the line
};

export type GeneratedPodcast = {
  title: string;
  turns: PodcastTurn[];
};

export const PODCAST_OUTPUT_FORMAT_INSTRUCTIONS = `Return your answer in EXACTLY this format, with these literal marker lines and
nothing before or after them (no markdown, no code fences):

${TITLE}
<short English title>
${DIALOGUE}
Then ONE line per spoken turn, alternating between the two speakers, each line
using this exact pipe format with " ${TURN_SEP} " as the separator:

<F or M> ${TURN_SEP} <speaker name> ${TURN_SEP} <the Indonesian line> ${TURN_SEP} <a faithful English translation>

Use exactly two recurring speakers: one woman (F) and one man (M). Keep every
turn on a single line (no line breaks inside a turn). Do not put the " ${TURN_SEP} "
sequence anywhere except as the four-field separator.`;

/**
 * Parse the marker-delimited podcast output: a title, then one pipe-delimited
 * turn per line. Malformed lines are skipped defensively.
 */
export function parsePodcastOutput(raw: string): GeneratedPodcast {
  const cleaned = raw.replace(/```[a-z]*\n?/gi, "").trim();
  const title = section(cleaned, TITLE, DIALOGUE);
  const dialogue = section(cleaned, DIALOGUE, null);

  const turns: PodcastTurn[] = [];
  for (const line of dialogue.split(/\n+/)) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const parts = trimmed.split(TURN_SEP).map((s) => s.trim());
    if (parts.length < 4) continue; // skip malformed
    const gender = parts[0].toUpperCase().startsWith("M") ? "M" : "F";
    const speaker = parts[1];
    const text = parts[2];
    const en = parts.slice(3).join(` ${TURN_SEP} `); // tolerate stray separators in EN
    if (!text) continue;
    turns.push({ gender, speaker, text, en });
  }

  if (!turns.length) {
    throw new Error("Podcast output had no parseable turns");
  }
  return { title: title || "Untitled", turns };
}
