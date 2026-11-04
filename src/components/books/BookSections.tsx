import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, ChevronLeft, ChevronRight } from "lucide-react";
import { api } from "@/data";
import { useAsync } from "@/hooks/useAsync";
import { activeLinks, type Book, type PlacementKey, type PlacementResult } from "@/lib/books";
import { cn } from "@/lib/utils";
import { BookCard } from "./BookCard";
import { PurchaseFinePrint } from "./AmazonPurchaseButton";

export function usePlacement(key: PlacementKey, opts: { publicationId?: string; excludeBookId?: string; categoryId?: string | null } = {}) {
  return useAsync<PlacementResult>(() => api.getPlacementBooks(key, opts).catch(() => ({ placement: null, books: [] })), [key, opts.publicationId, opts.excludeBookId, opts.categoryId]);
}

/** Horizontal, scroll-snapping carousel with arrow controls. */
export function BookCarousel({ books, surface }: { books: Book[]; surface: PlacementKey }) {
  const track = useRef<HTMLDivElement>(null);
  const [edges, setEdges] = useState({ start: true, end: false });
  const update = () => {
    const el = track.current;
    if (!el) return;
    setEdges({ start: el.scrollLeft < 8, end: el.scrollLeft + el.clientWidth >= el.scrollWidth - 8 });
  };
  useEffect(() => {
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, [books.length]);
  const scroll = (dir: 1 | -1) => track.current?.scrollBy({ left: dir * track.current.clientWidth * 0.85, behavior: "smooth" });
  return (
    <div className="relative">
      <div ref={track} onScroll={update} className="relative -mx-5 flex snap-x snap-mandatory gap-6 overflow-x-auto px-5 pb-4 scrollbar-thin sm:-mx-8 sm:px-8" role="list">
        {books.map((b) => (
          <div key={b.id} role="listitem" className="w-[78%] shrink-0 snap-start sm:w-[45%] lg:w-[30%] xl:w-[23%]">
            <BookCard book={b} surface={surface} />
          </div>
        ))}
      </div>
      {books.length > 2 && (
        <div className="mt-2 flex justify-end gap-2">
          <button onClick={() => scroll(-1)} disabled={edges.start} className="grid size-10 place-items-center rounded-full border border-line-strong bg-surface text-ink transition-colors hover:bg-paper disabled:opacity-35" aria-label="Previous books">
            <ChevronLeft className="size-4" />
          </button>
          <button onClick={() => scroll(1)} disabled={edges.end} className="grid size-10 place-items-center rounded-full border border-line-strong bg-surface text-ink transition-colors hover:bg-paper disabled:opacity-35" aria-label="Next books">
            <ChevronRight className="size-4" />
          </button>
        </div>
      )}
    </div>
  );
}

/** A homepage / page section driven entirely by a placement's configuration. */
export function PlacementSection({ placementKey, layout = "grid", eyebrow, publicationId, excludeBookId, categoryId, className, viewAll = true }: {
  placementKey: PlacementKey;
  layout?: "grid" | "carousel";
  eyebrow?: string;
  publicationId?: string;
  excludeBookId?: string;
  categoryId?: string | null;
  className?: string;
  viewAll?: boolean;
}) {
  const { data } = usePlacement(placementKey, { publicationId, excludeBookId, categoryId });
  if (!data?.placement || !data.books.length) return null;
  const { placement, books } = data;
  return (
    <section className={cn("mx-auto max-w-7xl px-5 sm:px-8", className)} aria-labelledby={`pl-${placementKey}`}>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          {eyebrow && <p className="eyebrow">{eyebrow}</p>}
          <h2 id={`pl-${placementKey}`} className="mt-2 font-display text-[32px] font-normal leading-tight text-ink sm:text-[36px]">{placement.heading}</h2>
          {placement.description && <p className="mt-2 max-w-xl text-[15.5px] leading-relaxed text-secondary">{placement.description}</p>}
        </div>
        {viewAll && (
          <Link to="/books" className="inline-flex shrink-0 items-center gap-1.5 text-sm font-medium text-primary">
            All books <ArrowRight className="size-4" />
          </Link>
        )}
      </div>
      <div className="mt-8">
        {layout === "carousel" ? (
          <BookCarousel books={books} surface={placementKey} />
        ) : (
          <div className="grid gap-x-8 gap-y-12 sm:grid-cols-2 lg:grid-cols-3">
            {books.map((b) => <BookCard key={b.id} book={b} surface={placementKey} publicationId={publicationId} />)}
          </div>
        )}
      </div>
      {books.some((b) => activeLinks(b).length > 0) && <PurchaseFinePrint className="mt-4" showPriceNote={books.some((b) => b.links?.some((l) => l.show_price && l.displayed_price !== null))} />}
    </section>
  );
}
