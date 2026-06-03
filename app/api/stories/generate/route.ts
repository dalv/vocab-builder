import { NextResponse } from "next/server";
import { createClient } from "../../../lib/supabase/server";
import { generateStory, STORY_MODEL } from "../../../lib/stories/anthropic";
import { synthesizeWithTimestamps } from "../../../lib/stories/elevenlabs";

// External APIs (web search + TTS) can take a while; do the whole pipeline in
// one synchronous request. Time spent awaiting external APIs is cheap on
// Vercel Fluid Compute, so no job queue / polling.
export const maxDuration = 300;
export const dynamic = "force-dynamic";

const AUDIO_BUCKET = "vocab-story-audio";

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
  try {
    const body = (await req.json()) as { storyId?: string; topic?: string };
    storyId = (body.storyId ?? "").trim();
    topic = (body.topic ?? "").trim();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  if (!storyId || !topic) {
    return NextResponse.json({ error: "storyId and topic are required" }, { status: 400 });
  }

  // Mark the helper that records a failure so we never leave a row in `pending`.
  const fail = async (message: string) => {
    await supabase.from("vocab_stories").update({ status: "failed", error: message }).eq("id", storyId);
    return NextResponse.json({ error: message }, { status: 500 });
  };

  try {
    const voiceId = process.env.ELEVENLABS_VOICE_ID ?? null;

    // 1. Claude (with web search) → Indonesian story grounded in real facts.
    const generated = await generateStory(topic);

    // 2. ElevenLabs → audio + character timings aggregated to word tokens.
    const tts = await synthesizeWithTimestamps(generated.story);

    // 3. Upload the mp3 to the private bucket.
    const audioPath = `${storyId}.mp3`;
    const { error: uploadError } = await supabase.storage
      .from(AUDIO_BUCKET)
      .upload(audioPath, tts.audio, { contentType: "audio/mpeg", upsert: true });
    if (uploadError) return fail(`Audio upload failed: ${uploadError.message}`);

    // 4. Persist everything; the player renders `text` and highlights `tokens`,
    //    both derived from the same alignment characters.
    const { error: updateError } = await supabase
      .from("vocab_stories")
      .update({
        status: "ready",
        title: generated.title,
        story_text: tts.text,
        translation_en: generated.translation_en,
        audio_path: audioPath,
        word_timings: tts.tokens,
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
