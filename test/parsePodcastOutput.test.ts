import { test } from "node:test";
import assert from "node:assert/strict";
import { parsePodcastOutput } from "../app/lib/stories/parse.ts";

const sample = `@@TITLE@@
Coffee Chat
@@DIALOGUE@@
F ||| Sari ||| Eh, kamu udah denger soal aturan baru? ||| Hey, have you heard about the new rules?
M ||| Budi ||| Belum sih, emang ada apa? ||| Not yet, what's going on?`;

test("parses title and turns with gender, speaker, id, en", () => {
  const out = parsePodcastOutput(sample);
  assert.equal(out.title, "Coffee Chat");
  assert.equal(out.turns.length, 2);
  assert.deepEqual(out.turns[0], {
    gender: "F",
    speaker: "Sari",
    text: "Eh, kamu udah denger soal aturan baru?",
    en: "Hey, have you heard about the new rules?",
  });
  assert.equal(out.turns[1].gender, "M");
  assert.equal(out.turns[1].speaker, "Budi");
});

test("alternating speakers preserved in order", () => {
  const out = parsePodcastOutput(sample);
  assert.deepEqual(out.turns.map((t) => t.gender), ["F", "M"]);
});

test("skips malformed lines, keeps valid ones", () => {
  const raw = `@@TITLE@@\nT\n@@DIALOGUE@@\nF ||| Sari ||| Halo. ||| Hi.\ngarbage line with no pipes\nM ||| Budi ||| Apa kabar? ||| How are you?`;
  const out = parsePodcastOutput(raw);
  assert.equal(out.turns.length, 2);
});

test("throws when no valid turns", () => {
  assert.throws(() => parsePodcastOutput("@@TITLE@@\nT\n@@DIALOGUE@@\njust prose"));
});
