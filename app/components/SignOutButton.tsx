"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "../lib/supabase/client";

/**
 * Renders nothing for unauthenticated visitors — keeps the main page looking
 * exactly as it always has. Renders a small "Sign Out" link in the top-right
 * once a session is detected client-side.
 */
export default function SignOutButton() {
  const [authed, setAuthed] = useState(false);
  const router = useRouter();

  useEffect(() => {
    const supabase = createClient();
    let cancelled = false;

    supabase.auth.getSession().then(({ data }) => {
      if (!cancelled) setAuthed(!!data.session);
    });

    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      setAuthed(!!session);
    });

    return () => {
      cancelled = true;
      sub.subscription.unsubscribe();
    };
  }, []);

  if (!authed) return null;

  return (
    <button
      type="button"
      className="sign-out-btn"
      onClick={async () => {
        const supabase = createClient();
        await supabase.auth.signOut();
        router.refresh();
      }}
    >
      Sign Out
    </button>
  );
}
