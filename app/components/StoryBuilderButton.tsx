"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { createClient } from "../lib/supabase/client";

/**
 * Entry point to Story Builder, mounted in the language layout. Mirrors
 * SignOutButton: renders nothing for anonymous visitors (the feature calls paid
 * APIs and is auth-gated), and only on the Indonesian section for now.
 */
export default function StoryBuilderButton() {
  const params = useParams<{ lang?: string }>();
  const [authed, setAuthed] = useState(false);

  useEffect(() => {
    const supabase = createClient();
    let cancelled = false;
    supabase.auth.getSession().then(({ data }) => {
      if (!cancelled) setAuthed(!!data.session);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => {
      setAuthed(!!session);
    });
    return () => {
      cancelled = true;
      sub.subscription.unsubscribe();
    };
  }, []);

  const lang = params?.lang ?? "indonesian";
  if (!authed || lang !== "indonesian") return null;

  return (
    <div className="story-builder-entry">
      <Link href={`/${lang}/stories`} className="story-builder-btn">
        <svg viewBox="0 0 20 20" width="16" height="16" fill="currentColor" aria-hidden>
          <path d="M4 3h9l3 3v11a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1zm8 1.5V7h2.5L12 4.5zM6 9h8v1.4H6V9zm0 3h8v1.4H6V12z" />
        </svg>
        Story Builder
      </Link>
    </div>
  );
}
