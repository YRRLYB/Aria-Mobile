import { useEffect, useEffectEvent, useRef, useState } from "react";
import type { Track } from "@/data/music";
import { api } from "@/lib/api";
import { writeCachedLyrics } from "@/lib/playerPresentation";
import { idleTrack } from "@/lib/trackMappers";

function hasSyncedLyrics(track: Track): boolean {
  return track.lyricStatus === "linked" && track.lyrics.some((line) => line.text.trim().length > 0);
}

// Owns lyric acquisition: binding-driven rebinds for local tracks, automatic
// sync (and bilingual translation refresh) for the active track.
export function useLyricsSync(options: {
  applyTrackUpdate: (trackId: string, updateTrack: (track: Track) => Track, updateOptions?: { includeHistory?: boolean }) => void;
  activeTrack: Track;
  localTracks: Track[];
}) {
  const { applyTrackUpdate } = options;
  const [lyricBindings, setLyricBindings] = useState<Record<string, string>>({});
  const lyricSyncingRef = useRef<Set<string>>(new Set());
  const lyricEnrichmentRefreshRef = useRef<Set<string>>(new Set());
  const lyricRetryCountRef = useRef<Map<string, number>>(new Map());
  const lyricRetryTimerRef = useRef<number | null>(null);
  const [lyricRetryTick, setLyricRetryTick] = useState(0);

  function applyLyricsToTrack(trackId: string, lyrics: Track["lyrics"]) {
    if (!lyrics.length) return;
    writeCachedLyrics(trackId, lyrics);
    applyTrackUpdate(trackId, (track) => (track.id === trackId ? { ...track, lyrics, lyricStatus: "linked" as const } : track), {
      includeHistory: true,
    });
  }

  async function syncLyricsForTrack(track: Track): Promise<boolean> {
    const providerId = track.providerId
      ?? (track.id.startsWith(`${track.source}:`) ? track.id.slice(track.source.length + 1) : undefined);
    if (track.source === "netease" && providerId) {
      const result = await api.getNeteaseLyrics(providerId);
      if (!result.lyrics.length) return false;
      applyLyricsToTrack(track.id, result.lyrics);
      return true;
    }

    if (track.source === "local") {
      const candidates = await api.searchLyrics({
        title: track.title,
        artist: track.artist,
        album: track.album,
      });
      const best = candidates.candidates[0];
      if (!best) return false;
      const result = await api.bindLyric(track.id, best.id);
      if (!result.lyrics.length) return false;
      applyLyricsToTrack(track.id, result.lyrics);
      return true;
    }
    return false;
  }

  useEffect(() => {
    const boundTracks = options.localTracks
      .filter((track) => lyricBindings[track.id] && !hasSyncedLyrics(track) && !lyricSyncingRef.current.has(track.id))
      .slice(0, 8);
    if (!boundTracks.length) return;

    boundTracks.forEach((track) => {
      lyricSyncingRef.current.add(track.id);
      api
        .bindLyric(track.id, lyricBindings[track.id])
        .then((result) => {
          applyLyricsToTrack(track.id, result.lyrics);
        })
        .catch(() => {
          // Keep using cached placeholder if rebinding fails.
        })
        .finally(() => {
          lyricSyncingRef.current.delete(track.id);
        });
    });
  }, [options.localTracks, lyricBindings]);

  function scheduleLyricRetry(trackId: string) {
    const attempt = lyricRetryCountRef.current.get(trackId) ?? 0;
    if (attempt >= 3) return;
    if (lyricRetryTimerRef.current !== null) {
      window.clearTimeout(lyricRetryTimerRef.current);
      lyricRetryTimerRef.current = null;
    }
    const delay = [1_200, 3_000, 7_000][attempt] ?? 7_000;
    lyricRetryTimerRef.current = window.setTimeout(() => {
      lyricRetryTimerRef.current = null;
      if (options.activeTrack.id !== trackId || hasSyncedLyrics(options.activeTrack)) return;
      lyricRetryCountRef.current.set(trackId, attempt + 1);
      setLyricRetryTick((value) => value + 1);
    }, delay);
  }

  useEffect(() => () => {
    if (lyricRetryTimerRef.current !== null) window.clearTimeout(lyricRetryTimerRef.current);
    lyricRetryTimerRef.current = null;
  }, []);

  const syncActiveTrackLyrics = useEffectEvent(() => {
    const activeTrack = options.activeTrack;
    const hasLyrics = hasSyncedLyrics(activeTrack);
    const needsTranslation = activeTrack.source === "netease" && !activeTrack.lyrics.some((line) => Boolean(line.translation));
    if (activeTrack.id === idleTrack.id || (hasLyrics && !needsTranslation)) return;
    if (needsTranslation && lyricEnrichmentRefreshRef.current.has(activeTrack.id)) return;
    if (lyricSyncingRef.current.has(activeTrack.id)) return;

    if (needsTranslation) {
      lyricEnrichmentRefreshRef.current.add(activeTrack.id);
      if (lyricEnrichmentRefreshRef.current.size > 240) {
        const oldestTrackId = lyricEnrichmentRefreshRef.current.values().next().value;
        if (oldestTrackId) lyricEnrichmentRefreshRef.current.delete(oldestTrackId);
      }
    }
    lyricSyncingRef.current.add(activeTrack.id);
    syncLyricsForTrack(activeTrack)
      .then((applied) => {
        if (applied) {
          lyricRetryCountRef.current.delete(activeTrack.id);
          return;
        }
        lyricEnrichmentRefreshRef.current.delete(activeTrack.id);
        if (options.activeTrack.id === activeTrack.id) scheduleLyricRetry(activeTrack.id);
      })
      .catch(() => {
        lyricEnrichmentRefreshRef.current.delete(activeTrack.id);
        if (options.activeTrack.id === activeTrack.id) scheduleLyricRetry(activeTrack.id);
      })
      .finally(() => {
        lyricSyncingRef.current.delete(activeTrack.id);
      });
  });

  useEffect(() => {
    syncActiveTrackLyrics();
  }, [
    syncActiveTrackLyrics,
    options.activeTrack.id,
    options.activeTrack.providerId,
    options.activeTrack.lyricStatus,
    options.activeTrack.lyrics,
    options.activeTrack.source,
    lyricBindings,
    lyricRetryTick,
  ]);

  return {
    lyricBindings,
    setLyricBindings,
    lyricSyncingRef,
    applyLyricsToTrack,
    syncLyricsForTrack,
  };
}
