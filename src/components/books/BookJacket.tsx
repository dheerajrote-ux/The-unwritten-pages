import { useState } from "react";
import { api } from "@/data";
import { cn } from "@/lib/utils";

const PALETTES = [
  { bg: "#172B4D", ink: "#F3E3C6", rule: "#D6A85F" },
  { bg: "#0F3B3A", ink: "#EAF2EC", rule: "#E3B062" },
  { bg: "#3A2C4F", ink: "#F1E8F5", rule: "#D9A066" },
  { bg: "#7A2E1F", ink: "#FBEFE3", rule: "#F0C27B" },
  { bg: "#2F3B2A", ink: "#EEF0E2", rule: "#C9A46A" },
];

function hash(s: string) {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

/**
 * Book cover at 2:3. Without an uploaded image it renders a typographic
 * jacket (title + author), so books never show a broken or empty image.
 */
export function BookJacket({ path, title, author, className, eager }: { path: string | null; title: string; author?: string | null; className?: string; eager?: boolean }) {
  const [failed, setFailed] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const url = api.coverUrl(path);
  const shell = cn("book-cover relative aspect-[2/3] overflow-hidden rounded-[3px]", className);
  if (url && !failed) {
    return (
      <div className={cn(shell, "bg-[#efe9df]", !loaded && "skeleton")}>
        <img src={url} alt={`Cover of ${title}`} loading={eager ? "eager" : "lazy"} decoding="async" onLoad={() => setLoaded(true)} onError={() => setFailed(true)} className={cn("h-full w-full object-cover transition-opacity duration-500", loaded ? "opacity-100" : "opacity-0")} />
      </div>
    );
  }
  const p = PALETTES[hash(title) % PALETTES.length];
  return (
    <div className={cn(shell, "@container flex flex-col justify-between p-[9%]")} style={{ background: p.bg }} role="img" aria-label={`Cover of ${title}`}>
      <div className="absolute -right-[22%] -top-[12%] aspect-square w-[70%] rounded-full opacity-15" style={{ background: p.rule }} aria-hidden />
      <div className="relative min-h-0 overflow-hidden">
        <div className="h-px w-[22%]" style={{ background: p.rule }} />
        <p className="mt-[8%] font-display text-[clamp(6px,10.5cqw,30px)] font-medium leading-[1.08] text-balance" style={{ color: p.ink }}>
          {title}
        </p>
      </div>
      {author && (
        <p className="relative text-[clamp(4px,4.2cqw,12px)] font-semibold uppercase tracking-[0.16em] leading-tight" style={{ color: p.rule }}>
          {author}
        </p>
      )}
    </div>
  );
}
