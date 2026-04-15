import type { Card } from "./cards";
import type { ReviewState } from "./srs";

export const NEW_PER_DAY = 10;
export const MAX_PER_SESSION = 30;

export type StoredState = ReviewState & {
  card_id: string;
  due_at: string; // ISO timestamp
};

export type SessionItem = {
  card: Card;
  state: ReviewState | null; // null = brand-new card with no DB row yet
};

/**
 * Pure session-builder. Combines:
 *   - "due" cards: existing review_state rows whose due_at <= now
 *   - "new" cards: cards with no row, capped at newPerDay
 * Returns up to maxPerSession items, shuffled.
 */
export function buildSession(
  cards: Card[],
  states: Map<string, StoredState>,
  opts: { now?: Date; newPerDay?: number; maxPerSession?: number } = {},
): SessionItem[] {
  const now = opts.now ?? new Date();
  const newPerDay = opts.newPerDay ?? NEW_PER_DAY;
  const maxPerSession = opts.maxPerSession ?? MAX_PER_SESSION;

  const due: SessionItem[] = [];
  const fresh: SessionItem[] = [];

  for (const card of cards) {
    const s = states.get(card.id);
    if (!s) {
      fresh.push({ card, state: null });
    } else if (new Date(s.due_at) <= now) {
      due.push({
        card,
        state: {
          ease_factor: s.ease_factor,
          interval_days: s.interval_days,
          repetitions: s.repetitions,
        },
      });
    }
  }

  const newToday = shuffle(fresh).slice(0, newPerDay);
  const queue = shuffle([...due, ...newToday]).slice(0, maxPerSession);
  return queue;
}

function shuffle<T>(arr: T[]): T[] {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
