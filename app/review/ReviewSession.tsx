"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "../lib/supabase/client";
import type { Card, Lang } from "../lib/cards";
import { speak } from "../lib/tts";
import {
  applyRating,
  computeDueAt,
  INITIAL_STATE,
  type Rating,
  type ReviewState,
} from "../lib/srs";
import type { SessionItem, StrugglingItem } from "../lib/session";

type Props = {
  lang: Lang;
  queue: SessionItem[];
  initialStruggling: StrugglingItem[];
};

const SIDEBAR_KEY = "review-sidebar-open";
const STRUGGLE_THRESHOLD = 2.5;

const RATING_LABEL: Record<Rating, string> = {
  0: "Fail",
  1: "Hard",
  2: "Easy",
};

export default function ReviewSession({ lang, queue, initialStruggling }: Props) {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const [index, setIndex] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [stats, setStats] = useState({ fail: 0, hard: 0, easy: 0 });
  const [struggling, setStruggling] = useState<StrugglingItem[]>(initialStruggling);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [activeQueue, setActiveQueue] = useState<SessionItem[]>(queue);
  const [mode, setMode] = useState<"normal" | "practice">("normal");
  const submittingRef = useRef(false);

  // Restore collapse preference on mount.
  useEffect(() => {
    const stored = localStorage.getItem(SIDEBAR_KEY);
    if (stored === "0") setSidebarOpen(false);
  }, []);
  useEffect(() => {
    localStorage.setItem(SIDEBAR_KEY, sidebarOpen ? "1" : "0");
  }, [sidebarOpen]);

  const total = activeQueue.length;
  const current = activeQueue[index];
  const done = index >= total;

  const startPractice = useCallback(() => {
    if (struggling.length === 0) return;
    // Shuffle so the session doesn't always start with the same hardest card.
    const shuffled = struggling
      .map((s) => ({ card: s.card, state: s.state }) as SessionItem)
      .map((v) => ({ v, r: Math.random() }))
      .sort((a, b) => a.r - b.r)
      .map(({ v }) => v);
    setActiveQueue(shuffled);
    setMode("practice");
    setIndex(0);
    setFlipped(false);
    setStats({ fail: 0, hard: 0, easy: 0 });
  }, [struggling]);

  // Auto-speak the back side whenever a card flips.
  useEffect(() => {
    if (flipped && current) speak(current.card.backExample, lang);
  }, [flipped, current, lang]);

  const flip = useCallback(() => {
    if (!current || flipped) return;
    setFlipped(true);
  }, [current, flipped]);

  // Click/tap on the card: only flip if the user isn't mid-selection.
  // (Dragging to select text on the card otherwise flips it prematurely.)
  const onCardClick = useCallback(() => {
    if ((window.getSelection()?.toString().length ?? 0) > 0) return;
    flip();
  }, [flip]);

  const rate = useCallback(
    async (rating: Rating) => {
      if (!current || !flipped || submittingRef.current) return;
      submittingRef.current = true;

      const prevState: ReviewState = current.state ?? INITIAL_STATE;
      const next = applyRating(prevState, rating);
      const due_at = computeDueAt(next.interval_days).toISOString();

      // Fire DB writes but don't block the UI on them.
      void supabase
        .from("review_state")
        .upsert(
          {
            card_id: current.card.id,
            ease_factor: next.ease_factor,
            interval_days: next.interval_days,
            repetitions: next.repetitions,
            due_at,
            last_reviewed_at: new Date().toISOString(),
          },
          { onConflict: "card_id" },
        )
        .then(({ error }) => {
          if (error) console.error("review_state upsert failed", error);
        });

      void supabase
        .from("review_log")
        .insert({
          card_id: current.card.id,
          rating,
          prev_interval: prevState.interval_days,
          next_interval: next.interval_days,
          prev_ease: prevState.ease_factor,
          next_ease: next.ease_factor,
        })
        .then(({ error }) => {
          if (error) console.error("review_log insert failed", error);
        });

      setStats((s) =>
        rating === 0
          ? { ...s, fail: s.fail + 1 }
          : rating === 1
            ? { ...s, hard: s.hard + 1 }
            : { ...s, easy: s.easy + 1 },
      );

      // Keep the sidebar's struggling list in sync with the live state.
      setStruggling((prev) => {
        const qualifies = next.ease_factor < STRUGGLE_THRESHOLD;
        const existingIdx = prev.findIndex(
          (it) => it.card.id === current.card.id,
        );
        let updated: StrugglingItem[];
        if (existingIdx >= 0) {
          updated = prev.slice();
          if (qualifies) {
            updated[existingIdx] = { card: current.card, state: next };
          } else {
            updated.splice(existingIdx, 1);
          }
        } else if (qualifies) {
          updated = [...prev, { card: current.card, state: next }];
        } else {
          return prev;
        }
        updated.sort((a, b) => a.state.ease_factor - b.state.ease_factor);
        return updated;
      });

      setFlipped(false);
      setIndex((i) => i + 1);
      submittingRef.current = false;
    },
    [current, flipped, supabase],
  );

  const exit = useCallback(() => {
    router.push(`/${lang}`);
  }, [router, lang]);

  // Keyboard: space to flip, 1/2/3 to rate, Esc to exit.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const t = e.target as HTMLElement | null;
      if (
        t &&
        (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)
      ) {
        return;
      }
      if (e.key === "Escape") {
        e.preventDefault();
        exit();
        return;
      }
      if (done) return;
      if (e.code === "Space" || e.key === " ") {
        e.preventDefault();
        flip();
        return;
      }
      if (!flipped) return;
      if (e.key === "1") {
        e.preventDefault();
        rate(0);
      } else if (e.key === "2") {
        e.preventDefault();
        rate(1);
      } else if (e.key === "3") {
        e.preventDefault();
        rate(2);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [flipped, done, flip, rate, exit]);

  if (total === 0) {
    return (
      <div className="review-wrap">
        <div className="review-empty">
          <h2>All caught up</h2>
          <p>No cards are due right now. Come back later.</p>
          {struggling.length > 0 && (
            <button
              type="button"
              className="review-practice-btn"
              onClick={startPractice}
            >
              Practice struggling words ({struggling.length})
            </button>
          )}
          <button className="review-exit" onClick={exit}>
            Back to vocab
          </button>
        </div>
      </div>
    );
  }

  if (done) {
    return (
      <div className="review-wrap">
        <div className="review-empty">
          <h2>{mode === "practice" ? "Practice complete" : "Session complete"}</h2>
          <p>
            {total} cards reviewed · {stats.easy} easy · {stats.hard} hard ·{" "}
            {stats.fail} failed
          </p>
          {struggling.length > 0 && (
            <button
              type="button"
              className="review-practice-btn"
              onClick={startPractice}
            >
              {mode === "practice" ? "Practice again" : "Practice struggling words"}{" "}
              ({struggling.length})
            </button>
          )}
          <button className="review-exit" onClick={exit}>
            Back to vocab
          </button>
        </div>
      </div>
    );
  }

  const c = current.card;

  return (
    <div className="review-wrap">
      <div
        className={`review-layout${sidebarOpen ? " with-sidebar" : ""}`}
      >
        <div className="review-main">
      <div className="review-meta">
        <span>{mode === "practice" ? `practice · ${lang}` : lang}</span>
        <span>
          {index + 1} / {total}
        </span>
        {!sidebarOpen && (
          <button
            type="button"
            className="review-sidebar-open-btn"
            onClick={() => setSidebarOpen(true)}
          >
            Show list ({struggling.length})
          </button>
        )}
        <button className="review-exit-link" onClick={exit} aria-label="Exit review">
          Esc
        </button>
      </div>

      <div
        className={`review-card${flipped ? " is-flipped" : ""}`}
        onClick={onCardClick}
        role="button"
        tabIndex={0}
      >
        {!flipped ? (
          <>
            <div className="review-front-word">{c.front}</div>
            {c.tag && <div className="review-tag">{c.tag}</div>}
            <div className="review-front-example">{c.frontExample}</div>
            <div className="review-hint">Click or press space to flip</div>
          </>
        ) : (
          <>
            <div className="review-back-word">{c.back}</div>
            {c.backPinyin && <div className="review-back-pinyin">{c.backPinyin}</div>}
            <div className="review-back-example">{c.backExample}</div>
            {c.backExamplePinyin && (
              <div className="review-back-example-pinyin">{c.backExamplePinyin}</div>
            )}
            <button
              type="button"
              className="review-replay"
              onClick={(e) => {
                e.stopPropagation();
                speak(c.backExample, lang);
              }}
              aria-label="Replay audio"
            >
              ▶ Replay
            </button>
          </>
        )}
      </div>

      <div className="review-actions" aria-hidden={!flipped}>
        {([0, 1, 2] as Rating[]).map((r) => (
          <button
            key={r}
            type="button"
            className={`review-btn review-btn-${r}`}
            onClick={() => rate(r)}
            disabled={!flipped}
          >
            <span className="review-btn-label">{RATING_LABEL[r]}</span>
            <span className="review-btn-key">{r + 1}</span>
          </button>
        ))}
      </div>

      <div className="review-footer">Esc to exit · Space to flip · 1/2/3 to rate</div>
        </div>

        {sidebarOpen && (
          <aside className="review-sidebar" aria-label="Struggling words">
            <div className="review-sidebar-header">
              <h3>Struggling ({struggling.length})</h3>
              <button
                type="button"
                className="review-sidebar-toggle"
                onClick={() => setSidebarOpen(false)}
                aria-label="Hide struggling list"
              >
                Hide
              </button>
            </div>
            {struggling.length === 0 ? (
              <div className="review-sidebar-empty">
                Words you mark Hard or Fail will show up here, hardest first.
              </div>
            ) : (
              <ul className="review-sidebar-list">
                {struggling.map((item) => (
                  <li key={item.card.id} className="review-sidebar-item">
                    <div className="review-sidebar-word">{item.card.back}</div>
                    {item.card.backPinyin && (
                      <div className="review-sidebar-pinyin">
                        {item.card.backPinyin}
                      </div>
                    )}
                    <div className="review-sidebar-example">
                      {item.card.backExample}
                    </div>
                    {item.card.backExamplePinyin && (
                      <div className="review-sidebar-example-pinyin">
                        {item.card.backExamplePinyin}
                      </div>
                    )}
                    <div
                      className="review-sidebar-ease"
                      title={`Ease factor ${item.state.ease_factor.toFixed(2)} (lower = harder)`}
                    >
                      ease {item.state.ease_factor.toFixed(2)}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </aside>
        )}
      </div>
    </div>
  );
}
