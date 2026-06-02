import { test } from "node:test";
import assert from "node:assert/strict";
import { buildTokens, type CharAlignment } from "../app/lib/stories/alignment.ts";

/** Build a fake character alignment where each char takes 0.1s, in order. */
function fakeAlignment(s: string): CharAlignment {
  const characters = [...s];
  const character_start_times_seconds = characters.map((_, i) => i * 0.1);
  const character_end_times_seconds = characters.map((_, i) => i * 0.1 + 0.1);
  return { characters, character_start_times_seconds, character_end_times_seconds };
}

test("splits on whitespace, keeps punctuation attached to the word", () => {
  const { tokens } = buildTokens(fakeAlignment("Aku suka Bali."));
  assert.deepEqual(
    tokens.map((t) => t.text),
    ["Aku", "suka", "Bali."],
  );
});

test("token start = first char start, end = last char end", () => {
  const { tokens } = buildTokens(fakeAlignment("Aku suka"));
  // "Aku" = chars 0,1,2 → start 0.0, end 0.3
  assert.equal(tokens[0].text, "Aku");
  assert.ok(Math.abs(tokens[0].start - 0.0) < 1e-9);
  assert.ok(Math.abs(tokens[0].end - 0.3) < 1e-9);
  // "suka" = chars 4,5,6,7 → start 0.4, end 0.8
  assert.equal(tokens[1].text, "suka");
  assert.ok(Math.abs(tokens[1].start - 0.4) < 1e-9);
  assert.ok(Math.abs(tokens[1].end - 0.8) < 1e-9);
});

test("handles newlines and multiple/trailing spaces without empty tokens", () => {
  const { tokens, text } = buildTokens(fakeAlignment("Hai!\nApa  kabar? "));
  assert.deepEqual(
    tokens.map((t) => t.text),
    ["Hai!", "Apa", "kabar?"],
  );
  // text is reconstructed verbatim from the characters, newline and all.
  assert.equal(text, "Hai!\nApa  kabar? ");
});

test("rendered text and tokens come from the same character array", () => {
  const story = "Dia beliin aku kopi, terus kita ngobrol.";
  const { text, tokens } = buildTokens(fakeAlignment(story));
  assert.equal(text, story);
  // Concatenating token texts with single spaces won't equal text (collapsed
  // whitespace), but every token must be a substring of the rendered text.
  for (const t of tokens) assert.ok(text.includes(t.text), `${t.text} not in text`);
});

test("empty input yields no tokens", () => {
  const { tokens, text } = buildTokens(fakeAlignment(""));
  assert.equal(tokens.length, 0);
  assert.equal(text, "");
});
