"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "../../../lib/supabase/client";

// Minimal typings for the (prefixed, non-standard) Web Speech API.
type SpeechRecognition = {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  start: () => void;
  stop: () => void;
  onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null;
  onerror: (() => void) | null;
  onend: (() => void) | null;
};

const LOADING_STEPS = [
  "Researching your topic on the web…",
  "Writing your Indonesian story…",
  "Generating the audio narration…",
  "Almost there…",
];

export default function TopicCapture({ lang }: { lang: string }) {
  const router = useRouter();
  const [topic, setTopic] = useState("");
  const [listening, setListening] = useState(false);
  const [busy, setBusy] = useState(false);
  const [step, setStep] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [speechSupported, setSpeechSupported] = useState(false);
  const recognitionRef = useRef<SpeechRecognition | null>(null);

  useEffect(() => {
    const w = window as unknown as { webkitSpeechRecognition?: new () => SpeechRecognition };
    setSpeechSupported(typeof w.webkitSpeechRecognition === "function");
  }, []);

  // Cycle the loading status text so the long synchronous request feels alive.
  useEffect(() => {
    if (!busy) return;
    const id = setInterval(() => setStep((s) => Math.min(s + 1, LOADING_STEPS.length - 1)), 6000);
    return () => clearInterval(id);
  }, [busy]);

  function toggleMic() {
    if (listening) {
      recognitionRef.current?.stop();
      return;
    }
    const w = window as unknown as { webkitSpeechRecognition?: new () => SpeechRecognition };
    if (!w.webkitSpeechRecognition) return;
    const rec = new w.webkitSpeechRecognition();
    rec.lang = "en-US";
    rec.interimResults = true;
    rec.continuous = false;
    rec.onresult = (e) => {
      let transcript = "";
      for (let i = 0; i < e.results.length; i++) transcript += e.results[i][0].transcript;
      setTopic(transcript);
    };
    rec.onerror = () => setListening(false);
    rec.onend = () => setListening(false);
    recognitionRef.current = rec;
    setListening(true);
    rec.start();
  }

  async function generate() {
    const trimmed = topic.trim();
    if (!trimmed || busy) return;
    setError(null);
    setBusy(true);
    setStep(0);

    try {
      const supabase = createClient();
      // Insert the pending row first so the story persists (and is visible on
      // other devices) even while it's still generating.
      const { data: inserted, error: insertError } = await supabase
        .from("stories")
        .insert({ topic: trimmed, status: "pending" })
        .select("id")
        .single();
      if (insertError || !inserted) {
        throw new Error(insertError?.message ?? "Could not create the story");
      }

      const res = await fetch("/api/stories/generate", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ storyId: inserted.id, topic: trimmed }),
      });

      // Whether it succeeded or failed, the row now reflects the final state —
      // the story page renders ready audio or the failure with its error.
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        console.error("Generation failed:", body.error);
      }
      router.push(`/${lang}/stories/${inserted.id}`);
    } catch (err) {
      setBusy(false);
      setError(err instanceof Error ? err.message : "Something went wrong");
    }
  }

  if (busy) {
    return (
      <main className="stories-wrap">
        <div className="story-loading">
          <div className="story-spinner" aria-hidden />
          <p className="story-loading-topic">“{topic.trim()}”</p>
          <p className="story-loading-step">{LOADING_STEPS[step]}</p>
          <p className="story-loading-note">This can take a minute or two — hang tight.</p>
        </div>
      </main>
    );
  }

  return (
    <main className="stories-wrap">
      <div className="stories-head">
        <h2>New Story</h2>
        <Link href={`/${lang}/stories`} className="stories-back-link">
          ← Library
        </Link>
      </div>

      <p className="topic-prompt">What should the story be about? A current event, a place, anything.</p>

      <div className="topic-input-row">
        <textarea
          className="topic-input"
          placeholder="e.g. new rules for tourists in Bali, the surf at Uluwatu, a recipe for nasi goreng…"
          value={topic}
          onChange={(e) => setTopic(e.target.value)}
          rows={3}
        />
        {speechSupported && (
          <button
            type="button"
            className={`topic-mic${listening ? " topic-mic-on" : ""}`}
            onClick={toggleMic}
            aria-label={listening ? "Stop listening" : "Speak your topic"}
          >
            <svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor" aria-hidden>
              <path d="M12 14a3 3 0 0 0 3-3V5a3 3 0 0 0-6 0v6a3 3 0 0 0 3 3z" />
              <path d="M19 11a1 1 0 1 0-2 0 5 5 0 0 1-10 0 1 1 0 1 0-2 0 7 7 0 0 0 6 6.92V21a1 1 0 1 0 2 0v-3.08A7 7 0 0 0 19 11z" />
            </svg>
          </button>
        )}
      </div>

      {error && <div className="stories-error">{error}</div>}

      <button type="button" className="topic-generate" onClick={generate} disabled={!topic.trim()}>
        Generate story
      </button>
    </main>
  );
}
