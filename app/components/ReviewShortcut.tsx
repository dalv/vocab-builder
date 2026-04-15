"use client";

import { useEffect } from "react";
import { useRouter, useParams } from "next/navigation";

/**
 * Hidden review-mode triggers, mounted invisibly in the language layout:
 *   - cmd+K / ctrl+K on desktop
 *   - long-press on the "Vocabulary Builder" title on touch + mouse
 *
 * Both route to /review?lang=<current lang>.
 */
export default function ReviewShortcut() {
  const router = useRouter();
  const params = useParams<{ lang?: string }>();

  useEffect(() => {
    const goToReview = () => {
      const lang = params?.lang ?? "indonesian";
      router.push(`/review?lang=${encodeURIComponent(lang)}`);
    };

    // ---- Keyboard: cmd+K / ctrl+K ----
    function onKeyDown(e: KeyboardEvent) {
      const isMod = e.metaKey || e.ctrlKey;
      if (!isMod || e.key.toLowerCase() !== "k") return;

      const t = e.target as HTMLElement | null;
      if (
        t &&
        (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)
      ) {
        return;
      }

      e.preventDefault();
      goToReview();
    }
    window.addEventListener("keydown", onKeyDown);

    // ---- Long-press on title (mobile + mouse) ----
    const title = document.querySelector<HTMLElement>("header h1");
    let holdTimer: number | null = null;
    let startX = 0;
    let startY = 0;
    const HOLD_MS = 700;
    const MAX_MOVE = 10; // px before we treat it as a scroll/drag

    const cancelHold = () => {
      if (holdTimer !== null) {
        clearTimeout(holdTimer);
        holdTimer = null;
      }
    };

    const onPointerDown = (e: PointerEvent) => {
      startX = e.clientX;
      startY = e.clientY;
      cancelHold();
      holdTimer = window.setTimeout(() => {
        holdTimer = null;
        goToReview();
      }, HOLD_MS);
    };

    const onPointerMove = (e: PointerEvent) => {
      if (
        holdTimer !== null &&
        (Math.abs(e.clientX - startX) > MAX_MOVE ||
          Math.abs(e.clientY - startY) > MAX_MOVE)
      ) {
        cancelHold();
      }
    };

    // Suppress the iOS callout / right-click menu so the long-press feels
    // like nothing happened until we navigate.
    const onContextMenu = (e: Event) => e.preventDefault();

    if (title) {
      title.addEventListener("pointerdown", onPointerDown);
      title.addEventListener("pointerup", cancelHold);
      title.addEventListener("pointercancel", cancelHold);
      title.addEventListener("pointerleave", cancelHold);
      title.addEventListener("pointermove", onPointerMove);
      title.addEventListener("contextmenu", onContextMenu);
    }

    return () => {
      window.removeEventListener("keydown", onKeyDown);
      cancelHold();
      if (title) {
        title.removeEventListener("pointerdown", onPointerDown);
        title.removeEventListener("pointerup", cancelHold);
        title.removeEventListener("pointercancel", cancelHold);
        title.removeEventListener("pointerleave", cancelHold);
        title.removeEventListener("pointermove", onPointerMove);
        title.removeEventListener("contextmenu", onContextMenu);
      }
    };
  }, [router, params]);

  return null;
}
