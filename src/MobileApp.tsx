import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { type Track } from "@/data/music";
import { idleTrack } from "@/lib/trackMappers";
import { api, getApiConnection, type NeteaseAccountSummary, type ProviderPlaylist } from "@/lib/api";
import {
  createCachedQueueSnapshots,
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
import { commitPlaybackTime, getPlaybackTime, resetPlaybackTime, usePlaybackTime } from "@/lib/playbackClock";
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
import { AriaAudio, isNativeApp, setStatusBarIconsLight, type AriaAudioEvent, type EqualizerSettings, type UsbExclusiveSettings } from "./native/ariaAudio";
import {
  disableDirectMode,
  enableDirectMode,
  getDataMode,
  initDirectMode,
  isDirectCapable,
  registerDirectProvider,
  resolveDirectStreamUrl,
} from "./native/neteaseDirect";
import { applySafeAreasFromNative, downloadTrackFile, deleteDownloadedFile, requestUninterruptedPlayback } from "./native/ariaShell";
import { cachedDirectAccount } from "./native/neteaseDirect";
import { MiniPlayer, TabBar } from "./Chrome";
import { HomeScreen, LibraryScreen, SearchScreen, SettingsScreen } from "./screens";
import { NowPlaying } from "./NowPlaying";
import { PlaybackSession, updateMatchingTrack } from "./playbackSession";
import { buildNativeQueue, playbackStreamUrl, targetLevelFor, trackArtworkUrl } from "./playbackQueue";
import { hydrateLibrary, readLibrary, saveLibrary, compactTrack, newestLiked } from "./libraryStorage";
import { CollectionScreen } from "./Collections";
import { positiveAudioValue, type PlaybackQuality } from "./playbackQuality";
import { compactOfflineRecord, readOfflineRecords, writeOfflineRecords, type OfflineRecord } from "./offlineStorage";

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
  sleepTimerRemaining: number | null;
  setSleepTimer: (minutes: number | null) => void;
  playbackSpeed: number;
  setPlaybackSpeed: (speed: number) => void;
  equalizerSupported: boolean;
  equalizerPresets: string[];
  equalizerPreset: number;
  setEqualizerPreset: (preset: number) => void;
  offlineTracks: Track[];
  downloadingTrackIds: string[];
  downloadTrack: (trackId: string) => void;
  deleteOfflineTrack: (trackId: string) => void;
  shuffleEnabled: boolean;
  repeatMode: RepeatMode;
  hifiEnabled: boolean;
  qualityLevel: QualityLevel;
  qualitySwitching: boolean;
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
  playShuffledTracks: (tracks: Track[]) => void;
  togglePlayback: () => void;
  playNext: () => void;
  playPrevious: () => void;
  clearQueue: () => void;
  reorderQueue: (trackIds: string[]) => void;
  removeFromQueue: (trackId: string) => void;
  playNextInQueue: (trackId: string) => void;
  seekTo: (time: number) => void;
  setVolume: (volume: number) => void;
  toggleShuffle: () => void;
  toggleRepeatMode: () => void;
  toggleLikeTrack: (trackId: string) => void;
  openPlaylist: (playlist: ProviderPlaylist) => Promise<void>;
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
  const [playbackSpeed, setPlaybackSpeedState] = useState(() => {
    try {
      const value = Number(localStorage.getItem("aria-playback-speed") || 1);
      return value >= 0.5 && value <= 3 ? value : 1;
    } catch {
      return 1;
    }
  });
  const [equalizerSupported, setEqualizerSupported] = useState(false);
  const [equalizerPresets, setEqualizerPresets] = useState<string[]>([]);
  const [equalizerPreset, setEqualizerPresetState] = useState(() => {
    try {
      const value = Number(localStorage.getItem("aria-equalizer-preset"));
      return Number.isFinite(value) ? Math.round(value) : -1;
    } catch {
      return -1;
    }
  });
  const [sleepTimerEndsAt, setSleepTimerEndsAt] = useState<number | null>(null);
  const [sleepTimerRemaining, setSleepTimerRemaining] = useState<number | null>(null);
  const [shuffleEnabled, setShuffleEnabled] = useState(cachedState.shuffleEnabled ?? false);
  const [repeatMode, setRepeatMode] = useState<RepeatMode>(cachedState.repeatMode ?? "all");
  // Direct mode default: a level free accounts can actually stream (HiFi
  // stays opt-in — lossless/hires tiers null out for free accounts).
  const [hifiEnabled, setHifiEnabledState] = useState(() => readCachedAudioSettings().hifiEnabled ?? false);
  const [qualityLevel, setQualityLevelState] = useState<QualityLevel>(cachedState.qualityLevel ?? (isNativeApp() ? "exhigh" : "lossless"));
  const [qualitySwitching, setQualitySwitching] = useState(false);
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
  // Restored queue snapshots are kept as a live fallback pool. Without this,
  // a track that was queued but never played (and whose source playlist is not
  // loaded yet) could not receive a resolved direct URL or updated metadata.
  const [restoredQueueTracks, setRestoredQueueTracks] = useState<Track[]>(cachedState.playQueueSnapshots ?? []);
  const [offlineRecords, setOfflineRecords] = useState<OfflineRecord[]>(readOfflineRecords);
  const [downloadingTrackIds, setDownloadingTrackIds] = useState<string[]>([]);
  const offlineTracks = useMemo(() => offlineRecords.map((record) => record.track), [offlineRecords]);
  const [localLikedTimes, setLocalLikedTimes] = useState<Record<string, number>>(() => {
    try { return JSON.parse(localStorage.getItem("aria-local-liked-times") || "{}"); } catch { return {}; }
  });

  const pendingSeekRef = useRef(0);
  const reloadPositionRef = useRef(0);
  const qualitySwitchTimerRef = useRef(0);
  const qualitySequenceRef = useRef(0);
  const handleTrackEndedRef = useRef<() => void>(() => undefined);
  const playbackSessionRef = useRef(new PlaybackSession());
  const resolvedQualityRef = useRef<{ trackId: string; url: string; quality: PlaybackQuality } | null>(null);
  const [nativeQuality, setNativeQuality] = useState<{ trackId: string; requestId: string; quality: PlaybackQuality } | null>(null);
  const nativeEventHandlerRef = useRef<(event: AriaAudioEvent) => void>(() => undefined);
  const relativeTrackRef = useRef<(direction: 1 | -1) => void>(() => undefined);
  const nativeAdvancedTrackRef = useRef<string | null>(null);
  const getActiveTrackRef = useRef<() => Track>(() => idleTrack);
  const trackByIdRef = useRef<Map<string, Track>>(new Map());
  const activeTrackIdRef = useRef(activeTrackId);
  const nativeSessionActiveRef = useRef(false);
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
    // History snapshots go first so a fresh instance from a live pool wins
    // when both contain the same id (history may hold an expired stream URL).
    () => [...playHistory.map((entry) => entry.track), ...restoredQueueTracks, ...discoveryAllTracks, ...artistPoolTracks, ...deviceTracks, ...offlineTracks],
    [discoveryAllTracks, artistPoolTracks, deviceTracks, playHistory, restoredQueueTracks, offlineTracks],
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
    const live = trackById.get(activeTrackId);
    const cachedActive = cachedState.activeTrackSnapshot?.id === activeTrackId
      ? cachedState.activeTrackSnapshot
      : undefined;
    const cachedQueue = cachedState.playQueueSnapshots?.find((track) => track.id === activeTrackId);
    const candidates = [live, cachedActive, cachedQueue];
    return candidates.find((track) => Boolean(track?.streamUrl)) ?? live ?? cachedActive ?? cachedQueue ?? idleTrack;
  }, [activeTrackId, trackById, cachedState.activeTrackSnapshot, cachedState.playQueueSnapshots]);

  useEffect(() => {
    getActiveTrackRef.current = () => activeTrack;
    activeTrackIdRef.current = activeTrack.id;
    trackByIdRef.current = trackById;
  }, [activeTrack, trackById]);

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
      setRestoredQueueTracks(applyTo);
      setOfflineRecords((current) =>
        current.map((record) =>
          record.track.id === trackId ? { ...record, track: updateTrack(record.track) } : record,
        ),
      );
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

  const chooseSequenceRef = useRef(0);

  async function chooseTrack(trackId: string, preferredQueue?: Track[], options?: { shuffle?: boolean }) {
    playbackIntentRef.current = true;
    if (nativeAudio && !batteryPromptShownRef.current) {
      batteryPromptShownRef.current = true;
      void requestUninterruptedPlayback();
    }
    const chooseSequence = ++chooseSequenceRef.current;
    // A pending live quality change belongs to the previous selection.
    qualitySequenceRef.current += 1;
    const queue = resolveQueueForTrack(trackId, preferredQueue);
    const preferredTarget = preferredQueue?.find((track) => track.id === trackId && track.streamUrl);
    let targetTrack = preferredTarget ?? queue.find((track) => track.id === trackId) ?? trackById.get(trackId);
    if (!targetTrack?.streamUrl) return;
    if (!directMode && targetTrack.streamUrl.startsWith("direct:")) {
      setPlayNotice("该歌曲链接已失效，请刷新曲库后重试");
      window.setTimeout(() => setPlayNotice(null), 2600);
      return;
    }

    // Direct mode: resolve the CDN url at click time — the load layer only
    // ever sees real urls, so switching is deterministic.
    if (directMode && targetTrack.source === "netease" && !targetTrack.offline) {
      setPlayNotice("正在获取播放链接…");
      try {
        const meta = await resolveDirectStreamUrl(
          trackId,
          targetLevelFor(hifiEnabled, qualityLevel),
        );
        // A newer tap owns the screen now; never let a slow response pull the
        // UI back to the previous track.
        if (chooseSequence !== chooseSequenceRef.current) return;
        if (!meta?.url) {
          setPlayNotice(`「${targetTrack.title}」暂时无法播放`);
          window.setTimeout(() => setPlayNotice(null), 2600);
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
      } catch {
        if (chooseSequence !== chooseSequenceRef.current) return;
        setPlayNotice(`「${targetTrack.title}」暂时无法播放`);
        window.setTimeout(() => setPlayNotice(null), 2600);
        return;
      }
    }

    const playableIds = materializeQueueIds(
      queue.length ? queue : [targetTrack],
      trackId,
      options?.shuffle ?? shuffleEnabled,
    );
    if (playableIds.length) setPlayQueueIds(playableIds);
    if (options?.shuffle) setShuffleEnabled(true);
    pendingSeekRef.current = 0;
    reloadPositionRef.current = 0;
    setActiveTrackId(trackId);
    setPlayRequest((value) => value + 1);
    resetPlaybackTime();
    setDurationSeconds(0);
    setPlaying(true);
  }

  function playShuffledTracks(tracks: Track[]) {
    const playable = playableTracks(tracks);
    if (!playable.length) return;
    const random = playable[Math.floor(Math.random() * playable.length)];
    void chooseTrack(random.id, tracks, { shuffle: true });
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
    const safeIndex = currentIndex >= 0 ? currentIndex : direction === 1 ? -1 : 0;
    // Some restored/desktop entries can lack a stream URL. Skip over them
    // instead of silently ignoring the next-button press.
    let nextTrack: Track | undefined;
    for (let offset = 1; offset <= queue.length; offset += 1) {
      const candidate = queue[(safeIndex + direction * offset + queue.length * 2) % queue.length];
      if (candidate?.streamUrl && (directMode || !candidate.streamUrl.startsWith("direct:"))) {
        nextTrack = candidate;
        break;
      }
    }
    if (!nextTrack) return;
    if (directMode && nextTrack.source === "netease" && !nextTrack.offline) {
      // Sentinel: let chooseTrack resolve the stream, then switch.
      void chooseTrack(nextTrack.id, queue);
      return;
    }
    if (nextTrack.id === activeTrack.id) {
      restartActiveTrack();
      return;
    }
    reloadPositionRef.current = 0;
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
    reloadPositionRef.current = 0;
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
         void AriaAudio.getState()
           .then((state) => {
             if (state.active) return;
             nativeSessionActiveRef.current = false;
             reloadPositionRef.current = Math.max(nextTime, 0.001);
             setPlayRequest((value) => value + 1);
           })
           .catch(() => {
             reloadPositionRef.current = Math.max(nextTime, 0.001);
             setPlayRequest((value) => value + 1);
           });
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
        if (!directMode) {
          setPlayNotice("该歌曲链接已失效，请刷新曲库后重试");
          window.setTimeout(() => setPlayNotice(null), 2600);
          return;
        }
        // Boot-restored sentinel: resolve, persist onto the track, then play.
        setPlayNotice("正在获取播放链接…");
        void (async () => {
          const meta = await resolveDirectStreamUrl(
            activeTrack.id,
            targetLevelFor(hifiEnabled, qualityLevel),
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
          setPlayNotice(null);
           playbackIntentRef.current = true;
           setPlaying(true);
        })();
        return;
      }
      const nextPlaying = !playing;
      playbackIntentRef.current = nextPlaying;
      setPlaying(nextPlaying);
      if (nativeAudio && nextPlaying) {
        // The service can be killed by the system while the WebView stays
        // alive. Starting from a stale session then appears to do nothing;
        // re-issue the load when no native player exists any more.
        void AriaAudio.getState()
          .then((state) => {
            if (state.active) return;
            nativeSessionActiveRef.current = false;
            reloadPositionRef.current = getPlaybackTime();
            setPlayRequest((request) => request + 1);
          })
          .catch(() => {
            reloadPositionRef.current = getPlaybackTime();
            setPlayRequest((request) => request + 1);
          });
      }
      return;
    }
    const fallbackTrack = playableTracks(playQueueTracks)[0] ?? playableTracks(allTracks)[0];
    if (fallbackTrack) chooseTrack(fallbackTrack.id);
  }

  async function applyAudioQuality(nextLevel: QualityLevel, nextHifi: boolean) {
    if (nextLevel === qualityLevel && nextHifi === hifiEnabled) return;
    const previous = { level: qualityLevel, hifi: hifiEnabled };
    const trackId = activeTrack.id;
    const switchable =
      activeTrack.source === "netease" &&
      !activeTrack.offline &&
      Boolean(activeTrack.streamUrl) &&
      !activeTrack.streamUrl?.startsWith("direct:");

    // Preference changes still persist for the next track even when there is
    // nothing loaded right now.
    if (!switchable) {
      setQualityLevelState(nextLevel);
      setHifiEnabledState(nextHifi);
      return;
    }

    const position = getPlaybackTime();
    const sequence = ++qualitySequenceRef.current;
    markQualitySwitching();
    setQualityLevelState(nextLevel);
    setHifiEnabledState(nextHifi);

    if (directMode) {
      // Direct mode resolves a fresh CDN url for the new tier. The native
      // service must receive that url before it is asked to reload.
      try {
        const meta = await resolveDirectStreamUrl(trackId, targetLevelFor(nextHifi, nextLevel));
        if (sequence !== qualitySequenceRef.current || activeTrackIdRef.current !== trackId) return;
        if (!meta?.url) {
          setQualityLevelState(previous.level);
          setHifiEnabledState(previous.hifi);
          finishQualitySwitching();
          setPlayNotice("该音质暂时不可用，已保留当前音质");
          window.setTimeout(() => setPlayNotice(null), 2600);
          return;
        }
        resolvedQualityRef.current = {
          trackId,
          url: meta.url,
          quality: { bitrate: meta.bitrate, sampleRate: meta.sampleRate, audioFormat: meta.audioFormat },
        };
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
      } catch {
        if (sequence !== qualitySequenceRef.current || activeTrackIdRef.current !== trackId) return;
        setQualityLevelState(previous.level);
        setHifiEnabledState(previous.hifi);
        finishQualitySwitching();
        setPlayNotice("音质切换失败，请检查网络后重试");
        window.setTimeout(() => setPlayNotice(null), 2600);
        return;
      }
    }

    if (sequence !== qualitySequenceRef.current) return;
    // Resume from the exact playhead after the source is swapped. The native
    // service reads reloadPositionRef; the HTML5 fallback seeks on metadata.
    reloadPositionRef.current = Math.max(position, 0.001);
    pendingSeekRef.current = position;
    setPlayRequest((value) => value + 1);
  }

  function changeQualityLevel(level: QualityLevel) {
    void applyAudioQuality(level, false);
  }

  function changeHifiPreference(enabled: boolean) {
    void applyAudioQuality(qualityLevel, enabled);
  }

  function setSleepTimer(minutes: number | null) {
    const next = minutes && minutes > 0 ? Math.round(minutes) : null;
    setSleepTimerEndsAt(next ? Date.now() + next * 60_000 : null);
    setSleepTimerRemaining(next ? next * 60 : null);
    if (nativeAudio) {
      void AriaAudio.setSleepTimer({ minutes: next ?? 0 }).catch(() => undefined);
    }
  }

  function setPlaybackSpeed(speed: number) {
    const next = Math.max(0.5, Math.min(3, Number.isFinite(speed) ? speed : 1));
    setPlaybackSpeedState(next);
    try {
      localStorage.setItem("aria-playback-speed", String(next));
    } catch {
      // best effort
    }
    if (nativeAudio) {
      void AriaAudio.setPlaybackSpeed({ speed: next }).catch(() => undefined);
    } else if (audioRef.current) {
      audioRef.current.playbackRate = next;
    }
  }

  function setEqualizerPreset(preset: number) {
    const next = Number.isFinite(preset) ? Math.round(preset) : -1;
    setEqualizerPresetState(next);
    try {
      localStorage.setItem("aria-equalizer-preset", String(next));
    } catch {
      // best effort
    }
    if (nativeAudio) {
      void AriaAudio.setEqualizerPreset({ preset: next }).catch(() => undefined);
    }
  }

  async function refreshEqualizer() {
    if (!nativeAudio) return;
    try {
      const settings: EqualizerSettings = await AriaAudio.getEqualizerSettings();
      setEqualizerSupported(settings.supported);
      setEqualizerPresets(settings.presets);
      if (settings.supported && settings.current >= 0) {
        setEqualizerPresetState(settings.current);
      }
    } catch {
      // Equalizer support is device-dependent.
    }
  }

  async function downloadTrack(trackId: string) {
    if (!nativeAudio) {
      setPlayNotice("离线下载仅在 Android App 中可用");
      window.setTimeout(() => setPlayNotice(null), 2600);
      return;
    }
    if (downloadingTrackIds.includes(trackId)) return;
    if (offlineRecords.some((record) => record.track.id === trackId)) {
      setPlayNotice("这首歌已经在离线音乐里了");
      window.setTimeout(() => setPlayNotice(null), 2200);
      return;
    }
    const track = trackById.get(trackId) ?? allTracks.find((item) => item.id === trackId);
    if (!track) return;

    let url: string | undefined;
    let audioFormat = track.audioFormat ?? null;
    if (track.source === "netease") {
      if (directMode) {
        const meta = await resolveDirectStreamUrl(trackId, targetLevelFor(hifiEnabled, qualityLevel));
        url = meta?.url ?? undefined;
        audioFormat = meta?.audioFormat ?? audioFormat;
      } else {
        url = playbackStreamUrl(track, streamOptions);
      }
    } else if (track.streamUrl?.startsWith("http")) {
      url = track.streamUrl;
    }
    if (!url || url.startsWith("direct:")) {
      setPlayNotice(track.source === "local" ? "手机本地文件无需下载" : "暂时无法获取下载地址");
      window.setTimeout(() => setPlayNotice(null), 2600);
      return;
    }

    setDownloadingTrackIds((current) => current.includes(trackId) ? current : [...current, trackId]);
    setPlayNotice(`正在下载「${track.title}」…`);
    try {
      const result = await downloadTrackFile({
        trackId,
        url,
        extension: offlineExtension(audioFormat, url),
      });
      if (!result.ok || !result.fileUrl || !result.path) {
        setPlayNotice(result.message || "下载失败，请稍后重试");
        window.setTimeout(() => setPlayNotice(null), 2800);
        return;
      }
      const offlineTrack: Track = {
        ...track,
        streamUrl: result.fileUrl,
        offline: true,
        audioFormat,
      };
      setOfflineRecords((current) => [
        {
          track: offlineTrack,
          path: result.path as string,
          size: result.size ?? 0,
          downloadedAt: Date.now(),
        },
        ...current.filter((record) => record.track.id !== trackId),
      ]);
      setPlayNotice("已下载到离线音乐");
      window.setTimeout(() => setPlayNotice(null), 2200);
    } finally {
      setDownloadingTrackIds((current) => current.filter((id) => id !== trackId));
    }
  }

  async function deleteOfflineTrack(trackId: string) {
    const record = offlineRecords.find((item) => item.track.id === trackId);
    if (!record) return;
    const removed = await deleteDownloadedFile(record.path);
    setOfflineRecords((current) => current.filter((item) => item.track.id !== trackId));
    setPlayNotice(removed ? "已删除离线文件" : "已从离线列表移除");
    window.setTimeout(() => setPlayNotice(null), 2200);
  }

  function toggleShuffleQueue() {
    const nextShuffleEnabled = !shuffleEnabled;
    setShuffleEnabled(nextShuffleEnabled);
    const queue = resolveQueueForTrack(activeTrack.id);
    const playableIds = materializeQueueIds(queue.length ? queue : playQueueTracks, activeTrack.id, nextShuffleEnabled);
    if (playableIds.length) setPlayQueueIds(playableIds);
  }

  function toggleLikeTrack(trackId: string) {
    const track = allTracks.find((item) => item.id === trackId)
      ?? (activeTrack.id === trackId ? activeTrack : undefined);
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
    setLocalLikedTimes((current) => {
      const next = { ...current };
      if (likedTrackIds[trackId]) delete next[trackId];
      else next[trackId] = Date.now();
      return next;
    });
  }

  const currentTime = usePlaybackTime();
  const nativeAudio = useMemo(() => isNativeApp(), []);
  const [nativeStateReady, setNativeStateReady] = useState(!nativeAudio);
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

  // Before React starts driving play/pause, learn whether the foreground
  // service is already playing. Without this gate the initial
  // `setPaused({paused: true})` from restored UI state silences a healthy
  // background session every time the app is reopened.
  useEffect(() => {
    if (!nativeAudio) return;
    let cancelled = false;
    const fallback = window.setTimeout(() => {
      if (!cancelled) setNativeStateReady(true);
    }, 1500);
    void AriaAudio.getState()
      .then((state) => {
        if (cancelled) return;
        if (state.active && state.trackId) {
          nativeSessionActiveRef.current = true;
          const track = trackByIdRef.current.get(state.trackId);
          if (track) {
            playbackSessionRef.current.resume(state.trackId, state.requestId ?? "");
            nativeAdvancedTrackRef.current = state.trackId;
            setActiveTrackId(state.trackId);
            if (typeof state.position === "number") commitPlaybackTime(state.position, true);
            if (typeof state.duration === "number" && state.duration > 0) setDurationSeconds(state.duration);
            playbackIntentRef.current = true;
            setPlaying(!state.paused);
          }
        }
        window.clearTimeout(fallback);
        setNativeStateReady(true);
      })
      .catch(() => {
        window.clearTimeout(fallback);
        if (!cancelled) setNativeStateReady(true);
      });
    return () => {
      cancelled = true;
      window.clearTimeout(fallback);
    };
  }, [nativeAudio]);

  const streamOptions = useMemo(
    () => ({ hifiEnabled, level: qualityLevel, directMode }),
    [hifiEnabled, qualityLevel, directMode],
  );
  const nativeStreamUrl = useMemo(
    () => playbackStreamUrl(activeTrack, streamOptions),
    [activeTrack, streamOptions],
  );
  const webStreamUrl = useMemo(
    () => playbackStreamUrl(activeTrack, streamOptions),
    [activeTrack, streamOptions],
  );

  // Rapid double-taps can re-run the load effect for the same track; each run
  // is a startForegroundService round-trip. Dedupe identical loads in a short
  // window (the requestId changes every run, so it cannot be part of the key).
  const lastNativeLoadRef = useRef<{ key: string; at: number }>({ key: "", at: 0 });
  const directPlaybackRetryRef = useRef<string | null>(null);
  const [playNotice, setPlayNotice] = useState<string | null>(null);

  const markQualitySwitching = useCallback(() => {
    window.clearTimeout(qualitySwitchTimerRef.current);
    setQualitySwitching(true);
    qualitySwitchTimerRef.current = window.setTimeout(() => setQualitySwitching(false), 8000);
  }, []);

  const finishQualitySwitching = useCallback(() => {
    window.clearTimeout(qualitySwitchTimerRef.current);
    setQualitySwitching(false);
  }, []);

  useEffect(() => () => {
    window.clearTimeout(qualitySwitchTimerRef.current);
  }, []);

  useEffect(() => {
    if (sleepTimerEndsAt == null) {
      setSleepTimerRemaining(null);
      return;
    }
    const tick = () => {
      const remaining = Math.max(0, Math.ceil((sleepTimerEndsAt - Date.now()) / 1000));
      setSleepTimerRemaining((current) => (current === remaining ? current : remaining));
      if (remaining > 0) return;
      setSleepTimerEndsAt(null);
      playbackIntentRef.current = false;
      setPlaying(false);
      setPlayNotice("睡眠定时已结束，播放已暂停");
      window.setTimeout(() => setPlayNotice(null), 2600);
    };
    tick();
    const timer = window.setInterval(tick, 1000);
    return () => window.clearInterval(timer);
  }, [sleepTimerEndsAt]);

  useEffect(() => {
    if (!nativeAudio || !nativeStateReady) return;
    if (!nativeStreamUrl) {
      setNativeQuality(null);
      resolvedQualityRef.current = null;
      reloadPositionRef.current = 0;
      pendingSeekRef.current = 0;
      if (!nativeSessionActiveRef.current) void AriaAudio.stop().catch(() => undefined);
      return;
    }
    // Media3 can move to a preloaded item without a second load request. The
    // transition handler marks that render so this effect does not tear down
    // the already-playing item and turn a gapless change into a rebuffer.
    if (nativeAdvancedTrackRef.current === activeTrack.id) {
      nativeAdvancedTrackRef.current = null;
      reloadPositionRef.current = 0;
      pendingSeekRef.current = 0;
      return;
    }
    // Do not start a foreground service just to preload a paused, restored
    // track on app launch. A quality switch while paused intentionally asks
    // for a reload (reloadPositionRef > 0).
    if (!playing && reloadPositionRef.current <= 0) return;
    setNativeQuality(null);
    const loadKey = `${activeTrack.id}|${nativeStreamUrl}|${playRequest}`;
    if (loadKey === lastNativeLoadRef.current.key && Date.now() - lastNativeLoadRef.current.at < 500) return;
    lastNativeLoadRef.current = { key: loadKey, at: Date.now() };
    // Boot-restored tracks still carry the direct: sentinel — they stay
    // unloaded until the user taps play (which resolves first).
    if (nativeStreamUrl.startsWith("direct:")) {
      reloadPositionRef.current = 0;
      pendingSeekRef.current = 0;
      return;
    }
    const requestId = playbackSessionRef.current.begin(activeTrack.id);
    const resumeAt = reloadPositionRef.current;
    reloadPositionRef.current = 0;
    if (resumeAt <= 0) {
      resetPlaybackTime();
      setDurationSeconds(0);
    }
    const queueTracks = playQueueTracks.length ? playQueueTracks : playableTracks(allTracks);
    const queue = buildNativeQueue(queueTracks, {
      ...streamOptions,
      activeTrack,
    });
    // Streams are resolved at click time (chooseTrack) — this effect only
    // forwards an already-real url plus the queue the native service owns.
    void (playbackSessionRef.current.isCurrent(requestId) ? AriaAudio.load({
      url: nativeStreamUrl,
      requestId,
      trackId: activeTrack.id,
      title: activeTrack.title,
      artist: activeTrack.artist,
      album: activeTrack.album,
      artworkUrl: trackArtworkUrl(activeTrack),
      position: resumeAt > 0 ? resumeAt : undefined,
      paused: !playing,
      volume: Math.min(1, Math.max(0, volume / 100)),
      speed: playbackSpeed,
      equalizerPreset,
      repeatMode,
      queue,
    }) : Promise.resolve())
      .catch(() => {
        finishQualitySwitching();
        setPlaying(false);
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nativeAudio, nativeStateReady, activeTrack.id, nativeStreamUrl, playRequest]);

  useEffect(() => {
    if (!nativeAudio || !nativeStateReady) return;
    void AriaAudio.setPaused({ paused: !playing }).catch(() => undefined);
  }, [nativeAudio, nativeStateReady, playing]);

  useEffect(() => {
    if (!nativeAudio || !nativeStateReady) return;
    void AriaAudio.setRepeatMode({ repeatMode }).catch(() => undefined);
  }, [nativeAudio, nativeStateReady, repeatMode]);

  useEffect(() => {
    if (!nativeAudio || !nativeStateReady) return;
    void AriaAudio.setPlaybackSpeed({ speed: playbackSpeed }).catch(() => undefined);
  }, [nativeAudio, nativeStateReady, playbackSpeed]);

  useEffect(() => {
    if (!nativeAudio) return;
    const timer = window.setTimeout(() => void refreshEqualizer(), 1400);
    return () => window.clearTimeout(timer);
  }, [nativeAudio, nativeStateReady]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio || nativeAudio) return;
    audio.playbackRate = playbackSpeed;
  }, [nativeAudio, playbackSpeed, activeTrack.id]);

  useEffect(() => {
    if (!nativeAudio) return;

    const handleEvent = (event: AriaAudioEvent) => {
      if (event.kind === "advanced") {
        if (!event.trackId || !playbackSessionRef.current.adoptAdvanced(event.trackId, event.requestId ?? "")) return;
        // Only suppress the load effect when the native item differs from the
        // track React has rendered. Setting this for a same-id repeat leaves a
        // stale marker that would swallow the next real load request.
        nativeAdvancedTrackRef.current = event.trackId !== activeTrackIdRef.current ? event.trackId : null;
        setActiveTrackId(event.trackId);
        if (typeof event.position === "number") commitPlaybackTime(event.position, true);
        else resetPlaybackTime();
        setDurationSeconds(event.duration && event.duration > 0 ? event.duration : 0);
        playbackIntentRef.current = true;
        setPlaying(true);
        return;
      }
      if (!playbackSessionRef.current.accept(event)) return;
      if ((event.kind === "loaded" || event.kind === "progress") && event.audioFormat) {
        const audioFormat = event.audioFormat;
        const trackId = event.trackId || activeTrackIdRef.current;
        setNativeQuality((previous) => {
          const prior = previous && previous.requestId === event.requestId
            && previous.trackId === trackId
            && previous.quality.audioFormat === audioFormat
            ? previous
            : null;
          const quality: PlaybackQuality = {
            audioFormat,
            // Progress events can arrive without a measured bitrate right
            // after the WebView resumes. Keep the last known value instead of
            // blanking the quality row.
            bitrate: positiveAudioValue(event.bitrate) ?? prior?.quality.bitrate ?? null,
            sampleRate: positiveAudioValue(event.sampleRate) ?? prior?.quality.sampleRate ?? null,
          };
          if (prior && prior.quality.bitrate === quality.bitrate && prior.quality.sampleRate === quality.sampleRate) {
            return prior;
          }
          return { trackId, requestId: event.requestId!, quality };
        });
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
        }
        return;
      }
      if (event.kind === "loaded") {
        finishQualitySwitching();
        directPlaybackRetryRef.current = null;
        if (typeof event.duration === "number" && event.duration > 0) setDurationSeconds(event.duration);
        if (typeof event.position === "number" && event.position > 0) commitPlaybackTime(event.position, true);
        void refreshEqualizer();
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
        resolvedQualityRef.current = null;
        finishQualitySwitching();
        setPlaying(false);
        const failedTrackId = event.trackId || activeTrack.id;
        if (directMode && failedTrackId === activeTrack.id && directPlaybackRetryRef.current !== failedTrackId) {
          directPlaybackRetryRef.current = failedTrackId;
          const numericId = failedTrackId.replace(/^netease:/, "");
          applyTrackUpdate(failedTrackId, (track) => ({ ...track, streamUrl: `direct:${track.providerId ?? numericId}` }));
          window.setTimeout(() => {
            // Reuse the original queue; passing a one-track queue here used to
            // wipe the rest of the playlist after a stream failure.
            void chooseTrack(failedTrackId);
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

  // The native service keeps playing while the WebView is frozen. When the
  // user returns, adopt whatever item the service actually reached instead of
  // showing the track React last saw.
  useEffect(() => {
    if (!nativeAudio) return;
    let cancelled = false;

    const syncFromNative = async () => {
      try {
        const state = await AriaAudio.getState();
        if (cancelled) return;
        nativeSessionActiveRef.current = state.active;
        if (!state.active) return;
        const track = state.trackId ? trackByIdRef.current.get(state.trackId) : undefined;
        if (state.trackId && state.trackId !== activeTrackIdRef.current) {
          if (!track) return;
          playbackSessionRef.current.resume(state.trackId, state.requestId ?? "");
          nativeAdvancedTrackRef.current = state.trackId;
          setActiveTrackId(state.trackId);
        } else if (state.trackId) {
          playbackSessionRef.current.resume(state.trackId, state.requestId ?? "");
        }
        if (typeof state.position === "number") commitPlaybackTime(state.position, true);
        if (typeof state.duration === "number" && state.duration > 0) setDurationSeconds(state.duration);
        playbackIntentRef.current = true;
        setPlaying(!state.paused);
      } catch {
        // Service may be gone after a process restart; the next play recreates it.
      }
    };

    let handle: { remove(): void } | null = null;
    void CapacitorApp.addListener("resume", () => void syncFromNative()).then((handleRef) => {
      handle = handleRef;
    });
    const onVisible = () => {
      if (document.visibilityState === "visible") void syncFromNative();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      cancelled = true;
      handle?.remove();
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [nativeAudio]);


  useEffect(() => {
    const audio = audioRef.current;
    if (!audio || nativeAudio) return;
    if (!webStreamUrl) {
      audio.removeAttribute("src");
      audio.pause();
      return;
    }
    if (pendingSeekRef.current <= 0) {
      resetPlaybackTime();
      setDurationSeconds(0);
    }
    audio.pause();
    audio.src = webStreamUrl;
    audio.load();
    // Swapping the source (for example when the quality is changed live) must
    // not turn a playing track into silence.
    if (playing) audio.play().catch(() => setPlaying(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nativeAudio, activeTrack.id, webStreamUrl, playRequest]);

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
      finishQualitySwitching();
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
    if (!playing || !activeTrack.streamUrl || activeTrack.id === idleTrack.id) return;
    if (activeTrackStartedRef.current === activeTrack.id) return;
    activeTrackStartedRef.current = activeTrack.id;
    setPlayHistory((current) => {
      const previous = current[0];
      const existing = current.find((entry) => entry.track.id === activeTrack.id);
      const rest = previous?.track.id === activeTrack.id ? current.slice(1) : current.filter((entry) => entry.track.id !== activeTrack.id);
      return [{
        track: createPlayerCacheSnapshot(activeTrack),
        playedAt: Date.now(),
        count: (existing?.count ?? 0) + 1,
      }, ...rest].slice(0, 300);
    });
    setPlayCounts((current) => ({ ...current, [activeTrack.id]: (current[activeTrack.id] ?? 0) + 1 }));
    const warmCandidates = playQueueTracks.slice(0, 12);
    if (warmCandidates.length) void warmNeteaseTrackCache(warmCandidates);
  }, [activeTrack, playing, playQueueTracks, warmNeteaseTrackCache]);

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

  const cachedActiveTrackSnapshot = useMemo(
    () => activeTrack.id === idleTrack.id ? undefined : createCachedQueueSnapshots([compactTrack(activeTrack)], 1)[0],
    [activeTrack],
  );
  const cachedQueueSnapshots = useMemo(
    () => createCachedQueueSnapshots(playQueueTracks.map(compactTrack)),
    [playQueueTracks],
  );

  useEffect(() => {
    writeCachedPlayerState({
      activeTrackId: activeTrack.id === idleTrack.id ? undefined : activeTrack.id,
      activeTrackSnapshot: cachedActiveTrackSnapshot,
      playQueueIds: playQueueIds.slice(0, 1200),
      playQueueSnapshots: cachedQueueSnapshots,
      volume,
      qualityLevel,
      shuffleEnabled,
      repeatMode,
      playing: false,
    });
  }, [activeTrack.id, cachedActiveTrackSnapshot, cachedQueueSnapshots, playQueueIds, volume, qualityLevel, shuffleEnabled, repeatMode]);

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
    writeOfflineRecords(offlineRecords.map(compactOfflineRecord));
  }, [offlineRecords]);
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
    // Always refresh in the background: cached pools render immediately, and
    // stale daily/roam data from a previous day must not persist for weeks.
    const refreshTimer = window.setTimeout(() => {
      initialRefreshRef.current().catch(() => undefined);
    }, 600);
    // eslint-disable-next-line react-hooks/exhaustive-deps
    return () => window.clearTimeout(refreshTimer);
  }, []);

  const likedLocalTracks = useMemo(
    () => newestLiked([...deviceTracks, ...localTracks].filter((track) => likedTrackIds[track.id]).map((track) => ({ ...track, likedAt: localLikedTimes[track.id] ?? track.likedAt }))),
    [localTracks, deviceTracks, likedTrackIds, localLikedTimes],
  );
  const likedNeteaseTracks = useMemo(
    () => newestLiked(neteaseLikedTracks.filter((track) => Boolean(neteaseLikedIds[track.id]))),
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
    actualQuality: nativeQuality?.trackId === activeTrack.id && nativeQuality.requestId === playbackSessionRef.current.requestId
      ? nativeQuality.quality
      : resolvedQualityRef.current?.trackId === activeTrack.id
        ? resolvedQualityRef.current.quality
        : null,
    playing,
    currentTime,
    durationSeconds,
    volume,
    sleepTimerRemaining,
    setSleepTimer,
    playbackSpeed,
    setPlaybackSpeed,
    equalizerSupported,
    equalizerPresets,
    equalizerPreset,
    setEqualizerPreset,
    offlineTracks,
    downloadingTrackIds,
    downloadTrack,
    deleteOfflineTrack,
    shuffleEnabled,
    repeatMode,
    hifiEnabled,
    qualityLevel,
    qualitySwitching,
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
    playShuffledTracks,
    togglePlayback,
    playNext: () => pickRelativeTrack(1),
    playPrevious: () => pickRelativeTrack(-1),
    clearQueue: () => setPlayQueueIds(activeTrack.id === idleTrack.id ? [] : [activeTrack.id]),
    reorderQueue: (trackIds: string[]) => setPlayQueueIds((current) => {
      const visible = new Set(trackIds);
      const rest = current.filter((id) => !visible.has(id));
      return [...trackIds, ...rest];
    }),
    removeFromQueue: (trackId: string) => {
      if (trackId === activeTrack.id) return;
      setPlayQueueIds((current) => current.filter((id) => id !== trackId));
    },
    playNextInQueue: (trackId: string) => setPlayQueueIds((current) => {
      const without = current.filter((id) => id !== trackId);
      const activeIndex = without.indexOf(activeTrack.id);
      if (activeIndex < 0) return [trackId, ...without];
      return [...without.slice(0, activeIndex + 1), trackId, ...without.slice(activeIndex + 1)];
    }),
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
    setHifiEnabled: changeHifiPreference,
    setQualityLevel: changeQualityLevel,
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

function offlineExtension(audioFormat?: string | null, url?: string): string {
  const format = (audioFormat ?? "").toLowerCase();
  const mimeNames: Record<string, string> = {
    "audio/flac": "flac",
    flac: "flac",
    "audio/mpeg": "mp3",
    mp3: "mp3",
    "audio/mp4a-latm": "m4a",
    m4a: "m4a",
    "audio/aac": "aac",
    aac: "aac",
    "audio/ogg": "ogg",
    ogg: "ogg",
    "audio/opus": "opus",
    opus: "opus",
    "audio/wav": "wav",
    "audio/x-wav": "wav",
    wav: "wav",
  };
  if (mimeNames[format]) return mimeNames[format];
  try {
    const extension = new URL(url ?? "").pathname.split(".").pop()?.toLowerCase() ?? "";
    if (/^(mp3|flac|m4a|aac|ogg|opus|wav)$/.test(extension)) return extension;
  } catch {
    // Fall through to the generic extension.
  }
  return "audio";
}

function StatusBarIconsSync({ light }: { light: boolean }) {
  useEffect(() => {
    setStatusBarIconsLight(light);
  }, [light]);
  return null;
}
