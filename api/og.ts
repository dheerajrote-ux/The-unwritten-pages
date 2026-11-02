// GET /api/og?slug=…   → 1200×630 PNG preview for a publication
// GET /api/og          → site card (fan of covers)    GET /api/og?page=about → author card
import { ImageResponse } from "@vercel/og";
import { coverUrl, getPublication, getRecentCovers, getSite, truncate } from "./_lib/social";

export const config = { runtime: "edge" };

type Node = { type: string; props: Record<string, unknown> };
const h = (type: string, style: Record<string, unknown>, children?: unknown, extra: Record<string, unknown> = {}): Node => ({
  type,
  props: { style, ...extra, ...(children !== undefined ? { children } : {}) },
});

const C = { paper: "#F8F8F6", ink: "#20252B", muted: "#52647A", navy: "#172B4D", gold: "#D6A85F", goldInk: "#9A7232", soft: "#F3E6CF" };

async function font(origin: string, file: string) {
  const r = await fetch(new URL(`/og/${file}`, origin));
  if (!r.ok) throw new Error(`font ${file}`);
  return r.arrayBuffer();
}

/**
 * Fetches a cover and returns it as a data URL. The renderer supports PNG/JPEG
 * only, so other formats (e.g. older WebP uploads) fall back to a text-only card.
 */
async function usableImage(url: string | null): Promise<string | null> {
  if (!url) return null;
  try {
    const r = await fetch(url);
    const type = (r.headers.get("content-type") ?? "").split(";")[0];
    if (!r.ok || !/^image\/(png|jpe?g)$/.test(type)) return null;
    const bytes = new Uint8Array(await r.arrayBuffer());
    if (bytes.length > 4_000_000) return null;
    let bin = "";
    for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
    return `data:${type};base64,${btoa(bin)}`;
  } catch {
    return null;
  }
}

function brand(siteName: string): Node {
  return h("div", { display: "flex", alignItems: "center", gap: 14 }, [
    h("div", { display: "flex", width: 40, height: 40, borderRadius: 10, background: C.navy, alignItems: "center", justifyContent: "center", gap: 2 }, [
      h("div", { display: "flex", flexDirection: "column", justifyContent: "center", gap: 3, width: 12, height: 17, background: C.soft, borderRadius: "2px 1px 1px 2px", padding: "0 2px" }, [
        h("div", { height: 1.4, background: "rgba(23,43,77,0.5)" }),
        h("div", { height: 1.4, background: "rgba(23,43,77,0.5)" }),
        h("div", { height: 1.4, width: 5, background: "rgba(23,43,77,0.5)" }),
      ]),
      h("div", { display: "flex", justifyContent: "flex-end", width: 12, height: 17, background: "#FBF6EC", borderRadius: "1px 2px 2px 1px", paddingRight: 2 }, [h("div", { width: 3, height: 7, background: C.gold })]),
    ]),
    h("div", { fontFamily: "Newsreader", fontSize: 28, color: C.ink }, siteName),
  ]);
}

function coverEl(src: string, height: number, rotate = 0, extra: Record<string, unknown> = {}): Node {
  return h("img", { height, width: Math.round(height / 1.414), objectFit: "cover", borderRadius: 3, boxShadow: "0 30px 60px -20px rgba(15,25,45,0.45), 0 8px 18px -8px rgba(15,25,45,0.25)", transform: `rotate(${rotate}deg)`, ...extra }, undefined, { src, width: Math.round(height / 1.414), height });
}

export default async function handler(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const slug = url.searchParams.get("slug");
  const page = url.searchParams.get("page");
  const [site, newsreader, inter400, inter600] = await Promise.all([getSite(), font(url.origin, "newsreader-500.woff"), font(url.origin, "inter-400.woff"), font(url.origin, "inter-600.woff")]);
  const fonts = [
    { name: "Newsreader", data: newsreader, weight: 500 as const, style: "normal" as const },
    { name: "Inter", data: inter400, weight: 400 as const, style: "normal" as const },
    { name: "Inter", data: inter600, weight: 600 as const, style: "normal" as const },
  ];

  let body: Node;
  const pub = slug ? await getPublication(slug) : null;

  if (pub) {
    const cover = await usableImage(coverUrl(pub.cover_image_path));
    const title = truncate(pub.title, 90);
    const size = title.length > 60 ? 56 : title.length > 36 ? 66 : 76;
    body = h("div", { display: "flex", width: "100%", height: "100%", background: C.paper, fontFamily: "Inter", position: "relative" }, [
      h("div", { position: "absolute", right: -120, top: -160, width: 560, height: 560, borderRadius: 9999, background: C.soft }),
      h("div", { display: "flex", flexDirection: "column", justifyContent: "space-between", padding: "64px 0 60px 72px", width: cover ? 720 : 1056 }, [
        h("div", { display: "flex", flexDirection: "column" }, [
          h("div", { fontSize: 20, fontWeight: 600, letterSpacing: 4, textTransform: "uppercase", color: C.goldInk }, pub.category?.name ?? "Essay"),
          h("div", { fontFamily: "Newsreader", fontSize: size, lineHeight: 1.08, color: C.ink, marginTop: 22, letterSpacing: -1 }, title),
          pub.author ? h("div", { fontSize: 28, color: C.muted, marginTop: 26 }, `by ${pub.author}`) : h("div", {}),
        ]),
        h("div", { display: "flex", alignItems: "center", justifyContent: "space-between", paddingRight: 40 }, [
          brand(site.site_name),
          h("div", { fontSize: 20, color: C.muted }, "Free to read online"),
        ]),
      ]),
      cover ? h("div", { display: "flex", flex: 1, alignItems: "center", justifyContent: "center", paddingRight: 24 }, [coverEl(cover, 470, 2)]) : h("div", {}),
    ]);
  } else {
    const covers = (await Promise.all((await getRecentCovers(3)).map(usableImage))).filter((c): c is string => !!c);
    const about = page === "about";
    const heading = about ? "Dheeraj Rote" : site.site_name;
    const sub = about ? "UX leader and author of short essays about people, growing up, and the quiet things in between." : truncate(site.tagline, 140);
    body = h("div", { display: "flex", width: "100%", height: "100%", background: C.paper, fontFamily: "Inter", position: "relative" }, [
      h("div", { position: "absolute", right: -100, top: -140, width: 600, height: 600, borderRadius: 9999, background: C.soft }),
      h("div", { display: "flex", flexDirection: "column", justifyContent: "space-between", padding: "70px 0 60px 72px", width: covers.length ? 640 : 1056 }, [
        h("div", { display: "flex", flexDirection: "column" }, [
          h("div", { fontSize: 20, fontWeight: 600, letterSpacing: 4, textTransform: "uppercase", color: C.goldInk }, about ? "About the author" : "Digital library"),
          h("div", { fontFamily: "Newsreader", fontSize: 76, lineHeight: 1.04, color: C.ink, marginTop: 22, letterSpacing: -1.5 }, heading),
          h("div", { fontSize: 27, lineHeight: 1.4, color: C.muted, marginTop: 24 }, sub),
        ]),
        brand(site.site_name),
      ]),
      covers.length
        ? h("div", { display: "flex", flex: 1, position: "relative" }, covers.slice(0, 3).map((c, i) =>
            coverEl(c, i === 0 ? 420 : 360, [0, -7, 6][i], { position: "absolute", left: [140, 30, 260][i], top: [100, 150, 130][i], zIndex: 3 - i }),
          ).reverse())
        : h("div", {}),
    ]);
  }

  return new ImageResponse(body as never, {
    width: 1200,
    height: 630,
    fonts,
    headers: { "cache-control": "public, max-age=3600, s-maxage=86400, stale-while-revalidate=604800" },
  });
}
