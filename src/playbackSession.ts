import type { Track } from "@/data/music";
import type { AriaAudioEvent } from "./native/ariaAudio";

// A load owns its events, even when the same song is selected twice. Only a
// successfully prepared load can end, and it can advance the queue once.
export class PlaybackSession {
  private sequence = 0;
  private readonly prefix = `${Date.now()}-${Math.random()}`;
  requestId = "";
  trackId = "";
  ready = false;
  finished = false;

  begin(trackId: string) {
    this.requestId = `${this.prefix}-${++this.sequence}`;
    this.trackId = trackId;
    this.ready = false;
    this.finished = false;
    return this.requestId;
  }

  isCurrent(requestId: string) {
    return this.requestId === requestId && !this.finished;
  }

  adoptAdvanced(trackId: string, requestId: string) {
    if (!trackId || !this.requestId || requestId !== this.requestId || this.finished) return false;
    this.trackId = trackId;
    this.ready = true;
    return true;
  }

  accept(event: AriaAudioEvent) {
    if (!this.requestId || event.requestId !== this.requestId || event.trackId !== this.trackId || this.finished) return false;
    // The web queue is the sole owner of advancement. Manual native loads
    // must never be interpreted as another selection.
    if (event.kind === "advanced") return false;
    if (event.kind === "ended" && !this.ready) return false;
    if (event.kind === "loaded") this.ready = true;
    if (event.kind === "ended" || event.kind === "error") this.finished = true;
    return true;
  }
}

export function updateMatchingTrack(tracks: Track[], trackId: string, update: (track: Track) => Track) {
  if (!tracks.some((track) => track.id === trackId)) return tracks;
  return tracks.map((track) => track.id === trackId ? update(track) : track);
}
