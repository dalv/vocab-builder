import { test } from "node:test";
import assert from "node:assert/strict";
import { parseSentencesOutput } from "../app/lib/stories/parse.ts";

const sample = `@@SENTENCES@@
Aku mau sewa motor. ||| I want to rent a motorbike.
Kamu bisa naik motor? ||| Can you ride a motorbike?
Bensinnya habis nih. ||| I'm out of gas.`;

test("parses indo ||| eng lines after the marker", () => {
  const out = parseSentencesOutput(sample);
  assert.equal(out.length, 3);
  assert.deepEqual(out[0], { indo: "Aku mau sewa motor.", eng: "I want to rent a motorbike." });
  assert.equal(out[2].indo, "Bensinnya habis nih.");
});

test("tolerates a missing marker", () => {
  const out = parseSentencesOutput("Halo. ||| Hi.\nApa kabar? ||| How are you?");
  assert.equal(out.length, 2);
});

test("strips leading numbering / bullets", () => {
  const out = parseSentencesOutput("@@SENTENCES@@\n1. Aku lapar. ||| I'm hungry.\n- Aku haus. ||| I'm thirsty.");
  assert.equal(out[0].indo, "Aku lapar.");
  assert.equal(out[1].indo, "Aku haus.");
});

test("skips malformed lines without a separator", () => {
  const out = parseSentencesOutput("@@SENTENCES@@\nGaris tanpa pipa\nAku di sini. ||| I'm here.");
  assert.equal(out.length, 1);
});

test("throws when nothing parses", () => {
  assert.throws(() => parseSentencesOutput("@@SENTENCES@@\njust prose, no pipes"));
});
