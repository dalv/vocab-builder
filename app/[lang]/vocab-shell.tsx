"use client";

import { useState, useRef, useEffect, useCallback } from "react";

export default function VocabShell({
  lang,
  children,
}: {
  lang: string;
  children: React.ReactNode;
}) {
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const containerRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(null);

  // Debounce search input
  const handleInput = useCallback((value: string) => {
    setQuery(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      setDebouncedQuery(value);
    }, 250);
  }, []);

  // Filter cards based on debounced query
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const term = stripDiacritics(debouncedQuery.trim().toLowerCase());
    const cards = container.querySelectorAll<HTMLElement>(
      ".word-card, .pair-card"
    );
    const subsections = container.querySelectorAll<HTMLElement>(".subsection");
    const sections = container.querySelectorAll<HTMLElement>(".section");

    // Clear previous highlights
    clearHighlights(container);

    if (!term) {
      // Show everything
      cards.forEach((c) => (c.style.display = ""));
      subsections.forEach((s) => (s.style.display = ""));
      sections.forEach((s) => {
        s.style.display = "";
        const note = s.querySelector<HTMLElement>(".section-note");
        if (note) note.style.display = "";
        const header = s.querySelector<HTMLElement>(".section-header");
        if (header) header.style.display = "";
      });
      return;
    }

    // Hide/show cards
    cards.forEach((card) => {
      const text = stripDiacritics(card.textContent?.toLowerCase() ?? "");
      card.style.display = text.includes(term) ? "" : "none";
    });

    // Highlight matches in visible cards
    cards.forEach((card) => {
      if (card.style.display === "none") return;
      highlightText(card, term);
    });

    // Hide subsections with no visible cards
    subsections.forEach((sub) => {
      // Collect cards between this subsection header and the next one (or section end)
      const visibleCards: HTMLElement[] = [];
      let sibling = sub.nextElementSibling;
      while (sibling && !sibling.classList.contains("subsection")) {
        if (
          (sibling.classList.contains("word-card") ||
            sibling.classList.contains("pair-card")) &&
          (sibling as HTMLElement).style.display !== "none"
        ) {
          visibleCards.push(sibling as HTMLElement);
        }
        sibling = sibling.nextElementSibling;
      }
      sub.style.display = visibleCards.length > 0 ? "" : "none";
    });

    // Hide sections with no visible cards
    sections.forEach((section) => {
      const hasVisible = Array.from(
        section.querySelectorAll<HTMLElement>(".word-card, .pair-card")
      ).some((c) => c.style.display !== "none");

      const header = section.querySelector<HTMLElement>(".section-header");
      const note = section.querySelector<HTMLElement>(".section-note");

      if (!hasVisible) {
        section.style.display = "none";
      } else {
        section.style.display = "";
        if (header) header.style.display = "";
        if (note) note.style.display = "";
      }
    });
  }, [debouncedQuery]);

  // Inject play buttons into example divs
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const examples = container.querySelectorAll(".example");
    examples.forEach((example) => {
      if (example.querySelector(".play-btn")) return; // already has one

      const exText =
        example.querySelector(".ex-indo")?.textContent ??
        example.querySelector(".ex-zh")?.textContent;
      if (!exText) return;

      const btn = document.createElement("button");
      btn.className = "play-btn";
      btn.type = "button";
      btn.setAttribute("aria-label", "Play example sentence");
      btn.textContent = "\u25B6"; // ▶
      btn.addEventListener("click", () => speak(exText, lang));
      example.appendChild(btn);
    });
  }, [lang]);

  return (
    <>
      <div className="search-bar">
        <div className="search-inner">
          <svg
            className="search-icon"
            viewBox="0 0 20 20"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <circle cx="8.5" cy="8.5" r="5.5" />
            <line x1="12.5" y1="12.5" x2="17" y2="17" />
          </svg>
          <input
            type="text"
            placeholder="Search words, phrases, or examples..."
            value={query}
            onChange={(e) => handleInput(e.target.value)}
            className="search-input"
          />
          {query && (
            <button
              className="search-clear"
              onClick={() => {
                setQuery("");
                setDebouncedQuery("");
              }}
              aria-label="Clear search"
            >
              &times;
            </button>
          )}
        </div>
      </div>
      <div ref={containerRef}>{children}</div>
    </>
  );
}

function stripDiacritics(str: string): string {
  return str.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

function clearHighlights(root: HTMLElement) {
  root.querySelectorAll("mark.search-hl").forEach((mark) => {
    const parent = mark.parentNode;
    if (!parent) return;
    parent.replaceChild(document.createTextNode(mark.textContent ?? ""), mark);
    parent.normalize(); // merge adjacent text nodes
  });
}

function highlightText(root: HTMLElement, term: string) {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const matches: { node: Text; index: number }[] = [];

  while (walker.nextNode()) {
    const node = walker.currentNode as Text;
    // Skip text inside buttons (play btn)
    if (node.parentElement?.closest(".play-btn")) continue;
    const idx = node.textContent?.toLowerCase().indexOf(term) ?? -1;
    if (idx !== -1) matches.push({ node, index: idx });
  }

  // Process in reverse so earlier splits don't invalidate later indices
  for (let i = matches.length - 1; i >= 0; i--) {
    const { node, index } = matches[i];
    const text = node.textContent!;
    const before = text.slice(0, index);
    const match = text.slice(index, index + term.length);
    const after = text.slice(index + term.length);

    const mark = document.createElement("mark");
    mark.className = "search-hl";
    mark.textContent = match;

    const parent = node.parentNode!;
    if (after) parent.insertBefore(document.createTextNode(after), node.nextSibling);
    parent.insertBefore(mark, node.nextSibling);
    node.textContent = before;
  }
}

function speak(text: string, lang: string) {
  if (!("speechSynthesis" in window)) return;

  // Cancel any ongoing speech
  window.speechSynthesis.cancel();

  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = lang === "mandarin" ? "zh-CN" : "id-ID";
  utterance.rate = 0.85;

  // Try to find a matching voice
  const voices = window.speechSynthesis.getVoices();
  const match = voices.find((v) => v.lang.startsWith(utterance.lang.split("-")[0]));
  if (match) utterance.voice = match;

  window.speechSynthesis.speak(utterance);
}
