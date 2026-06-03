import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "../../lib/supabase/server";
import LoginForm from "../../review/LoginForm";

export const dynamic = "force-dynamic";

type StoryRow = {
  id: string;
  topic: string;
  status: string;
  title: string | null;
  error: string | null;
  created_at: string;
};

function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

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
    .from("stories")
    .select("id, topic, status, title, error, created_at")
    .order("created_at", { ascending: false });

  const stories = (data ?? []) as StoryRow[];

  return (
    <main className="stories-wrap">
      <div className="stories-head">
        <h2>Story Builder</h2>
        <Link href={`/${lang}/stories/new`} className="stories-new-btn">
          + New Story
        </Link>
      </div>

      {error && <div className="stories-error">Couldn’t load stories: {error.message}</div>}

      {stories.length === 0 && !error && (
        <p className="stories-empty">
          No stories yet. Tap <strong>New Story</strong>, pick a topic, and I’ll write you a short
          Indonesian story using the words you already know.
        </p>
      )}

      <ul className="stories-list">
        {stories.map((s) => (
          <li key={s.id} className="stories-item">
            <Link href={`/${lang}/stories/${s.id}`} className="stories-item-link">
              <div className="stories-item-main">
                <span className="stories-item-title">{s.title ?? s.topic}</span>
                <span className="stories-item-topic">{s.topic}</span>
                {s.status === "failed" && s.error && (
                  <span className="stories-item-errmsg">{s.error}</span>
                )}
              </div>
              <div className="stories-item-meta">
                <span className={`stories-badge stories-badge-${s.status}`}>{s.status}</span>
                <span className="stories-item-date">{formatDate(s.created_at)}</span>
              </div>
            </Link>
          </li>
        ))}
      </ul>
    </main>
  );
}
