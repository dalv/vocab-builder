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

  // Cache lookup: same (word, sentence) → reuse the stored explanation, no API
  // call. The learner taps few words but may re-tap the same one to refresh
  // their memory; this keeps that free.
  const { data: cached } = await supabase
    .from("vocab_word_explanations")
    .select("explanation")
    .eq("word", word)
    .eq("indo_sentence", indoSentence)
    .maybeSingle();
  if (cached?.explanation) {
    return NextResponse.json({ explanation: cached.explanation, cached: true });
  }

  try {
    const explanation = await explainWordChoice({ word, indoSentence, englishSentence });

    // Write-through. upsert on the (word, indo_sentence) unique key so a
    // double-tap race can't error. A failed cache write must not fail the
    // request — the user still gets their explanation.
    const { error: cacheError } = await supabase
      .from("vocab_word_explanations")
      .upsert(
        { word, indo_sentence: indoSentence, english_sentence: englishSentence, explanation },
        { onConflict: "word,indo_sentence" },
      );
    if (cacheError) console.error("Failed to cache explanation:", cacheError.message);

    return NextResponse.json({ explanation });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to explain";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
