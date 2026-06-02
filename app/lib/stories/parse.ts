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
