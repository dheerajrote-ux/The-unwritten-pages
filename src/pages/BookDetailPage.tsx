import { useEffect, useRef } from "react";
import { Link, useParams } from "react-router-dom";
import { ArrowLeft, ArrowRight, Check, ShoppingBag } from "lucide-react";
import { api } from "@/data";
import { useAsync } from "@/hooks/useAsync";
import { useSite } from "@/hooks/useSite";
import { useDocumentMeta } from "@/hooks/useDocumentMeta";
import { activeLinks, formatLabel, formatPrice, marketplaceLabel, type Book } from "@/lib/books";
import { formatDate, languageLabel } from "@/lib/utils";
import { BookJacket } from "@/components/books/BookJacket";
import { AmazonPurchaseButton, PurchaseFinePrint } from "@/components/books/AmazonPurchaseButton";
import { PlacementSection } from "@/components/books/BookSections";
import { Button } from "@/components/ui/button";
import { EmptyState, ErrorState, Skeleton } from "@/components/ui/misc";

export function BookDetailPage() {
  const { slug = "" } = useParams();
  const { site } = useSite();
  const { data: book, error, loading, reload } = useAsync(() => api.getPublicBook(slug), [slug]);
  const viewed = useRef<string | null>(null);

  useEffect(() => {
    window.scrollTo(0, 0);
  }, [slug]);
  useEffect(() => {
    if (book && viewed.current !== book.id) {
      viewed.current = book.id;
      api.trackBookEvent(book.id, "book_detail_view", { surface: "book_detail" }).catch(() => undefined);
    }
  }, [book]);

  useDocumentMeta({
    title: book ? `${book.seo_title || book.title} — ${site.site_name}` : site.site_name,
    description: book ? book.meta_description || book.short_description : null,
    image: book ? api.coverUrl(book.og_image_path || book.cover_image_path) : null,
    canonical: book?.canonical_url ?? null,
    type: "article",
    siteName: site.site_name,
    author: book?.author ?? null,
  });

  if (loading) return <div className="mx-auto grid max-w-6xl gap-12 px-5 py-20 sm:px-8 md:grid-cols-[320px_1fr]"><Skeleton className="aspect-[2/3]" /><div className="space-y-4"><Skeleton className="h-12 w-3/4" /><Skeleton className="h-6 w-1/3" /><Skeleton className="h-32" /></div></div>;
  if (error) return <ErrorState message={error} onRetry={reload} />;
  if (!book) return <EmptyState className="py-32" title="Book not found" description="It may have been moved or is no longer available." action={<Button asChild variant="outline"><Link to="/books">All books</Link></Button>} />;

  return <BookDetailView book={book} />;
}

/** Shared by the public page and the admin preview. */
export function BookDetailView({ book, preview }: { book: Book; preview?: boolean }) {
  const links = activeLinks(book);
  const info: [string, string | null | undefined][] = [
    ["Author", book.author],
    ["Publisher", book.publisher],
    ["Publication date", book.publication_date ? formatDate(book.publication_date) : null],
    ["Language", book.language ? languageLabel(book.language) : null],
    ["Pages", book.page_count?.toString()],
    ["Edition", book.edition],
    ["Formats", book.formats.length ? book.formats.map(formatLabel).join(", ") : null],
    ["ISBN-13", book.isbn_13],
    ["ISBN-10", book.isbn_10],
  ];
  const hasDetails = book.learn_points.length > 0 || !!book.audience || book.key_takeaways.length > 0;
  return (
    <article className="animate-fade-in">
      {/* Hero */}
      <section className="mx-auto max-w-6xl px-5 pt-10 sm:px-8">
        {!preview && (
          <Link to="/books" className="inline-flex items-center gap-1.5 text-[13.5px] text-secondary hover:text-ink">
            <ArrowLeft className="size-4" /> All books
          </Link>
        )}
        <div className="mt-8 grid items-start gap-12 md:grid-cols-[minmax(0,340px)_1fr] lg:gap-20">
          <div className="mx-auto w-[70%] max-w-[340px] md:w-full">
            <BookJacket path={book.cover_image_path} title={book.title} author={book.author} className="w-full" eager />
          </div>
          <div>
            {book.category?.name && <p className="eyebrow text-[#9a7232]">{book.category.name}</p>}
            <h1 className="mt-3 font-display text-[40px] font-normal leading-[1.05] tracking-tight text-ink text-balance sm:text-[54px]">{book.title}</h1>
            {book.subtitle && <p className="mt-3 font-display text-[22px] italic leading-snug text-secondary">{book.subtitle}</p>}
            {book.author && <p className="mt-4 text-[15px] text-secondary">by <span className="font-medium text-ink">{book.author}</span></p>}
            <p className="mt-6 max-w-2xl text-[17.5px] leading-relaxed text-secondary">{book.short_description}</p>
            {book.formats.length > 0 && (
              <ul className="mt-6 flex flex-wrap gap-2" aria-label="Available formats">
                {book.formats.map((f) => <li key={f} className="rounded-full border border-line-strong px-3 py-1 text-[12.5px] text-secondary">{formatLabel(f)}</li>)}
              </ul>
            )}
            <div className="mt-8 flex flex-wrap items-center gap-3">
              <AmazonPurchaseButton book={book} surface="book_detail" size="lg" />
              {links.length > 1 && (
                <Button variant="ghost" size="lg" onClick={() => document.getElementById("purchase")?.scrollIntoView({ behavior: "smooth" })}>All buying options</Button>
              )}
            </div>
            {links.length > 0 && <PurchaseFinePrint className="mt-3" />}
          </div>
        </div>
      </section>

      {/* Description & info */}
      <section className="mx-auto mt-20 grid max-w-6xl gap-12 border-t border-line px-5 pt-16 sm:px-8 lg:grid-cols-[1fr_320px] lg:gap-20">
        <div>
          <h2 className="font-display text-[30px] font-normal text-ink">About the book</h2>
          <div className="mt-5 space-y-5 text-[17px] leading-[1.8] text-secondary">
            {(book.full_description || book.short_description).split(/\n{2,}/).map((p, i) => <p key={i}>{p}</p>)}
          </div>
          {hasDetails && (
            <div className="mt-12 space-y-10">
              {book.learn_points.length > 0 && (
                <div>
                  <h3 className="text-[18px] font-semibold text-ink">What readers will learn</h3>
                  <ul className="mt-4 space-y-3">{book.learn_points.map((x) => <li key={x} className="flex gap-3 text-[16px] leading-relaxed text-secondary"><Check className="mt-1 size-4 shrink-0 text-[#9a7232]" />{x}</li>)}</ul>
                </div>
              )}
              {book.audience && (
                <div>
                  <h3 className="text-[18px] font-semibold text-ink">Who should read this book</h3>
                  <p className="mt-3 text-[16px] leading-relaxed text-secondary">{book.audience}</p>
                </div>
              )}
              {book.key_takeaways.length > 0 && (
                <div>
                  <h3 className="text-[18px] font-semibold text-ink">Key takeaways</h3>
                  <ol className="mt-4 grid gap-3 sm:grid-cols-2">{book.key_takeaways.map((x, i) => <li key={x} className="rounded-xl border border-line bg-surface p-4 text-[15px] leading-relaxed text-secondary"><span className="mb-1 block font-display text-[22px] text-[#9a7232]">{String(i + 1).padStart(2, "0")}</span>{x}</li>)}</ol>
                </div>
              )}
            </div>
          )}
        </div>
        <aside>
          <h2 className="text-[13px] font-semibold uppercase tracking-wider text-muted">Book information</h2>
          <dl className="mt-4 divide-y divide-line rounded-xl border border-line bg-surface">
            {info.filter(([, v]) => v).map(([k, v]) => (
              <div key={k} className="flex justify-between gap-4 px-5 py-3 text-[14px]">
                <dt className="text-muted">{k}</dt>
                <dd className="text-right font-medium text-ink">{v}</dd>
              </div>
            ))}
          </dl>
        </aside>
      </section>

      {/* Purchase */}
      <section id="purchase" className="mx-auto mt-20 max-w-6xl scroll-mt-24 px-5 sm:px-8">
        <div className="rounded-2xl bg-primary p-8 text-white sm:p-12">
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-accent">Get the book</p>
          <h2 className="mt-3 font-display text-[32px] font-normal leading-tight">{links.length ? "Buy on Amazon" : "Coming soon on Amazon"}</h2>
          {links.length ? (
            <ul className="mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {links.map((l) => (
                <li key={l.id}>
                  <AmazonPurchaseButton book={{ ...book, links: [l] }} surface="book_detail" withOptions={false} label={l.display_label || `${formatLabel(l.format)} · ${marketplaceLabel(l.marketplace, l.marketplace_name)}`} className="w-full" size="lg" />
                  {l.show_price && formatPrice(l.displayed_price, l.currency) && <p className="mt-1.5 text-center text-[12.5px] text-white/70">{formatPrice(l.displayed_price, l.currency)} · listed price</p>}
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-4 max-w-xl text-[15.5px] leading-relaxed text-white/75">
              <ShoppingBag className="mr-2 inline size-4 text-accent" />
              Purchase links will appear here as soon as the book is available.
            </p>
          )}
          <p className="mt-6 text-[13px] text-white/70">You will be redirected to Amazon to complete your purchase.{links.some((l) => l.show_price && l.displayed_price !== null) && " Prices are updated manually and may differ on Amazon."}</p>
          <SiteDisclosure />
        </div>
      </section>

      {!preview && <PlacementSection placementKey="related_books" excludeBookId={book.id} categoryId={book.category_id} className="mt-24" viewAll />}
      {!preview && (
        <div className="mx-auto mt-20 max-w-6xl px-5 sm:px-8">
          <Link to="/library" className="inline-flex items-center gap-2 text-[14px] font-medium text-primary">
            Read the free essays in the library <ArrowRight className="size-3.5" />
          </Link>
        </div>
      )}
    </article>
  );
}

function SiteDisclosure() {
  const { site } = useSite();
  if (!site.amazon_associate || !site.affiliate_disclosure) return null;
  return <p className="mt-2 text-[12.5px] text-white/60">{site.affiliate_disclosure}</p>;
}
