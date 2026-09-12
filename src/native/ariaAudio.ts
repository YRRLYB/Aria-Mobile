import { Capacitor, registerPlugin, type PluginListenerHandle } from "@capacitor/core";

export type AriaAudioEvent = {
  kind: "loaded" | "progress" | "state" | "advanced" | "ended" | "error";
  trackId?: string;
  position?: number;
  duration?: number;
  playing?: boolean;
  message?: string;
};

export type AriaAudioLoadPayload = {
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

export type AriaAudioPluginInterface = {
  load(payload: AriaAudioLoadPayload): Promise<void>;
  loadNext(payload: {
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
  addListener(
    eventName: "audioEvent",
    listener: (event: AriaAudioEvent) => void,
  ): Promise<PluginListenerHandle> & PluginListenerHandle;
};

export const AriaAudio = registerPlugin<AriaAudioPluginInterface>("AriaAudio");

export function isNativeApp(): boolean {
  return Capacitor.isNativePlatform();
}
