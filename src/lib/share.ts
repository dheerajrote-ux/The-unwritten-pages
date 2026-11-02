import { ROUTER_MODE } from "./config";

export type ShareChannel = "whatsapp" | "x" | "linkedin" | "facebook" | "telegram" | "pinterest" | "email";

/**
 * Canonical public URL for a publication. Uses the configured site URL when set,
 * otherwise the current origin on real deployments (browser routing).
 */
export function publicationUrl(slug: string, siteUrl: string | null | undefined): { url: string; configured: boolean } {
  const base = siteUrl?.trim().replace(/\/+$/, "");
  if (base) return { url: `${base}/library/${slug}`, configured: true };
  if (ROUTER_MODE === "browser") return { url: `${window.location.origin}/library/${slug}`, configured: true };
  if (ROUTER_MODE === "hash") return { url: `${window.location.origin}${window.location.pathname}#/library/${slug}`, configured: false };
  return { url: `${window.location.origin}/library/${slug}`, configured: false };
}

function withUtm(url: string, source: string) {
  try {
    const u = new URL(url);
    if (u.hash) return url; // hash routes can't carry query params safely
    u.searchParams.set("utm_source", source);
    u.searchParams.set("utm_medium", "social");
    u.searchParams.set("utm_campaign", "share");
    return u.toString();
  } catch {
    return url;
  }
}

export function shareLink(channel: ShareChannel, opts: { url: string; title: string; text: string; image?: string | null }): string {
  const url = withUtm(opts.url, channel);
  const e = encodeURIComponent;
  switch (channel) {
    case "whatsapp":
      return `https://wa.me/?text=${e(`${opts.text}\n${url}`)}`;
    case "x":
      return `https://twitter.com/intent/tweet?text=${e(opts.text)}&url=${e(url)}`;
    case "linkedin":
      return `https://www.linkedin.com/sharing/share-offsite/?url=${e(url)}`;
    case "facebook":
      return `https://www.facebook.com/sharer/sharer.php?u=${e(url)}`;
    case "telegram":
      return `https://t.me/share/url?url=${e(url)}&text=${e(opts.text)}`;
    case "pinterest":
      return `https://www.pinterest.com/pin/create/button/?url=${e(url)}&description=${e(opts.text)}${opts.image ? `&media=${e(opts.image)}` : ""}`;
    case "email":
      return `mailto:?subject=${e(opts.title)}&body=${e(`${opts.text}\n\n${url}`)}`;
  }
}

export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    try {
      const ta = document.createElement("textarea");
      ta.value = text;
      ta.setAttribute("readonly", "");
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.select();
      const ok = document.execCommand("copy");
      ta.remove();
      return ok;
    } catch {
      return false;
    }
  }
}
