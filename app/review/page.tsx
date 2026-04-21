import { createClient } from "../lib/supabase/server";
import { getAllCards, type Lang } from "../lib/cards";
import {
  buildSession,
  buildStrugglingList,
  NEW_PER_DAY,
  type StoredState,
} from "../lib/session";
import LoginForm from "./LoginForm";
import ReviewSession from "./ReviewSession";

export const dynamic = "force-dynamic";

const VALID_LANGS = ["indonesian", "mandarin"] as const;

export default async function ReviewPage({
  searchParams,
}: {
  searchParams: Promise<{ lang?: string }>;
}) {
  const { lang: raw } = await searchParams;
  const lang: Lang = (VALID_LANGS as readonly string[]).includes(raw ?? "")
    ? (raw as Lang)
    : "indonesian";

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return <LoginForm />;
  }

  const cards = getAllCards(lang);

  // Card IDs all start with `${lang}:`, so a single LIKE filter avoids the
  // 16KB request-header limit we'd hit with .in("card_id", [780 ids]).
  const { data: rows, error } = await supabase
    .from("review_state")
    .select(
      "card_id, ease_factor, interval_days, repetitions, due_at, created_at",
    )
    .like("card_id", `${lang}:%`);

  if (error) {
    console.error("Failed to load review_state", error);
  }

  const states = new Map<string, StoredState>();
  for (const r of (rows ?? []) as StoredState[]) {
    states.set(r.card_id, r);
  }

  // Calendar-day cap on new-card introductions: count cards added to
  // review_state since 00:00 UTC today and subtract from the daily quota.
  // Prevents "I opened review 3 times today and got 30 new words" while
  // still giving a fresh 10 after each UTC midnight, so same-time-each-day
  // sessions don't starve the new-card budget.
  const startOfToday = new Date();
  startOfToday.setUTCHours(0, 0, 0, 0);
  const cutoff = startOfToday.getTime();
  const introducedToday = (rows ?? []).filter((r) => {
    const created = (r as StoredState).created_at;
    return created ? new Date(created).getTime() >= cutoff : false;
  }).length;
  const newRemainingToday = Math.max(0, NEW_PER_DAY - introducedToday);

  const queue = buildSession(cards, states, { newPerDay: newRemainingToday });
  const initialStruggling = buildStrugglingList(cards, states);

  return (
    <ReviewSession
      lang={lang}
      queue={queue}
      initialStruggling={initialStruggling}
    />
  );
}
