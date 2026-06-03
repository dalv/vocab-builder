import { NextResponse } from "next/server";
import { createClient } from "../../../lib/supabase/server";
import { synthesizeWithTimestamps } from "../../../lib/stories/elevenlabs";

export const maxDuration = 120;
export const dynamic = "force-dynamic";

const AUDIO_BUCKET = "vocab-story-audio";

/**
 * Re-run ONLY the ElevenLabs step for an existing story: re-synthesize from the
 * stored story_text, overwrite the audio file, and refresh word_timings. No
 * Claude call — the story text is unchanged. Used to apply new voice/speed
 * settings to older stories.
 */
export async function POST(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  let storyId: string;
  try {
    const body = (await req.json()) as { storyId?: string };
    storyId = (body.storyId ?? "").trim();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  if (!storyId) {
    return NextResponse.json({ error: "storyId is required" }, { status: 400 });
  }

  const { data: story } = await supabase
    .from("vocab_stories")
    .select("story_text, audio_path")
    .eq("id", storyId)
    .single();
  if (!story?.story_text) {
    return NextResponse.json({ error: "Story not found or has no text" }, { status: 404 });
  }

  try {
    const tts = await synthesizeWithTimestamps(story.story_text);

    const audioPath = story.audio_path ?? `${storyId}.mp3`;
    const { error: uploadError } = await supabase.storage
      .from(AUDIO_BUCKET)
      .upload(audioPath, tts.audio, { contentType: "audio/mpeg", upsert: true });
    if (uploadError) {
      return NextResponse.json({ error: `Audio upload failed: ${uploadError.message}` }, { status: 500 });
    }

    const { error: updateError } = await supabase
      .from("vocab_stories")
      .update({
        audio_path: audioPath,
        word_timings: tts.tokens,
        voice_id: process.env.ELEVENLABS_VOICE_ID ?? null,
        status: "ready",
        error: null,
      })
      .eq("id", storyId);
    if (updateError) {
      return NextResponse.json({ error: `Saving failed: ${updateError.message}` }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to regenerate audio";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
