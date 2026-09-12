import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { type Track } from "@/data/music";
import { idleTrack } from "@/lib/trackMappers";
import { api, getApiConnection, type NeteaseAccountSummary, type ProviderPlaylist } from "@/lib/api";
import {
  readCachedAudioSettings,
  readCachedPlayerState,
  writeCachedAudioSettings,
  writeCachedPlayerState,
  type QualityLevel,
} from "@/lib/playerPresentation";
import {
  createPlayerCacheSnapshot,
  readPlayHistory,
  writePlayHistory,
  type PlayHistoryEntry,
} from "@/lib/playHistory";
import { commitPlaybackTime, resetPlaybackTime, usePlaybackTime } from "@/lib/playbackClock";
import { getTrackSearchSignature } from "@/lib/trackMappers";
import { materializeQueueIds, mergeQueueTrackSources, orderedQueueIds, playableTracks } from "@/lib/playQueue";
import { createLocalArtistSummaries, type ArtistSummary } from "@/lib/artists";
import { useLocalLibrary } from "@/hooks/useLocalLibrary";
import { useNeteaseData } from "@/hooks/useNeteaseData";
import { useLyricsSync } from "@/hooks/useLyricsSync";
import { useDiscovery, type SearchBundle } from "@/hooks/useDiscovery";
import { ConnectScreen } from "./ConnectScreen";
import { clearConnection, readConnection, verifyConnection } from "./connection";
import { App as CapacitorApp } from "@capacitor/app";
import { AriaAudio, isNativeApp, setStatusBarIconsLight, type AriaAudioEvent } from "./native/ariaAudio";
import {
  disableDirectMode,
  enableDirectMode,
  getDataMode,
  initDirectMode,
  isDirectCapable,
  registerDirectProvider,
  resolveDirectStreamUrl,
} from "./native/neteaseDirect";
import { applySafeAreasFromNative } from "./native/ariaShell";
import { MiniPlayer, TabBar } from "./Chrome";
import { HomeScreen, LibraryScreen, SearchScreen, SettingsScreen } from "./screens";
import { NowPlaying } from "./NowPlaying";

export type Gate = "checking" | "unconfigured" | "ready";
export type TabId = "home" | "library" | "search" | "settings";
export type RepeatMode = "all" | "one";

export type TrackUpdateOptions = { includeHistory?: boolean };

export type MobileControls = {
  directMode: boolean;
  deviceTracks: Track[];
  neteaseLikedIds: Record<string, true>;
  activeTrack: Track;
  activeTrackId: string;
  playing: boolean;
  currentTime: number;
  durationSeconds: number;
  volume: number;
  shuffleEnabled: boolean;
  repeatMode: RepeatMode;
  hifiEnabled: boolean;
  qualityLevel: QualityLevel;
  playQueueTracks: Track[];
  localTracks: Track[];
  likedLocalTracks: Track[];
  likedNeteaseTracks: Track[];
  dailyTracks: Track[];
  roamTracks: Track[];
  playlistTracks: Track[];
  providerPlaylists: ProviderPlaylist[];
  selectedPlaylist: ProviderPlaylist | null;
  playlistLoading: boolean;
  neteaseAccount: NeteaseAccountSummary | null;
  playHistory: PlayHistoryEntry[];
  playCounts: Record<string, number>;
  likedTrackIds: Record<string, boolean>;
  searchBundle: SearchBundle;
  searchLoading: boolean;
  artistTracks: Track[];
  selectedArtist: ArtistSummary | null;
  artistSummaries: ArtistSummary[];
  historyTracks: Track[];
  libraryMeta: { roots: number; updatedAt: string | null };
  connection: { serverUrl: string; token: string };
  searchQuery: string;
  chooseTrack: (trackId: string, preferredQueue?: Track[]) => void;
  togglePlayback: () => void;
  playNext: () => void;
  playPrevious: () => void;
  seekTo: (time: number) => void;
  setVolume: (volume: number) => void;
  toggleShuffle: () => void;
  toggleRepeatMode: () => void;
  toggleLikeTrack: (trackId: string) => void;
  openPlaylist: (playlist: ProviderPlaylist) => void;
  closePlaylist: () => void;
  refreshNeteaseData: () => void;
  refreshRoamData: () => void;
  setSelectedArtist: (artist: ArtistSummary | null) => void;
  setSearchQuery: (query: string) => void;
  setHifiEnabled: (enabled: boolean) => void;
  setQualityLevel: (level: QualityLevel) => void;
  openNowPlaying: () => void;
  disconnect: () => void;
  switchToDesktopMode: () => void;
  addDeviceTracks: (tracks: Track[]) => void;
};

export function MobileApp() {
  const [gate, setGate] = useState<Gate>("checking");
  const [gateError, setGateError] = useState<"none" | "unreachable" | "unauthorized">("none");

  useEffect(() => {
    let mounted = true;
    (async () => {
      if (isNativeApp() && getDataMode() === "direct") {
        const loggedIn = await initDirectMode();
        if (!mounted) return;
        setGate(loggedIn ? "ready" : "unconfigured");
        return;
      }
      const connection = readConnection();
      if (!connection.serverUrl) {
        setGate("unconfigured");
        return;
      }
      const result = await verifyConnection(connection.serverUrl, connection.token);
      if (!mounted) return;
      if (result.ok) {
        setGate("ready");
      } else {
        setGateError(result.reason);
        setGate("unconfigured");
      }
    })();
    return () => {
      mounted = false;
    };
  }, []);

  if (gate === "checking") {
    return (
      <div className="flex h-full items-center justify-center bg-[#f7f8fb]">
        <p className="text-sm text-neutral-400">Aria 启动中…</p>
      </div>
    );
  }

  if (gate === "unconfigured") {
    return (
      <div className="h-full overflow-y-auto">
        {gateError !== "none" && (
          <p className="bg-amber-50 px-4 pt-3 text-center text-xs text-amber-700">
            {gateError === "unreachable"
              ? "无法连接到上次的服务器,请检查桌面端是否在线。"
              : "连接令牌已失效,请重新配对。"}
          </p>
        )}
        <ConnectScreen onConnected={() => setGate("ready")} />
      </div>
    );
  }

  return <AriaMobile onDisconnect={() => { clearConnection(); setGate("unconfigured"); }} />;
}

function AriaMobile({ onDisconnect }: { onDisconnect: () => void }) {
  const cachedState = useMemo(() => readCachedPlayerState(), []);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const directMode = isNativeApp() && getDataMode() === "direct";

  useEffect(() => {
    if (directMode) registerDirectProvider();
  }, [directMode]);

  const [activeTab, setActiveTab] = useState<TabId>("home");
  const [nowPlayingOpen, setNowPlayingOpen] = useState(false);
  const [activeTrackId, setActiveTrackId] = useState<string>(cachedState.activeTrackId ?? idleTrack.id);
  const [playQueueIds, setPlayQueueIds] = useState<string[]>(cachedState.playQueueIds ?? []);
  const [playing, setPlaying] = useState(false);
  const [durationSeconds, setDurationSeconds] = useState(0);
  const [volume, setVolume] = useState(cachedState.volume ?? 85);
  const [shuffleEnabled, setShuffleEnabled] = useState(cachedState.shuffleEnabled ?? false);
  const [repeatMode, setRepeatMode] = useState<RepeatMode>(cachedState.repeatMode ?? "all");
  const [hifiEnabled, setHifiEnabled] = useState(() => readCachedAudioSettings().hifiEnabled ?? true);
  const [qualityLevel, setQualityLevel] = useState<QualityLevel>(cachedState.qualityLevel ?? "lossless");
  const [likedTrackIds, setLikedTrackIds] = useState<Record<string, boolean>>(() => {
    try {
      return JSON.parse(window.localStorage.getItem("aria-liked-track-ids") || "{}") as Record<string, boolean>;
    } catch {
      return {};
    }
  });
  const [playCounts, setPlayCounts] = useState<Record<string, number>>(() => {
    try {
      return JSON.parse(window.localStorage.getItem("aria-play-counts") || "{}") as Record<string, number>;
    } catch {
      return {};
    }
  });
  const [playHistory, setPlayHistory] = useState<PlayHistoryEntry[]>(readPlayHistory);
  const [searchQuery, setSearchQuery] = useState("");
  const [deviceTracks, setDeviceTracks] = useState<Track[]>([]);

  const pendingSeekRef = useRef(0);
  const handleTrackEndedRef = useRef<() => void>(() => undefined);
  const getActiveTrackRef = useRef<() => Track>(() => idleTrack);
  const updateTrackRef = useRef<(trackId: string, updateTrack: (track: Track) => Track, updateOptions?: TrackUpdateOptions) => void>(() => undefined);
  const applyTrackUpdate = useCallback(
    (trackId: string, updateTrack: (track: Track) => Track, updateOptions?: TrackUpdateOptions) => {
      updateTrackRef.current(trackId, updateTrack, updateOptions);
    },
    [],
  );

  const localLibrary = useLocalLibrary({
    applyTrackUpdate,
    activeTrackId,
    shuffleEnabled,
    setPlayQueueIds,
    onLibraryOpened: () => undefined,
    onTrackScanned: () => undefined,
    resetPendingSeek: () => {
      pendingSeekRef.current = 0;
    },
  });
  const { localTracks, libraryMeta } = localLibrary;

  const netease = useNeteaseData({
    applyTrackUpdate,
    warmupLevel: hifiEnabled ? "jymaster" : qualityLevel,
    playing,
    canAutoSelectFirstTrack: false,
    onAutoSelectTrack: () => undefined,
    activeView: "home",
    getActiveTrack: () => getActiveTrackRef.current(),
    shuffleEnabled,
    setPlayQueueIds,
  });
  const {
    neteaseAccount,
    neteaseTracks,
    setNeteaseTracks,
    neteaseLikedTracks,
    dailyTracks,
    roamTracks,
    playlistTracks,
    providerPlaylists,
    selectedPlaylist,
    playlistLoading,
    neteaseLikedIds,
    applyStreamMetaToTrack,
    warmNeteaseTrackCache,
    refreshNeteaseData,
    refreshRoamData,
    openPlaylist,
    toggleNeteaseLike,
  } = netease;

  const [artistPoolTracks, setArtistPoolTracks] = useState<Track[]>([]);

  // Search + artist discovery. The discovery pool excludes the artist
  // drill-down results themselves (they come back through artistTracks) to
  // avoid a self-referencing memo.
  const discoveryAllTracks = useMemo(
    () => [...localTracks, ...neteaseTracks, ...neteaseLikedTracks, ...dailyTracks, ...roamTracks, ...playlistTracks],
    [localTracks, neteaseTracks, neteaseLikedTracks, dailyTracks, roamTracks, playlistTracks],
  );
  const artistSummaries = useMemo(
    () => createLocalArtistSummaries(localTracks),
    [localTracks],
  );
  const discovery = useDiscovery({
    query: searchQuery,
    localTracks,
    localSearchSignature: getTrackSearchSignature(localTracks),
    allTracks: discoveryAllTracks,
    artistSummaries,
    onMergeNeteaseTracks: setNeteaseTracks,
  });
  const { searchBundle, searchLoading, selectedArtist, setSelectedArtist, artistTracks } = discovery;

  useEffect(() => {
    if (!artistTracks.length) return;
    setArtistPoolTracks((current) =>
      current.length === artistTracks.length && current[0]?.id === artistTracks[0]?.id ? current : artistTracks,
    );
  }, [artistTracks]);

  const allTracks = useMemo(
    () => [...discoveryAllTracks, ...artistPoolTracks, ...deviceTracks, ...playHistory.map((entry) => entry.track)],
    [discoveryAllTracks, artistPoolTracks, deviceTracks, playHistory],
  );

  const trackById = useMemo(() => {
    const index = new Map<string, Track>();
    for (const track of allTracks) if (!index.has(track.id)) index.set(track.id, track);
    if (cachedState.activeTrackSnapshot && !index.has(cachedState.activeTrackSnapshot.id)) {
      index.set(cachedState.activeTrackSnapshot.id, cachedState.activeTrackSnapshot);
    }
    for (const snapshot of cachedState.playQueueSnapshots ?? []) {
      if (!index.has(snapshot.id)) index.set(snapshot.id, snapshot);
    }
    return index;
  }, [allTracks, cachedState.activeTrackSnapshot, cachedState.playQueueSnapshots]);

  const playQueueTracks = useMemo(
    () => mergeQueueTrackSources(playQueueIds, allTracks, cachedState.playQueueSnapshots ?? []),
    [playQueueIds, allTracks, cachedState.playQueueSnapshots],
  );

  const activeTrack = useMemo(() => {
    if (activeTrackId === idleTrack.id) return idleTrack;
    return trackById.get(activeTrackId) ?? cachedState.activeTrackSnapshot ?? idleTrack;
  }, [activeTrackId, trackById, cachedState.activeTrackSnapshot]);

  useEffect(() => {
    getActiveTrackRef.current = () => activeTrack;
  }, [activeTrack]);

  useLyricsSync({ applyTrackUpdate, activeTrack, localTracks });

  // ---- Shared track update helper (wired after all pool setters exist) ----
  useEffect(() => {
    updateTrackRef.current = (trackId, updateTrack, updateOptions) => {
      const includeHistory = updateOptions?.includeHistory ?? true;
      const applyTo = (tracks: Track[]) =>
        tracks.some((track) => track.id === trackId) ? tracks.map(updateTrack) : tracks;
      localLibrary.setLocalTracks(applyTo);
      setNeteaseTracks(applyTo);
      netease.setNeteaseLikedTracks(applyTo);
      netease.setDailyTracks(applyTo);
      netease.setRoamTracks(applyTo);
      netease.setPlaylistTracks(applyTo);
      setArtistPoolTracks(applyTo);
      if (includeHistory) {
        setPlayHistory((current) =>
          current.some((entry) => entry.track.id === trackId)
            ? current.map((entry) => ({ ...entry, track: updateTrack(entry.track) }))
            : current,
        );
      }
    };
  });

  function resolveQueueForTrack(trackId: string, preferredQueue?: Track[]): Track[] {
    const preferredTracks = preferredQueue ? playableTracks(preferredQueue) : [];
    if (preferredTracks.some((track) => track.id === trackId)) return preferredTracks;
    const candidateQueues = [
      playQueueTracks,
      dailyTracks,
      roamTracks,
      playlistTracks,
      neteaseLikedTracks,
      neteaseTracks,
      artistPoolTracks,
      localTracks,
    ].map(playableTracks);
    return candidateQueues.find((tracks) => tracks.some((track) => track.id === trackId)) ?? [];
  }

  function chooseTrack(trackId: string, preferredQueue?: Track[]) {
    if (nativeAudio && !batteryPromptShownRef.current) {
      batteryPromptShownRef.current = true;
      void import("./native/ariaShell").then((m) => m.requestUninterruptedPlayback());
    }
    const queue = resolveQueueForTrack(trackId, preferredQueue);
    const preferredTarget = preferredQueue?.find((track) => track.id === trackId && track.streamUrl);
    if (preferredQueue && !preferredTarget) return;
    const targetTrack = preferredTarget ?? queue.find((track) => track.id === trackId) ?? trackById.get(trackId);
    if (!targetTrack?.streamUrl) return;

    const playableIds = materializeQueueIds(queue.length ? queue : [targetTrack], trackId, shuffleEnabled);
    if (playableIds.length) setPlayQueueIds(playableIds);
    pendingSeekRef.current = 0;
    setActiveTrackId(trackId);
    resetPlaybackTime();
    setDurationSeconds(0);
    setPlaying(true);
  }

  function pickRelativeTrack(direction: 1 | -1) {
    const fallbackQueue = playQueueTracks.length ? playQueueTracks : playableTracks(allTracks);
    const shouldRefreshShuffleQueue =
      shuffleEnabled && (!playQueueTracks.length || !playQueueTracks.some((track) => track.id === activeTrack.id));
    const nextQueueIds = shouldRefreshShuffleQueue
      ? materializeQueueIds(fallbackQueue, activeTrack.id, true)
      : orderedQueueIds(playQueueTracks.length ? playQueueTracks : fallbackQueue);
    const byId = new Map([...playQueueTracks, ...fallbackQueue].map((track) => [track.id, track]));
    const queue = nextQueueIds.map((id) => byId.get(id)).filter((track): track is Track => Boolean(track));
    if (!queue.length) return;
    if (shouldRefreshShuffleQueue) setPlayQueueIds(nextQueueIds);
    const currentIndex = queue.findIndex((track) => track.id === activeTrack.id);
    const safeIndex = currentIndex >= 0 ? currentIndex : 0;
    const nextTrack = queue[(safeIndex + direction + queue.length) % queue.length];
    if (!nextTrack?.streamUrl) return;
    if (nextTrack.id === activeTrack.id && audioRef.current) {
      audioRef.current.currentTime = 0;
      audioRef.current.play().catch(() => setPlaying(false));
    }
    setActiveTrackId(nextTrack.id);
    resetPlaybackTime();
    setDurationSeconds(0);
    setPlaying(true);
  }

  function restartActiveTrack() {
    pendingSeekRef.current = 0;
    resetPlaybackTime();
    setPlaying(true);
    const audio = audioRef.current;
    if (!audio) return;
    audio.currentTime = 0;
    audio.play().catch(() => setPlaying(false));
  }

  function handleTrackEnded() {
    if (repeatMode === "one") {
      restartActiveTrack();
      return;
    }
    pickRelativeTrack(1);
  }
  useEffect(() => {
    handleTrackEndedRef.current = handleTrackEnded;
  });

  function seekTo(nextTime: number) {
    if (nativeAudio) {
      commitPlaybackTime(nextTime, true);
      pendingSeekRef.current = 0;
      void AriaAudio.seek({ position: nextTime }).catch(() => undefined);
      if (!playing) setPlaying(true);
      return;
    }
    const audio = audioRef.current;
    if (!audio) return;
    audio.currentTime = nextTime;
    commitPlaybackTime(nextTime, true);
    if (!playing) setPlaying(true);
  }

  function togglePlayback() {
    if (activeTrack.streamUrl) {
      setPlaying((value) => !value);
      return;
    }
    const fallbackTrack = playableTracks(playQueueTracks)[0] ?? playableTracks(allTracks)[0];
    if (fallbackTrack) chooseTrack(fallbackTrack.id);
  }

  function toggleShuffleQueue() {
    const nextShuffleEnabled = !shuffleEnabled;
    setShuffleEnabled(nextShuffleEnabled);
    const queue = resolveQueueForTrack(activeTrack.id);
    const playableIds = materializeQueueIds(queue.length ? queue : playQueueTracks, activeTrack.id, nextShuffleEnabled);
    if (playableIds.length) setPlayQueueIds(playableIds);
  }

  function toggleLikeTrack(trackId: string) {
    const track = allTracks.find((item) => item.id === trackId);
    if (track?.source === "netease") {
      toggleNeteaseLike(track);
      return;
    }
    setLikedTrackIds((current) => {
      const next = { ...current };
      if (next[trackId]) delete next[trackId];
      else next[trackId] = true;
      return next;
    });
  }

  const currentTime = usePlaybackTime();
  const nativeAudio = useMemo(() => isNativeApp(), []);

  // Active safe-area pull: MIUI-style ROMs may report zero insets during the
  // passive listener window; pull real values once the page is interactive.
  useEffect(() => {
    if (!isNativeApp()) return;
    const timer = window.setTimeout(() => void applySafeAreasFromNative(), 1200);
    const onVisible = () => {
      if (document.visibilityState === "visible") void applySafeAreasFromNative();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, []);

  // Hardware/gesture back: step back inside the app instead of exiting.
  useEffect(() => {
    if (!isNativeApp()) return;
    let handle: { remove(): void } | null = null;
    void CapacitorApp.addListener("backButton", () => {
      if (nowPlayingOpen) setNowPlayingOpen(false);
      else if (activeTab !== "home") setActiveTab("home");
      else void CapacitorApp.exitApp();
    }).then((handleRef) => {
      handle = handleRef;
    });
    return () => {
      handle?.remove();
    };
  }, [nowPlayingOpen, activeTab]);

  // Battery-optimization exemption keeps the foreground service alive when
  // the app is backgrounded; asked once, right before the first play.
  const batteryPromptShownRef = useRef(false);

  // Notification permission is required for the media card on Android 13+.
  useEffect(() => {
    if (!nativeAudio) return;
    void AriaAudio.requestNotifications().catch(() => undefined);
  }, [nativeAudio]);

  // ---- Audio engine wiring: native foreground service (AriaAudio/Media3)
  // inside the app, HTML5 audio element in the plain browser. ----
  const nextQueueTrack = useMemo(() => {
    const queue = orderedQueueIds(playQueueTracks.length ? playQueueTracks : playableTracks(allTracks));
    const nextId = queue[queue.indexOf(activeTrack.id) + 1];
    return nextId ? trackById.get(nextId) : undefined;
  }, [playQueueTracks, allTracks, activeTrack.id, trackById]);

  // Rapid double-taps can re-run the load effect for the same track; each run
  // is a startForegroundService round-trip. Dedupe within a short window.
  const lastNativeLoadRef = useRef<{ key: string; at: number }>({ key: "", at: 0 });

  useEffect(() => {
    if (!nativeAudio) return;
    if (!activeTrack.streamUrl) {
      void AriaAudio.stop().catch(() => undefined);
      return;
    }
    const loadKey = `${activeTrack.id}|${activeTrack.streamUrl}`;
    if (loadKey === lastNativeLoadRef.current.key && Date.now() - lastNativeLoadRef.current.at < 500) return;
    lastNativeLoadRef.current = { key: loadKey, at: Date.now() };
    // Stop the previous item right away: the pause/play effect below would
    // otherwise resume it while the new stream is still being resolved.
    void AriaAudio.setPaused({ paused: true }).catch(() => undefined);
    resetPlaybackTime();
    setDurationSeconds(0);
    let cancelled = false;
    void (async () => {
      let url: string = playbackStreamUrl(activeTrack, hifiEnabled, qualityLevel) ?? activeTrack.streamUrl ?? "";
      // Direct mode sentinel: resolve the real CDN url through songUrlV1.
      if (url.startsWith("direct:")) {
        const meta = await resolveDirectStreamUrl(activeTrack.id, targetLevelFor(activeTrack, hifiEnabled, qualityLevel));
        if (cancelled) return;
        if (!meta?.url) {
          setPlaying(false);
          return;
        }
        applyTrackUpdate(activeTrack.id, (track) => ({
          ...track,
          streamUrl: meta.url ?? undefined,
          bitrate: meta.bitrate ?? track.bitrate,
          sampleRate: meta.sampleRate ?? track.sampleRate,
          quality: meta.quality ?? track.quality,
          currentLevel: meta.currentLevel ?? track.currentLevel,
          availableLevels: meta.availableLevels ?? track.availableLevels,
        }));
        url = meta.url;
      }
      if (cancelled) return;
      const loadUrl: string = url;
      await AriaAudio.load({
        url: loadUrl,
        trackId: activeTrack.id,
        title: activeTrack.title,
        artist: activeTrack.artist,
        album: activeTrack.album,
        artworkUrl: activeTrack.coverUrl ?? (activeTrack.cover.startsWith("http") ? activeTrack.cover : undefined),
        paused: !playing,
        volume: Math.min(1, Math.max(0, volume / 100)),
      }).catch(() => setPlaying(false));
    })();
    return () => {
      cancelled = true;
    };
    // `playing`/`volume` intentionally read once here; dedicated effects sync
    // later changes so a track switch does not restart playback.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nativeAudio, activeTrack.id, activeTrack.streamUrl]);

  useEffect(() => {
    if (!nativeAudio) return;
    void AriaAudio.setPaused({ paused: !playing }).catch(() => undefined);
  }, [nativeAudio, playing]);

  useEffect(() => {
    if (!nativeAudio || !activeTrack.streamUrl) return;
    if (!nextQueueTrack?.streamUrl) return;
    let cancelled = false;
    void (async () => {
      let url: string = playbackStreamUrl(nextQueueTrack, hifiEnabled, qualityLevel) ?? nextQueueTrack.streamUrl ?? "";
      if (url.startsWith("direct:")) {
        const meta = await resolveDirectStreamUrl(nextQueueTrack.id, targetLevelFor(nextQueueTrack, hifiEnabled, qualityLevel));
        if (cancelled) return;
        if (!meta?.url) return; // gapless append is best-effort
        url = meta.url;
      }
      await AriaAudio.loadNext({
        url,
        trackId: nextQueueTrack.id,
        title: nextQueueTrack.title,
        artist: nextQueueTrack.artist,
        album: nextQueueTrack.album,
        artworkUrl: nextQueueTrack.coverUrl ?? (nextQueueTrack.cover.startsWith("http") ? nextQueueTrack.cover : undefined),
      }).catch(() => undefined);
    })();
    return () => {
      cancelled = true;
    };
  }, [nativeAudio, activeTrack.streamUrl, activeTrack.id, nextQueueTrack, hifiEnabled, qualityLevel]);

  useEffect(() => {
    if (!nativeAudio) return;
    const handleEvent = (event: AriaAudioEvent) => {
      if (event.kind === "progress") {
        if (typeof event.position === "number") commitPlaybackTime(event.position);
        if (typeof event.duration === "number" && event.duration > 0) {
          setDurationSeconds((current) => (Math.abs(current - event.duration!) > 0.5 ? event.duration! : current));
        }
        return;
      }
      if (event.kind === "loaded") {
        if (typeof event.duration === "number" && event.duration > 0) setDurationSeconds(event.duration);
        if (typeof event.position === "number" && event.position > 0) commitPlaybackTime(event.position, true);
        return;
      }
      if (event.kind === "state") {
        if (typeof event.playing === "boolean") setPlaying(event.playing);
        return;
      }
      if (event.kind === "advanced") {
        if (event.trackId && trackById.has(event.trackId)) {
          setActiveTrackId(event.trackId);
          resetPlaybackTime();
          setDurationSeconds(0);
          setPlaying(true);
        }
        return;
      }
      if (event.kind === "ended") {
        handleTrackEndedRef.current();
        return;
      }
      if (event.kind === "error") {
        setPlaying(false);
      }
    };
    const subscription = AriaAudio.addListener("audioEvent", handleEvent);
    return () => {
      void Promise.resolve(subscription).then((handle) => handle.remove());
    };
  }, [nativeAudio, trackById]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio || nativeAudio) return;
    if (!activeTrack.streamUrl) {
      audio.removeAttribute("src");
      audio.pause();
      return;
    }
    resetPlaybackTime();
    setDurationSeconds(0);
    audio.src = playbackStreamUrl(activeTrack, hifiEnabled, qualityLevel) ?? "";
    audio.load();
  }, [nativeAudio, activeTrack.id, activeTrack.streamUrl]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio || nativeAudio || !activeTrack.streamUrl) return;
    if (playing) {
      audio.play().catch(() => setPlaying(false));
    } else {
      audio.pause();
    }
  }, [nativeAudio, playing, activeTrack.streamUrl]);

  useEffect(() => {
    if (nativeAudio) {
      void AriaAudio.setVolume({ volume: Math.min(1, Math.max(0, volume / 100)) }).catch(() => undefined);
      return;
    }
    const audio = audioRef.current;
    if (audio) audio.volume = Math.min(1, Math.max(0, volume / 100));
  }, [nativeAudio, volume]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio || nativeAudio) return;
    const onTimeUpdate = () => commitPlaybackTime(audio.currentTime);
    const onLoadedMetadata = () => {
      setDurationSeconds(Number.isFinite(audio.duration) ? audio.duration : 0);
      if (pendingSeekRef.current > 0) {
        audio.currentTime = pendingSeekRef.current;
        commitPlaybackTime(pendingSeekRef.current, true);
        pendingSeekRef.current = 0;
      }
    };
    const onEnded = () => handleTrackEndedRef.current();
    audio.addEventListener("timeupdate", onTimeUpdate);
    audio.addEventListener("loadedmetadata", onLoadedMetadata);
    audio.addEventListener("ended", onEnded);
    return () => {
      audio.removeEventListener("timeupdate", onTimeUpdate);
      audio.removeEventListener("loadedmetadata", onLoadedMetadata);
      audio.removeEventListener("ended", onEnded);
    };
  }, [nativeAudio]);

  // ---- History, counts, media session, persistence ----
  const activeTrackStartedRef = useRef<string>("");
  useEffect(() => {
    if (!activeTrack.streamUrl || activeTrack.id === idleTrack.id) return;
    if (activeTrackStartedRef.current === activeTrack.id) return;
    activeTrackStartedRef.current = activeTrack.id;
    setPlayHistory((current) => {
      const previous = current[0];
      const rest = previous?.track.id === activeTrack.id ? current.slice(1) : current;
      return [{ track: createPlayerCacheSnapshot(activeTrack), playedAt: Date.now(), count: 1 }, ...rest].slice(0, 300);
    });
    setPlayCounts((current) => ({ ...current, [activeTrack.id]: (current[activeTrack.id] ?? 0) + 1 }));
    const warmCandidates = playQueueTracks.slice(0, 12);
    if (warmCandidates.length) void warmNeteaseTrackCache(warmCandidates);
  }, [activeTrack, playQueueTracks, warmNeteaseTrackCache]);

  useEffect(() => {
    if (!("mediaSession" in navigator) || activeTrack.id === idleTrack.id) return;
    const artwork = activeTrack.cover.startsWith("http")
      ? [{ src: activeTrack.cover, sizes: "512x512", type: "image/jpeg" }]
      : [];
    navigator.mediaSession.metadata = new MediaMetadata({
      title: activeTrack.title,
      artist: activeTrack.artist,
      album: activeTrack.album,
      artwork,
    });
    navigator.mediaSession.setActionHandler("play", () => setPlaying(true));
    navigator.mediaSession.setActionHandler("pause", () => setPlaying(false));
    navigator.mediaSession.setActionHandler("previoustrack", () => pickRelativeTrack(-1));
    navigator.mediaSession.setActionHandler("nexttrack", () => pickRelativeTrack(1));
  }, [activeTrack, playing]);

  useEffect(() => {
    writeCachedPlayerState({
      activeTrackId: activeTrack.id === idleTrack.id ? undefined : activeTrack.id,
      activeTrackSnapshot: activeTrack.id === idleTrack.id ? undefined : createPlayerCacheSnapshot(activeTrack),
      playQueueIds: playQueueIds.slice(0, 1200),
      playQueueSnapshots: playQueueTracks.slice(0, 1200).map((track) => createPlayerCacheSnapshot(track)),
      volume,
      qualityLevel,
      shuffleEnabled,
      repeatMode,
      playing: false,
    });
  }, [activeTrack, playQueueIds, playQueueTracks, volume, qualityLevel, shuffleEnabled, repeatMode]);

  useEffect(() => {
    window.localStorage.setItem("aria-liked-track-ids", JSON.stringify(likedTrackIds));
  }, [likedTrackIds]);
  useEffect(() => {
    window.localStorage.setItem("aria-play-counts", JSON.stringify(playCounts));
  }, [playCounts]);
  useEffect(() => {
    writePlayHistory(playHistory);
  }, [playHistory]);
  useEffect(() => {
    const settings = readCachedAudioSettings();
    writeCachedAudioSettings({
      sinkId: settings.sinkId ?? "default",
      hifiEnabled,
      gaplessEnabled: settings.gaplessEnabled ?? true,
      exclusiveMode: false,
      outputMode: "system",
    });
  }, [hifiEnabled]);

  // Initial data load: account info (desktop reads /api/settings for this),
  // then netease pools. Local library loads inside its own hook. Runs ONCE —
  // refreshNeteaseData is a fresh function each render, so depending on it
  // directly would re-fire (and hammer the API) on every render.
  const initialRefreshRef = useRef(refreshNeteaseData);
  useEffect(() => {
    initialRefreshRef.current = refreshNeteaseData;
  });
  useEffect(() => {
    api
      .getSettings()
      .then((settings) => {
        netease.setNeteaseAccount(settings.neteaseAccount);
      })
      .catch(() => undefined);
    initialRefreshRef.current().catch(() => undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const likedLocalTracks = useMemo(
    () => localTracks.filter((track) => likedTrackIds[track.id]),
    [localTracks, likedTrackIds],
  );
  const likedNeteaseTracks = useMemo(
    () => neteaseLikedTracks.filter((track) => neteaseLikedIds[track.id] || track.likedAt),
    [neteaseLikedTracks, neteaseLikedIds],
  );
  const historyTracks = useMemo(() => playHistory.map((entry) => entry.track), [playHistory]);

  const controls: MobileControls = {
    directMode,
    deviceTracks,
    neteaseLikedIds,
    addDeviceTracks: (tracks: Track[]) => setDeviceTracks((current) => (current.length ? current : tracks)),
    activeTrack,
    activeTrackId,
    playing,
    currentTime,
    durationSeconds,
    volume,
    shuffleEnabled,
    repeatMode,
    hifiEnabled,
    qualityLevel,
    playQueueTracks,
    localTracks,
    likedLocalTracks,
    likedNeteaseTracks,
    dailyTracks,
    roamTracks,
    playlistTracks,
    providerPlaylists,
    selectedPlaylist,
    playlistLoading,
    neteaseAccount,
    playHistory,
    playCounts,
    likedTrackIds,
    searchBundle,
    searchLoading,
    artistTracks,
    selectedArtist,
    artistSummaries,
    historyTracks,
    libraryMeta,
    connection: getApiConnection(),
    searchQuery,
    chooseTrack,
    togglePlayback,
    playNext: () => pickRelativeTrack(1),
    playPrevious: () => pickRelativeTrack(-1),
    seekTo,
    setVolume,
    toggleShuffle: toggleShuffleQueue,
    toggleRepeatMode: () => setRepeatMode((mode) => (mode === "all" ? "one" : "all")),
    toggleLikeTrack,
    openPlaylist,
    closePlaylist: () => netease.setSelectedPlaylist(null),
    refreshNeteaseData,
    refreshRoamData,
    setSelectedArtist,
    setSearchQuery,
    setHifiEnabled,
    setQualityLevel,
    openNowPlaying: () => setNowPlayingOpen(true),
    disconnect: onDisconnect,
    switchToDesktopMode: () => {
      disableDirectMode();
      onDisconnect();
    },
  };

  return (
    <div className="flex h-full flex-col bg-[linear-gradient(170deg,#f7f8fb_0%,#eef1fa_60%,#f4eef8_100%)]">
      <audio ref={audioRef} preload="metadata" className="hidden" />

      <div className="safe-top no-scrollbar min-h-0 flex-1 overflow-y-auto">
        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={activeTab}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.16, ease: "easeOut" }}
            className="min-h-full px-4 pb-2 pt-3"
          >
            {activeTab === "home" && <HomeScreen {...controls} />}
            {activeTab === "library" && <LibraryScreen {...controls} />}
            {activeTab === "search" && <SearchScreen {...controls} />}
            {activeTab === "settings" && <SettingsScreen {...controls} />}
          </motion.div>
        </AnimatePresence>
      </div>

      <MiniPlayer {...controls} />
      <TabBar activeTab={activeTab} onSelect={setActiveTab} />

      <AnimatePresence>
        {nowPlayingOpen && <NowPlaying {...controls} onClose={() => setNowPlayingOpen(false)} />}
      </AnimatePresence>
      <StatusBarIconsSync light={nowPlayingOpen} />
    </div>
  );
}

function targetLevelFor(track: Track, hifi: boolean, level: QualityLevel): QualityLevel {
  const levels = track.availableLevels ?? [];
  return hifi ? (levels[levels.length - 1] ?? level) : level;
}

// Lossless pipeline: the stream route defaults to lossless server-side, and
// the level query parameter selects the tier the user picked (HiFi takes the
// highest tier the track actually offers). Applies on the next track load.
function playbackStreamUrl(track: Track, hifi: boolean, level: QualityLevel): string | undefined {
  if (!track.streamUrl) return undefined;
  if (track.source !== "netease") return track.streamUrl;
  // Direct-mode sentinel: resolved against songUrlV1 at load time.
  if (track.streamUrl.startsWith("direct:")) return track.streamUrl;
  const separator = track.streamUrl.includes("?") ? "&" : "?";
  return `${track.streamUrl}${separator}level=${targetLevelFor(track, hifi, level)}`;
}

function StatusBarIconsSync({ light }: { light: boolean }) {
  useEffect(() => {
    setStatusBarIconsLight(light);
  }, [light]);
  return null;
}
