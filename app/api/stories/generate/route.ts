import { NextResponse } from "next/server";
import { createClient } from "../../../lib/supabase/server";
import { generateStory, generatePodcast, STORY_MODEL } from "../../../lib/stories/anthropic";
import {
  synthesizeWithTimestamps,
  synthesizeDialogue,
  synthesizeSentencesWithEnglish,
} from "../../../lib/stories/elevenlabs";
import { allExampleSentences } from "../../../lib/stories/knownCorpus";
import { indonesianSections } from "../../../[lang]/indonesian-data";
import type { Token } from "../../../lib/stories/alignment";

// External APIs (web search + TTS) can take a while; do the whole pipeline in
// one synchronous request. Time spent awaiting external APIs is cheap on
// Vercel Fluid Compute, so no job queue / polling.
export const maxDuration = 300;
export const dynamic = "force-dynamic";

const AUDIO_BUCKET = "vocab-story-audio";

// Podcast voices: a woman and a man. Premade voices that work on free tier
// (env-overridable). Female falls back to the single-story voice.
const FEMALE_VOICE =
  process.env.ELEVENLABS_VOICE_ID_FEMALE ?? process.env.ELEVENLABS_VOICE_ID ?? "EXAVITQu4vr4xnSDxMaL";
const MALE_VOICE = process.env.ELEVENLABS_VOICE_ID_MALE ?? "JBFqnCBsd6RMkjVDRZzb";

// Podcast segments carry speaker/gender; sentences segments carry the English
// audio range. Both live in the same jsonb column, keyed by style.
type Segment = { speaker: string; gender: "F" | "M" } | { engStart: number; engEnd: number };

/** Fisher–Yates shuffle (returns a new array). */
function shuffle<T>(arr: T[]): T[] {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export async function POST(req: Request) {
  const supabase = await createClient();

  // Gate the paid pipeline behind auth — same posture as the review feature.
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  let storyId: string;
  let topic: string;
  let style: "story" | "podcast" | "sentences";
  let count: number;
  try {
    const body = (await req.json()) as {
      storyId?: string;
      topic?: string;
      style?: string;
      count?: number;
    };
    storyId = (body.storyId ?? "").trim();
    topic = (body.topic ?? "").trim();
    style =
      body.style === "podcast" ? "podcast" : body.style === "sentences" ? "sentences" : "story";
    count = Math.floor(Number(body.count) || 0);
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  // Sentences don't need a topic (they're sampled from the corpus); the other
  // styles do.
  if (!storyId || (style !== "sentences" && !topic)) {
    return NextResponse.json({ error: "storyId and topic are required" }, { status: 400 });
  }

  // Mark the helper that records a failure so we never leave a row in `pending`.
  const fail = async (message: string) => {
    await supabase.from("vocab_stories").update({ status: "failed", error: message }).eq("id", storyId);
    return NextResponse.json({ error: message }, { status: 500 });
  };

  try {
    // 1 + 2: generate the content (Claude, web search) and synthesize audio
    //        (ElevenLabs). The two styles differ here; everything after is shared.
    let title: string;
    let storyText: string;
    let translationEn: string;
    let tokens: Token[];
    let audio: Buffer;
    let contentType: string;
    let voiceId: string | null;
    let segments: Segment[] | null = null;

    if (style === "sentences") {
      // No Claude call: sample example sentences straight from the corpus.
      const pool = allExampleSentences(indonesianSections);
      const n = Math.max(1, Math.min(count || 10, pool.length));
      const picked = shuffle(pool).slice(0, n);
      // Both languages synthesized by ElevenLabs into one continuous track.
      const tts = await synthesizeSentencesWithEnglish(
        picked.map((s) => ({ indo: s.indo, eng: s.eng })),
      );
      title = `${n} sentence${n === 1 ? "" : "s"}`;
      storyText = tts.text; // Indonesian sentences, one per paragraph
      tokens = tts.tokens;
      audio = tts.audio;
      contentType = tts.contentType;
      translationEn = picked.map((s) => s.eng).join("\n\n"); // aligned per paragraph
      segments = tts.engRanges.map((r) => ({ engStart: r.start, engEnd: r.end }));
      voiceId = process.env.ELEVENLABS_VOICE_ID ?? null;
    } else if (style === "podcast") {
      const podcast = await generatePodcast(topic);
      const tts = await synthesizeDialogue(
        podcast.turns.map((t) => ({
          text: t.text,
          voiceId: t.gender === "M" ? MALE_VOICE : FEMALE_VOICE,
        })),
      );
      title = podcast.title;
      storyText = tts.text;
      tokens = tts.tokens;
      audio = tts.audio;
      contentType = tts.contentType;
      translationEn = podcast.turns.map((t) => t.en).join("\n\n");
      segments = podcast.turns.map((t) => ({ speaker: t.speaker, gender: t.gender }));
      voiceId = `${FEMALE_VOICE}/${MALE_VOICE}`;
    } else {
      const generated = await generateStory(topic);
      const tts = await synthesizeWithTimestamps(generated.story);
      title = generated.title;
      storyText = tts.text;
      tokens = tts.tokens;
      audio = tts.audio;
      contentType = tts.contentType;
      translationEn = generated.translation_en;
      voiceId = process.env.ELEVENLABS_VOICE_ID ?? null;
    }

    // 3. Upload the audio to the private bucket (extension matches the format).
    const audioPath = `${storyId}.${contentType === "audio/wav" ? "wav" : "mp3"}`;
    const { error: uploadError } = await supabase.storage
      .from(AUDIO_BUCKET)
      .upload(audioPath, audio, { contentType, upsert: true });
    if (uploadError) return fail(`Audio upload failed: ${uploadError.message}`);

    // 4. Persist everything; the player renders `story_text` and highlights
    //    `word_timings`, both derived from the same alignment characters.
    const { error: updateError } = await supabase
      .from("vocab_stories")
      .update({
        status: "ready",
        style,
        title,
        story_text: storyText,
        translation_en: translationEn,
        audio_path: audioPath,
        word_timings: tokens,
        segments,
        model: STORY_MODEL,
        voice_id: voiceId,
        error: null,
      })
      .eq("id", storyId);
    if (updateError) return fail(`Saving story failed: ${updateError.message}`);

    return NextResponse.json({ status: "ready", storyId });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error during generation";
    return fail(message);
  }
}
