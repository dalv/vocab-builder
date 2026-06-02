/**
 * Throwaway review harness (NOT part of the app). Generates one real story via
 * the actual pipeline modules so register / vocab reuse / timing can be eyeballed
 * before any UI is built.
 *
 *   npx tsx scripts/sample-story.ts "your topic here"
 */
import { readFileSync } from "node:fs";
import { generateStory } from "../app/lib/stories/anthropic";
import { synthesizeWithTimestamps } from "../app/lib/stories/elevenlabs";

// Minimal .env.local loader (no dotenv dependency).
for (const line of readFileSync(".env.local", "utf8").split("\n")) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
}

async function main() {
  const topic = process.argv[2] ?? "the best warungs in Canggu right now";
  const doTts = process.argv.includes("--tts");

  const story = await generateStory(topic);
  console.log("\n===== TOPIC =====\n" + topic);
  console.log("\n===== TITLE =====\n" + story.title);
  console.log("\n===== STORY (Indonesian) =====\n" + story.story);
  console.log("\n===== TRANSLATION (English) =====\n" + story.translation_en);
  console.log(`\n(story length: ${story.story.split(/\s+/).length} words)`);

  if (doTts) {
    const tts = await synthesizeWithTimestamps(story.story);
    const last = tts.tokens[tts.tokens.length - 1];
    console.log(`\n===== TTS =====\naudio: ${tts.audio.length} bytes, ${tts.tokens.length} tokens, ${last?.end?.toFixed(2)}s total`);
    console.log("first 12 tokens:");
    for (const t of tts.tokens.slice(0, 12)) {
      console.log(`  ${t.start.toFixed(2)}–${t.end.toFixed(2)}  ${t.text}`);
    }
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
