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
import { AriaAudio, isNativeApp, setStatusBarIconsLight, type AriaAudioEvent, type UsbExclusiveSettings } from "./native/ariaAudio";
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
import { cachedDirectAccount } from "./native/neteaseDirect";
import { MiniPlayer, TabBar } from "./Chrome";
import { HomeScreen, LibraryScreen, SearchScreen, SettingsScreen } from "./screens";
import { NowPlaying } from "./NowPlaying";
import { PlaybackSession, updateMatchingTrack } from "./playbackSession";
import { hydrateLibrary, readLibrary, saveLibrary, compactTrack, newestLiked } from "./libraryStorage";
import { CollectionScreen } from "./Collections";
import { positiveAudioValue, type PlaybackQuality } from "./playbackQuality";

export type Gate = "checking" | "unconfigured" | "ready";
export type TabId = "home" | "library" | "search" | "settings";
export type RepeatMode = "all" | "one";
export type CollectionId = "liked" | "history" | "daily" | "roam";

export type TrackUpdateOptions = { includeHistory?: boolean };

export type MobileControls = {
  openCollection: (collection: CollectionId) => void;
  refreshLikedData: () => Promise<void>;
  refreshDailyData: () => Promise<void>;
  loadMoreRoam: () => Promise<void>;
  directMode: boolean;
  deviceTracks: Track[];
  neteaseLikedIds: Record<string, true>;
  activeTrack: Track;
  actualQuality: PlaybackQuality | null;
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
  setNeteaseAccount: (account: NeteaseAccountSummary | null) => void;
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
  refreshRoamData: () => Promise<void>;
  setSelectedArtist: (artist: ArtistSummary | null) => void;
  setSearchQuery: (query: string) => void;
  setHifiEnabled: (enabled: boolean) => void;
  setQualityLevel: (level: QualityLevel) => void;
  openNowPlaying: () => void;
  onLyricsCollapse: () => void;
  disconnect: () => void;
  switchToDesktopMode: () => void;
  addDeviceTracks: (tracks: Track[]) => void;
  usbExclusive: UsbExclusiveSettings;
  setUsbExclusiveEnabled: (enabled: boolean) => Promise<void>;
};

export function MobileApp() {
  const [gate, setGate] = useState<Gate>("checking");
  const [gateError, setGateError] = useState<"none" | "unreachable" | "unauthorized">("none");

  useEffect(() => {
    let mounted = true;
    (async () => {
      await hydrateLibrary();
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
  const cachedLibrary = useMemo(() => readLibrary(), []);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const directMode = isNativeApp() && getDataMode() === "direct";

  useEffect(() => {
    if (directMode) registerDirectProvider();
  }, [directMode]);

  const [activeTab, setActiveTab] = useState<TabId>("home");
  const [collection, setCollection] = useState<CollectionId | null>(null);
  const [nowPlayingOpen, setNowPlayingOpen] = useState(false);
  const [activeTrackId, setActiveTrackId] = useState<string>(cachedState.activeTrackId ?? idleTrack.id);
  const [playQueueIds, setPlayQueueIds] = useState<string[]>(cachedState.playQueueIds ?? []);
  const [playing, setPlaying] = useState(false);
  const playbackIntentRef = useRef(false);
  const [usbExclusive, setUsbExclusive] = useState<UsbExclusiveSettings>({ enabled: false, connected: false, supported: false });
  const [playRequest, setPlayRequest] = useState(0);
  const [durationSeconds, setDurationSeconds] = useState(0);
  const [volume, setVolume] = useState(cachedState.volume ?? 85);
  const [shuffleEnabled, setShuffleEnabled] = useState(cachedState.shuffleEnabled ?? false);
  const [repeatMode, setRepeatMode] = useState<RepeatMode>(cachedState.repeatMode ?? "all");
  // Direct mode default: a level free accounts can actually stream (HiFi
  // stays opt-in — lossless/hires tiers null out for free accounts).
  const [hifiEnabled, setHifiEnabled] = useState(() => readCachedAudioSettings().hifiEnabled ?? false);
  const [qualityLevel, setQualityLevel] = useState<QualityLevel>(cachedState.qualityLevel ?? (isNativeApp() ? "exhigh" : "lossless"));
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
  const [deviceTracks, setDeviceTracks] = useState<Track[]>(cachedLibrary.device);
  const [localLikedTimes, setLocalLikedTimes] = useState<Record<string, number>>(() => {
    try { return JSON.parse(localStorage.getItem("aria-local-liked-times") || "{}"); } catch { return {}; }
  });

  const pendingSeekRef = useRef(0);
  const handleTrackEndedRef = useRef<() => void>(() => undefined);
  const playbackSessionRef = useRef(new PlaybackSession());
  const resolvedQualityRef = useRef<{ trackId: string; url: string; quality: PlaybackQuality } | null>(null);
  const [nativeQuality, setNativeQuality] = useState<{ trackId: string; requestId: string; quality: PlaybackQuality } | null>(null);
  const nativeEventHandlerRef = useRef<(event: AriaAudioEvent) => void>(() => undefined);
  const relativeTrackRef = useRef<(direction: 1 | -1) => void>(() => undefined);
  const nativeAdvancedTrackRef = useRef<string | null>(null);
  const nativePreloadBusyRef = useRef(false);
  const nativePreloadKeyRef = useRef("");
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
    initial: cachedLibrary,
    initialAccount: cachedDirectAccount(),
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
    setNeteaseLikedIds,
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
    // Later pools contain stream metadata refreshed after the initial payload.
    // Keep the newest occurrence so a selected song never falls back to an
    // older object with its previous URL.
    for (const track of allTracks) index.set(track.id, track);
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
      const applyTo = (tracks: Track[]) => updateMatchingTrack(tracks, trackId, updateTrack);
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
            ? current.map((entry) => entry.track.id === trackId ? { ...entry, track: updateTrack(entry.track) } : entry)
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

  const choosingRef = useRef(false);

  async function chooseTrack(trackId: string, preferredQueue?: Track[]) {
    playbackIntentRef.current = true;
    if (nativeAudio && !batteryPromptShownRef.current) {
      batteryPromptShownRef.current = true;
      void import("./native/ariaShell").then((m) => m.requestUninterruptedPlayback());
    }
    const queue = resolveQueueForTrack(trackId, preferredQueue);
    const preferredTarget = preferredQueue?.find((track) => track.id === trackId && track.streamUrl);
    if (preferredQueue && !preferredTarget) return;
    let targetTrack = preferredTarget ?? queue.find((track) => track.id === trackId) ?? trackById.get(trackId);
    if (!targetTrack?.streamUrl) return;

    // Direct mode: resolve the CDN url at click time — the load layer only
    // ever sees real urls, so switching is deterministic.
    if (directMode && targetTrack.source === "netease") {
      if (choosingRef.current) return;
      choosingRef.current = true;
      setPlayNotice("正在获取播放链接…");
      try {
        const meta = await resolveDirectStreamUrl(
          trackId,
          targetLevelFor(targetTrack, hifiEnabled, qualityLevel),
        );
        if (!meta?.url) {
          setPlayNotice(`「${targetTrack.title}」暂时无法播放`);
          window.setTimeout(() => setPlayNotice(null), 2600);
          choosingRef.current = false;
          return;
        }
        resolvedQualityRef.current = { trackId, url: meta.url, quality: {
          bitrate: meta.bitrate, sampleRate: meta.sampleRate, audioFormat: meta.audioFormat,
        } };
        applyTrackUpdate(trackId, (track) => ({
          ...track,
          streamUrl: meta.url ?? undefined,
          bitrate: meta.bitrate,
          sampleRate: meta.sampleRate,
          audioFormat: meta.audioFormat,
          quality: meta.quality ?? track.quality,
          currentLevel: meta.currentLevel ?? track.currentLevel,
          availableLevels: meta.availableLevels ?? track.availableLevels,
        }));
        targetTrack = { ...targetTrack, streamUrl: meta.url ?? undefined };
        setPlayNotice(null);
      } finally {
        choosingRef.current = false;
      }
    }

    const playableIds = materializeQueueIds(queue.length ? queue : [targetTrack], trackId, shuffleEnabled);
    if (playableIds.length) setPlayQueueIds(playableIds);
    pendingSeekRef.current = 0;
    setActiveTrackId(trackId);
    setPlayRequest((value) => value + 1);
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
    if (directMode && nextTrack.source === "netease") {
      // Sentinel: let chooseTrack resolve the stream, then switch.
      void chooseTrack(nextTrack.id, queue);
      return;
    }
    if (nextTrack.id === activeTrack.id) {
      restartActiveTrack();
      return;
    }
    setActiveTrackId(nextTrack.id);
    setPlayRequest((value) => value + 1);
    resetPlaybackTime();
    setDurationSeconds(0);
    playbackIntentRef.current = true;
    setPlaying(true);
  }

  function restartActiveTrack() {
    playbackIntentRef.current = true;
    pendingSeekRef.current = 0;
    resetPlaybackTime();
    setPlaying(true);
    setPlayRequest((value) => value + 1);
    const audio = audioRef.current;
    if (!audio || nativeAudio) return;
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
    relativeTrackRef.current = pickRelativeTrack;
  });

  function seekTo(nextTime: number) {
    if (nativeAudio) {
      commitPlaybackTime(nextTime, true);
      pendingSeekRef.current = 0;
      void AriaAudio.seek({ position: nextTime }).catch(() => undefined);
       if (!playing) {
         playbackIntentRef.current = true;
         setPlaying(true);
       }
      return;
    }
    const audio = audioRef.current;
    if (!audio) return;
    audio.currentTime = nextTime;
    commitPlaybackTime(nextTime, true);
    if (!playing) {
      playbackIntentRef.current = true;
      setPlaying(true);
    }
  }

  function togglePlayback() {
    if (activeTrack.streamUrl) {
      if (activeTrack.streamUrl.startsWith("direct:")) {
        // Boot-restored sentinel: resolve, persist onto the track, then play.
        setPlayNotice("正在获取播放链接…");
        void (async () => {
          const meta = await resolveDirectStreamUrl(
            activeTrack.id,
            targetLevelFor(activeTrack, hifiEnabled, qualityLevel),
          );
          if (!meta?.url) {
            setPlayNotice(`「${activeTrack.title}」暂时无法播放`);
            window.setTimeout(() => setPlayNotice(null), 2600);
            return;
          }
          resolvedQualityRef.current = { trackId: activeTrack.id, url: meta.url, quality: {
            bitrate: meta.bitrate, sampleRate: meta.sampleRate, audioFormat: meta.audioFormat,
          } };
          applyTrackUpdate(activeTrack.id, (track) => ({
            ...track,
            streamUrl: meta.url ?? undefined,
            bitrate: meta.bitrate,
            sampleRate: meta.sampleRate,
            audioFormat: meta.audioFormat,
            quality: meta.quality ?? track.quality,
            currentLevel: meta.currentLevel ?? track.currentLevel,
            availableLevels: meta.availableLevels ?? track.availableLevels,
          }));
           playbackIntentRef.current = true;
           setPlaying(true);
        })();
        return;
      }
      setPlaying((value) => {
        playbackIntentRef.current = !value;
        return !value;
      });
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
    setLocalLikedTimes((current) => ({ ...current, [trackId]: Date.now() }));
  }

  const currentTime = usePlaybackTime();
  const nativeAudio = useMemo(() => isNativeApp(), []);
  useEffect(() => {
    if (!nativeAudio) return;
    void AriaAudio.getUsbExclusiveSettings().then(setUsbExclusive).catch(() => undefined);
  }, [nativeAudio]);
  useEffect(() => {
    if (!nativeAudio) return;
    void AriaAudio.updateLockInfo({ trackId: activeTrack.id, lyrics: activeTrack.lyrics ?? [],
      liked: Boolean(neteaseLikedIds[activeTrack.id] || likedTrackIds[activeTrack.id]),
    }).catch(() => undefined);
  }, [nativeAudio, activeTrack.id, activeTrack.lyrics, neteaseLikedIds, likedTrackIds]);

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
      else if (collection) setCollection(null);
      else if (activeTab !== "home") setActiveTab("home");
      else void CapacitorApp.exitApp();
    }).then((handleRef) => {
      handle = handleRef;
    });
    return () => {
      handle?.remove();
    };
  }, [nowPlayingOpen, activeTab, collection]);

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

  // Rapid double-taps can re-run the load effect for the same track; each run
  // is a startForegroundService round-trip. Dedupe within a short window.
  const lastNativeLoadRef = useRef<{ key: string; at: number }>({ key: "", at: 0 });
  const skipGuardRef = useRef(0);
  const directPlaybackRetryRef = useRef<string | null>(null);
  const [playNotice, setPlayNotice] = useState<string | null>(null);

  useEffect(() => {
    if (!nativeAudio) return;
    if (!activeTrack.streamUrl) {
      setNativeQuality(null);
      void AriaAudio.stop().catch(() => undefined);
      return;
    }
    // Media3 can move to a preloaded item without a second load request. The
    // transition handler marks that render so this effect does not tear down
    // the already-playing item and turn a gapless change into a rebuffer.
    if (nativeAdvancedTrackRef.current === activeTrack.id) {
      nativeAdvancedTrackRef.current = null;
      return;
    }
    const requestId = playbackSessionRef.current.begin(activeTrack.id);
    setNativeQuality(null);
    const loadKey = `${requestId}|${activeTrack.streamUrl}`;
    if (loadKey === lastNativeLoadRef.current.key && Date.now() - lastNativeLoadRef.current.at < 500) return;
    lastNativeLoadRef.current = { key: loadKey, at: Date.now() };
    resetPlaybackTime();
    setDurationSeconds(0);
    // Boot-restored tracks still carry the direct: sentinel — they stay
    // unloaded until the user taps play (which resolves first).
    if (activeTrack.streamUrl.startsWith("direct:")) return;
    const streamUrl = activeTrack.streamUrl;
    // Streams are resolved at click time (chooseTrack) — this effect only
    // forwards an already-real url to the native player.
    void (playbackSessionRef.current.isCurrent(requestId) ? AriaAudio.load({
      url: streamUrl,
      requestId,
      trackId: activeTrack.id,
      title: activeTrack.title,
      artist: activeTrack.artist,
      album: activeTrack.album,
      artworkUrl: activeTrack.coverUrl ?? (activeTrack.cover.startsWith("http") ? activeTrack.cover : undefined),
      paused: !playing,
      volume: Math.min(1, Math.max(0, volume / 100)),
      }) : Promise.resolve())
      .catch(() => setPlaying(false));
  }, [nativeAudio, activeTrack.id, activeTrack.streamUrl, playRequest]);

  useEffect(() => {
    if (!nativeAudio) return;
    void AriaAudio.setPaused({ paused: !playing }).catch(() => undefined);
  }, [nativeAudio, playing]);

  useEffect(() => {
    if (!nativeAudio) return;

    async function preloadNextNative(requestId: string) {
      if (!requestId || nativePreloadBusyRef.current) return;
      const queue = playQueueTracks.length ? playQueueTracks : playableTracks(allTracks);
      if (!queue.length) return;
      const currentIndex = queue.findIndex((track) => track.id === activeTrack.id);
      const nextTrack = queue[(Math.max(0, currentIndex) + 1) % queue.length];
      if (!nextTrack?.streamUrl) return;
      const key = `${requestId}|${activeTrack.id}|${nextTrack.id}|${nextTrack.streamUrl}`;
      if (nativePreloadKeyRef.current === key) return;

      nativePreloadBusyRef.current = true;
      try {
        let streamUrl = nextTrack.streamUrl;
        if (directMode && nextTrack.source === "netease" && streamUrl.startsWith("direct:")) {
          const meta = await resolveDirectStreamUrl(
            nextTrack.id,
            targetLevelFor(nextTrack, hifiEnabled, qualityLevel),
          );
          if (!meta?.url) return;
          streamUrl = meta.url;
          applyTrackUpdate(nextTrack.id, (track) => ({
            ...track,
            streamUrl,
            bitrate: meta.bitrate,
            sampleRate: meta.sampleRate,
            audioFormat: meta.audioFormat,
            quality: meta.quality ?? track.quality,
            currentLevel: meta.currentLevel ?? track.currentLevel,
            availableLevels: meta.availableLevels ?? track.availableLevels,
          }));
        }
        await AriaAudio.loadNext({
          requestId,
          url: streamUrl,
          trackId: nextTrack.id,
          title: nextTrack.title,
          artist: nextTrack.artist,
          album: nextTrack.album,
          artworkUrl: nextTrack.coverUrl ?? (nextTrack.cover.startsWith("http") ? nextTrack.cover : undefined),
        });
        nativePreloadKeyRef.current = key;
      } catch {
        // The normal ended handler remains the fallback when preloading fails.
      } finally {
        nativePreloadBusyRef.current = false;
      }
    }

    const handleEvent = (event: AriaAudioEvent) => {
      if (event.kind === "advanced") {
        if (!event.trackId || !playbackSessionRef.current.adoptAdvanced(event.trackId, event.requestId ?? "")) return;
        nativeAdvancedTrackRef.current = event.trackId;
        nativePreloadKeyRef.current = "";
        setActiveTrackId(event.trackId);
        resetPlaybackTime();
        setDurationSeconds(event.duration && event.duration > 0 ? event.duration : 0);
        playbackIntentRef.current = true;
        setPlaying(true);
        return;
      }
      if (!playbackSessionRef.current.accept(event)) return;
      if ((event.kind === "loaded" || event.kind === "progress") && event.audioFormat) {
        const quality: PlaybackQuality = {
          audioFormat: event.audioFormat,
          bitrate: positiveAudioValue(event.bitrate),
          sampleRate: positiveAudioValue(event.sampleRate),
        };
        setNativeQuality((previous) => previous && previous.requestId === event.requestId
          && previous.quality.audioFormat === quality.audioFormat && previous.quality.bitrate === quality.bitrate
          && previous.quality.sampleRate === quality.sampleRate ? previous
          : { trackId: activeTrack.id, requestId: event.requestId!, quality });
      }
      if (event.kind === "like") {
        toggleLikeTrack(activeTrack.id);
        return;
      }
      if (event.kind === "next" || event.kind === "previous") {
        relativeTrackRef.current(event.kind === "next" ? 1 : -1);
        return;
      }
      if (event.kind === "progress") {
        if (typeof event.position === "number") commitPlaybackTime(event.position);
        if (typeof event.duration === "number" && event.duration > 0) {
          setDurationSeconds((current) => (Math.abs(current - event.duration!) > 0.5 ? event.duration! : current));
          if (event.position !== undefined && event.duration - event.position <= 8) {
            void preloadNextNative(event.requestId ?? playbackSessionRef.current.requestId);
          }
        }
        return;
      }
      if (event.kind === "loaded") {
        if (typeof event.duration === "number" && event.duration > 0) setDurationSeconds(event.duration);
        if (typeof event.position === "number" && event.position > 0) commitPlaybackTime(event.position, true);
        return;
      }
      if (event.kind === "state") {
        if (event.playing && !playbackIntentRef.current) return;
        if (typeof event.playing === "boolean") setPlaying(event.playing);
        return;
      }
      if (event.kind === "ended") {
        handleTrackEndedRef.current();
        return;
      }
      if (event.kind === "error") {
        setNativeQuality(null);
        setPlaying(false);
        const failedTrackId = event.trackId || activeTrack.id;
        if (directMode && failedTrackId === activeTrack.id && directPlaybackRetryRef.current !== failedTrackId) {
          directPlaybackRetryRef.current = failedTrackId;
          const numericId = failedTrackId.replace(/^netease:/, "");
          applyTrackUpdate(failedTrackId, (track) => ({ ...track, streamUrl: `direct:${track.providerId ?? numericId}` }));
          window.setTimeout(() => {
            void chooseTrack(failedTrackId, [getActiveTrackRef.current()]);
          }, 120);
          return;
        }
        setPlayNotice("Playback failed. Tap play to retry.");
        window.setTimeout(() => setPlayNotice(null), 3000);
        return;
      }
    };
    nativeEventHandlerRef.current = handleEvent;
  });

  useEffect(() => {
    if (!nativeAudio) return;
    const subscription = AriaAudio.addListener("audioEvent", (event) => nativeEventHandlerRef.current(event));
    return () => {
      void Promise.resolve(subscription).then((handle) => handle.remove());
    };
  }, [nativeAudio]);

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
    audio.pause();
    audio.src = playbackStreamUrl(activeTrack, hifiEnabled, qualityLevel) ?? "";
    audio.load();
  }, [nativeAudio, activeTrack.id, activeTrack.streamUrl, hifiEnabled, qualityLevel, playRequest]);

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
    const timer = window.setTimeout(() => {
      void saveLibrary({
        daily: dailyTracks.map(compactTrack), roam: roamTracks.map(compactTrack),
        liked: neteaseLikedTracks.map(compactTrack), playlists: providerPlaylists,
        device: deviceTracks.map(compactTrack),
        likedComplete: cachedLibrary.likedComplete || netease.likedComplete,
      }).catch(() => setPlayNotice("曲库保存失败，请检查手机可用空间"));
    }, 250);
    return () => window.clearTimeout(timer);
  }, [dailyTracks, roamTracks, neteaseLikedTracks, providerPlaylists, deviceTracks, netease.likedComplete]);
  useEffect(() => {
    localStorage.setItem("aria-local-liked-times", JSON.stringify(localLikedTimes));
  }, [localLikedTimes]);
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

  // First paint: restore the cached account so the header shows the logged-in
  // user instantly instead of flashing "晚上好" for ~3 seconds.
  useEffect(() => {
    const cached = cachedDirectAccount();
    if (cached) netease.setNeteaseAccount(cached);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Seed the pools from the last successful refresh so the home screen is
  // never empty on relaunch. When the cache is fresh (same day) the boot
  // refresh is skipped entirely — no second-load flicker.
  const poolsSeededRef = useRef(Boolean(cachedLibrary.daily.length || cachedLibrary.roam.length || cachedLibrary.liked.length));
  useEffect(() => {
    // Hydrated before mounting; never overwrite the full database with the
    // legacy 200-track cache.
    if (poolsSeededRef.current) return;
    try {
      const raw = localStorage.getItem("aria-pools-cache");
      if (!raw) return;
      const parsed = JSON.parse(raw) as {
        daily?: Track[]; roam?: Track[]; liked?: Track[]; playlists?: ProviderPlaylist[]; savedAt?: number;
      };
      if (parsed.daily?.length) netease.setDailyTracks(parsed.daily);
      if (parsed.roam?.length) netease.setRoamTracks(parsed.roam);
      if (parsed.liked?.length) {
        netease.setNeteaseLikedTracks(parsed.liked);
        netease.setNeteaseLikedIds(Object.fromEntries(parsed.liked.map((track) => [track.id, true])));
      }
      if (parsed.playlists?.length) netease.setProviderPlaylists(parsed.playlists);
      // Cached content is immediately usable on launch. Refreshes remain
      // explicit so the home screen does not replace itself a few seconds
      // after it first appears.
      poolsSeededRef.current = Boolean(parsed.daily?.length || parsed.roam?.length || parsed.liked?.length);
    } catch {
      // cache is best-effort
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
    if (!poolsSeededRef.current) {
      initialRefreshRef.current().catch(() => undefined);
    } else if (!cachedLibrary.likedComplete) {
      netease.refreshLikedData().catch(() => setPlayNotice("喜欢列表同步失败，可在列表中重试"));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const likedLocalTracks = useMemo(
    () => newestLiked([...deviceTracks, ...localTracks].filter((track) => likedTrackIds[track.id]).map((track) => ({ ...track, likedAt: localLikedTimes[track.id] ?? track.likedAt }))),
    [localTracks, deviceTracks, likedTrackIds, localLikedTimes],
  );
  const likedNeteaseTracks = useMemo(
    () => newestLiked(neteaseLikedTracks.filter((track) => neteaseLikedIds[track.id] || track.likedAt)),
    [neteaseLikedTracks, neteaseLikedIds],
  );
  const historyTracks = useMemo(() => {
    const seen = new Set<string>();
    return [...playHistory].sort((a, b) => b.playedAt - a.playedAt).filter((entry) => {
      if (seen.has(entry.track.id)) return false;
      seen.add(entry.track.id); return true;
    }).map((entry) => entry.track);
  }, [playHistory]);

  const controls: MobileControls = {
    openCollection: setCollection,
    refreshLikedData: netease.refreshLikedData,
    refreshDailyData: netease.refreshDailyData,
    loadMoreRoam: () => refreshRoamData(true),
    directMode,
    deviceTracks,
    neteaseLikedIds,
    addDeviceTracks: (tracks: Track[]) => setDeviceTracks(tracks),
    activeTrack,
    activeTrackId,
    actualQuality: nativeQuality?.trackId === activeTrack.id && nativeQuality.requestId === playbackSessionRef.current.requestId ? nativeQuality.quality : null,
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
    setNeteaseAccount: netease.setNeteaseAccount,
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
    usbExclusive,
    setUsbExclusiveEnabled: async (enabled: boolean) => {
      const next = await AriaAudio.setUsbExclusiveEnabled({ enabled });
      setUsbExclusive(next);
    },
    openNowPlaying: () => setNowPlayingOpen(true),
    onLyricsCollapse: () => undefined,
    disconnect: onDisconnect,
    switchToDesktopMode: () => {
      disableDirectMode();
      onDisconnect();
    },
  };

  return (
      <div className="aria-app-shell flex h-full flex-col bg-[linear-gradient(170deg,#f7f8fb_0%,#eef1fa_60%,#f4eef8_100%)]">
      <audio ref={audioRef} preload="metadata" className="hidden" />

      {(["home", "library", "search", "settings"] as TabId[]).map((tab) => (
        <div key={tab} hidden={activeTab !== tab || Boolean(collection)} className="safe-top no-scrollbar min-h-0 flex-1 overflow-y-auto px-4 pb-2 pt-3">
          {tab === "home" && <HomeScreen {...controls} />}
          {tab === "library" && <LibraryScreen {...controls} />}
          {tab === "search" && <SearchScreen {...controls} />}
          {tab === "settings" && activeTab === "settings" && <SettingsScreen {...controls} />}
        </div>
      ))}
      {collection && <div className="safe-top no-scrollbar min-h-0 flex-1 overflow-y-auto px-4 pb-4 pt-3">
        <CollectionScreen key={collection} collection={collection} controls={controls} onBack={() => setCollection(null)} />
      </div>}

      <MiniPlayer {...controls} />
      <TabBar activeTab={activeTab} onSelect={(tab) => { setCollection(null); setActiveTab(tab); }} />

      <AnimatePresence>
        {nowPlayingOpen && <NowPlaying {...controls} onClose={() => setNowPlayingOpen(false)} />}
      </AnimatePresence>
      <AnimatePresence>
        {playNotice && (
          <motion.div
            initial={{ opacity: 0, y: -14 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="safe-top pointer-events-none fixed inset-x-0 top-0 z-40 flex justify-center pt-3"
          >
            <span className="rounded-full bg-neutral-950/90 px-4 py-2 text-xs text-white shadow-lg">{playNotice}</span>
          </motion.div>
        )}
      </AnimatePresence>
      <StatusBarIconsSync light={nowPlayingOpen} />
    </div>
  );
}

function targetLevelFor(_track: Track, hifi: boolean, level: QualityLevel): QualityLevel {
  // The catalog maxbr is not authoritative (it commonly reports 320K for
  // songs that a VIP account can stream losslessly). Let songUrlV1 decide.
  return hifi ? "jymaster" : level;
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
