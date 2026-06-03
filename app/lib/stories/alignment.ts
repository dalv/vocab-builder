/**
 * ElevenLabs `/with-timestamps` returns CHARACTER-level alignment, not word
 * level. This module aggregates those per-character timings into word tokens
 * and, crucially, reconstructs the displayed text from the SAME character array
 * — so what the player renders and what it highlights are identical by
 * construction.
 */

export type CharAlignment = {
  characters: string[];
  character_start_times_seconds: number[];
  character_end_times_seconds: number[];
};

export type Token = {
  text: string; // the word incl. attached punctuation, e.g. "Bali."
  start: number; // seconds — start time of the token's first character
  end: number; // seconds — end time of the token's last character
};

export type AlignmentResult = {
  /** The full story text, rebuilt from `characters.join("")`. */
  text: string;
  /** Whitespace-delimited word tokens with timings, in order. */
  tokens: Token[];
};

function isWhitespace(ch: string): boolean {
  // A single character: spaces, tabs, and newlines all break tokens.
  return ch === " " || ch === "\t" || ch === "\n" || ch === "\r";
}

/**
 * Walk the character array, accumulating runs of non-whitespace characters into
 * tokens. A token's `start` is its first char's start time and its `end` is its
 * last char's end time. Tokens flush on whitespace and at the very end.
 * Splitting on whitespace only means punctuation stays attached to its word.
 */
export function buildTokens(alignment: CharAlignment): AlignmentResult {
  const { characters, character_start_times_seconds, character_end_times_seconds } =
    alignment;

  const tokens: Token[] = [];
  let curText = "";
  let curStart = 0;
  let curEnd = 0;
  let inToken = false;

  const flush = () => {
    if (inToken && curText.length > 0) {
      tokens.push({ text: curText, start: curStart, end: curEnd });
    }
    curText = "";
    inToken = false;
  };

  for (let i = 0; i < characters.length; i++) {
    const ch = characters[i];
    if (isWhitespace(ch)) {
      flush();
      continue;
    }
    const start = character_start_times_seconds[i];
    const end = character_end_times_seconds[i];
    if (!inToken) {
      inToken = true;
      curStart = start;
      curText = ch;
      curEnd = end;
    } else {
      curText += ch;
      curEnd = end;
    }
  }
  flush();

  return { text: characters.join(""), tokens };
}
