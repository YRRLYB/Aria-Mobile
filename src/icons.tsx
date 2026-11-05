import type { ReactNode, SVGProps } from "react";

export type AriaIconProps = SVGProps<SVGSVGElement>;

function LineIcon({ children, ...props }: AriaIconProps & { children: ReactNode }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      width="24"
      height="24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...props}
    >
      {children}
    </svg>
  );
}

function FillIcon({ children, ...props }: AriaIconProps & { children: ReactNode }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      width="24"
      height="24"
      fill="currentColor"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...props}
    >
      {children}
    </svg>
  );
}

export function Heart(props: AriaIconProps) {
  return (
    <LineIcon {...props}>
      <path d="M12 20C5.5 15.6 3.2 12.2 3.2 9A4.6 4.6 0 0 1 12 7.2A4.6 4.6 0 0 1 20.8 9C20.8 12.2 18.5 15.6 12 20Z" />
    </LineIcon>
  );
}

export function HeartFill(props: AriaIconProps) {
  return (
    <FillIcon {...props}>
      <path d="M12 20C5.5 15.6 3.2 12.2 3.2 9A4.6 4.6 0 0 1 12 7.2A4.6 4.6 0 0 1 20.8 9C20.8 12.2 18.5 15.6 12 20Z" />
      <path d="M5.6 10.4A2.6 2.6 0 0 1 7.5 7" fill="none" strokeWidth="1.4" style={{ stroke: "var(--aria-glint, #fff)" }} opacity=".9" />
    </FillIcon>
  );
}

export function Play(props: AriaIconProps) {
  return (
    <FillIcon {...props}>
      <rect x="5" y="5.2" width="2.6" height="13.6" rx="1.3" />
      <rect x="8.8" y="7.15" width="2.6" height="9.7" rx="1.3" />
      <rect x="12.6" y="9.1" width="2.6" height="5.8" rx="1.3" />
      <circle cx="17.7" cy="12" r="1.8" style={{ fill: "var(--aria-dot, currentColor)" }} />
    </FillIcon>
  );
}

export function Pause(props: AriaIconProps) {
  return (
    <FillIcon {...props}>
      <rect x="7.1" y="5" width="3.2" height="14" rx="1.6" />
      <rect x="13.7" y="5" width="3.2" height="14" rx="1.6" />
    </FillIcon>
  );
}

export function SkipForward(props: AriaIconProps) {
  return (
    <FillIcon {...props}>
      <rect x="4.9" y="6.2" width="2.2" height="11.6" rx="1.1" />
      <rect x="8.4" y="8.5" width="2.2" height="7" rx="1.1" />
      <circle cx="13.3" cy="12" r="1.5" style={{ fill: "var(--aria-dot, currentColor)" }} />
      <rect x="16.8" y="5" width="2.2" height="14" rx="1.1" />
    </FillIcon>
  );
}

export function SkipBack(props: AriaIconProps) {
  return (
    <FillIcon {...props}>
      <rect x="5" y="5" width="2.2" height="14" rx="1.1" />
      <circle cx="10.7" cy="12" r="1.5" style={{ fill: "var(--aria-dot, currentColor)" }} />
      <rect x="13.4" y="8.5" width="2.2" height="7" rx="1.1" />
      <rect x="16.9" y="6.2" width="2.2" height="11.6" rx="1.1" />
    </FillIcon>
  );
}

export function Shuffle(props: AriaIconProps) {
  return (
    <LineIcon {...props}>
      <path d="M3.5 7H7.5C11.5 7 12.5 17 16.5 17H17.5" />
      <path d="M3.5 17H7.5C8.7 17 9.63 16.1 10.45 14.84" />
      <path d="M13.55 9.16C14.37 7.9 15.3 7 16.5 7H17.5" />
      <circle cx="19.5" cy="7" r="2.25" stroke="none" style={{ fill: "var(--aria-dot, currentColor)" }} />
      <circle cx="19.5" cy="17" r="2.25" stroke="none" style={{ fill: "var(--aria-dot, currentColor)" }} />
    </LineIcon>
  );
}

export function Repeat(props: AriaIconProps) {
  return (
    <LineIcon {...props}>
      <path d="M13.5 7H15A5.5 5.5 0 0 1 15 18H9A5.5 5.5 0 0 1 9 7" />
      <circle cx="9" cy="7" r="2.25" stroke="none" style={{ fill: "var(--aria-dot, currentColor)" }} />
    </LineIcon>
  );
}

export function Repeat1(props: AriaIconProps) {
  return (
    <LineIcon {...props}>
      <path d="M13.5 7H15A5.5 5.5 0 0 1 15 18H9A5.5 5.5 0 0 1 9 7" />
      <path d="M10.7 11.6L12.4 10.4V15" />
      <circle cx="9" cy="7" r="2.25" stroke="none" style={{ fill: "var(--aria-dot, currentColor)" }} />
    </LineIcon>
  );
}

export function ListMusic(props: AriaIconProps) {
  return (
    <LineIcon {...props}>
      <path d="M3.5 5H20.5M3.5 10.5H12.5M3.5 16H9" />
      <path d="M14.8 13.9V20.5L20.8 17.2Z" fill="currentColor" strokeWidth="1.6" />
    </LineIcon>
  );
}

export function Lyrics(props: AriaIconProps) {
  return (
    <LineIcon {...props}>
      <path d="M3.5 6H15M3.5 18H12M3.5 12H20.5" opacity=".38" />
      <path d="M3.5 12H8.5" />
      <circle cx="8.5" cy="12" r="2.25" stroke="none" style={{ fill: "var(--aria-dot, currentColor)" }} />
    </LineIcon>
  );
}

export function Immersive(props: AriaIconProps) {
  return (
    <LineIcon {...props}>
      <path d="M4 9V6.5A2.5 2.5 0 0 1 6.5 4H9M15 4H17.5A2.5 2.5 0 0 1 20 6.5V9M20 15V17.5A2.5 2.5 0 0 1 17.5 20H15M9 20H6.5A2.5 2.5 0 0 1 4 17.5V15" />
      <circle cx="12" cy="12" r="2.25" stroke="none" style={{ fill: "var(--aria-dot, currentColor)" }} />
    </LineIcon>
  );
}

export function SlidersHorizontal(props: AriaIconProps) {
  return (
    <LineIcon {...props}>
      <path d="M3.5 6H10.6M19.4 6H20.5M3.5 12H4.1M12.9 12H20.5M3.5 18H9.1M17.9 18H20.5" />
      <circle cx="15" cy="6" r="2.25" stroke="none" style={{ fill: "var(--aria-dot, currentColor)" }} />
      <circle cx="8.5" cy="12" r="2.25" stroke="none" style={{ fill: "var(--aria-dot, currentColor)" }} />
      <circle cx="13.5" cy="18" r="2.25" stroke="none" style={{ fill: "var(--aria-dot, currentColor)" }} />
    </LineIcon>
  );
}

export function Playing(props: AriaIconProps) {
  return (
    <LineIcon {...props} strokeWidth="2.6">
      <style>{`@keyframes aria-eq{0%,100%{transform:scaleY(.4)}50%{transform:scaleY(1)}}.aria-eq{transform-box:fill-box;transform-origin:50% 50%;animation:aria-eq 1.1s ease-in-out infinite}.aria-eq:nth-of-type(2){animation-delay:-.4s}.aria-eq:nth-of-type(3){animation-delay:-.8s}@media (prefers-reduced-motion:reduce){.aria-eq{animation:none}}`}</style>
      <path className="aria-eq" d="M6 8.5V15.5" />
      <path className="aria-eq" d="M12 5V19" />
      <path className="aria-eq" d="M18 9.5V14.5" />
    </LineIcon>
  );
}

export function Volume(props: AriaIconProps) {
  return (
    <LineIcon {...props}>
      <path d="M3.5 9.6H6.6L11 6V18L6.6 14.4H3.5Z" />
      <path d="M14.6 10.4V13.6M17.6 7.8V16.2M20.6 9.4V14.6" />
    </LineIcon>
  );
}

export function VolumeLow(props: AriaIconProps) {
  return (
    <LineIcon {...props}>
      <path d="M3.5 9.6H6.6L11 6V18L6.6 14.4H3.5Z" />
      <path d="M14.6 10.4V13.6M17.6 12h.01M20.6 12h.01" />
    </LineIcon>
  );
}

export function VolumeMute(props: AriaIconProps) {
  return (
    <LineIcon {...props}>
      <path d="M3.5 9.6H6.6L11 6V18L6.6 14.4H3.5Z" />
      <path d="M14.6 12h.01M17.6 12h.01M20.6 12h.01" />
    </LineIcon>
  );
}

export function Home(props: AriaIconProps) {
  return (
    <LineIcon {...props}>
      <path d="M4 10.2 12 3.8l8 6.4V19a1.8 1.8 0 0 1-1.8 1.8H5.8A1.8 1.8 0 0 1 4 19Z" />
      <path d="M9.2 20.8v-5.6h5.6v5.6" />
      <circle cx="16.8" cy="8.2" r="1.35" stroke="none" style={{ fill: "var(--aria-dot, currentColor)" }} />
    </LineIcon>
  );
}

export function Library(props: AriaIconProps) {
  return (
    <LineIcon {...props}>
      <rect x="4" y="4" width="4.2" height="16" rx="1.3" />
      <rect x="10.2" y="6.5" width="4.2" height="13.5" rx="1.3" />
      <path d="M17.1 7.2 20.8 18" />
      <circle cx="18.8" cy="5.1" r="1.25" stroke="none" style={{ fill: "var(--aria-dot, currentColor)" }} />
    </LineIcon>
  );
}

export function Search(props: AriaIconProps) {
  return (
    <LineIcon {...props}>
      <circle cx="10.7" cy="10.7" r="6.3" />
      <path d="m15.4 15.4 4.4 4.4" />
      <circle cx="10.7" cy="10.7" r="1.35" stroke="none" style={{ fill: "var(--aria-dot, currentColor)" }} />
    </LineIcon>
  );
}

export function Settings(props: AriaIconProps) {
  return (
    <LineIcon {...props}>
      <path d="M12 3.6v3.1M12 17.3v3.1M20.4 12h-3.1M6.7 12H3.6M18.1 5.9l-2.2 2.2M8.1 15.9l-2.2 2.2M18.1 18.1l-2.2-2.2M8.1 8.1 5.9 5.9" />
      <circle cx="12" cy="12" r="3.5" />
      <circle cx="12" cy="12" r="1.3" stroke="none" style={{ fill: "var(--aria-dot, currentColor)" }} />
    </LineIcon>
  );
}

export function UserRound(props: AriaIconProps) {
  return (
    <LineIcon {...props}>
      <circle cx="12" cy="8" r="3.6" />
      <path d="M4.8 20.2c.8-3.7 3.5-5.8 7.2-5.8s6.4 2.1 7.2 5.8" />
    </LineIcon>
  );
}

export function Server(props: AriaIconProps) {
  return (
    <LineIcon {...props}>
      <rect x="3.8" y="4.2" width="16.4" height="6.2" rx="1.8" />
      <rect x="3.8" y="13.6" width="16.4" height="6.2" rx="1.8" />
      <path d="M7.4 7.3h.01M7.4 16.7h.01M11 7.3h5.6M11 16.7h5.6" />
    </LineIcon>
  );
}

export function Wifi(props: AriaIconProps) {
  return (
    <LineIcon {...props}>
      <path d="M3.8 9.2a13 13 0 0 1 16.4 0M6.6 12.5a8.8 8.8 0 0 1 10.8 0M9.5 15.7a4.4 4.4 0 0 1 5 0" />
      <circle cx="12" cy="19" r="1.2" stroke="none" style={{ fill: "var(--aria-dot, currentColor)" }} />
    </LineIcon>
  );
}

export function Smartphone(props: AriaIconProps) {
  return (
    <LineIcon {...props}>
      <rect x="6.2" y="2.8" width="11.6" height="18.4" rx="2.6" />
      <path d="M10 5.5h4M11 18.5h2" />
    </LineIcon>
  );
}

export function AlertCircle(props: AriaIconProps) {
  return (
    <LineIcon {...props}>
      <circle cx="12" cy="12" r="8.6" />
      <path d="M12 7.7v5.1" />
      <circle cx="12" cy="16.4" r="1.05" stroke="none" style={{ fill: "var(--aria-dot, currentColor)" }} />
    </LineIcon>
  );
}

export function CheckCircle2(props: AriaIconProps) {
  return (
    <LineIcon {...props}>
      <circle cx="12" cy="12" r="8.6" />
      <path d="m8 12.2 2.7 2.7 5.3-5.5" />
    </LineIcon>
  );
}

export function LogOut(props: AriaIconProps) {
  return (
    <LineIcon {...props}>
      <path d="M10 4H6.8A1.8 1.8 0 0 0 5 5.8v12.4A1.8 1.8 0 0 0 6.8 20H10" />
      <path d="M14.5 8.2 18.3 12l-3.8 3.8M9 12h9" />
    </LineIcon>
  );
}

export function Usb(props: AriaIconProps) {
  return (
    <LineIcon {...props}>
      <path d="M12 3.5v11.3" />
      <circle cx="12" cy="16.8" r="1.7" />
      <path d="m9.4 6.3 2.6-2.8 2.6 2.8M7 9.4h10M8.4 9.4v3.1M15.6 9.4v3.1" />
    </LineIcon>
  );
}

export function Disc3(props: AriaIconProps) {
  return (
    <LineIcon {...props}>
      <circle cx="12" cy="12" r="8.6" />
      <circle cx="12" cy="12" r="4.8" opacity=".55" />
      <circle cx="12" cy="12" r="1.5" stroke="none" style={{ fill: "var(--aria-dot, currentColor)" }} />
    </LineIcon>
  );
}

export function Compass(props: AriaIconProps) {
  return (
    <LineIcon {...props}>
      <circle cx="12" cy="12" r="8.6" />
      <path d="m15.8 8.2-2.2 5.4-5.4 2.2 2.2-5.4Z" />
    </LineIcon>
  );
}

export function Radar(props: AriaIconProps) {
  return (
    <LineIcon {...props}>
      <path d="M12 3.5a8.5 8.5 0 1 1-8.5 8.5" />
      <path d="M12 6.8a5.2 5.2 0 1 0 5.2 5.2" />
      <path d="M12 12 18.6 5.4" />
      <circle cx="12" cy="12" r="1.25" stroke="none" style={{ fill: "var(--aria-dot, currentColor)" }} />
    </LineIcon>
  );
}

export function History(props: AriaIconProps) {
  return (
    <LineIcon {...props}>
      <path d="M4.4 9.2A8.4 8.4 0 1 1 4 12" />
      <path d="M4.4 4.8v4.4H8.8" />
      <path d="M12 7.6V12l3 2" />
    </LineIcon>
  );
}

export function Trash2(props: AriaIconProps) {
  return (
    <LineIcon {...props}>
      <path d="M4.6 6.6h14.8M9.2 6.6V4.4h5.6v2.2M6.7 6.6l.8 12.1a1.6 1.6 0 0 0 1.6 1.5h5.8a1.6 1.6 0 0 0 1.6-1.5l.8-12.1" />
      <path d="M10 10.3v5.8M14 10.3v5.8" />
    </LineIcon>
  );
}

export function Download(props: AriaIconProps) {
  return (
    <LineIcon {...props}>
      <path d="M12 3.8v10.7M8.2 10.9 12 14.7l3.8-3.8M4.6 16.1v2.4a1.9 1.9 0 0 0 1.9 1.9h11a1.9 1.9 0 0 0 1.9-1.9v-2.4" />
    </LineIcon>
  );
}

export function Timer(props: AriaIconProps) {
  return (
    <LineIcon {...props}>
      <circle cx="12" cy="13.2" r="7.2" />
      <path d="M12 9.5v3.7l2.3 1.4M9.4 3.6h5.2" />
    </LineIcon>
  );
}

export function ChevronDown(props: AriaIconProps) {
  return (
    <LineIcon {...props}>
      <path d="m6.2 9.3 5.8 5.8 5.8-5.8" />
    </LineIcon>
  );
}

export function ChevronUp(props: AriaIconProps) {
  return (
    <LineIcon {...props}>
      <path d="m6.2 14.7 5.8-5.8 5.8 5.8" />
    </LineIcon>
  );
}

export function ChevronRight(props: AriaIconProps) {
  return (
    <LineIcon {...props}>
      <path d="m9.3 6.2 5.8 5.8-5.8 5.8" />
    </LineIcon>
  );
}

export function ArrowLeft(props: AriaIconProps) {
  return (
    <LineIcon {...props}>
      <path d="M19.2 12H4.8M10.4 6.4 4.8 12l5.6 5.6" />
    </LineIcon>
  );
}

export function ArrowUp(props: AriaIconProps) {
  return (
    <LineIcon {...props}>
      <path d="M12 19.2V4.8M6.4 10.4 12 4.8l5.6 5.6" />
    </LineIcon>
  );
}

export function ArrowDown(props: AriaIconProps) {
  return (
    <LineIcon {...props}>
      <path d="M12 4.8v14.4M6.4 13.6 12 19.2l5.6-5.6" />
    </LineIcon>
  );
}

export function ExternalLink(props: AriaIconProps) {
  return (
    <LineIcon {...props}>
      <path d="M14 4h6v6M20 4l-9 9" />
      <path d="M18 13.5V19a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5.5" />
    </LineIcon>
  );
}

export function Check(props: AriaIconProps) {
  return (
    <LineIcon {...props}>
      <path d="m5 12.4 4.4 4.4L19 6.8" />
    </LineIcon>
  );
}

export function X(props: AriaIconProps) {
  return (
    <LineIcon {...props}>
      <path d="M6 6l12 12M18 6 6 18" />
    </LineIcon>
  );
}

export function Plus(props: AriaIconProps) {
  return (
    <LineIcon {...props}>
      <path d="M12 5v14M5 12h14" />
    </LineIcon>
  );
}

export function RefreshCw(props: AriaIconProps) {
  return (
    <LineIcon {...props}>
      <path d="M19.2 9.2A7.4 7.4 0 0 0 5.5 6.3L3.8 8.4M4.8 14.8a7.4 7.4 0 0 0 13.7 2.9l1.7-2.1" />
      <path d="M3.8 4.6v3.8h3.8M20.2 19.4v-3.8h-3.8" />
    </LineIcon>
  );
}

export function Loader2(props: AriaIconProps) {
  return (
    <LineIcon {...props}>
      <path d="M20 12a8 8 0 1 1-2.3-5.6" />
      <path d="M20 4.5V8h-3.5" opacity=".45" />
    </LineIcon>
  );
}

export function GripVertical(props: AriaIconProps) {
  return (
    <FillIcon {...props}>
      <circle cx="9.5" cy="6" r="1.35" />
      <circle cx="14.5" cy="6" r="1.35" />
      <circle cx="9.5" cy="12" r="1.35" />
      <circle cx="14.5" cy="12" r="1.35" />
      <circle cx="9.5" cy="18" r="1.35" />
      <circle cx="14.5" cy="18" r="1.35" />
    </FillIcon>
  );
}
