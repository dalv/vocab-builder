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

  // Number of words spoken so far. Words with index < spokenCount are filled
  // orange and STAY orange; the text progressively fills as the audio plays.
  const [spokenCount, setSpokenCount] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [showTranslation, setShowTranslation] = useState(false);

  const audioRef = useRef<HTMLAudioElement>(null);
  const rafRef = useRef<number | null>(null);
  const pointerRef = useRef(0); // index into tokens, kept in sync with currentTime
  const wordRefs = useRef<(HTMLSpanElement | null)[]>([]);

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
    setSpokenCount((prev) => {
      if (prev !== p && p > 0) wordRefs.current[p - 1]?.scrollIntoView({ block: "nearest" });
      return prev === p ? prev : p;
    });
  };

  const tick = () => {
    sync();
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
  };
  const onPause = () => {
    setPlaying(false);
    stopLoop();
    sync(); // leave the already-spoken words orange
  };
  const onEnded = () => {
    setPlaying(false);
    stopLoop();
    pointerRef.current = tokens.length;
    setSpokenCount(tokens.length); // whole story filled
  };
  const onSeeked = () => sync(); // re-fill correctly after scrubbing (paused or playing)

  const toggle = () => {
    const audio = audioRef.current;
    if (!audio) return;
    if (audio.paused) audio.play();
    else audio.pause();
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

  const onWordClick = (e: React.MouseEvent<HTMLSpanElement>, wordIndex: number) => {
    const { id, en } = lookupEnglish(wordIndex);
    const rect = e.currentTarget.getBoundingClientRect();
    const vw = window.innerWidth;
    const width = Math.min(320, vw - 24);
    let left = rect.left;
    if (left + width > vw - 12) left = vw - 12 - width;
    if (left < 12) left = 12;
    const above = rect.top > 220;
    setPopup({ id, en, left, width, above, top: above ? rect.top - 8 : rect.bottom + 8 });
  };

  // Dismiss the popup on scroll / resize / Escape so it can't sit stale.
  useEffect(() => {
    if (!popup) return;
    const close = () => setPopup(null);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    window.addEventListener("scroll", close, true);
    window.addEventListener("resize", close);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("scroll", close, true);
      window.removeEventListener("resize", close);
      window.removeEventListener("keydown", onKey);
    };
  }, [popup]);

  return (
    <div className="story-player">
      {audioUrl ? (
        <>
          <div className="story-controls">
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
          <div className="story-popup-backdrop" onClick={() => setPopup(null)} />
          <div
            className={`story-popup${popup.above ? " story-popup-above" : ""}`}
            style={{ top: popup.top, left: popup.left, width: popup.width }}
            role="dialog"
          >
            {popup.id && <p className="story-popup-id">{popup.id}</p>}
            <p className="story-popup-en">{popup.en}</p>
          </div>
        </>
      )}
    </div>
  );
}
