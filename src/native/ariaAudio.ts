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
};

export type UsbExclusiveSettings = {
  enabled: boolean;
  connected: boolean;
  supported: boolean;
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
  stop(): Promise<void>;
  getState(): Promise<{ active: boolean; position: number; duration: number; paused: boolean; trackId: string | null }>;
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
