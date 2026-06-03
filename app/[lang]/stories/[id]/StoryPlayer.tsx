"use client";

import { useMemo, useRef, useState } from "react";
import type { Token } from "../../../lib/stories/alignment";

type Piece =
  | { kind: "ws"; value: string }
  | { kind: "word"; value: string; index: number };

/**
 * Split the story text into render pieces, assigning each non-whitespace chunk
 * the next token index. Because the tokens were produced by the SAME
 * whitespace split (see alignment.ts), the Nth word here is timing token N —
 * what's displayed and what's highlighted line up by construction.
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
  const [active, setActive] = useState(-1);
  const [playing, setPlaying] = useState(false);
  const [showTranslation, setShowTranslation] = useState(false);

  const audioRef = useRef<HTMLAudioElement>(null);
  const rafRef = useRef<number | null>(null);
  const pointerRef = useRef(0); // monotonic index into tokens, advances with time
  const wordRefs = useRef<(HTMLSpanElement | null)[]>([]);

  const setActiveSafe = (i: number) => {
    setActive((prev) => {
      if (prev !== i && i >= 0) {
        wordRefs.current[i]?.scrollIntoView({ block: "nearest" });
      }
      return prev === i ? prev : i;
    });
  };

  const tick = () => {
    const audio = audioRef.current;
    if (!audio) return;
    const t = audio.currentTime;
    let p = pointerRef.current;
    while (p < tokens.length && tokens[p].end < t) p++;
    pointerRef.current = p;
    if (p < tokens.length && t >= tokens[p].start) setActiveSafe(p);
    else setActiveSafe(-1);
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
    setActiveSafe(-1);
  };
  const onEnded = () => {
    setPlaying(false);
    stopLoop();
    pointerRef.current = 0;
    setActiveSafe(-1);
  };
  // On any scrub, reset the monotonic pointer so it re-finds the spot forward.
  const onSeeking = () => {
    pointerRef.current = 0;
  };

  const toggle = () => {
    const audio = audioRef.current;
    if (!audio) return;
    if (audio.paused) audio.play();
    else audio.pause();
  };

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
              onSeeking={onSeeking}
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
                  className={p.index === active ? "story-word story-word-active" : "story-word"}
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
    </div>
  );
}
