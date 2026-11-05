import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import { cachedCoverUrl } from "./coverCache";

const palettes = [
  "from-[#d9e1f0] to-[#aebbd4] text-[#3d4d68]",
  "from-[#eadfd7] to-[#c8b2a4] text-[#654a3d]",
  "from-[#d8e8e2] to-[#a9c8bc] text-[#3c5b4f]",
  "from-[#e3def0] to-[#bbb2d8] text-[#51466f]",
  "from-[#e9e3d4] to-[#c9bea2] text-[#5d5238]",
  "from-[#dde5e9] to-[#b2c1ca] text-[#465761]",
];

function paletteFor(name: string) {
  let hash = 0;
  for (let index = 0; index < name.length; index += 1) {
    hash = (hash * 31 + name.charCodeAt(index)) % 997;
  }
  return palettes[hash % palettes.length];
}

const sizes = {
  sm: "size-10 text-sm",
  md: "size-14 text-lg",
  lg: "size-24 text-3xl",
};

export function ArtistAvatar({
  name,
  avatarUrl,
  size = "md",
  className,
}: {
  name: string;
  avatarUrl?: string | null;
  size?: keyof typeof sizes;
  className?: string;
}) {
  const [failed, setFailed] = useState(false);
  const [resolved, setResolved] = useState(() =>
    /^https?:/i.test(avatarUrl ?? "") ? "" : avatarUrl ?? "",
  );
  useEffect(() => {
    let mounted = true;
    setResolved(/^https?:/i.test(avatarUrl ?? "") ? "" : avatarUrl ?? "");
    setFailed(false);
    if (avatarUrl) {
      void cachedCoverUrl(avatarUrl).then((url) => {
        if (mounted && url) setResolved(url);
      });
    }
    return () => { mounted = false; };
  }, [avatarUrl]);
  if (resolved && !failed) {
    return (
      <img
        src={resolved}
        alt=""
        aria-hidden="true"
        loading="lazy"
        onError={() => {
          if (resolved !== avatarUrl) setResolved(avatarUrl ?? "");
          else setFailed(true);
        }}
        className={cn(
          "shrink-0 rounded-full object-cover shadow-sm ring-1 ring-white/60",
          sizes[size],
          className,
        )}
      />
    );
  }
  return (
    <span
      aria-hidden="true"
      className={cn(
        "flex shrink-0 items-center justify-center rounded-full bg-gradient-to-br font-semibold shadow-sm ring-1 ring-white/60",
        sizes[size],
        paletteFor(name),
        className,
      )}
    >
      {name.slice(0, 1).toUpperCase() || "♪"}
    </span>
  );
}
