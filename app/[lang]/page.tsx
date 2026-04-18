import { notFound } from "next/navigation";
import IndonesianContent from "./indonesian-content";
import MandarinContent from "./mandarin-content";
import VocabShell from "./vocab-shell";
import { createClient } from "../lib/supabase/server";
import { masteryLevel, type MasteryLevel } from "../lib/srs";

const LANGUAGES = ["indonesian", "mandarin"] as const;
type LangTuple = typeof LANGUAGES;
type LangValue = LangTuple[number];

export default async function LanguagePage({
  params,
}: {
  params: Promise<{ lang: string }>;
}) {
  const { lang } = await params;

  if (!LANGUAGES.includes(lang as LangValue)) {
    notFound();
  }

  // Only fetch mastery state for authenticated users — anonymous visitors
  // see the page exactly as it was before, with no signal indicators and
  // no trace of the hidden review feature.
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  let masteryMap: Map<string, MasteryLevel> | null = null;
  if (user) {
    const { data: rows, error } = await supabase
      .from("review_state")
      .select("card_id, interval_days")
      .like("card_id", `${lang}:%`);

    if (error) {
      console.error("Failed to load mastery data", error);
    } else if (rows) {
      masteryMap = new Map();
      for (const r of rows as { card_id: string; interval_days: number }[]) {
        masteryMap.set(r.card_id, masteryLevel({ interval_days: r.interval_days }));
      }
    }
  }

  let content;
  switch (lang) {
    case "indonesian":
      content = <IndonesianContent masteryMap={masteryMap} />;
      break;
    case "mandarin":
      content = <MandarinContent masteryMap={masteryMap} />;
      break;
    default:
      notFound();
  }

  return <VocabShell lang={lang}>{content}</VocabShell>;
}
