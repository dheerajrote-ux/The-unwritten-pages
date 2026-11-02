import { useMemo } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { ArrowRight, BookOpen, ExternalLink, Search, X } from "lucide-react";
import { api } from "@/data";
import { useAsync } from "@/hooks/useAsync";
import { useSite } from "@/hooks/useSite";
import { useDocumentMeta } from "@/hooks/useDocumentMeta";
import { FORMATS, activeLinks, formatLabel, type Book, type BookCategory } from "@/lib/books";
import type { Publication } from "@/lib/types";
import { cn } from "@/lib/utils";
import { AUTHOR } from "@/content/author";
import { BookCard } from "@/components/books/BookCard";
import { BookJacket } from "@/components/books/BookJacket";
import { AmazonPurchaseButton, PriceNote, PurchaseFinePrint } from "@/components/books/AmazonPurchaseButton";
import { usePlacement } from "@/components/books/BookSections";
import { useBookImpression } from "@/components/books/useBookImpression";
import { BookCover } from "@/components/public/BookCover";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { EmptyState, ErrorState } from "@/components/ui/misc";

export function BooksPage() {
  const { site } = useSite();
  const [params, setParams] = useSearchParams();
  const q = params.get("q") ?? "";
  const category = params.get("category") ?? "";
  const format = params.get("format") ?? "";
  const sort = params.get("sort") ?? "newest";
  const { data, error, loading, reload } = useAsync(() => Promise.all([api.listPublicBooks(), api.listPublicBookCategories(), api.listPublicPublications()]), []);
  const [books, cats, pubs] = data ?? [[] as Book[], [] as BookCategory[], [] as Publication[]];
  const recommended = usePlacement("books_landing");

  useDocumentMeta({ title: `Books — ${site.site_name}`, description: "Books That Inspire Ideas — the author's books, with links to buy on Amazon.", siteName: site.site_name });

  const update = (k: string, v: string) => {
    const next = new URLSearchParams(params);
    if (v) next.set(k, v);
    else next.delete(k);
    setParams(next, { replace: true });
  };

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    return books
      .filter((b) => (!term || b.title.toLowerCase().includes(term)) && (!category || b.category?.slug === category) && (!format || b.formats.includes(format as Book["formats"][number])))
      .sort((a, b) => (sort === "az" ? a.title.localeCompare(b.title) : (b.published_at ?? "").localeCompare(a.published_at ?? "")));
  }, [books, q, category, format, sort]);

  const featured = books.find((b) => b.is_featured) ?? books[0];
  const filtering = Boolean(q || category || format);
  const usedFormats = FORMATS.filter((f) => books.some((b) => b.formats.includes(f.value)));

  return (
    <>
      <section className="mx-auto max-w-7xl px-5 pb-6 pt-14 sm:px-8 sm:pt-20">
        <p className="eyebrow">Books</p>
        <h1 className="mt-3 max-w-3xl font-display text-[46px] font-normal leading-[1.04] tracking-tight text-ink text-balance sm:text-[64px]">Books That Inspire Ideas.</h1>
        <p className="mt-5 max-w-2xl text-[17px] leading-relaxed text-secondary">
          Longer works by {AUTHOR.name} — the stories and reflections that grew beyond a single essay. Read about each book here, and buy it on Amazon when it's available.
        </p>
      </section>

      {featured && !filtering && <FeaturedBook book={featured} />}

      <section id="all-books" className="mx-auto max-w-7xl px-5 sm:px-8">
        <div className="flex flex-col gap-5 border-b border-line pb-6 pt-16">
          <div>
            <p className="eyebrow">Browse</p>
            <h2 className="mt-2 font-display text-[34px] font-normal text-ink">Explore All Books</h2>
          </div>
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
            <div className="relative lg:w-72">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted" />
              <input value={q} onChange={(e) => update("q", e.target.value)} placeholder="Search by title" aria-label="Search books by title" className="h-10 w-full rounded-full border border-line-strong bg-surface pl-9 pr-9 text-sm outline-none focus:border-primary" />
              {q && (
                <button onClick={() => update("q", "")} className="absolute right-2 top-1/2 grid size-6 -translate-y-1/2 place-items-center rounded-full text-muted hover:bg-black/5" aria-label="Clear search">
                  <X className="size-3.5" />
                </button>
              )}
            </div>
            <div className="flex flex-1 flex-wrap gap-1.5" role="group" aria-label="Filter by category">
              <Chip active={!category} onClick={() => update("category", "")}>All</Chip>
              {cats.filter((c) => books.some((b) => b.category_id === c.id)).map((c) => (
                <Chip key={c.id} active={category === c.slug} onClick={() => update("category", category === c.slug ? "" : c.slug)}>{c.name}</Chip>
              ))}
            </div>
            {usedFormats.length > 0 && (
              <div className="lg:w-44">
                <Select size="sm" aria-label="Filter by format" value={format} onValueChange={(v) => update("format", v)} options={[{ value: "", label: "All formats" }, ...usedFormats.map((f) => ({ value: f.value, label: f.label }))]} className="rounded-full" />
              </div>
            )}
            <div className="lg:w-48">
              <Select size="sm" aria-label="Sort books" value={sort} onValueChange={(v) => update("sort", v === "newest" ? "" : v)} options={[{ value: "newest", label: "Newest first" }, { value: "az", label: "Alphabetical (A–Z)" }]} className="rounded-full" />
            </div>
          </div>
        </div>
        {error ? (
          <ErrorState message={error} onRetry={reload} />
        ) : loading ? (
          <div className="mt-8 grid gap-8 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">{Array.from({ length: 4 }, (_, i) => <div key={i} className="skeleton aspect-[4/6] rounded-xl" />)}</div>
        ) : filtered.length === 0 ? (
          <EmptyState icon={<BookOpen />} title={books.length ? "No books match" : "No books yet"} description={books.length ? "Try a different title, category or format." : "Books will appear here once they're published."} action={filtering ? <Button variant="outline" onClick={() => setParams({}, { replace: true })}>Clear filters</Button> : undefined} />
        ) : (
          <div className="mt-8 grid gap-x-8 gap-y-14 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {filtered.map((b) => <BookCard key={b.id} book={b} surface="books_grid" />)}
          </div>
        )}
        {books.some((b) => activeLinks(b).length > 0) && <PurchaseFinePrint className="mt-6" />}
      </section>

      {/* Recommended reading: curated books + featured publications */}
      {((recommended.data?.books.length ?? 0) > 0 || pubs.length > 0) && (
        <section className="mt-24 bg-[#f2f0eb]">
          <div className="mx-auto max-w-7xl px-5 py-20 sm:px-8">
            <p className="eyebrow">{recommended.data?.placement?.heading ?? "Recommended Reading"}</p>
            <h2 className="mt-2 font-display text-[34px] font-normal text-ink">Start with these</h2>
            {recommended.data?.placement?.description && <p className="mt-2 max-w-xl text-[15.5px] text-secondary">{recommended.data.placement.description}</p>}
            <div className="mt-10 grid gap-10 lg:grid-cols-2">
              {recommended.data && recommended.data.books.length > 0 && (
                <div>
                  <h3 className="text-[13px] font-semibold uppercase tracking-wider text-muted">Books</h3>
                  <ul className="mt-4 space-y-4">
                    {recommended.data.books.map((b) => <RecommendedRow key={b.id} book={b} />)}
                  </ul>
                </div>
              )}
              {pubs.length > 0 && (
                <div>
                  <h3 className="text-[13px] font-semibold uppercase tracking-wider text-muted">Free essays to read now</h3>
                  <ul className="mt-4 space-y-4">
                    {[...pubs].sort((a, b) => Number(b.is_featured) - Number(a.is_featured)).slice(0, 4).map((p) => (
                      <li key={p.id}>
                        <Link to={`/library/${p.slug}`} className="group flex items-center gap-4 rounded-xl bg-surface p-3 pr-5 ring-1 ring-line transition-shadow hover:shadow-md">
                          <BookCover path={p.cover_image_path} title={p.title} className="aspect-[1/1.414] w-14 shrink-0 shadow-none" />
                          <span className="min-w-0 flex-1">
                            <span className="block font-display text-[17px] leading-snug text-ink group-hover:text-primary">{p.title}</span>
                            <span className="block text-[12.5px] text-muted">{p.category?.name} · {p.page_count} pages · Free</span>
                          </span>
                          <ArrowRight className="size-4 text-muted transition-transform group-hover:translate-x-0.5" />
                        </Link>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          </div>
        </section>
      )}

      {/* Author */}
      <section className="mx-auto max-w-5xl px-5 py-20 sm:px-8">
        <div className="grid items-center gap-8 rounded-2xl border border-line bg-surface p-8 sm:grid-cols-[120px_1fr] sm:p-10">
          {AUTHOR.photo ? (
            <img src={AUTHOR.photo} alt={AUTHOR.name} className="size-[120px] rounded-full object-cover" />
          ) : (
            <div className="grid size-[120px] place-items-center rounded-full bg-primary font-display text-[44px] italic text-[#F3E3C6]" aria-hidden>DR</div>
          )}
          <div>
            <p className="eyebrow">About the author</p>
            <h2 className="mt-2 font-display text-[30px] text-ink">{AUTHOR.name}</h2>
            <p className="mt-3 text-[15.5px] leading-relaxed text-secondary">{AUTHOR.intro}</p>
            <div className="mt-5 flex flex-wrap gap-3">
              <Button asChild variant="outline">
                <Link to="/about">Read the full bio <ArrowRight /></Link>
              </Button>
              {site.author_website_url && (
                <Button asChild variant="ghost">
                  <a href={site.author_website_url} target="_blank" rel="noopener noreferrer">Author's website <ExternalLink /></a>
                </Button>
              )}
            </div>
          </div>
        </div>
      </section>
    </>
  );
}

function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button onClick={onClick} aria-pressed={active} className={cn("h-9 rounded-full border px-4 text-[13px] font-medium transition-colors", active ? "border-primary bg-primary text-white" : "border-line-strong bg-surface text-secondary hover:text-ink")}>
      {children}
    </button>
  );
}

function RecommendedRow({ book }: { book: Book }) {
  const ref = useBookImpression<HTMLLIElement>(book.id, "books_landing");
  return (
    <li ref={ref} className="flex items-center gap-4 rounded-xl bg-surface p-3 pr-4 ring-1 ring-line">
      <Link to={`/books/${book.slug}`} className="w-14 shrink-0" tabIndex={-1} aria-hidden>
        <BookJacket path={book.cover_image_path} title={book.title} author={book.author} className="w-full shadow-none" />
      </Link>
      <div className="min-w-0 flex-1">
        <Link to={`/books/${book.slug}`} className="block font-display text-[17px] leading-snug text-ink hover:text-primary">{book.title}</Link>
        <span className="block truncate text-[12.5px] text-muted">{book.category?.name ?? book.author}</span>
      </div>
      <AmazonPurchaseButton book={book} surface="books_landing" size="sm" withOptions={false} className="shrink-0 [&_a]:h-8 [&_a]:text-[12px] [&_span]:h-8 [&_span]:text-[12px]" />
    </li>
  );
}

export function FeaturedBook({ book }: { book: Book }) {
  const ref = useBookImpression<HTMLElement>(book.id, "books_landing");
  return (
    <section ref={ref} className="mx-auto max-w-7xl px-5 sm:px-8">
      <div className="grid items-center gap-10 overflow-hidden rounded-2xl border border-line bg-surface p-6 sm:p-10 md:grid-cols-[minmax(0,300px)_1fr] lg:gap-16 lg:p-14">
        <Link to={`/books/${book.slug}`} className="mx-auto block w-[60%] max-w-[280px] md:w-full" tabIndex={-1} aria-hidden>
          <BookJacket path={book.cover_image_path} title={book.title} author={book.author} className="w-full" eager />
        </Link>
        <div>
          <p className="eyebrow text-[#9a7232]">Featured book{book.category?.name ? ` · ${book.category.name}` : ""}</p>
          <h2 className="mt-3 font-display text-[34px] font-normal leading-[1.1] text-ink text-balance sm:text-[44px]">{book.title}</h2>
          {book.subtitle && <p className="mt-2 font-display text-[20px] italic text-secondary">{book.subtitle}</p>}
          {book.author && <p className="mt-3 text-[14.5px] text-secondary">by <span className="text-ink">{book.author}</span></p>}
          <p className="mt-5 max-w-xl text-[16px] leading-relaxed text-secondary">{book.short_description}</p>
          {book.formats.length > 0 && <p className="mt-4 text-[13px] text-muted">Available as {book.formats.map(formatLabel).join(", ")}</p>}
          <PriceNote book={book} className="mt-2" />
          <div className="mt-7 flex flex-wrap gap-3">
            <AmazonPurchaseButton book={book} surface="books_landing" size="lg" />
            <Button asChild size="lg" variant="outline">
              <Link to={`/books/${book.slug}`}>Explore Book <ArrowRight /></Link>
            </Button>
          </div>
          {activeLinks(book).length > 0 && <PurchaseFinePrint className="mt-3" />}
        </div>
      </div>
    </section>
  );
}
