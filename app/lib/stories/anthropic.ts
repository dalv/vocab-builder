import { indonesianSections } from "../../[lang]/indonesian-data";
import { buildKnownCorpus, formatKnownCorpus } from "./knownCorpus";
import {
  parseStoryOutput,
  parsePodcastOutput,
  parseSentencesOutput,
  OUTPUT_FORMAT_INSTRUCTIONS,
  PODCAST_OUTPUT_FORMAT_INSTRUCTIONS,
  SENTENCES_OUTPUT_FORMAT_INSTRUCTIONS,
  type GeneratedStory,
  type GeneratedPodcast,
  type SentencePairOut,
} from "./parse";

export type { GeneratedStory, GeneratedPodcast, SentencePairOut } from "./parse";

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

const PODCAST_SYSTEM_INSTRUCTIONS = `You write short PODCAST-STYLE DIALOGUES in INDONESIAN for an intermediate learner
who has been studying COLLOQUIAL, INFORMAL, everyday Bali-context Indonesian.

PROCESS:
1. Use the web search tool to find real, current, accurate information about the
   user's topic. Base the conversation's factual content on what you find.
2. Then write a natural, engaging conversation in Indonesian about that topic
   between TWO people chatting casually (like a relaxed podcast / two friends).

SPEAKERS:
- Exactly two recurring speakers: one woman (F) and one man (M). Give them simple
  Indonesian first names. They alternate turns naturally, react to each other,
  ask questions, agree/disagree — a real back-and-forth, not two monologues.

REGISTER & LEVEL (strict):
- Informal/colloquial register, the way people actually speak — NOT formal or news-style.
- Use colloquial particles naturally where they fit: sih, dong, kok, aja, lah, deh, nih, kan.
- Use colloquial affixation the learner studies (e.g. -in suffix like "beliin", "liatin";
  di- passives; ke-...-an). Conversational Indonesian often drops the me- prefix in speech.
- Intermediate comprehension level: clear, natural, flowing — not childish, not academic.
- Length: roughly 150-250 words TOTAL across all turns. Keep turns fairly short.

VOCABULARY (most important instruction):
- Below is the learner's KNOWN VOCABULARY: headwords AND example sentences they've studied.
  Treat EVERY word and phrase appearing anywhere in these example sentences as already familiar.
- Reuse this known vocabulary HEAVILY and naturally so the learner gets repeated exposure in
  fresh context. Introduce new words ONLY where the conversation genuinely needs them.

OUTPUT:
${PODCAST_OUTPUT_FORMAT_INSTRUCTIONS}`;

/** The known-vocabulary block, cached (large + identical on every call). */
function corpusBlock() {
  const corpus = formatKnownCorpus(buildKnownCorpus(indonesianSections));
  return {
    type: "text",
    text: `KNOWN VOCABULARY:\n${corpus}`,
    cache_control: { type: "ephemeral" },
  };
}

/** Assemble the full system prompt: instructions + the known-vocabulary block. */
function buildSystemBlocks() {
  return [{ type: "text", text: SYSTEM_INSTRUCTIONS }, corpusBlock()];
}

function buildPodcastSystemBlocks() {
  return [{ type: "text", text: PODCAST_SYSTEM_INSTRUCTIONS }, corpusBlock()];
}

const SENTENCES_SYSTEM_INSTRUCTIONS = `You generate short, useful, everyday INDONESIAN sentences for an intermediate
learner living in Bali. The learner gives a TOPIC and a COUNT; produce that many
sentences about the topic that real people would actually say in day-to-day life
in Bali.

REGISTER & LEVEL (strict):
- Informal/colloquial — the way people actually talk on the street, NOT formal or
  textbook/news style.
- Use colloquial particles naturally where they fit: sih, dong, kok, aja, lah,
  deh, nih, kan.
- Use the colloquial affixation the learner studies (e.g. -in suffix like
  "beliin", "liatin"; di- passives; ke-...-an). Conversational Indonesian often
  drops the me- prefix in speech.
- Intermediate, practical, natural. Mix statements and questions a real person
  would use (asking prices, asking where things are, giving opinions, etc.).

REPETITION (very important):
- Build the whole set around a small CORE of topic vocabulary, and REUSE those
  same key words and phrases across many of the sentences, in different contexts,
  so the learner sees them repeatedly. Heavy, deliberate repetition is the goal —
  not maximum variety.

VOCABULARY:
- Below is the learner's KNOWN VOCABULARY (headwords AND example sentences).
  Lean on it heavily; introduce new words only where the topic genuinely needs them.

OUTPUT:
${SENTENCES_OUTPUT_FORMAT_INSTRUCTIONS}`;

/**
 * Generate `count` fresh, repetitive, colloquial everyday Indonesian sentences
 * about `topic`, each with an English translation. No web search (these are
 * practical phrases, not fact-dependent).
 */
export async function generateSentences(
  topic: string,
  count: number,
): Promise<SentencePairOut[]> {
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
      max_tokens: 8192,
      system: [{ type: "text", text: SENTENCES_SYSTEM_INSTRUCTIONS }, corpusBlock()],
      messages: [{ role: "user", content: `Topic: ${topic}\nNumber of sentences: ${count}` }],
    }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Anthropic API ${res.status}: ${body.slice(0, 500)}`);
  }

  const data = (await res.json()) as { content?: unknown };
  const text = collectText(data.content);
  if (!text) throw new Error("Anthropic returned no text content");
  return parseSentencesOutput(text).slice(0, count);
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
 * Run a web-search-grounded generation: send the system blocks + topic with the
 * web search tool enabled, and return the model's final text. Shared by the
 * story and podcast generators.
 */
async function generateGroundedText(system: unknown, topic: string): Promise<string> {
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
      system,
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
  return text;
}

/**
 * Generate the Indonesian story for `topic`, grounded in real facts via web
 * search.
 */
export async function generateStory(topic: string): Promise<GeneratedStory> {
  return parseStoryOutput(await generateGroundedText(buildSystemBlocks(), topic));
}

/**
 * Generate a two-person Indonesian podcast-style dialogue for `topic`, grounded
 * in real facts via web search.
 */
export async function generatePodcast(topic: string): Promise<GeneratedPodcast> {
  return parsePodcastOutput(await generateGroundedText(buildPodcastSystemBlocks(), topic));
}

/**
 * Word-choice explainer. A FRESH Claude session (not the one that wrote the
 * story) explains why a given Indonesian word was used when translating from
 * English — framed as "why is this a sensible AI translation choice", with
 * register and common alternatives. Small/fast model, no web search.
 */
export const EXPLAIN_MODEL = "claude-haiku-4-5-20251001";

export async function explainWordChoice(args: {
  word: string;
  indoSentence: string;
  englishSentence: string;
}): Promise<string> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY is not set");

  const prompt = `You are a friendly Indonesian tutor for an intermediate learner who studies casual, colloquial (Bali-context) Indonesian.

The learner is reading an AI-generated Indonesian translation of an English sentence and tapped one Indonesian word to understand the translator's choice.

English sentence:
"${args.englishSentence}"

Indonesian translation:
"${args.indoSentence}"

The tapped word: "${args.word}"

In 2–3 short, plain sentences (no markdown, no bullet points, no headings), explain why "${args.word}" is a sensible, natural choice here. Cover: what it means / does in this sentence; whether it's casual/colloquial or more formal/neutral; and one or two common alternative words that could have been used instead, with the nuance difference. This is an AI translation, so frame it as why this choice makes sense. Do not repeat the full sentences back.`;

  const res = await fetch(ANTHROPIC_URL, {
    method: "POST",
    headers: {
      "x-api-key": apiKey,
      "anthropic-version": ANTHROPIC_VERSION,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: EXPLAIN_MODEL,
      max_tokens: 400,
      messages: [{ role: "user", content: prompt }],
    }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Anthropic API ${res.status}: ${body.slice(0, 500)}`);
  }

  const data = (await res.json()) as { content?: unknown };
  const text = collectText(data.content);
  if (!text) throw new Error("Anthropic returned no explanation");
  return text;
}
