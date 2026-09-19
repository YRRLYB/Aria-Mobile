export type PlaybackQuality = {
  bitrate: number | null;
  sampleRate: number | null;
  audioFormat: string | null;
};

export function positiveAudioValue(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : null;
}

export function formatPlaybackQuality(quality: PlaybackQuality | null): string {
  if (!quality) return "实际音质：等待音频加载";
  const format = quality.audioFormat?.toLowerCase();
  const names: Record<string, string> = {
    "audio/mpeg": "MP3", "audio/mp4a-latm": "AAC", "audio/flac": "FLAC",
    "audio/alac": "ALAC", "audio/raw": "PCM", "audio/opus": "Opus", "audio/vorbis": "Vorbis",
  };
  const codec = format ? names[format] ?? format.replace(/^audio\//, "").toUpperCase() : "格式未知";
  const bitrate = positiveAudioValue(quality.bitrate);
  const rate = positiveAudioValue(quality.sampleRate);
  return `实际 ${codec} · ${bitrate ? `${Math.round(bitrate / 1000)} kbps` : "码率未知"} · ${rate ? `${Number((rate / 1000).toFixed(3))} kHz` : "采样率未知"}`;
}
