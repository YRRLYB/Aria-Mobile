// The Aria icon kit: every glyph is a hand-drawn SVG under src/icons-kit/
// (nav / player / action / page), inlined at build time with Vite ?raw -
// zero runtime requests, currentColor theming, and the aria-eq playing
// animation ships inside playing.svg. Size comes from the className; the
// --aria-dot / --aria-glint CSS variables still work.
import type { HTMLAttributes } from "react";
import { cn } from "@/lib/utils";
import HomeSvg from "./icons-kit/nav/home.svg?raw";
import LibrarySvg from "./icons-kit/nav/library.svg?raw";
import SearchSvg from "./icons-kit/nav/search.svg?raw";
import SettingsSvg from "./icons-kit/nav/settings.svg?raw";
import PlaySvg from "./icons-kit/player/play.svg?raw";
import PauseSvg from "./icons-kit/player/pause.svg?raw";
import PlayingSvg from "./icons-kit/player/playing.svg?raw";
import SkipBackSvg from "./icons-kit/player/skip-back.svg?raw";
import SkipForwardSvg from "./icons-kit/player/skip-forward.svg?raw";
import ShuffleSvg from "./icons-kit/player/shuffle.svg?raw";
import RepeatSvg from "./icons-kit/player/repeat.svg?raw";
import Repeat1Svg from "./icons-kit/player/repeat-1.svg?raw";
import TimerSvg from "./icons-kit/player/timer.svg?raw";
import VolumeSvg from "./icons-kit/player/volume.svg?raw";
import VolumeLowSvg from "./icons-kit/player/volume-low.svg?raw";
import VolumeMuteSvg from "./icons-kit/player/volume-mute.svg?raw";
import SlidersHorizontalSvg from "./icons-kit/player/sliders.svg?raw";
import ImmersiveSvg from "./icons-kit/player/immersive.svg?raw";
import LyricsSvg from "./icons-kit/player/lyrics.svg?raw";
import ListMusicSvg from "./icons-kit/player/list-music.svg?raw";
import DownloadSvg from "./icons-kit/player/download.svg?raw";
import CheckSvg from "./icons-kit/player/check.svg?raw";
import Loader2Svg from "./icons-kit/player/loader.svg?raw";
import HeartSvg from "./icons-kit/action/heart.svg?raw";
import HeartFillSvg from "./icons-kit/action/heart-fill.svg?raw";
import CopySvg from "./icons-kit/action/copy.svg?raw";
import Trash2Svg from "./icons-kit/action/trash.svg?raw";
import RefreshCwSvg from "./icons-kit/action/refresh.svg?raw";
import GripVerticalSvg from "./icons-kit/action/grip-vertical.svg?raw";
import PlusSvg from "./icons-kit/action/plus.svg?raw";
import XSvg from "./icons-kit/action/x.svg?raw";
import UserRoundSvg from "./icons-kit/page/user-round.svg?raw";
import ServerSvg from "./icons-kit/page/server.svg?raw";
import WifiSvg from "./icons-kit/page/wifi.svg?raw";
import UsbSvg from "./icons-kit/page/usb.svg?raw";
import Disc3Svg from "./icons-kit/page/disc.svg?raw";
import CompassSvg from "./icons-kit/page/compass.svg?raw";
import RadarSvg from "./icons-kit/page/radar.svg?raw";
import HistorySvg from "./icons-kit/page/history.svg?raw";
import MusicNoteSvg from "./icons-kit/page/music-note.svg?raw";
import AlertCircleSvg from "./icons-kit/page/alert-circle.svg?raw";
import CheckCircle2Svg from "./icons-kit/page/check-circle.svg?raw";
import LogOutSvg from "./icons-kit/page/log-out.svg?raw";
import ExternalLinkSvg from "./icons-kit/page/external-link.svg?raw";
import ChevronUpSvg from "./icons-kit/page/chevron-up.svg?raw";
import ChevronDownSvg from "./icons-kit/page/chevron-down.svg?raw";
import ChevronLeftSvg from "./icons-kit/page/chevron-left.svg?raw";
import ChevronRightSvg from "./icons-kit/page/chevron-right.svg?raw";
import ArrowUpSvg from "./icons-kit/page/arrow-up.svg?raw";
import ArrowDownSvg from "./icons-kit/page/arrow-down.svg?raw";
import ArrowLeftSvg from "./icons-kit/page/arrow-left.svg?raw";
import ArrowRightSvg from "./icons-kit/page/arrow-right.svg?raw";

type KitIconProps = HTMLAttributes<HTMLSpanElement> & { className?: string };

function kitIcon(markup: string) {
  return function KitIcon({ className, ...rest }: KitIconProps) {
    return (
      <span
        aria-hidden="true"
        {...rest}
        className={cn("inline-flex items-center justify-center [&>svg]:size-full", className)}
        dangerouslySetInnerHTML={{ __html: markup }}
      />
    );
  };
}

export const Home = kitIcon(HomeSvg);
export const Library = kitIcon(LibrarySvg);
export const Search = kitIcon(SearchSvg);
export const Settings = kitIcon(SettingsSvg);
export const Play = kitIcon(PlaySvg);
export const Pause = kitIcon(PauseSvg);
export const Playing = kitIcon(PlayingSvg);
export const SkipBack = kitIcon(SkipBackSvg);
export const SkipForward = kitIcon(SkipForwardSvg);
export const Shuffle = kitIcon(ShuffleSvg);
export const Repeat = kitIcon(RepeatSvg);
export const Repeat1 = kitIcon(Repeat1Svg);
export const Timer = kitIcon(TimerSvg);
export const Volume = kitIcon(VolumeSvg);
export const VolumeLow = kitIcon(VolumeLowSvg);
export const VolumeMute = kitIcon(VolumeMuteSvg);
export const SlidersHorizontal = kitIcon(SlidersHorizontalSvg);
export const Immersive = kitIcon(ImmersiveSvg);
export const Lyrics = kitIcon(LyricsSvg);
export const ListMusic = kitIcon(ListMusicSvg);
export const Download = kitIcon(DownloadSvg);
export const Check = kitIcon(CheckSvg);
export const Loader2 = kitIcon(Loader2Svg);
export const Heart = kitIcon(HeartSvg);
export const HeartFill = kitIcon(HeartFillSvg);
export const Copy = kitIcon(CopySvg);
export const Trash2 = kitIcon(Trash2Svg);
export const RefreshCw = kitIcon(RefreshCwSvg);
export const GripVertical = kitIcon(GripVerticalSvg);
export const Plus = kitIcon(PlusSvg);
export const X = kitIcon(XSvg);
export const UserRound = kitIcon(UserRoundSvg);
export const Server = kitIcon(ServerSvg);
export const Wifi = kitIcon(WifiSvg);
export const Usb = kitIcon(UsbSvg);
export const Disc3 = kitIcon(Disc3Svg);
export const Compass = kitIcon(CompassSvg);
export const Radar = kitIcon(RadarSvg);
export const History = kitIcon(HistorySvg);
export const MusicNote = kitIcon(MusicNoteSvg);
export const AlertCircle = kitIcon(AlertCircleSvg);
export const CheckCircle2 = kitIcon(CheckCircle2Svg);
export const LogOut = kitIcon(LogOutSvg);
export const ExternalLink = kitIcon(ExternalLinkSvg);
export const ChevronUp = kitIcon(ChevronUpSvg);
export const ChevronDown = kitIcon(ChevronDownSvg);
export const ChevronLeft = kitIcon(ChevronLeftSvg);
export const ChevronRight = kitIcon(ChevronRightSvg);
export const ArrowUp = kitIcon(ArrowUpSvg);
export const ArrowDown = kitIcon(ArrowDownSvg);
export const ArrowLeft = kitIcon(ArrowLeftSvg);
export const ArrowRight = kitIcon(ArrowRightSvg);
