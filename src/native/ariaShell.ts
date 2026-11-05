import { Capacitor, registerPlugin } from "@capacitor/core";

const AriaShell = registerPlugin<{
  getSafeAreas(): Promise<{ top: number; bottom: number }>;
  requestUninterruptedPlayback(): Promise<{ alreadyExempt: boolean }>;
  requestAudioPermission(): Promise<{ granted: boolean }>;
  openExternal(options: { url: string }): Promise<void>;
  downloadTrack(options: {
    trackId: string;
    url: string;
    extension?: string;
  }): Promise<{ ok: boolean; path?: string; fileUrl?: string; size?: number; message?: string }>;
  deleteDownload(options: { path: string }): Promise<{ ok: boolean }>;
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

export async function requestUninterruptedPlayback(): Promise<{ alreadyExempt: boolean } | null> {
  if (!Capacitor.isNativePlatform()) return null;
  try {
    return await AriaShell.requestUninterruptedPlayback();
  } catch {
    return null;
  }
}

/** Opens an HTTP(S) link in the system browser instead of navigating the WebView. */
export async function openExternal(url: string): Promise<void> {
  if (!/^https?:\/\//i.test(url)) return;
  if (Capacitor.isNativePlatform()) {
    try {
      await AriaShell.openExternal({ url });
      return;
    } catch {
      // Fall through to the browser window below.
    }
  }
  window.open(url, "_blank", "noopener,noreferrer");
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
  const { tracks } = await AriaShell.scanLocalAudio();
  return tracks ?? [];
}

export async function downloadTrackFile(options: {
  trackId: string;
  url: string;
  extension?: string;
}): Promise<{ ok: boolean; path?: string; fileUrl?: string; size?: number; message?: string }> {
  if (!Capacitor.isNativePlatform()) {
    return { ok: false, message: "当前环境不支持离线下载" };
  }
  try {
    return await AriaShell.downloadTrack(options);
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : "下载失败" };
  }
}

export async function deleteDownloadedFile(path: string): Promise<boolean> {
  if (!Capacitor.isNativePlatform() || !path) return false;
  try {
    return Boolean((await AriaShell.deleteDownload({ path })).ok);
  } catch {
    return false;
  }
}
