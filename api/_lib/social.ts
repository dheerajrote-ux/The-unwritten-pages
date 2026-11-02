// Shared helpers for the social-metadata edge functions (Vercel).
// Reads only public data through Supabase's REST API with the anon key, so RLS
// guarantees nothing unpublished can leak into a link preview.

import { PUBLIC_SUPABASE_ANON_KEY, PUBLIC_SUPABASE_URL } from "../../src/lib/public-supabase";

export interface SiteInfo {
  site_name: string;
  site_url: string | null;
  tagline: string;
}

export interface PublicationInfo {
  title: string;
  slug: string;
  description: string;
  author: string | null;
  tags: string[];
  language: string | null;
  cover_image_path: string | null;
  updated_at: string;
  published_at: string;
  category: { name: string } | null;
  seo: { seo_title: string | null; meta_description: string | null; og_image_path: string | null; canonical_url: string | null } | null;
}

const env = (k: string) => (typeof process !== "undefined" ? process.env[k] : undefined) ?? "";
export const SUPABASE_URL = () => env("SUPABASE_URL") || env("VITE_SUPABASE_URL") || PUBLIC_SUPABASE_URL;
const ANON = () => env("SUPABASE_ANON_KEY") || env("VITE_SUPABASE_ANON_KEY") || PUBLIC_SUPABASE_ANON_KEY;

export const SLUG_RE = /^[a-z0-9]+(-[a-z0-9]+)*$/;

async function rest<T>(path: string): Promise<T | null> {
  const base = SUPABASE_URL();
  const key = ANON();
  if (!base || !key) return null;
  const res = await fetch(`${base}/rest/v1/${path}`, { headers: { apikey: key, Authorization: `Bearer ${key}`, Accept: "application/json" } });
  if (!res.ok) return null;
  const rows = (await res.json()) as T[];
  return rows[0] ?? null;
}

const one = <T,>(v: T | T[] | null | undefined): T | null => (Array.isArray(v) ? v[0] ?? null : v ?? null);

export async function getSite(): Promise<SiteInfo> {
  const s = await rest<SiteInfo>("site_settings?select=site_name,site_url,tagline&id=eq.1");
  return { site_name: s?.site_name || "The Unwritten Pages", site_url: s?.site_url || null, tagline: s?.tagline || "" };
}

export async function getPublication(slug: string): Promise<PublicationInfo | null> {
  if (!SLUG_RE.test(slug)) return null;
  const now = encodeURIComponent(new Date().toISOString());
  const row = await rest<PublicationInfo>(
    `publications?select=title,slug,description,author,tags,language,cover_image_path,updated_at,published_at,category:categories(name),seo:publication_seo(seo_title,meta_description,og_image_path,canonical_url)` +
      `&slug=eq.${slug}&status=eq.published&published_at=lte.${now}&limit=1`,
  );
  if (!row) return null;
  return { ...row, category: one(row.category), seo: one(row.seo) };
}

export async function getRecentCovers(limit = 3): Promise<string[]> {
  const base = SUPABASE_URL();
  const key = ANON();
  if (!base || !key) return [];
  const now = encodeURIComponent(new Date().toISOString());
  const res = await fetch(`${base}/rest/v1/publications?select=cover_image_path,is_featured&status=eq.published&published_at=lte.${now}&order=is_featured.desc,published_at.desc&limit=${limit}`, {
    headers: { apikey: key, Authorization: `Bearer ${key}` },
  });
  if (!res.ok) return [];
  const rows = (await res.json()) as { cover_image_path: string | null }[];
  return rows.map((r) => coverUrl(r.cover_image_path)).filter((u): u is string => !!u);
}

export function coverUrl(path: string | null | undefined): string | null {
  if (!path) return null;
  if (/^https?:/.test(path)) return path;
  return `${SUPABASE_URL()}/storage/v1/object/public/publication-covers/${path.split("/").map(encodeURIComponent).join("/")}`;
}

export function siteBase(site: SiteInfo, req: Request): string {
  return (site.site_url || new URL(req.url).origin).replace(/\/+$/, "");
}

export function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

export function truncate(s: string, n: number): string {
  const t = s.replace(/\s+/g, " ").trim();
  return t.length <= n ? t : t.slice(0, n - 1).replace(/\s+\S*$/, "") + "…";
}

export interface PageMeta {
  title: string;
  description: string;
  url: string;
  image: string;
  imageAlt: string;
  imageSize?: { w: number; h: number };
  type: "website" | "article";
  siteName: string;
  canonical: string;
  author?: string | null;
  publishedTime?: string;
  modifiedTime?: string;
  section?: string | null;
  tags?: string[];
  locale?: string;
  jsonLd: Record<string, unknown>;
}

/** Replaces the static <title>/description in the SPA shell and injects full social metadata. */
export function injectMeta(html: string, m: PageMeta): string {
  const tags = [
    `<title>${esc(m.title)}</title>`,
    `<meta name="description" content="${esc(m.description)}" />`,
    `<link rel="canonical" href="${esc(m.canonical)}" />`,
    `<meta property="og:site_name" content="${esc(m.siteName)}" />`,
    `<meta property="og:type" content="${m.type}" />`,
    `<meta property="og:title" content="${esc(m.title)}" />`,
    `<meta property="og:description" content="${esc(m.description)}" />`,
    `<meta property="og:url" content="${esc(m.url)}" />`,
    `<meta property="og:image" content="${esc(m.image)}" />`,
    `<meta property="og:image:alt" content="${esc(m.imageAlt)}" />`,
    m.imageSize ? `<meta property="og:image:width" content="${m.imageSize.w}" />\n<meta property="og:image:height" content="${m.imageSize.h}" />` : "",
    m.locale ? `<meta property="og:locale" content="${esc(m.locale)}" />` : "",
    m.author ? `<meta name="author" content="${esc(m.author)}" />\n<meta property="article:author" content="${esc(m.author)}" />` : "",
    m.publishedTime ? `<meta property="article:published_time" content="${esc(m.publishedTime)}" />` : "",
    m.modifiedTime ? `<meta property="article:modified_time" content="${esc(m.modifiedTime)}" />` : "",
    m.section ? `<meta property="article:section" content="${esc(m.section)}" />` : "",
    ...(m.tags ?? []).map((t) => `<meta property="article:tag" content="${esc(t)}" />`),
    `<meta name="twitter:card" content="summary_large_image" />`,
    `<meta name="twitter:title" content="${esc(m.title)}" />`,
    `<meta name="twitter:description" content="${esc(m.description)}" />`,
    `<meta name="twitter:image" content="${esc(m.image)}" />`,
    `<meta name="twitter:image:alt" content="${esc(m.imageAlt)}" />`,
    `<script type="application/ld+json">${JSON.stringify(m.jsonLd).replace(/</g, "\\u003c")}</script>`,
  ]
    .filter(Boolean)
    .join("\n    ");
  return html
    .replace(/<title>[\s\S]*?<\/title>/i, "")
    .replace(/<meta\s+name="description"[^>]*>/i, "")
    .replace(/<meta\s+property="og:[^"]+"[^>]*>/gi, "")
    .replace(/<meta\s+name="twitter:[^"]+"[^>]*>/gi, "")
    .replace(/<\/head>/i, `    ${tags}\n  </head>`);
}

const LOCALES: Record<string, string> = { en: "en_IN", hi: "hi_IN", mr: "mr_IN", es: "es_ES", fr: "fr_FR", de: "de_DE", pt: "pt_PT", ja: "ja_JP", zh: "zh_CN", ar: "ar_AR" };

export function publicationMeta(pub: PublicationInfo, site: SiteInfo, base: string): PageMeta {
  const url = `${base}/library/${pub.slug}`;
  const title = `${pub.seo?.seo_title || pub.title} — ${site.site_name}`;
  const description = truncate(pub.seo?.meta_description || pub.description || site.tagline, 200);
  const custom = coverUrl(pub.seo?.og_image_path);
  const image = custom ?? `${base}/api/og?slug=${pub.slug}&v=${encodeURIComponent(pub.updated_at)}`;
  return {
    title,
    description,
    url,
    canonical: pub.seo?.canonical_url || url,
    image,
    imageAlt: `Cover of ${pub.title}${pub.author ? ` by ${pub.author}` : ""}`,
    imageSize: custom ? undefined : { w: 1200, h: 630 },
    type: "article",
    siteName: site.site_name,
    author: pub.author,
    publishedTime: pub.published_at,
    modifiedTime: pub.updated_at,
    section: pub.category?.name ?? null,
    tags: pub.tags,
    locale: LOCALES[pub.language ?? "en"],
    jsonLd: {
      "@context": "https://schema.org",
      "@type": "Article",
      headline: pub.title,
      description,
      url,
      image: [image, coverUrl(pub.cover_image_path)].filter(Boolean),
      inLanguage: pub.language ?? "en",
      datePublished: pub.published_at,
      dateModified: pub.updated_at,
      keywords: pub.tags.join(", "),
      articleSection: pub.category?.name,
      author: pub.author ? { "@type": "Person", name: pub.author } : undefined,
      publisher: { "@type": "Organization", name: site.site_name, url: base },
      isAccessibleForFree: true,
    },
  };
}

export interface BookInfo {
  title: string;
  slug: string;
  subtitle: string | null;
  author: string | null;
  short_description: string;
  cover_image_path: string | null;
  isbn_13: string | null;
  language: string | null;
  publication_date: string | null;
  updated_at: string;
  seo_title: string | null;
  meta_description: string | null;
  og_image_path: string | null;
  canonical_url: string | null;
}

export async function getBook(slug: string): Promise<BookInfo | null> {
  if (!SLUG_RE.test(slug)) return null;
  const now = encodeURIComponent(new Date().toISOString());
  return rest<BookInfo>(
    `books?select=title,slug,subtitle,author,short_description,cover_image_path,isbn_13,language,publication_date,updated_at,seo_title,meta_description,og_image_path,canonical_url` +
      `&slug=eq.${slug}&status=eq.published&published_at=lte.${now}&limit=1`,
  );
}

export function bookMeta(book: BookInfo, site: SiteInfo, base: string): PageMeta {
  const url = `${base}/books/${book.slug}`;
  const description = truncate(book.meta_description || book.short_description || site.tagline, 200);
  const image = coverUrl(book.og_image_path) ?? coverUrl(book.cover_image_path) ?? `${base}/api/og`;
  return {
    title: `${book.seo_title || book.title} — ${site.site_name}`,
    description,
    url,
    canonical: book.canonical_url || url,
    image,
    imageAlt: `Cover of ${book.title}`,
    type: "website",
    siteName: site.site_name,
    author: book.author,
    locale: "en_IN",
    jsonLd: {
      "@context": "https://schema.org",
      "@type": "Book",
      name: book.title,
      alternativeHeadline: book.subtitle ?? undefined,
      description,
      url,
      image,
      isbn: book.isbn_13 ?? undefined,
      inLanguage: book.language ?? "en",
      datePublished: book.publication_date ?? undefined,
      author: book.author ? { "@type": "Person", name: book.author } : undefined,
    },
  };
}

export function pageMeta(page: "home" | "library" | "about" | "books", site: SiteInfo, base: string): PageMeta {
  const path = page === "home" ? "" : `/${page}`;
  const url = `${base}${path}`;
  const titles = { home: site.site_name, library: `Library — ${site.site_name}`, about: `About Dheeraj Rote — ${site.site_name}`, books: `Books — ${site.site_name}` };
  const descriptions = {
    home: site.tagline,
    library: `Browse every publication in ${site.site_name}. ${site.tagline}`,
    about: "Dheeraj Rote is a UX leader and author writing short essays about people, growing up, and the quiet things in between.",
    books: "Books That Inspire Ideas — longer works by Dheeraj Rote, with links to buy on Amazon.",
  };
  const image = `${base}/api/og${page === "about" ? "?page=about" : ""}`;
  return {
    title: titles[page],
    description: truncate(descriptions[page], 200),
    url,
    canonical: url,
    image,
    imageAlt: site.site_name,
    imageSize: { w: 1200, h: 630 },
    type: "website",
    siteName: site.site_name,
    locale: "en_IN",
    jsonLd:
      page === "about"
        ? { "@context": "https://schema.org", "@type": "ProfilePage", url, mainEntity: { "@type": "Person", name: "Dheeraj Rote", jobTitle: "UX Manager and Author" } }
        : { "@context": "https://schema.org", "@type": "WebSite", name: site.site_name, url: base, description: site.tagline },
  };
}
