// GET /api/meta?page=publication&slug=…  (rewritten from /library/:slug, /, /library, /about)
// Returns the SPA shell with server-rendered Open Graph, Twitter Card and JSON-LD
// tags so social networks — which don't run JavaScript — show rich previews.
import { bookMeta, getBook, getPublication, getSite, injectMeta, pageMeta, publicationMeta, siteBase } from "./_lib/social";

export const config = { runtime: "edge" };

export default async function handler(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const page = (url.searchParams.get("page") ?? "home") as "home" | "library" | "about" | "books" | "book" | "publication";
  // The Vercel build renames index.html to app.html (see vite.config.ts).
  let shellRes = await fetch(new URL("/app.html", url.origin));
  if (!shellRes.ok) shellRes = await fetch(new URL("/index.html", url.origin));
  const shell = await shellRes.text();
  const headers = { "content-type": "text/html; charset=utf-8", "cache-control": "public, max-age=0, s-maxage=300, stale-while-revalidate=86400" };

  try {
    const site = await getSite();
    const base = siteBase(site, req);
    if (page === "publication") {
      const pub = await getPublication(url.searchParams.get("slug") ?? "");
      // Unknown or unpublished: serve the plain shell and let the app show its 404.
      if (!pub) return new Response(shell, { headers: { ...headers, "x-robots-tag": "noindex" } });
      return new Response(injectMeta(shell, publicationMeta(pub, site, base)), { headers });
    }
    if (page === "book") {
      const book = await getBook(url.searchParams.get("slug") ?? "");
      if (!book) return new Response(shell, { headers: { ...headers, "x-robots-tag": "noindex" } });
      return new Response(injectMeta(shell, bookMeta(book, site, base)), { headers });
    }
    const p = page === "library" || page === "about" || page === "books" ? page : "home";
    return new Response(injectMeta(shell, pageMeta(p, site, base)), { headers });
  } catch {
    // Metadata must never block the page itself.
    return new Response(shell, { headers });
  }
}
