"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";

export type StoryItem = {
  id: string;
  topic: string;
  status: string;
  style: string | null;
  title: string | null;
  error: string | null;
  created_at: string;
};

function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

const STYLE_META: Record<string, { icon: string; label: string }> = {
  story: { icon: "📖", label: "Story" },
  podcast: { icon: "🎙️", label: "Podcast" },
  sentences: { icon: "🗂️", label: "Sentences" },
};

function styleMeta(style: string | null) {
  return STYLE_META[style ?? "story"] ?? STYLE_META.story;
}

export default function StoriesList({ lang, initial }: { lang: string; initial: StoryItem[] }) {
  const [stories, setStories] = useState(initial);

  if (stories.length === 0) {
    return (
      <p className="stories-empty">
        No stories yet. Tap <strong>New Story</strong>, pick a topic, and I’ll write you a short
        Indonesian story using the words you already know.
      </p>
    );
  }

  return (
    <ul className="stories-list">
      {stories.map((s) => (
        <SwipeRow
          key={s.id}
          lang={lang}
          story={s}
          onDeleted={() => setStories((prev) => prev.filter((x) => x.id !== s.id))}
        />
      ))}
    </ul>
  );
}

const DELETE_W = 92; // px width of the revealed Delete button

function SwipeRow({
  lang,
  story,
  onDeleted,
}: {
  lang: string;
  story: StoryItem;
  onDeleted: () => void;
}) {
  const router = useRouter();
  const [dx, setDx] = useState(0);
  const [open, setOpen] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const startX = useRef(0);
  const baseDx = useRef(0);
  const moved = useRef(false);

  const onTouchStart = (e: React.TouchEvent) => {
    startX.current = e.touches[0].clientX;
    baseDx.current = open ? -DELETE_W : 0;
    moved.current = false;
    setDragging(true);
  };
  const onTouchMove = (e: React.TouchEvent) => {
    const d = e.touches[0].clientX - startX.current;
    if (Math.abs(d) > 6) moved.current = true;
    setDx(Math.max(-DELETE_W, Math.min(0, baseDx.current + d)));
  };
  const onTouchEnd = () => {
    setDragging(false);
    if (dx < -DELETE_W / 2) {
      setDx(-DELETE_W);
      setOpen(true);
    } else {
      setDx(0);
      setOpen(false);
    }
  };

  const openStory = () => {
    // A swipe (or an open delete affordance) shouldn't navigate.
    if (moved.current) return;
    if (open) {
      setOpen(false);
      setDx(0);
      return;
    }
    router.push(`/${lang}/stories/${story.id}`);
  };

  const del = async () => {
    setDeleting(true);
    try {
      const res = await fetch("/api/stories/delete", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ storyId: story.id }),
      });
      if (!res.ok) throw new Error("delete failed");
      onDeleted();
    } catch {
      setDeleting(false);
    }
  };

  return (
    <li className="swipe-row">
      <button
        className="swipe-delete"
        style={{ width: DELETE_W }}
        onClick={del}
        disabled={deleting}
        aria-label={`Delete ${story.title ?? story.topic}`}
      >
        {deleting ? "…" : "Delete"}
      </button>
      <div
        className={`swipe-content stories-item-link story-style-row-${story.style ?? "story"}`}
        style={{ transform: `translateX(${dx}px)`, transition: dragging ? "none" : "transform 0.2s ease" }}
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
        onClick={openStory}
        role="button"
        tabIndex={0}
      >
        <div className="stories-item-main">
          <span className={`story-style-chip story-style-${story.style ?? "story"}`}>
            {styleMeta(story.style).icon} {styleMeta(story.style).label}
          </span>
          <span className="stories-item-title">{story.title ?? story.topic}</span>
          <span className="stories-item-topic">{story.topic}</span>
          {story.status === "failed" && story.error && (
            <span className="stories-item-errmsg">{story.error}</span>
          )}
        </div>
        <div className="stories-item-right">
          <div className="stories-item-meta">
            <span className={`stories-badge stories-badge-${story.status}`}>{story.status}</span>
            <span className="stories-item-date">{formatDate(story.created_at)}</span>
          </div>
          <button
            type="button"
            className="story-delete-btn"
            onClick={(e) => {
              e.stopPropagation();
              del();
            }}
            disabled={deleting}
            aria-label={`Delete ${story.title ?? story.topic}`}
          >
            <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor" aria-hidden>
              <path d="M9 3h6l1 2h4v2H4V5h4l1-2zm-3 6h12l-1 12H7L6 9zm3 2v8h2v-8H9zm4 0v8h2v-8h-2z" />
            </svg>
          </button>
        </div>
      </div>
    </li>
  );
}
