// Shared placement resolution (used by both data adapters so behaviour matches).
import type { Book, Placement, PlacementKey, PlacementResult, Recommendation } from "./books";

const FALLBACK: Partial<Record<PlacementKey, "featured" | "all" | "category">> = {
  homepage_carousel: "all",
  books_landing: "featured",
  reader_sidebar: "featured",
  reader_footer: "featured",
  download_success: "featured",
  publication_page: "featured",
  related_books: "category",
};

export function isLiveRec(r: Recommendation, now = Date.now()) {
  return r.is_active && (!r.start_date || new Date(r.start_date).getTime() <= now) && (!r.end_date || new Date(r.end_date).getTime() > now);
}

/**
 * Manual recommendations first (publication-specific before global, then by
 * featured, priority and display order). Only if none are configured does a
 * gentle automatic fallback apply (featured books, or same-category books).
 */
export function resolvePlacement(
  placement: Placement | null,
  recs: Recommendation[],
  books: Book[],
  opts: { publicationId?: string; excludeBookId?: string; categoryId?: string | null } = {},
): PlacementResult {
  if (!placement || !placement.is_active) return { placement: null, books: [] };
  const live = new Map(books.map((b) => [b.id, b]));
  const relevant = recs
    .filter((r) => r.placement === placement.placement_key && isLiveRec(r) && live.has(r.book_id))
    .filter((r) => r.publication_id === null || (opts.publicationId && r.publication_id === opts.publicationId))
    .sort(
      (a, b) =>
        Number(b.publication_id !== null) - Number(a.publication_id !== null) ||
        Number(b.is_featured) - Number(a.is_featured) ||
        b.priority - a.priority ||
        a.display_order - b.display_order,
    );
  const seen = new Set<string>();
  let out: Book[] = [];
  for (const r of relevant) {
    if (seen.has(r.book_id) || r.book_id === opts.excludeBookId) continue;
    seen.add(r.book_id);
    out.push(live.get(r.book_id)!);
  }
  if (!out.length) {
    const mode = FALLBACK[placement.placement_key];
    const pool = books.filter((b) => b.id !== opts.excludeBookId);
    if (mode === "all") out = pool;
    else if (mode === "featured") out = pool.filter((b) => b.is_featured);
    else if (mode === "category") out = pool.filter((b) => opts.categoryId && b.category_id === opts.categoryId);
    if (mode === "featured" && !out.length) out = pool;
  }
  return { placement, books: out.slice(0, placement.max_books) };
}
