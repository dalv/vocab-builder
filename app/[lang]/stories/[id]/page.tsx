import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "../../../lib/supabase/server";
import LoginForm from "../../../review/LoginForm";
import StoryPlayer from "./StoryPlayer";
import PendingRefresher from "./PendingRefresher";
import type { Token } from "../../../lib/stories/alignment";

export const dynamic = "force-dynamic";

const AUDIO_BUCKET = "story-audio";

type StoryRow = {
  id: string;
  topic: string;
  status: string;
  title: string | null;
  story_text: string | null;
  translation_en: string | null;
  audio_path: string | null;
  word_timings: Token[] | null;
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
    .from("stories")
    .select("id, topic, status, title, story_text, translation_en, audio_path, word_timings, error")
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

  return (
    <main className="stories-wrap">
      <div className="stories-head">
        <h2>{story.title ?? story.topic}</h2>
        {backLink}
      </div>
      <p className="story-topic-sub">{story.topic}</p>
      <StoryPlayer
        text={story.story_text ?? ""}
        tokens={story.word_timings ?? []}
        audioUrl={audioUrl}
        translation={story.translation_en ?? ""}
      />
    </main>
  );
}
