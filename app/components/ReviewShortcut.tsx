"use client";

import { useEffect } from "react";
import { useRouter, useParams } from "next/navigation";

/**
 * Listens for cmd+K (mac) / ctrl+K (everything else) and routes to
 * /review?lang=<current lang>. Mounted invisibly in the language layout.
 */
export default function ReviewShortcut() {
  const router = useRouter();
  const params = useParams<{ lang?: string }>();

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      const isMod = e.metaKey || e.ctrlKey;
      if (!isMod || e.key.toLowerCase() !== "k") return;

      // Don't hijack when the user is selecting text in an editable surface.
      const target = e.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.isContentEditable)
      ) {
        return;
      }

      e.preventDefault();
      const lang = params?.lang ?? "indonesian";
      router.push(`/review?lang=${encodeURIComponent(lang)}`);
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [router, params]);

  return null;
}
