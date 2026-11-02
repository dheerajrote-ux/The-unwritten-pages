import { useEffect } from "react";

function setMeta(attr: "name" | "property", key: string, value: string | null | undefined) {
  let el = document.head.querySelector<HTMLMetaElement>(`meta[${attr}="${key}"]`);
  if (!value) {
    el?.remove();
    return;
  }
  if (!el) {
    el = document.createElement("meta");
    el.setAttribute(attr, key);
    document.head.appendChild(el);
  }
  el.content = value;
}

/** Client-side SEO tags (for crawlers that render JS; see README for prerendering). */
export function useDocumentMeta(meta: { title?: string; description?: string | null; image?: string | null; canonical?: string | null; url?: string | null; type?: "website" | "article"; siteName?: string; author?: string | null }) {
  useEffect(() => {
    if (meta.title) document.title = meta.title;
    setMeta("name", "description", meta.description);
    setMeta("property", "og:title", meta.title);
    setMeta("property", "og:description", meta.description);
    setMeta("property", "og:image", meta.image);
    setMeta("property", "og:url", meta.url);
    setMeta("property", "og:type", meta.type ?? "website");
    setMeta("property", "og:site_name", meta.siteName);
    setMeta("name", "author", meta.author);
    setMeta("name", "twitter:card", meta.image ? "summary_large_image" : "summary");
    setMeta("name", "twitter:title", meta.title);
    setMeta("name", "twitter:description", meta.description);
    setMeta("name", "twitter:image", meta.image);
    let link = document.head.querySelector<HTMLLinkElement>('link[rel="canonical"]');
    if (meta.canonical) {
      if (!link) {
        link = document.createElement("link");
        link.rel = "canonical";
        document.head.appendChild(link);
      }
      link.href = meta.canonical;
    } else link?.remove();
  }, [meta.title, meta.description, meta.image, meta.canonical, meta.url, meta.type, meta.siteName, meta.author]);
}
