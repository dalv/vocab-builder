"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { Token } from "../../../lib/stories/alignment";
import { buildSentenceMap, splitParagraphs, splitSentences } from "../../../lib/stories/sentences";

type Piece =
  | { kind: "ws"; value: string }
  | { kind: "word"; value: string; index: number };

/**
 * Split the story text into render pieces, assigning each non-whitespace chunk
 * the next token index. Because the tokens were produced by the SAME
 * whitespace split (see alignment.ts), the Nth word here is timing token N —
 * what's displayed and what's filled line up by construction.
 */
function toPieces(text: string): Piece[] {
  const pieces: Piece[] = [];
  let index = 0;
  for (const part of text.split(/(\s+)/)) {
    if (part === "") continue;
    if (/^\s+$/.test(part)) pieces.push({ kind: "ws", value: part });
    else pieces.push({ kind: "word", value: part, index: index++ });
  }
  return pieces;
}

export default function StoryPlayer({
  text,
  tokens,
  audioUrl,
  translation,
}: {
  text: string;
  tokens: Token[];
  audioUrl: string | null;
  translation: string;
}) {
  const pieces = useMemo(() => toPieces(text), [text]);

  // Sentence mapping for tap-to-translate: a tapped word's index → its sentence
  // → the matching English sentence in the stored translation (no re-translate).
  const idMap = useMemo(() => buildSentenceMap(text), [text]);
  const english = useMemo(() => {
    const paras = splitParagraphs(translation).map(splitSentences);
    return { paras, flat: paras.flat() };
  }, [translation]);
  const [popup, setPopup] = useState<{
    id: string;
    en: string;
    top: number;
    left: number;
    width: number;
    above: boolean;
  } | null>(null);
  const [explain, setExplain] = useState<{
    word: string;
    top: number;
    left: number;
    width: number;
    above: boolean;
    loading: boolean;
    text: string;
    error: string;
  } | null>(null);

  // Number of words spoken so far. Words with index < spokenCount are filled
  // orange and STAY orange; the text progressively fills as the audio plays.
  const [spokenCount, setSpokenCount] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [showTranslation, setShowTranslation] = useState(false);

  const audioRef = useRef<HTMLAudioElement>(null);
  const rafRef = useRef<number | null>(null);
  const pointerRef = useRef(0); // index into tokens, kept in sync with currentTime
  const wordRefs = useRef<(HTMLSpanElement | null)[]>([]);
  const lastScrollRef = useRef(0); // timestamp of the last auto-scroll (cooldown)

  // Keep the phone screen awake while audio plays (Screen Wake Lock API).
  // Supported on Android Chrome and iOS Safari 16.4+ (incl. installed PWAs);
  // a no-op everywhere else.
  type WakeLockSentinel = { release: () => Promise<void> };
  const wakeLockRef = useRef<WakeLockSentinel | null>(null);
  const requestWakeLock = async () => {
    const nav = navigator as Navigator & {
      wakeLock?: { request: (type: "screen") => Promise<WakeLockSentinel> };
    };
    if (!nav.wakeLock || wakeLockRef.current) return;
    try {
      wakeLockRef.current = await nav.wakeLock.request("screen");
    } catch {
      // e.g. battery-saver or permissions — ignore; playback still works.
    }
  };
  const releaseWakeLock = async () => {
    try {
      await wakeLockRef.current?.release();
    } catch {
      // already released
    }
    wakeLockRef.current = null;
  };

  /**
   * Recompute how many words have been spoken at the current playback time.
   * A word counts as spoken once the audio reaches its start time. Adjusts in
   * BOTH directions so scrubbing backward un-fills later words.
   */
  const sync = () => {
    const audio = audioRef.current;
    if (!audio) return;
    const t = audio.currentTime;
    let p = pointerRef.current;
    while (p < tokens.length && tokens[p].start <= t) p++;
    while (p > 0 && tokens[p - 1].start > t) p--;
    pointerRef.current = p;
    setSpokenCount((prev) => (prev === p ? prev : p));
  };

  /**
   * Auto-scroll, audiobook-style: keep the current word inside a comfortable
   * reading band rather than scrolling every line. We only scroll when the
   * active word drifts BELOW the band (it's read its way down ~several lines)
   * or ABOVE it (after a rewind/manual scroll), then jump it back to a focus
   * line high on the screen — leaving the just-read lines as context above and
   * the upcoming lines below. A cooldown prevents the smooth scroll from
   * re-triggering itself mid-animation.
   */
  const autoScroll = () => {
    const el = wordRefs.current[pointerRef.current - 1];
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const vh = window.innerHeight;
    const isMobile = window.matchMedia("(max-width: 700px)").matches;
    const bottomBar = isMobile ? 104 : 0; // space reserved by the fixed controls
    const focus = vh * 0.25; // where we park the current line after scrolling
    const lowerBound = vh * 0.60 - bottomBar; // too low → scroll
    const upperBound = vh * 0.1; // too high (e.g. after rewind) → scroll
    if (rect.top <= lowerBound && rect.top >= upperBound) return;
    const now = performance.now();
    if (now - lastScrollRef.current < 500) return; // mid-animation cooldown
    lastScrollRef.current = now;
    window.scrollBy({ top: rect.top - focus, behavior: "smooth" });
  };

  const tick = () => {
    sync();
    autoScroll();
    rafRef.current = requestAnimationFrame(tick);
  };

  const stopLoop = () => {
    if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    rafRef.current = null;
  };

  const onPlay = () => {
    setPlaying(true);
    stopLoop();
    rafRef.current = requestAnimationFrame(tick);
    requestWakeLock();
  };
  const onPause = () => {
    setPlaying(false);
    stopLoop();
    sync(); // leave the already-spoken words orange
    releaseWakeLock();
  };
  const onEnded = () => {
    setPlaying(false);
    stopLoop();
    releaseWakeLock();
    pointerRef.current = tokens.length;
    setSpokenCount(tokens.length); // whole story filled
  };
  const onSeeked = () => sync(); // re-fill correctly after scrubbing (paused or playing)

  // The OS releases the wake lock when the tab is hidden; re-acquire it when we
  // come back if audio is still playing. Release on unmount.
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === "visible" && audioRef.current && !audioRef.current.paused) {
        requestWakeLock();
      }
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      releaseWakeLock();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const toggle = () => {
    const audio = audioRef.current;
    if (!audio) return;
    if (audio.paused) audio.play();
    else audio.pause();
  };

  // Driving-friendly quick rewind. Programmatically setting currentTime fires a
  // "seeked" event, so the orange fill re-syncs automatically.
  const rewind = (seconds: number) => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.currentTime = Math.max(0, audio.currentTime - seconds);
  };

  // Map a tapped word to its sentence, then to the parallel English sentence.
  const lookupEnglish = (wordIndex: number): { id: string; en: string } => {
    const wt = idMap.wordToSentence;
    if (!wt.length) return { id: "", en: translation };
    const si = wt[Math.min(wordIndex, wt.length - 1)];
    const info = idMap.sentences[si];
    const para = english.paras[info?.para ?? 0];
    const en =
      para?.[info?.sentInPara ?? 0] ??
      para?.[(para?.length ?? 1) - 1] ??
      english.flat[Math.min(si, english.flat.length - 1)] ??
      translation;
    return { id: info?.text ?? "", en: en || translation };
  };

  // Place a popup near an element's rect, clamped to the viewport.
  const placeFrom = (rect: DOMRect) => {
    const vw = window.innerWidth;
    const width = Math.min(320, vw - 24);
    let left = rect.left;
    if (left + width > vw - 12) left = vw - 12 - width;
    if (left < 12) left = 12;
    const above = rect.top > 220;
    return { left, width, above, top: above ? rect.top - 8 : rect.bottom + 8 };
  };

  const onWordClick = (e: React.MouseEvent<HTMLSpanElement>, wordIndex: number) => {
    const { id, en } = lookupEnglish(wordIndex);
    setExplain(null);
    setPopup({ id, en, ...placeFrom(e.currentTarget.getBoundingClientRect()) });
  };

  // Second level: tap an Indonesian word INSIDE the translation popup → ask a
  // fresh Claude session to explain why that word was chosen.
  const onExplainClick = async (e: React.MouseEvent<HTMLSpanElement>, rawWord: string) => {
    e.stopPropagation();
    if (!popup) return;
    const word = rawWord.replace(/^[^\p{L}]+|[^\p{L}]+$/gu, "");
    if (!word) return;
    const indoSentence = popup.id;
    const englishSentence = popup.en;
    setExplain({ word, ...placeFrom(e.currentTarget.getBoundingClientRect()), loading: true, text: "", error: "" });
    try {
      const res = await fetch("/api/stories/explain", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ word, indoSentence, englishSentence }),
      });
      const data = (await res.json()) as { explanation?: string; error?: string };
      if (!res.ok) throw new Error(data.error || "Could not explain that word");
      setExplain((prev) => (prev && prev.word === word ? { ...prev, loading: false, text: data.explanation ?? "" } : prev));
    } catch (err) {
      const message = err instanceof Error ? err.message : "Something went wrong";
      setExplain((prev) => (prev && prev.word === word ? { ...prev, loading: false, error: message } : prev));
    }
  };

  // Dismiss popups on scroll / resize / Escape so they can't sit stale.
  useEffect(() => {
    if (!popup && !explain) return;
    const closeAll = () => {
      setExplain(null);
      setPopup(null);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (explain) setExplain(null);
      else setPopup(null);
    };
    window.addEventListener("scroll", closeAll, true);
    window.addEventListener("resize", closeAll);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("scroll", closeAll, true);
      window.removeEventListener("resize", closeAll);
      window.removeEventListener("keydown", onKey);
    };
  }, [popup, explain]);

  return (
    <div className="story-player">
      {audioUrl ? (
        <>
          <div className="story-controls">
            <button
              type="button"
              className="story-skip-btn"
              onClick={() => rewind(5)}
              aria-label="Rewind 5 seconds"
            >
              <svg viewBox="0 0 24 24" width="30" height="30" aria-hidden>
                <path
                  fill="currentColor"
                  d="M12 5V1L7 6l5 5V7c3.31 0 6 2.69 6 6s-2.69 6-6 6-6-2.69-6-6H4c0 4.42 3.58 8 8 8s8-3.58 8-8-3.58-8-8-8z"
                />
                <text x="12.3" y="16" textAnchor="middle" fontSize="8.5" fontWeight="700" fill="currentColor">
                  5
                </text>
              </svg>
            </button>
            <button type="button" className="story-play-btn" onClick={toggle} aria-label={playing ? "Pause" : "Play"}>
              {playing ? (
                <svg viewBox="0 0 24 24" width="26" height="26" fill="currentColor" aria-hidden>
                  <rect x="6" y="5" width="4" height="14" rx="1" />
                  <rect x="14" y="5" width="4" height="14" rx="1" />
                </svg>
              ) : (
                <svg viewBox="0 0 24 24" width="26" height="26" fill="currentColor" aria-hidden>
                  <path d="M8 5.14v13.72a1 1 0 0 0 1.54.84l10.29-6.86a1 1 0 0 0 0-1.68L9.54 4.3A1 1 0 0 0 8 5.14z" />
                </svg>
              )}
            </button>
            <audio
              ref={audioRef}
              src={audioUrl}
              controls
              preload="auto"
              className="story-audio"
              onPlay={onPlay}
              onPause={onPause}
              onEnded={onEnded}
              onSeeked={onSeeked}
            />
          </div>

          <p className="story-text">
            {pieces.map((p, i) =>
              p.kind === "ws" ? (
                <span key={i}>{p.value}</span>
              ) : (
                <span
                  key={i}
                  ref={(el) => {
                    wordRefs.current[p.index] = el;
                  }}
                  className={p.index < spokenCount ? "story-word story-word-spoken" : "story-word"}
                  onClick={(e) => onWordClick(e, p.index)}
                >
                  {p.value}
                </span>
              ),
            )}
          </p>
        </>
      ) : (
        <p className="story-text">{text}</p>
      )}

      {translation && (
        <div className="story-translation-block">
          <button
            type="button"
            className="story-translation-toggle"
            onClick={() => setShowTranslation((s) => !s)}
          >
            {showTranslation ? "Hide English" : "Show English"}
          </button>
          {showTranslation && <p className="story-translation">{translation}</p>}
        </div>
      )}

      {popup && (
        <>
          <div
            className="story-popup-backdrop"
            onClick={() => {
              setExplain(null);
              setPopup(null);
            }}
          />
          <div
            className={`story-popup${popup.above ? " story-popup-above" : ""}`}
            style={{ top: popup.top, left: popup.left, width: popup.width }}
            role="dialog"
          >
            {popup.id && (
              <p className="story-popup-id">
                {popup.id.split(/(\s+)/).map((tok, k) =>
                  tok === "" || /^\s+$/.test(tok) ? (
                    tok
                  ) : (
                    <span
                      key={k}
                      className="story-popup-word"
                      onClick={(e) => onExplainClick(e, tok)}
                    >
                      {tok}
                    </span>
                  ),
                )}
              </p>
            )}
            <p className="story-popup-en">{popup.en}</p>
          </div>
        </>
      )}

      {explain && (
        <>
          <div className="story-popup-backdrop story-popup-backdrop-2" onClick={() => setExplain(null)} />
          <div
            className={`story-popup story-explain${explain.above ? " story-popup-above" : ""}`}
            style={{ top: explain.top, left: explain.left, width: explain.width }}
            role="dialog"
          >
            <p className="story-explain-word">{explain.word}</p>
            {explain.loading && (
              <p className="story-explain-loading">
                <span className="story-explain-spinner" aria-hidden /> Thinking…
              </p>
            )}
            {explain.error && <p className="story-explain-error">{explain.error}</p>}
            {!explain.loading && !explain.error && (
              <p className="story-explain-text">{explain.text}</p>
            )}
          </div>
        </>
      )}
    </div>
  );
}
