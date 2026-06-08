"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { Token } from "../../../lib/stories/alignment";
import { buildSentenceMap, splitParagraphs, splitSentences } from "../../../lib/stories/sentences";

type Piece =
  | { kind: "ws"; value: string }
  | { kind: "word"; value: string; index: number };

type Segment = {
  speaker?: string;
  gender?: "F" | "M";
  // Sentences style: the audio [start,end] of this sentence's spoken English.
  engStart?: number;
  engEnd?: number;
};

/**
 * Split the story text into PARAGRAPHS of render pieces, assigning each
 * non-whitespace chunk the next GLOBAL token index. Split on any newline run, to
 * match splitParagraphs() used for the English side + sentence map, so paragraph
 * i lines up with English paragraph i and (for podcasts) segment i. Because
 * tokens were produced by the SAME whitespace split (see alignment.ts), the Nth
 * word across all paragraphs is timing token N — display and fill line up.
 */
function toParagraphs(text: string): Piece[][] {
  const paragraphs: Piece[][] = [];
  let index = 0;
  for (const para of text.split(/\n+/)) {
    const pieces: Piece[] = [];
    for (const part of para.split(/(\s+)/)) {
      if (part === "") continue;
      if (/^\s+$/.test(part)) pieces.push({ kind: "ws", value: part });
      else pieces.push({ kind: "word", value: part, index: index++ });
    }
    if (pieces.length) paragraphs.push(pieces);
  }
  return paragraphs;
}

export default function StoryPlayer({
  storyId,
  style,
  text,
  tokens,
  audioUrl,
  translation,
  segments,
}: {
  storyId: string;
  style: string;
  text: string;
  tokens: Token[];
  audioUrl: string | null;
  translation: string;
  segments: Segment[] | null;
}) {
  const isSentences = style === "sentences";
  const paragraphs = useMemo(() => toParagraphs(text), [text]);

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
  const [regenerating, setRegenerating] = useState(false);
  const [regenError, setRegenError] = useState<string | null>(null);
  // "3-pass" study mode: per paragraph, play Indonesian audio → speak the
  // English (browser TTS) → play the Indonesian audio again, then next paragraph.
  const [studyMode, setStudyMode] = useState(false);
  const router = useRouter();

  // English paragraph texts, parallel to the rendered paragraphs.
  const englishParaTexts = useMemo(() => splitParagraphs(translation), [translation]);
  // Sentences style: audio range of each sentence's spoken English (from the
  // ElevenLabs bilingual track). null when not available (older stories).
  const engRanges = useMemo(() => {
    if (!isSentences || !segments) return null;
    const ranges = segments.map((s) =>
      typeof s?.engStart === "number" && typeof s?.engEnd === "number"
        ? { start: s.engStart, end: s.engEnd }
        : null,
    );
    return ranges.some(Boolean) ? ranges : null;
  }, [isSentences, segments]);

  // Audio time range [start, end] for each rendered paragraph, from word timings.
  const paraRanges = useMemo(() => {
    return paragraphs.map((para) => {
      const words = para.filter((p): p is { kind: "word"; value: string; index: number } => p.kind === "word");
      if (!words.length) return null;
      const first = words[0].index;
      const last = words[words.length - 1].index;
      const start = tokens[first]?.start ?? 0;
      const end = tokens[last]?.end ?? start;
      return { start, end };
    });
  }, [paragraphs, tokens]);

  const audioRef = useRef<HTMLAudioElement>(null);
  const rafRef = useRef<number | null>(null);
  const pointerRef = useRef(0); // index into tokens, kept in sync with currentTime
  const wordRefs = useRef<(HTMLSpanElement | null)[]>([]);
  const lastScrollRef = useRef(0); // timestamp of the last auto-scroll (cooldown)
  const primedRef = useRef(false); // whether we've fixed a bogus reported duration
  const resumeAfterPopupRef = useRef(false); // was playing when the popup opened?
  const prevPopupRef = useRef<unknown>(null); // detect the translation popup closing
  // 3-pass study-mode sequencer state (refs so the rAF loop reads live values).
  // Phase kinds: 'id' = play the Indonesian audio slice; 'eng-audio' = play the
  // sentence's English audio slice (Sentences style); 'eng-speak' = browser
  // speech (story/podcast study mode, or older sentences without English audio).
  type Phase = "id" | "eng-audio" | "eng-speak";
  const studyRef = useRef<{
    running: boolean;
    p: number;
    phaseIdx: number;
    phases: Phase[];
    interPause: number;
  }>({ running: false, p: 0, phaseIdx: 0, phases: [], interPause: 0 });
  const studyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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
    const lowerBound = vh * 0.50 - bottomBar; // too low → scroll
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
    if (studyRef.current.running) studyWatch();
    rafRef.current = requestAnimationFrame(tick);
  };

  const stopLoop = () => {
    if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    rafRef.current = null;
  };

  // In study mode the sequencer owns play/pause/seek (it stops & restarts the
  // audio at paragraph boundaries), so the native events must not tear it down.
  const onPlay = () => {
    if (studyRef.current.running) return;
    setPlaying(true);
    stopLoop();
    rafRef.current = requestAnimationFrame(tick);
    requestWakeLock();
    resumeAfterPopupRef.current = false; // a manual play cancels the auto-resume
  };
  const onPause = () => {
    if (studyRef.current.running) return;
    setPlaying(false);
    stopLoop();
    sync(); // leave the already-spoken words orange
    releaseWakeLock();
  };
  const onEnded = () => {
    if (studyRef.current.running) return;
    setPlaying(false);
    stopLoop();
    releaseWakeLock();
    pointerRef.current = tokens.length;
    setSpokenCount(tokens.length); // whole story filled
  };
  const onSeeked = () => {
    if (studyRef.current.running) return;
    sync(); // re-fill correctly after scrubbing (paused or playing)
  };

  // ---------------- Generalized A/B playback sequencer ----------------
  // Plays each paragraph through a list of phases (no audio is regenerated; we
  // just seek the existing track and interleave browser speech):
  //   'id'  = play the paragraph's Indonesian audio slice (highlight follows)
  //   'eng' = speak the paragraph's English via the browser's SpeechSynthesis
  // Story/podcast study toggle uses [id, eng, id]; Sentences uses
  // [eng, id, eng, id] with a pause between sentences.

  // The audio range for the current phase: the Indonesian slice, or (Sentences)
  // the English slice. null for a browser-speech phase.
  const rangeForPhase = (phase: Phase, p: number) => {
    if (phase === "id") return paraRanges[p];
    if (phase === "eng-audio") return engRanges ? engRanges[p] : null;
    return null;
  };

  const beginAudioSegment = (range: { start: number; end: number } | null) => {
    const a = audioRef.current;
    if (!a || !range) {
      finishSequence();
      return;
    }
    a.currentTime = range.start;
    a.play().catch(() => {
      /* ignore */
    });
  };

  const speakEnglish = (p: number, onDone: () => void) => {
    const text = englishParaTexts[p];
    const synth = typeof window !== "undefined" ? window.speechSynthesis : null;
    if (!text || !synth) {
      onDone();
      return;
    }
    const u = new SpeechSynthesisUtterance(text);
    u.lang = "en-US";
    u.rate = 0.95;
    u.onend = onDone;
    u.onerror = onDone;
    synth.cancel();
    synth.speak(u);
  };

  const scheduleNext = (fn: () => void, delay: number) => {
    if (studyTimerRef.current) clearTimeout(studyTimerRef.current);
    if (delay > 0) {
      studyTimerRef.current = setTimeout(() => {
        if (studyRef.current.running) fn();
      }, delay);
    } else {
      fn();
    }
  };

  const playCurrentPhase = () => {
    const s = studyRef.current;
    if (!s.running) return;
    const phase = s.phases[s.phaseIdx];
    if (phase === "eng-speak") speakEnglish(s.p, onPhaseDone);
    else beginAudioSegment(rangeForPhase(phase, s.p));
  };

  const onPhaseDone = () => {
    const s = studyRef.current;
    if (!s.running) return;
    s.phaseIdx++;
    if (s.phaseIdx < s.phases.length) {
      // After BROWSER speech, iOS ducks other audio and restores it on a ~1-2s
      // ramp, so pause before the next audio slice. All-ElevenLabs phases (eng
      // audio → id) need no such pause.
      const duck = s.phases[s.phaseIdx - 1] === "eng-speak";
      scheduleNext(playCurrentPhase, duck ? 800 : 0);
    } else {
      scheduleNext(advanceParagraph, s.interPause);
    }
  };

  const advanceParagraph = () => {
    const s = studyRef.current;
    let next = s.p + 1;
    while (next < paraRanges.length && !paraRanges[next]) next++;
    if (next >= paraRanges.length) {
      finishSequence();
      return;
    }
    s.p = next;
    s.phaseIdx = 0;
    playCurrentPhase();
  };

  // The rAF loop calls this; detect when an audio slice hits its end.
  const studyWatch = () => {
    const s = studyRef.current;
    const a = audioRef.current;
    if (!a) return;
    const phase = s.phases[s.phaseIdx];
    if (phase === "id" || phase === "eng-audio") {
      const range = rangeForPhase(phase, s.p);
      if (range && a.currentTime >= range.end - 0.06) {
        a.pause();
        onPhaseDone();
      }
    }
  };

  const finishSequence = () => {
    studyRef.current.running = false;
    if (studyTimerRef.current) clearTimeout(studyTimerRef.current);
    studyTimerRef.current = null;
    stopLoop();
    setPlaying(false);
    releaseWakeLock();
  };

  const stopSequence = () => {
    studyRef.current.running = false;
    try {
      window.speechSynthesis?.cancel();
    } catch {
      /* ignore */
    }
    audioRef.current?.pause();
    finishSequence();
  };

  const paragraphAtTime = (t: number) => {
    for (let i = 0; i < paraRanges.length; i++) {
      const r = paraRanges[i];
      if (r && t >= r.start && t < r.end) return i;
    }
    return 0;
  };

  const startSequence = (phases: Phase[], interPause: number) => {
    const synth = typeof window !== "undefined" ? window.speechSynthesis : null;
    // Prime iOS speech within this user gesture so later speak() calls work.
    if (synth) {
      try {
        synth.cancel();
        const warm = new SpeechSynthesisUtterance(" ");
        warm.volume = 0;
        synth.speak(warm);
      } catch {
        /* ignore */
      }
    }
    const a = audioRef.current;
    let p = a ? paragraphAtTime(a.currentTime) : 0;
    while (p < paraRanges.length && !paraRanges[p]) p++;
    if (p >= paraRanges.length) return;
    studyRef.current = { running: true, p, phaseIdx: 0, phases, interPause };
    setPlaying(true);
    requestWakeLock();
    stopLoop();
    rafRef.current = requestAnimationFrame(tick);
    playCurrentPhase();
  };

  const startStudy = () => startSequence(["id", "eng-speak", "id"], 0);

  // Sentences: read the Indonesian twice per sentence, with a pause between
  // sentences. (The English is shown as text only — not read aloud.)
  const startSentences = () => {
    startSequence(["id", "id"], 700);
  };

  const toggleStudyMode = () => {
    // Switching modes resets playback to a clean paused state.
    try {
      window.speechSynthesis?.cancel();
    } catch {
      /* ignore */
    }
    studyRef.current.running = false;
    audioRef.current?.pause();
    stopLoop();
    setPlaying(false);
    setStudyMode((m) => !m);
  };

  // Some browsers (notably iOS Safari) mis-read the duration of stitched audio
  // as just the first clip, which freezes currentTime partway through. If the
  // reported duration is clearly too short vs our timings, force a full scan by
  // seeking to the end, then snap back to 0. (No-op for correct WAV durations.)
  const onLoadedMetadata = () => {
    const a = audioRef.current;
    if (!a || primedRef.current) return;
    const lastEnd = tokens.length ? tokens[tokens.length - 1].end : 0;
    if (!Number.isFinite(a.duration) || a.duration < lastEnd * 0.9) {
      primedRef.current = true;
      const reset = () => {
        a.removeEventListener("seeked", reset);
        try {
          a.currentTime = 0;
        } catch {
          /* ignore */
        }
      };
      a.addEventListener("seeked", reset);
      try {
        a.currentTime = 1e7;
      } catch {
        /* ignore */
      }
    }
  };

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

  // When the translation popup closes (tap-away / scroll / Escape), resume
  // playback with a 5s rewind — but only if we paused it on open.
  useEffect(() => {
    const was = prevPopupRef.current;
    prevPopupRef.current = popup;
    if (was && !popup && resumeAfterPopupRef.current && !studyRef.current.running) {
      resumeAfterPopupRef.current = false;
      const a = audioRef.current;
      if (a) {
        a.currentTime = Math.max(0, a.currentTime - 5);
        a.play().catch(() => {
          /* autoplay may be blocked; ignore */
        });
      }
    }
  }, [popup]);

  const toggle = () => {
    if (isSentences) {
      if (studyRef.current.running) stopSequence();
      else startSentences();
      return;
    }
    if (studyMode) {
      if (studyRef.current.running) stopSequence();
      else startStudy();
      return;
    }
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

  // New audio (e.g. after a regenerate) → reset the fill + stop any study run.
  useEffect(() => {
    pointerRef.current = 0;
    primedRef.current = false;
    studyRef.current.running = false;
    try {
      window.speechSynthesis?.cancel();
    } catch {
      /* ignore */
    }
    setSpokenCount(0);
  }, [audioUrl]);

  // Re-run only the ElevenLabs step for this story, then refresh to pick up the
  // new audio URL + word timings from the server.
  const regenerate = async () => {
    if (regenerating) return;
    setRegenError(null);
    setRegenerating(true);
    audioRef.current?.pause();
    try {
      const res = await fetch("/api/stories/regenerate-audio", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ storyId }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(data.error || "Could not regenerate audio");
      router.refresh();
    } catch (err) {
      setRegenError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setRegenerating(false);
    }
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
    // Pause playback while reading the translation; remember to resume on close.
    // (Not in study mode — the sequencer drives playback there.)
    const a = audioRef.current;
    if (a && !a.paused && !studyRef.current.running) {
      a.pause();
      resumeAfterPopupRef.current = true;
    }
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
              controls={!studyMode && !isSentences}
              preload="auto"
              className={`story-audio${studyMode || isSentences ? " story-audio-hidden" : ""}`}
              onPlay={onPlay}
              onPause={onPause}
              onEnded={onEnded}
              onSeeked={onSeeked}
              onLoadedMetadata={onLoadedMetadata}
            />
            {studyMode && !isSentences && (
              <span className="story-study-label">3-pass mode · Indonesian → English → Indonesian</span>
            )}
            {isSentences && (
              <span className="story-study-label">Sentences · Indonesian ×2</span>
            )}
          </div>

          <div className="story-text">
            {paragraphs.map((para, pi) => (
              <p className={`story-para${isSentences ? " story-sentence" : ""}`} key={pi}>
                {segments && segments[pi] && (
                  <span className={`story-speaker story-speaker-${segments[pi].gender}`}>
                    {segments[pi].speaker}
                  </span>
                )}
                {isSentences && englishParaTexts[pi] && (
                  <span className="story-sentence-en">{englishParaTexts[pi]}</span>
                )}
                {para.map((p, i) =>
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
            ))}
          </div>
        </>
      ) : (
        <p className="story-text">{text}</p>
      )}

      <div className="story-actions">
        {/* Sentences already show the English inline, so the toggles are hidden. */}
        {translation && !isSentences && (
          <button
            type="button"
            className="story-translation-toggle"
            onClick={() => setShowTranslation((s) => !s)}
          >
            {showTranslation ? "Hide English" : "Show English"}
          </button>
        )}
        {audioUrl && englishParaTexts.length > 0 && !isSentences && (
          <button
            type="button"
            className={`story-translation-toggle${studyMode ? " story-mode-on" : ""}`}
            onClick={toggleStudyMode}
            aria-pressed={studyMode}
            title="Play each paragraph in Indonesian, then English, then Indonesian again"
          >
            {studyMode ? "🔁 ID→EN→ID: on" : "🔁 ID→EN→ID"}
          </button>
        )}
        <button
          type="button"
          className="story-translation-toggle story-regen-btn"
          onClick={regenerate}
          disabled={regenerating}
        >
          {regenerating ? "Regenerating…" : "Regenerate audio"}
        </button>
      </div>
      {regenError && <div className="stories-error">{regenError}</div>}
      {translation && showTranslation && <p className="story-translation">{translation}</p>}

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
