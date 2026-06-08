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

// Output formats. Single-voice stories use MP3 (small, single clip plays fine).
// Multi-voice podcasts use PCM so we can stitch clips into ONE valid WAV file:
// concatenated MP3s confuse browsers (esp. iOS Safari) into reading only the
// first clip's duration, which freezes currentTime — and the highlight with it.
const MP3_FORMAT = "mp3_44100_128";
const PCM_FORMAT = "pcm_24000";
const PCM_SAMPLE_RATE = 24000;

// Free-tier ElevenLabs allows a maximum of 2 concurrent requests; stay under it.
const MAX_CONCURRENCY = 2;

export type TtsResult = {
  /** Encoded audio bytes, ready to upload to object storage. */
  audio: Buffer;
  /** MIME type of `audio` (audio/mpeg or audio/wav). */
  contentType: string;
  /** The text rebuilt from the alignment characters (what to display). */
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

type RawTts = { audio: Buffer; text: string; tokens: Token[] };

/** One TTS call with a specific voice + output format + language → raw bytes + tokens. */
async function ttsRequest(
  text: string,
  voiceId: string,
  outputFormat: string,
  lang: string = "id",
): Promise<RawTts> {
  const apiKey = process.env.ELEVENLABS_API_KEY;
  if (!apiKey) throw new Error("ELEVENLABS_API_KEY is not set");
  if (!voiceId) throw new Error("ElevenLabs voice id is missing");

  const url = `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}/with-timestamps?output_format=${outputFormat}`;

  // Retry on 429 (e.g. a brief concurrency collision) with exponential backoff.
  let res!: Response;
  for (let attempt = 0; attempt < 5; attempt++) {
    res = await fetch(url, {
      method: "POST",
      headers: {
        "xi-api-key": apiKey,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        text,
        model_id: TTS_MODEL,
        language_code: lang,
        voice_settings: { speed: TTS_SPEED },
      }),
    });
    if (res.status !== 429) break;
    await new Promise((r) => setTimeout(r, 600 * 2 ** attempt)); // 0.6s,1.2s,2.4s,4.8s
  }

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

/** Wrap raw 16-bit mono little-endian PCM in a minimal WAV container. */
function pcmToWav(pcm: Buffer, sampleRate: number): Buffer {
  const channels = 1;
  const bitsPerSample = 16;
  const byteRate = (sampleRate * channels * bitsPerSample) / 8;
  const blockAlign = (channels * bitsPerSample) / 8;
  const header = Buffer.alloc(44);
  header.write("RIFF", 0);
  header.writeUInt32LE(36 + pcm.length, 4);
  header.write("WAVE", 8);
  header.write("fmt ", 12);
  header.writeUInt32LE(16, 16); // PCM fmt chunk size
  header.writeUInt16LE(1, 20); // audio format = PCM
  header.writeUInt16LE(channels, 22);
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(byteRate, 28);
  header.writeUInt16LE(blockAlign, 32);
  header.writeUInt16LE(bitsPerSample, 34);
  header.write("data", 36);
  header.writeUInt32LE(pcm.length, 40);
  return Buffer.concat([header, pcm]);
}

/**
 * Synthesize `text` with the configured single voice (MP3). Text and tokens come
 * from the SAME character array, so the rendered story and the highlight match.
 */
export async function synthesizeWithTimestamps(text: string): Promise<TtsResult> {
  const voiceId = process.env.ELEVENLABS_VOICE_ID;
  if (!voiceId) throw new Error("ELEVENLABS_VOICE_ID is not set");
  const r = await ttsRequest(text, voiceId, MP3_FORMAT);
  return { audio: r.audio, contentType: "audio/mpeg", text: r.text, tokens: r.tokens };
}

/**
 * Multi-voice dialogue → ONE WAV file. Each turn is synthesized as raw PCM with
 * its own voice; clips are concatenated and wrapped in a single WAV header so
 * the browser sees the true total duration (the thing that breaks with stitched
 * MP3). Each turn's timings are offset by the EXACT prior PCM duration, so word
 * tokens stay perfectly aligned across speakers with no drift.
 */
async function dialogueAsWav(turns: { text: string; voiceId: string }[]): Promise<TtsResult> {
  const pcmParts: Buffer[] = [];
  const textParts: string[] = [];
  const tokens: Token[] = [];
  let offset = 0;
  const bytesPerSecond = PCM_SAMPLE_RATE * 2; // 16-bit mono

  for (const turn of turns) {
    const r = await ttsRequest(turn.text, turn.voiceId, PCM_FORMAT);
    pcmParts.push(r.audio);
    textParts.push(r.text);
    for (const t of r.tokens) {
      tokens.push({ text: t.text, start: t.start + offset, end: t.end + offset });
    }
    offset += r.audio.length / bytesPerSecond; // exact clip duration in seconds
  }

  const wav = pcmToWav(Buffer.concat(pcmParts), PCM_SAMPLE_RATE);
  return { audio: wav, contentType: "audio/wav", text: textParts.join("\n\n"), tokens };
}

export type SentencesTtsResult = TtsResult & {
  /** Audio time range [start, end] of the spoken English for each sentence. */
  engRanges: { start: number; end: number }[];
};

/**
 * Synthesize a list of {indo, eng} sentence pairs into ONE continuous track,
 * with BOTH languages spoken by ElevenLabs. Per sentence the track contains the
 * English clip followed by the Indonesian clip (each once): [en0, id0, en1, id1,
 * …]. We return:
 *   - `tokens`: word timings for the INDONESIAN words only (so the existing
 *     1:1 display↔highlight mapping holds — English isn't highlighted);
 *   - `engRanges`: the audio [start,end] of each sentence's English clip, so the
 *     player can replay just that slice.
 * The player's sequencer then plays en→id→en→id per sentence by seeking these
 * ranges — no second audio source, no browser speech. Falls back to MP3.
 */
export async function synthesizeSentencesWithEnglish(
  pairs: { indo: string; eng: string }[],
): Promise<SentencesTtsResult> {
  const idVoice = process.env.ELEVENLABS_VOICE_ID;
  const enVoice = process.env.ELEVENLABS_VOICE_ID_EN ?? idVoice;
  if (!idVoice) throw new Error("ELEVENLABS_VOICE_ID is not set");
  if (!pairs.length) throw new Error("No sentences to synthesize");

  // Playback-order task list: english then indonesian for each sentence.
  type Task = { role: "eng" | "indo"; sentence: number; text: string; voice: string; lang: string };
  const tasks: Task[] = [];
  pairs.forEach((p, i) => {
    tasks.push({ role: "eng", sentence: i, text: p.eng, voice: enVoice!, lang: "en" });
    tasks.push({ role: "indo", sentence: i, text: p.indo, voice: idVoice, lang: "id" });
  });

  let usePcm = true;
  const run = async (format: string) => {
    const results: RawTts[] = new Array(tasks.length);
    let cursor = 0;
    const worker = async () => {
      for (;;) {
        const i = cursor++;
        if (i >= tasks.length) return;
        results[i] = await ttsRequest(tasks[i].text, tasks[i].voice, format, tasks[i].lang);
      }
    };
    await Promise.all(Array.from({ length: Math.min(MAX_CONCURRENCY, tasks.length) }, worker));
    return results;
  };

  let results: RawTts[];
  try {
    results = await run(PCM_FORMAT);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "";
    if (/\b(400|401|403)\b/.test(msg) || /format|tier|plan|subscription/i.test(msg)) {
      console.warn("ElevenLabs PCM unavailable for sentences, falling back to MP3:", msg);
      usePcm = false;
      results = await run(MP3_FORMAT);
    } else {
      throw err;
    }
  }

  const parts: Buffer[] = [];
  const indoTextParts: string[] = [];
  const tokens: Token[] = [];
  const engRanges: { start: number; end: number }[] = new Array(pairs.length);
  let offset = 0;
  const bytesPerSecond = PCM_SAMPLE_RATE * 2;

  for (let i = 0; i < tasks.length; i++) {
    const t = tasks[i];
    const r = results[i];
    parts.push(r.audio);
    const dur = usePcm
      ? r.audio.length / bytesPerSecond
      : r.tokens.length
        ? r.tokens[r.tokens.length - 1].end
        : 0;
    if (t.role === "eng") {
      engRanges[t.sentence] = { start: offset, end: offset + dur };
    } else {
      indoTextParts.push(r.text);
      for (const tok of r.tokens) {
        tokens.push({ text: tok.text, start: tok.start + offset, end: tok.end + offset });
      }
    }
    offset += dur;
  }

  const text = indoTextParts.join("\n\n");
  if (usePcm) {
    const wav = pcmToWav(Buffer.concat(parts), PCM_SAMPLE_RATE);
    return { audio: wav, contentType: "audio/wav", text, tokens, engRanges };
  }
  return { audio: Buffer.concat(parts), contentType: "audio/mpeg", text, tokens, engRanges };
}

/** Fallback: stitch MP3 clips (used only if PCM output isn't available). */
async function dialogueAsMp3(turns: { text: string; voiceId: string }[]): Promise<TtsResult> {
  const audioParts: Buffer[] = [];
  const textParts: string[] = [];
  const tokens: Token[] = [];
  let offset = 0;
  for (const turn of turns) {
    const r = await ttsRequest(turn.text, turn.voiceId, MP3_FORMAT);
    audioParts.push(r.audio);
    textParts.push(r.text);
    for (const t of r.tokens) {
      tokens.push({ text: t.text, start: t.start + offset, end: t.end + offset });
    }
    offset += r.tokens.length ? r.tokens[r.tokens.length - 1].end : 0;
  }
  return {
    audio: Buffer.concat(audioParts),
    contentType: "audio/mpeg",
    text: textParts.join("\n\n"),
    tokens,
  };
}

/**
 * Synthesize a multi-voice dialogue. Prefers the WAV path (correct duration on
 * every browser); if PCM output is rejected (some plans gate it), falls back to
 * MP3 stitching so generation still succeeds.
 */
export async function synthesizeDialogue(
  turns: { text: string; voiceId: string }[],
): Promise<TtsResult> {
  try {
    return await dialogueAsWav(turns);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "";
    const looksLikeFormatGate = /\b(400|401|403)\b/.test(msg) || /format|tier|plan|subscription/i.test(msg);
    if (looksLikeFormatGate) {
      console.warn("ElevenLabs PCM unavailable, falling back to MP3 stitching:", msg);
      return await dialogueAsMp3(turns);
    }
    throw err;
  }
}
