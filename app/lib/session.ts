import type { Card } from "./cards";
import type { ReviewState } from "./srs";
export type { Card } from "./cards";

export const NEW_PER_DAY = 10;
export const MAX_PER_SESSION = 30;

export type StoredState = ReviewState & {
  card_id: string;
  due_at: string;    // ISO timestamp
  created_at?: string; // ISO timestamp of first review for this card
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

export type StrugglingItem = {
  card: Card;
  state: ReviewState;
};

/**
 * Cards the user has struggled with, sorted hardest-first.
 *
 * The SM-2 ease factor starts at 2.5 and moves down only when the user
 * rates Hard (−0.15) or Fail (−0.2), so `ease_factor < 2.5` captures
 * exactly the cards that have been difficult at least once. Rating Easy
 * only raises ease, so Easy-only cards never appear here.
 */
export function buildStrugglingList(
  cards: Card[],
  states: Map<string, StoredState>,
  opts: { limit?: number; threshold?: number } = {},
): StrugglingItem[] {
  const limit = opts.limit ?? 100;
  const threshold = opts.threshold ?? 2.5;

  const items: StrugglingItem[] = [];
  for (const card of cards) {
    const s = states.get(card.id);
    if (!s) continue;
    if (s.ease_factor < threshold) {
      items.push({
        card,
        state: {
          ease_factor: s.ease_factor,
          interval_days: s.interval_days,
          repetitions: s.repetitions,
        },
      });
    }
  }
  items.sort((a, b) => a.state.ease_factor - b.state.ease_factor);
  return items.slice(0, limit);
}

function shuffle<T>(arr: T[]): T[] {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
