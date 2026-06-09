import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "../../../lib/supabase/server";
import LoginForm from "../../../review/LoginForm";
import StoryPlayer from "./StoryPlayer";
import PendingRefresher from "./PendingRefresher";
import type { Token } from "../../../lib/stories/alignment";

export const dynamic = "force-dynamic";

const AUDIO_BUCKET = "vocab-story-audio";

type Segment = {
  speaker?: string;
  gender?: "F" | "M";
  engStart?: number;
  engEnd?: number;
};

type StoryRow = {
  id: string;
  topic: string;
  status: string;
  style: string | null;
  title: string | null;
  story_text: string | null;
  translation_en: string | null;
  audio_path: string | null;
  word_timings: Token[] | null;
  segments: Segment[] | null;
  error: string | null;
};

export default async function StoryPage({
  params,
}: {
  params: Promise<{ lang: string; id: string }>;
}) {
  const { lang, id } = await params;
  if (lang !== "indonesian") notFound();

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return <LoginForm />;

  const { data } = await supabase
    .from("vocab_stories")
    .select(
      "id, topic, status, style, title, story_text, translation_en, audio_path, word_timings, segments, error",
    )
    .eq("id", id)
    .single();

  const story = data as StoryRow | null;
  if (!story) notFound();

  const backLink = (
    <Link href={`/${lang}/stories`} className="stories-back-link">
      ← Library
    </Link>
  );

  if (story.status === "pending") {
    return (
      <main className="stories-wrap">
        <div className="stories-head">
          <h2>Working…</h2>
          {backLink}
        </div>
        <div className="story-loading">
          <div className="story-spinner" aria-hidden />
          <p className="story-loading-topic">“{story.topic}”</p>
          <p className="story-loading-step">Researching, writing, and narrating your story…</p>
        </div>
        <PendingRefresher />
      </main>
    );
  }

  if (story.status === "failed") {
    return (
      <main className="stories-wrap">
        <div className="stories-head">
          <h2>Generation failed</h2>
          {backLink}
        </div>
        <p className="story-loading-topic">“{story.topic}”</p>
        <div className="stories-error">{story.error ?? "Unknown error"}</div>
        <Link href={`/${lang}/stories/new`} className="topic-generate" style={{ textAlign: "center" }}>
          Try a new story
        </Link>
      </main>
    );
  }

  // status === "ready": mint a short-lived signed URL for the private audio.
  let audioUrl: string | null = null;
  if (story.audio_path) {
    const { data: signed } = await supabase.storage
      .from(AUDIO_BUCKET)
      .createSignedUrl(story.audio_path, 60 * 60);
    audioUrl = signed?.signedUrl ?? null;
  }

  // Ordered list of ready story ids for the "auto-play next" playlist (same
  // newest-first order as the library).
  const { data: idRows } = await supabase
    .from("vocab_stories")
    .select("id")
    .eq("status", "ready")
    .order("created_at", { ascending: false });
  const playlistIds = (idRows ?? []).map((r) => (r as { id: string }).id);

  return (
    <main className="stories-wrap">
      <Link href={`/${lang}/stories`} className="stories-back-link stories-back-top">
        ← Library
      </Link>
      <StoryPlayer
        storyId={story.id}
        style={story.style ?? "story"}
        initialTitle={story.title ?? story.topic}
        topic={story.topic}
        text={story.story_text ?? ""}
        tokens={story.word_timings ?? []}
        audioUrl={audioUrl}
        translation={story.translation_en ?? ""}
        segments={story.segments}
        playlistIds={playlistIds}
        lang={lang}
      />
    </main>
  );
}
