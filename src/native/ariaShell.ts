import { Capacitor, registerPlugin } from "@capacitor/core";

const AriaShell = registerPlugin<{
  getSafeAreas(): Promise<{ top: number; bottom: number }>;
  requestUninterruptedPlayback(): Promise<{ alreadyExempt: boolean }>;
  requestAudioPermission(): Promise<{ granted: boolean }>;
  scanLocalAudio(): Promise<{
    tracks: Array<{
      id: string;
      title: string;
      artist: string;
      album: string;
      durationMs: number;
      streamUrl: string;
      coverUrl: string;
    }>;
  }>;
}>("AriaShell");

/** Belt-and-braces: pull the current safe-area sizes natively (the passive
 *  inset listener can fire before the web document exists). */
export async function applySafeAreasFromNative(): Promise<void> {
  try {
    const { top, bottom } = await AriaShell.getSafeAreas();
    document.documentElement.style.setProperty("--aria-safe-top", `${top}px`);
    document.documentElement.style.setProperty("--aria-safe-bottom", `${bottom}px`);
  } catch {
    // Browser dev: env() fallbacks apply.
  }
}

export async function requestUninterruptedPlayback(): Promise<void> {
  if (!Capacitor.isNativePlatform()) return;
  try {
    await AriaShell.requestUninterruptedPlayback();
  } catch {
    // best effort
  }
}

export type DeviceAudioTrack = {
  id: string;
  title: string;
  artist: string;
  album: string;
  durationMs: number;
  streamUrl: string;
  coverUrl: string;
};

export async function requestAudioPermission(): Promise<boolean> {
  try {
    const result = await AriaShell.requestAudioPermission();
    return Boolean(result.granted);
  } catch {
    return false;
  }
}

export async function scanDeviceAudio(): Promise<DeviceAudioTrack[]> {
  if (!Capacitor.isNativePlatform()) return [];
  try {
    const { tracks } = await AriaShell.scanLocalAudio();
    return tracks ?? [];
  } catch {
    return [];
  }
}
