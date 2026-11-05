import type { LyricLine, LyricWord } from "@/data/music";

function preciseClock(seconds: number): string {
  const safe = Math.max(0, seconds);
  const minutes = Math.floor(safe / 60);
  const rest = safe - minutes * 60;
  return `${String(minutes).padStart(2, "0")}:${rest.toFixed(3).padStart(6, "0")}`;
}

export function parseLrc(source: string | undefined): LyricLine[] {
  if (!source) return [];
  const lines: LyricLine[] = [];
  for (const raw of source.split("\n")) {
    const match = raw.match(/^\s*\[(\d{2}):(\d{2})(?:\.(\d{1,3}))?\](.*)$/);
    if (!match) continue;
    const text = match[4].trim();
    if (!text) continue;
    lines.push({ time: `${match[1]}:${match[2]}`, text });
  }
  return lines;
}

/**
 * NetEase YRC (word-by-word) format:
 *   [lineStartMs,lineDurationMs,0](wordStartMs,wordDurationMs,0)word...
 * Timestamps are converted to seconds for playback-clock comparisons.
 */
export function parseYrc(source: string | undefined): LyricLine[] {
  if (!source) return [];
  const lines: LyricLine[] = [];
  for (const raw of source.split("\n")) {
    const line = raw.trim();
    if (!line) continue;
    const prefix = line.match(/^\[(\d+),(\d+)(?:,-?\d+)?\]/);
    if (!prefix) continue;
    const lineStartMs = Number(prefix[1]);
    const body = line.slice(prefix[0].length);
    const words: LyricWord[] = [];
    const wordPattern = /\((\d+),(\d+),-?\d+\)([^()]*)/g;
    let match: RegExpExecArray | null;
    while ((match = wordPattern.exec(body)) !== null) {
      const text = match[3];
      if (!text) continue;
      words.push({
        start: Number(match[1]) / 1000,
        duration: Number(match[2]) / 1000,
        text,
      });
    }
    const text = words.map((word) => word.text).join("").trim();
    if (!text) continue;
    lines.push({
      time: preciseClock(lineStartMs / 1000),
      text,
      // Keep the source chunk text (including spaces) so English lyrics keep
      // their word spacing while Chinese chunks still concatenate naturally.
      words: words.filter((word) => word.text.trim()),
    });
  }
  return lines.sort((left, right) => left.time.localeCompare(right.time));
}

export function withTranslations(lines: LyricLine[], translationSource: string | undefined): LyricLine[] {
  const translations = parseLrc(translationSource);
  if (!translations.length) return lines;
  // YRC and translated LRC normally have identical line counts; matching by
  // index is more accurate than matching the minute/second string when two
  // lines share a timestamp.
  if (translations.length === lines.length) {
    return lines.map((line, index) => ({ ...line, translation: translations[index].text }));
  }
  const byTime = new Map(translations.map((line) => [line.time, line.text]));
  return lines.map((line) => {
    const translation = byTime.get(line.time);
    return translation ? { ...line, translation } : line;
  });
}

export function activeWordRange(line: LyricLine | undefined, currentTime: number): { start: number; end: number } {
  if (!line?.words?.length) return { start: -1, end: -1 };
  for (let index = 0; index < line.words.length; index += 1) {
    const word = line.words[index];
    const next = line.words[index + 1];
    const end = next?.start ?? word.start + Math.max(word.duration, 0.05);
    if (currentTime >= word.start && currentTime < end) return { start: word.start, end };
  }
  return { start: -1, end: -1 };
}
