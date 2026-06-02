import { indonesianSections } from "../../[lang]/indonesian-data";
import { buildKnownCorpus, formatKnownCorpus } from "./knownCorpus";
import { parseStoryOutput, OUTPUT_FORMAT_INSTRUCTIONS, type GeneratedStory } from "./parse";

export type { GeneratedStory } from "./parse";

/**
 * Story-generation model. Kept as a single constant so it's a one-line change
 * to bump to an Opus model for higher quality.
 */
export const STORY_MODEL = "claude-sonnet-4-6";

/** Web search server-tool version. Confirm against Anthropic's docs when bumping. */
const WEB_SEARCH_TOOL = { type: "web_search_20250305", name: "web_search", max_uses: 5 };

const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";
const ANTHROPIC_VERSION = "2023-06-01";

const SYSTEM_INSTRUCTIONS = `You write short stories in INDONESIAN for an intermediate learner who has been
studying COLLOQUIAL, INFORMAL, everyday Bali-context Indonesian.

PROCESS:
1. Use the web search tool to find real, current, accurate information about the
   user's topic. Base the story's factual content on what you find.
2. Then write an engaging short story or narrative in Indonesian about that topic.

REGISTER & LEVEL (strict):
- Informal/colloquial register, the way people actually speak — NOT formal or news-style.
- Use colloquial particles naturally where they fit: sih, dong, kok, aja, lah, deh, nih, kan.
- Use colloquial affixation the learner studies (e.g. -in suffix like "beliin", "liatin";
  di- passives; ke-...-an). Conversational Indonesian often drops the me- prefix in speech.
- Intermediate comprehension level: clear, natural, flowing — not childish, not academic.
- Length: roughly 150-250 words. Keep it tight.

VOCABULARY (most important instruction):
- Below is the learner's KNOWN VOCABULARY: headwords AND example sentences they've studied.
  Treat EVERY word and phrase appearing anywhere in these example sentences as already familiar.
- Reuse this known vocabulary HEAVILY and naturally so the learner gets repeated exposure in
  fresh context. Introduce new words ONLY where the story genuinely needs them.

OUTPUT:
${OUTPUT_FORMAT_INSTRUCTIONS}`;

/** Assemble the full system prompt: instructions + the known-vocabulary block. */
function buildSystemBlocks() {
  const corpus = formatKnownCorpus(buildKnownCorpus(indonesianSections));
  return [
    { type: "text", text: SYSTEM_INSTRUCTIONS },
    // The corpus is large and identical on every call → cache it.
    {
      type: "text",
      text: `KNOWN VOCABULARY:\n${corpus}`,
      cache_control: { type: "ephemeral" },
    },
  ];
}

/**
 * Pull the model's final answer out of a Messages response. Web search produces
 * intermediate tool-use / search-result blocks, so we join the `text` blocks
 * (the actual prose) rather than assuming the first block is the answer.
 */
function collectText(content: unknown): string {
  if (!Array.isArray(content)) return "";
  return content
    .filter((b): b is { type: string; text: string } => {
      const block = b as { type?: string; text?: string };
      return block.type === "text" && typeof block.text === "string";
    })
    .map((b) => b.text)
    .join("\n")
    .trim();
}

/**
 * Generate the Indonesian story for `topic`. Calls the Anthropic Messages API
 * with the web search tool enabled so the model grounds the story in real,
 * current facts before writing.
 */
export async function generateStory(topic: string): Promise<GeneratedStory> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY is not set");

  const res = await fetch(ANTHROPIC_URL, {
    method: "POST",
    headers: {
      "x-api-key": apiKey,
      "anthropic-version": ANTHROPIC_VERSION,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: STORY_MODEL,
      max_tokens: 2048,
      system: buildSystemBlocks(),
      tools: [WEB_SEARCH_TOOL],
      messages: [{ role: "user", content: topic }],
    }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Anthropic API ${res.status}: ${body.slice(0, 500)}`);
  }

  const data = (await res.json()) as { content?: unknown };
  const text = collectText(data.content);
  if (!text) throw new Error("Anthropic returned no text content");
  return parseStoryOutput(text);
}
