import { useMemo, useState } from "react";
import { AtSign, Briefcase, Check, Copy, Info, Mail, MessageCircle, Pin, Send, Share2, ThumbsUp } from "lucide-react";
import { api } from "@/data";
import { useSite } from "@/hooks/useSite";
import type { Publication } from "@/lib/types";
import { copyText, publicationUrl, shareLink, type ShareChannel } from "@/lib/share";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";

const CHANNELS: { id: ShareChannel; label: string; icon: React.ReactNode; tint: string }[] = [
  { id: "whatsapp", label: "WhatsApp", icon: <MessageCircle />, tint: "bg-[#e7f6ec] text-[#1a7f43]" },
  { id: "linkedin", label: "LinkedIn", icon: <Briefcase />, tint: "bg-[#e8f0fa] text-[#0a5aa8]" },
  { id: "x", label: "X", icon: <AtSign />, tint: "bg-[#eeeff1] text-[#20252b]" },
  { id: "facebook", label: "Facebook", icon: <ThumbsUp />, tint: "bg-[#e9effc] text-[#2851b8]" },
  { id: "telegram", label: "Telegram", icon: <Send />, tint: "bg-[#e6f4fb] text-[#1d7cb3]" },
  { id: "pinterest", label: "Pinterest", icon: <Pin />, tint: "bg-[#fbe9ea] text-[#b3202a]" },
  { id: "email", label: "Email", icon: <Mail />, tint: "bg-accent-soft text-[#8a6224]" },
];

export function ShareDialog({ pub, open, onOpenChange }: { pub: Publication; open: boolean; onOpenChange: (v: boolean) => void }) {
  const { site } = useSite();
  const [copied, setCopied] = useState(false);
  const { url, configured } = useMemo(() => publicationUrl(pub.slug, site.site_url), [pub.slug, site.site_url]);
  const title = `${pub.title} — ${site.site_name}`;
  const text = `“${pub.title}”${pub.author ? ` by ${pub.author}` : ""} — free to read on ${site.site_name}`;
  const cover = api.coverUrl(pub.cover_image_path);
  const absoluteCover = cover && /^https?:/.test(cover) ? cover : null;
  const host = (() => {
    try {
      return new URL(url).host;
    } catch {
      return "";
    }
  })();
  const canNativeShare = typeof navigator !== "undefined" && typeof navigator.share === "function";

  const track = () => api.trackEvent(pub.id, "publication_share").catch(() => undefined);

  const copy = async () => {
    if (await copyText(url)) {
      setCopied(true);
      track();
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const nativeShare = async () => {
    try {
      await navigator.share({ title, text, url });
      track();
    } catch {
      /* user cancelled or unsupported */
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[520px]">
        <DialogTitle>Share this publication</DialogTitle>
        <DialogDescription>Links open the reading page, with the title, description and cover as the preview.</DialogDescription>

        {/* Link preview, modelled on how social networks render the page's metadata */}
        <figure className="mt-5 overflow-hidden rounded-xl border border-line bg-surface" aria-label="Link preview">
          <div className="relative flex aspect-[1.91/1] items-center gap-5 overflow-hidden bg-paper px-6">
            <div className="absolute -right-10 -top-16 size-56 rounded-full bg-accent-soft" aria-hidden />
            <div className="relative min-w-0 flex-1">
              <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[#9a7232]">{pub.category?.name ?? "Essay"}</p>
              <p className="mt-1.5 line-clamp-3 font-display text-[21px] leading-[1.15] text-ink">{pub.title}</p>
              {pub.author && <p className="mt-2 text-[11.5px] text-secondary">by {pub.author}</p>}
              <p className="mt-3 text-[10.5px] font-medium text-muted">{site.site_name}</p>
            </div>
            {cover && <img src={cover} alt="" className="relative h-[78%] w-auto shrink-0 rotate-[2deg] rounded-[2px] shadow-book" />}
          </div>
          <figcaption className="border-t border-line bg-[#f6f7f9] px-4 py-3">
            <p className="text-[11.5px] uppercase tracking-wide text-muted">{host}</p>
            <p className="mt-0.5 truncate text-[14px] font-semibold text-ink">{pub.title}</p>
            <p className="mt-0.5 line-clamp-1 text-[12.5px] text-secondary">{pub.description}</p>
          </figcaption>
        </figure>

        <div className="mt-5 grid grid-cols-4 gap-2 sm:grid-cols-7">
          {CHANNELS.map((c) => (
            <a
              key={c.id}
              href={shareLink(c.id, { url, title, text, image: absoluteCover })}
              target="_blank"
              rel="noopener noreferrer"
              onClick={track}
              className="group flex flex-col items-center gap-1.5 rounded-lg py-2 text-[11.5px] text-secondary transition-colors hover:bg-black/[0.03] hover:text-ink"
              aria-label={`Share on ${c.label}`}
            >
              <span className={cn("grid size-11 place-items-center rounded-full transition-transform group-hover:-translate-y-0.5 [&_svg]:size-[18px]", c.tint)}>{c.icon}</span>
              {c.label}
            </a>
          ))}
        </div>

        <div className="mt-5">
          <label htmlFor="share-url" className="mb-1.5 block text-[13px] font-medium text-ink">Page link</label>
          <div className="flex gap-2">
            <input id="share-url" readOnly value={url} onFocus={(e) => e.currentTarget.select()} className="h-10 min-w-0 flex-1 rounded-md border border-line-strong bg-paper px-3 text-[13px] text-secondary outline-none focus:border-primary" />
            <Button variant={copied ? "outline" : "primary"} onClick={copy} className="shrink-0" aria-live="polite">
              {copied ? <Check /> : <Copy />}
              {copied ? "Copied" : "Copy"}
            </Button>
          </div>
        </div>

        {canNativeShare && (
          <Button variant="outline" className="mt-3 w-full" onClick={nativeShare}>
            <Share2 /> More sharing options
          </Button>
        )}

        {!configured && (
          <p className="mt-4 flex gap-2 rounded-md bg-accent-soft px-3 py-2.5 text-[12.5px] text-[#6d4d1c]">
            <Info className="mt-0.5 size-3.5 shrink-0" />
            This preview isn't running on your public domain. Set the Public site URL in Admin → Settings so shared links point to your live library.
          </p>
        )}
      </DialogContent>
    </Dialog>
  );
}
