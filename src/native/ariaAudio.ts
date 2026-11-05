import { Capacitor, registerPlugin, type PluginListenerHandle } from "@capacitor/core";

export type AriaAudioEvent = {
  kind: "loaded" | "progress" | "state" | "advanced" | "ended" | "error" | "next" | "previous" | "like";
  trackId?: string;
  requestId?: string;
  position?: number;
  duration?: number;
  playing?: boolean;
  message?: string;
  audioFormat?: string;
  bitrate?: number;
  sampleRate?: number;
};

export type AriaNativeQueueItem = {
  trackId: string;
  url?: string;
  directId?: string;
  level?: string;
  title: string;
  artist: string;
  album: string;
  artworkUrl?: string;
};

export type AriaAudioLoadPayload = {
  requestId: string;
  url: string;
  trackId: string;
  title: string;
  artist: string;
  album: string;
  artworkUrl?: string;
  position?: number;
  paused?: boolean;
  volume?: number;
  repeatMode?: "all" | "one";
  speed?: number;
  equalizerPreset?: number;
  // The native service keeps this list so it can resolve and play the next
  // track even while the WebView is suspended in the background.
  queue?: AriaNativeQueueItem[];
};

export type UsbExclusiveSettings = {
  enabled: boolean;
  connected: boolean;
  supported: boolean;
};

export type EqualizerSettings = {
  supported: boolean;
  enabled: boolean;
  current: number;
  presets: string[];
};

export type AriaAudioPluginInterface = {
  load(payload: AriaAudioLoadPayload): Promise<void>;
  loadNext(payload: {
    requestId: string;
    url: string;
    trackId: string;
    title: string;
    artist: string;
    album: string;
    artworkUrl?: string;
  }): Promise<void>;
  setPaused(options: { paused: boolean }): Promise<void>;
  seek(options: { position: number }): Promise<void>;
  setVolume(options: { volume: number }): Promise<void>;
  setRepeatMode(options: { repeatMode: "all" | "one" }): Promise<void>;
  skip(options: { direction: "next" | "previous" }): Promise<void>;
  setSleepTimer(options: { minutes: number }): Promise<void>;
  setPlaybackSpeed(options: { speed: number }): Promise<void>;
  getEqualizerSettings(): Promise<EqualizerSettings>;
  setEqualizerPreset(options: { preset: number }): Promise<void>;
  stop(): Promise<void>;
  getState(): Promise<{ active: boolean; position: number; duration: number; paused: boolean; trackId: string | null; requestId?: string | null }>;
  requestNotifications(): Promise<{ granted?: boolean }>;
  getUsbExclusiveSettings(): Promise<UsbExclusiveSettings>;
  setUsbExclusiveEnabled(options: { enabled: boolean }): Promise<UsbExclusiveSettings>;
  updateLockInfo(options: { trackId: string; lyrics: { time: string; text: string; translation?: string }[]; liked: boolean }): Promise<void>;
  getLockScreenSettings(): Promise<{ enabled: boolean; permission: boolean }>;
  setLockScreenEnabled(options: { enabled: boolean }): Promise<void>;
  openLockScreenPermission(): Promise<void>;
  openLockScreenAppSettings(): Promise<void>;
  addListener(
    eventName: "audioEvent",
    listener: (event: AriaAudioEvent) => void,
  ): Promise<PluginListenerHandle> & PluginListenerHandle;
};

export const AriaAudio = registerPlugin<AriaAudioPluginInterface>("AriaAudio");

export function isNativeApp(): boolean {
  return Capacitor.isNativePlatform();
}

// Shell helpers without a cross-platform plugin (status-bar icon appearance
// for the immersive dark player page). No-op outside the native app.
export const AriaShell = registerPlugin<{ setStatusBarIconsLight(options: { light: boolean }): Promise<void> }>(
  "AriaShell",
);

export function setStatusBarIconsLight(light: boolean): void {
  if (!isNativeApp()) return;
  void AriaShell.setStatusBarIconsLight({ light }).catch(() => undefined);
}
