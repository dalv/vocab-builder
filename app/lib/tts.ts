import type { Lang } from "./cards";

const LANG_CODE: Record<Lang, string> = {
  indonesian: "id-ID",
  mandarin: "zh-CN",
};

let voicesPromise: Promise<SpeechSynthesisVoice[]> | null = null;

function loadVoices(): Promise<SpeechSynthesisVoice[]> {
  if (voicesPromise) return voicesPromise;
  voicesPromise = new Promise((resolve) => {
    const v = window.speechSynthesis.getVoices();
    if (v.length > 0) {
      resolve(v);
      return;
    }
    const handler = () => {
      window.speechSynthesis.removeEventListener("voiceschanged", handler);
      resolve(window.speechSynthesis.getVoices());
    };
    window.speechSynthesis.addEventListener("voiceschanged", handler);
  });
  return voicesPromise;
}

/**
 * Speak `text` in the given language using the Web Speech API.
 * Handles the cold-start race where `getVoices()` is empty until the
 * `voiceschanged` event fires.
 */
export async function speak(text: string, lang: Lang | string) {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) return;

  window.speechSynthesis.cancel();

  const voices = await loadVoices();
  const code =
    lang in LANG_CODE ? LANG_CODE[lang as Lang] : lang === "mandarin" ? "zh-CN" : "id-ID";

  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = code;
  utterance.rate = 0.85;

  const match = voices.find((v) => v.lang.startsWith(code.split("-")[0]));
  if (match) utterance.voice = match;

  window.speechSynthesis.speak(utterance);
}
