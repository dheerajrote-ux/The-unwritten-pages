import { Link } from "react-router-dom";
import { ArrowRight } from "lucide-react";
import { formatLabel, type Book, type EventSurface } from "@/lib/books";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { AmazonPurchaseButton, PriceNote } from "./AmazonPurchaseButton";
import { BookJacket } from "./BookJacket";
import { useBookImpression } from "./useBookImpression";

/** Grid / carousel card: cover, category, title, author, short description, formats, CTAs. */
export function BookCard({ book, surface, publicationId, className }: { book: Book; surface: EventSurface; publicationId?: string; className?: string }) {
  const ref = useBookImpression<HTMLElement>(book.id, surface, publicationId);
  return (
    <article ref={ref} className={cn("group flex flex-col", className)}>
      <Link to={`/books/${book.slug}`} className="flex aspect-[4/4.6] items-center justify-center rounded-xl bg-[#efece6] px-[18%] py-[8%] transition-colors duration-300 group-hover:bg-[#e9e5dd]" tabIndex={-1} aria-hidden>
        <BookJacket path={book.cover_image_path} title={book.title} author={book.author} className="h-full w-auto max-w-full transition-transform duration-500 ease-out group-hover:-translate-y-1.5" />
      </Link>
      <div className="flex flex-1 flex-col px-1 pt-5">
        <p className="eyebrow flex flex-wrap items-center gap-x-2">
          {book.category?.name && <span className="text-[#9a7232]">{book.category.name}</span>}
          {book.formats.length > 0 && <span>{book.formats.map(formatLabel).join(" · ")}</span>}
        </p>
        <h3 className="mt-2 font-display text-[22px] font-medium leading-[1.18] text-ink text-balance">
          <Link to={`/books/${book.slug}`} className="hover:text-primary">{book.title}</Link>
        </h3>
        {book.author && <p className="mt-1 text-[13.5px] text-secondary">by {book.author}</p>}
        <p className="mt-2 line-clamp-2 text-[14px] leading-relaxed text-secondary">{book.short_description}</p>
        <PriceNote book={book} className="mt-2" />
        <div className="mt-auto flex flex-wrap gap-2 pt-4">
          <AmazonPurchaseButton book={book} surface={surface} publicationId={publicationId} size="sm" withOptions={false} />
          <Button asChild variant="outline" size="sm">
            <Link to={`/books/${book.slug}`}>
              Explore Book <ArrowRight />
            </Link>
          </Button>
        </div>
      </div>
    </article>
  );
}

/** Compact card for the reader sidebar and footer. */
export function BookCompact({ book, surface, publicationId, dark }: { book: Book; surface: EventSurface; publicationId?: string; dark?: boolean }) {
  const ref = useBookImpression<HTMLElement>(book.id, surface, publicationId);
  return (
    <article ref={ref} className="flex gap-3.5">
      <Link to={`/books/${book.slug}`} className="w-[68px] shrink-0" tabIndex={-1} aria-hidden>
        <BookJacket path={book.cover_image_path} title={book.title} author={book.author} className="w-full" />
      </Link>
      <div className="min-w-0 flex-1">
        <h4 className={cn("font-display text-[16.5px] leading-snug", dark ? "text-white" : "text-ink")}>
          <Link to={`/books/${book.slug}`} className="hover:underline underline-offset-4">{book.title}</Link>
        </h4>
        <p className={cn("mt-1 line-clamp-2 text-[12.5px] leading-relaxed", dark ? "text-white/65" : "text-secondary")}>{book.short_description}</p>
        <div className="mt-2.5 flex flex-wrap items-center gap-x-3 gap-y-2">
          <AmazonPurchaseButton book={book} surface={surface} publicationId={publicationId} size="sm" withOptions={false} className={cn("[&_a]:h-7 [&_a]:px-2.5 [&_a]:text-[12px] [&_span]:h-7 [&_span]:text-[12px]", dark && "[&_span[aria-disabled]]:bg-white/10 [&_span[aria-disabled]]:text-white/75")} />
          <Link to={`/books/${book.slug}`} className={cn("text-[12.5px] font-medium underline-offset-4 hover:underline", dark ? "text-white/85" : "text-primary")}>
            Explore Book
          </Link>
        </div>
      </div>
    </article>
  );
}
