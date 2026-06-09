import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "../../lib/supabase/server";
import LoginForm from "../../review/LoginForm";
import StoriesList, { type StoryItem } from "./StoriesList";

export const dynamic = "force-dynamic";

export default async function StoriesLibraryPage({
  params,
}: {
  params: Promise<{ lang: string }>;
}) {
  const { lang } = await params;
  if (lang !== "indonesian") notFound();

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return <LoginForm />;

  const { data, error } = await supabase
    .from("vocab_stories")
    .select("id, topic, status, style, title, error, created_at")
    .order("created_at", { ascending: false });

  const stories = (data ?? []) as StoryItem[];

  return (
    <main className="stories-wrap">
      <Link href={`/${lang}`} className="stories-back-link stories-back-top">
        ← Vocabulary
      </Link>

      <div className="stories-head">
        <h2>Story Builder</h2>
        <Link href={`/${lang}/stories/new`} className="stories-new-btn">
          + New Story
        </Link>
      </div>

      {error && <div className="stories-error">Couldn’t load stories: {error.message}</div>}

      {!error && <StoriesList lang={lang} initial={stories} />}

      {!error && stories.length > 0 && (
        <p className="stories-swipe-hint">Swipe a story left to delete it.</p>
      )}
    </main>
  );
}
