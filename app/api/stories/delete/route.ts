import { NextResponse } from "next/server";
import { createClient } from "../../../lib/supabase/server";

export const dynamic = "force-dynamic";

const AUDIO_BUCKET = "vocab-story-audio";

/** Delete a story and its audio file. Auth-gated like the rest of the feature. */
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

  // Best-effort remove the audio object first (don't fail the delete if it's
  // already gone), then delete the row.
  const { data: row } = await supabase
    .from("vocab_stories")
    .select("audio_path")
    .eq("id", storyId)
    .single();
  if (row?.audio_path) {
    await supabase.storage.from(AUDIO_BUCKET).remove([row.audio_path]);
  }

  const { error } = await supabase.from("vocab_stories").delete().eq("id", storyId);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
