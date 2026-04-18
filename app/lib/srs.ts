/**
 * Lightweight SM-2 implementation tailored to a 3-button UI:
 *   0 = Fail (didn't recall)
 *   1 = Hard (recalled with effort)
 *   2 = Easy (recalled cleanly)
 *
 * Pure: takes a state, returns the next state. No side effects, no DB.
 */

export type Rating = 0 | 1 | 2;

export type ReviewState = {
  /** SM-2 ease factor. Starts at 2.5, never drops below MIN_EASE. */
  ease_factor: number;
  /** Interval until next review, in days. */
  interval_days: number;
  /** Successful repetition streak (resets to 0 on Fail). */
  repetitions: number;
};

export const INITIAL_STATE: ReviewState = {
  ease_factor: 2.5,
  interval_days: 0,
  repetitions: 0,
};

const MIN_EASE = 1.3;

export function applyRating(state: ReviewState, rating: Rating): ReviewState {
  if (rating === 0) {
    // Fail — drop ease, reset streak, see again tomorrow.
    return {
      ease_factor: Math.max(MIN_EASE, state.ease_factor - 0.2),
      interval_days: 1,
      repetitions: 0,
    };
  }

  const repetitions = state.repetitions + 1;
  let interval_days: number;

  if (repetitions === 1) {
    interval_days = 1;
  } else if (repetitions === 2) {
    interval_days = 6;
  } else {
    const multiplier = rating === 1 ? 1.2 : state.ease_factor;
    interval_days = Math.max(1, Math.round(state.interval_days * multiplier));
  }

  const ease_factor =
    rating === 1
      ? Math.max(MIN_EASE, state.ease_factor - 0.15)
      : state.ease_factor + 0.15;

  return { ease_factor, interval_days, repetitions };
}

/** Returns the next due date given an interval (days) and a base time. */
export function computeDueAt(intervalDays: number, from: Date = new Date()): Date {
  const d = new Date(from);
  d.setDate(d.getDate() + intervalDays);
  return d;
}

/**
 * Maps an SRS state to a 0–3 "signal strength" used by the main vocab page.
 * Interval is the cleanest signal: SM-2 grows it as recall succeeds and
 * shrinks it on failure, so it's a direct readout of how well the
 * scheduler thinks the card is learned.
 */
export type MasteryLevel = 0 | 1 | 2 | 3;

export function masteryLevel(
  state: Pick<ReviewState, "interval_days"> | undefined | null,
): MasteryLevel {
  if (!state) return 0;
  const d = state.interval_days;
  if (d <= 0) return 0;
  if (d < 7) return 1;
  if (d < 30) return 2;
  return 3;
}
