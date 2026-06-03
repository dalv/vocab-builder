import { NextResponse } from "next/server";
import { createClient } from "../../../lib/supabase/server";
import { explainWordChoice } from "../../../lib/stories/anthropic";

export const maxDuration = 60;
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  let word: string;
  let indoSentence: string;
  let englishSentence: string;
  try {
    const body = (await req.json()) as {
      word?: string;
      indoSentence?: string;
      englishSentence?: string;
    };
    word = (body.word ?? "").trim();
    indoSentence = (body.indoSentence ?? "").trim();
    englishSentence = (body.englishSentence ?? "").trim();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  if (!word || !indoSentence) {
    return NextResponse.json({ error: "word and indoSentence are required" }, { status: 400 });
  }

  try {
    const explanation = await explainWordChoice({ word, indoSentence, englishSentence });
    return NextResponse.json({ explanation });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to explain";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
