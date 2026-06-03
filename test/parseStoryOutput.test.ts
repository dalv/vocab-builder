import { test } from "node:test";
import assert from "node:assert/strict";
import { parseStoryOutput } from "../app/lib/stories/parse.ts";

const sample = `@@TITLE@@
Surf Day
@@STORY@@
Aku ke pantai. "Ombaknya bagus!" kata dia.
Terus kita pulang.
@@TRANSLATION@@
I went to the beach. "The waves are great!" she said.
Then we went home.`;

test("parses all three marker-delimited sections", () => {
  const out = parseStoryOutput(sample);
  assert.equal(out.title, "Surf Day");
  assert.equal(out.story, 'Aku ke pantai. "Ombaknya bagus!" kata dia.\nTerus kita pulang.');
  assert.ok(out.translation_en.startsWith("I went to the beach."));
});

test("story may contain unescaped quotes and newlines (the whole point)", () => {
  const out = parseStoryOutput(sample);
  assert.ok(out.story.includes('"Ombaknya bagus!"'));
  assert.ok(out.story.includes("\n"));
});

test("strips stray code fences", () => {
  const raw = "```\n@@TITLE@@\nT\n@@STORY@@\nCerita.\n@@TRANSLATION@@\nStory.\n```";
  assert.equal(parseStoryOutput(raw).story, "Cerita.");
});

test("defaults title when the section is empty", () => {
  const raw = "@@TITLE@@\n@@STORY@@\nCuma cerita.\n@@TRANSLATION@@\nJust a story.";
  assert.equal(parseStoryOutput(raw).title, "Untitled");
});

test("throws when the story section is missing", () => {
  assert.throws(() => parseStoryOutput("@@TITLE@@\nT"));
});
