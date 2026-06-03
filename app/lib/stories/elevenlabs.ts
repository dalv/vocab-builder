import { buildTokens, type Token } from "./alignment";

/**
 * ElevenLabs multilingual model that supports Indonesian and the
 * with-timestamps endpoint.
 */
export const TTS_MODEL = "eleven_multilingual_v2";

/**
 * Narration speed, applied at GENERATION time via voice_settings (the model
 * actually speaks slower — not time-stretched, so no quality loss). Valid
 * range is 0.7–1.2; 1.0 is normal. Lowered for an intermediate learner.
 */
export const TTS_SPEED = 0.75;

export type TtsResult = {
  /** Decoded MP3 audio, ready to upload to object storage. */
  audio: Buffer;
  /** The story text rebuilt from the alignment characters (what to display). */
  text: string;
  /** Word tokens with start/end times for highlighting. */
  tokens: Token[];
};

type WithTimestampsResponse = {
  audio_base64: string;
  alignment: {
    characters: string[];
    character_start_times_seconds: number[];
    character_end_times_seconds: number[];
  };
  normalized_alignment?: unknown;
};

/** One TTS call with a specific voice → audio + reconstructed text + tokens. */
async function ttsOne(text: string, voiceId: string): Promise<TtsResult> {
  const apiKey = process.env.ELEVENLABS_API_KEY;
  if (!apiKey) throw new Error("ELEVENLABS_API_KEY is not set");
  if (!voiceId) throw new Error("ElevenLabs voice id is missing");

  const url = `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}/with-timestamps`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "xi-api-key": apiKey,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      text,
      model_id: TTS_MODEL,
      language_code: "id",
      voice_settings: { speed: TTS_SPEED },
    }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`ElevenLabs API ${res.status}: ${body.slice(0, 500)}`);
  }

  const data = (await res.json()) as WithTimestampsResponse;
  if (!data.audio_base64 || !data.alignment) {
    throw new Error("ElevenLabs response missing audio or alignment");
  }

  const { text: reconstructed, tokens } = buildTokens(data.alignment);
  return { audio: Buffer.from(data.audio_base64, "base64"), text: reconstructed, tokens };
}

/**
 * Synthesize `text` with the configured single voice, with character-level
 * timestamps aggregated to word tokens. Text and tokens come from the SAME
 * character array, so the rendered story and the highlight spans match.
 */
export async function synthesizeWithTimestamps(text: string): Promise<TtsResult> {
  const voiceId = process.env.ELEVENLABS_VOICE_ID;
  if (!voiceId) throw new Error("ELEVENLABS_VOICE_ID is not set");
  return ttsOne(text, voiceId);
}

/**
 * Synthesize a multi-voice dialogue: each turn is spoken by its own voice, then
 * the audio is concatenated and the per-turn timings are offset by the running
 * duration so the word tokens are continuous across the whole conversation.
 * (mp3 frames concatenate fine for sequential playback; any frame-padding drift
 * over a short dialogue is well within word-highlight tolerance.) Turns are
 * joined by a blank line so each becomes its own paragraph in the player.
 */
export async function synthesizeDialogue(
  turns: { text: string; voiceId: string }[],
): Promise<TtsResult> {
  const audioParts: Buffer[] = [];
  const textParts: string[] = [];
  const tokens: Token[] = [];
  let offset = 0;

  for (const turn of turns) {
    const r = await ttsOne(turn.text, turn.voiceId);
    audioParts.push(r.audio);
    textParts.push(r.text);
    for (const t of r.tokens) {
      tokens.push({ text: t.text, start: t.start + offset, end: t.end + offset });
    }
    offset += r.tokens.length ? r.tokens[r.tokens.length - 1].end : 0;
  }

  return { audio: Buffer.concat(audioParts), text: textParts.join("\n\n"), tokens };
}
