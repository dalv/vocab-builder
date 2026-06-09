import { NextResponse } from "next/server";
import { createClient } from "../../../lib/supabase/server";

export const dynamic = "force-dynamic";

const AUDIO_BUCKET = "vocab-story-audio";

/**
 * Return a story's full playable payload (text, timings, signed audio URL, etc.)
 * so the player can swap to the next item in-place — keeping the audio element
 * (and its iOS unlock) alive across a playlist, which navigation would break.
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

  const { data } = await supabase
    .from("vocab_stories")
    .select(
      "id, topic, status, style, title, story_text, translation_en, audio_path, word_timings, segments",
    )
    .eq("id", storyId)
    .single();
  if (!data) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  if (data.status !== "ready") {
    return NextResponse.json({ error: "Story is not ready" }, { status: 409 });
  }

  let audioUrl: string | null = null;
  if (data.audio_path) {
    const { data: signed } = await supabase.storage
      .from(AUDIO_BUCKET)
      .createSignedUrl(data.audio_path, 60 * 60);
    audioUrl = signed?.signedUrl ?? null;
  }

  return NextResponse.json({
    storyId: data.id,
    title: data.title ?? data.topic,
    topic: data.topic,
    style: data.style ?? "story",
    text: data.story_text ?? "",
    translation: data.translation_en ?? "",
    tokens: data.word_timings ?? [],
    segments: data.segments ?? null,
    audioUrl,
  });
}
