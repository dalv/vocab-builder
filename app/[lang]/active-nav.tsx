"use client";

import { useEffect, useState, useCallback, useRef } from "react";

const SECTIONS = [
  { id: "verbs", label: "Verbs" },
  { id: "adjectives", label: "Adjective Pairs" },
  { id: "connectors", label: "Connectors" },
  { id: "questions", label: "Question Words" },
  { id: "prepositions", label: "Prepositions" },
  { id: "adverbs", label: "Adverbs" },
  { id: "particles", label: "Particles" },
  { id: "nouns", label: "Nouns" },
  { id: "transactions", label: "Transactions" },
  { id: "negation", label: "Negation" },
  { id: "affixes", label: "Affixes" },
  { id: "fillers", label: "Fillers" },
  { id: "health", label: "Health" },
];

export default function ActiveNav() {
  const [visibleId, setVisibleId] = useState<string | null>(null);
  const [showHome, setShowHome] = useState(false);

  // Track which section is in view (always, regardless of sticky state)
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);

        if (visible.length > 0) {
          setVisibleId(visible[0].target.id);
        }
      },
      { rootMargin: "-60px 0px -70% 0px" }
    );

    SECTIONS.forEach(({ id }) => {
      const el = document.getElementById(id);
      if (el) observer.observe(el);
    });

    return () => observer.disconnect();
  }, []);

  // Track scroll position to show/hide home button
  useEffect(() => {
    const nav = document.querySelector(".nav");
    if (!nav) return;

    const check = () => {
      const navRect = nav.getBoundingClientRect();
      setShowHome(navRect.top <= 0);
    };

    check();
    window.addEventListener("scroll", check, { passive: true });
    return () => window.removeEventListener("scroll", check);
  }, []);

  // Only show active highlight when nav is sticky
  const activeId = showHome ? visibleId : null;

  const scrollToTop = useCallback(() => {
    window.scrollTo({ top: 0, behavior: "smooth" });
  }, []);

  return (
    <nav className="nav">
      <button
        className={`nav-home${showHome ? " nav-home-visible" : ""}`}
        onClick={scrollToTop}
        aria-label="Scroll to top"
      >
        <svg viewBox="0 0 20 20" fill="currentColor" width="14" height="14">
          <path d="M10 3.5l-7 6V17a1 1 0 001 1h4v-5h4v5h4a1 1 0 001-1v-7.5l-7-6z" />
        </svg>
      </button>
      {SECTIONS.map((s) => (
        <a
          key={s.id}
          href={`#${s.id}`}
          className={activeId === s.id ? "active" : ""}
        >
          {s.label}
        </a>
      ))}
    </nav>
  );
}
