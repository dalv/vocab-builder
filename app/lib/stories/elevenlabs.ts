import { buildTokens, type Token } from "./alignment";

/**
 * ElevenLabs multilingual model that supports Indonesian and the
 * with-timestamps endpoint.
 */
export const TTS_MODEL = "eleven_multilingual_v2";

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

/**
 * Synthesize `text` to speech with character-level timestamps, then aggregate
 * those into word tokens. Returns the audio plus the reconstructed text and
 * tokens (both derived from the SAME character array, so the rendered story and
 * the highlight spans are identical by construction).
 */
export async function synthesizeWithTimestamps(text: string): Promise<TtsResult> {
  const apiKey = process.env.ELEVENLABS_API_KEY;
  const voiceId = process.env.ELEVENLABS_VOICE_ID;
  if (!apiKey) throw new Error("ELEVENLABS_API_KEY is not set");
  if (!voiceId) throw new Error("ELEVENLABS_VOICE_ID is not set");

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

  return {
    audio: Buffer.from(data.audio_base64, "base64"),
    text: reconstructed,
    tokens,
  };
}
