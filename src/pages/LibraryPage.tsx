import { useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { ArrowRight, BookOpen, Search, Share2, X } from "lucide-react";
import { api } from "@/data";
import { useAsync } from "@/hooks/useAsync";
import { useSite } from "@/hooks/useSite";
import { useDocumentMeta } from "@/hooks/useDocumentMeta";
import type { Category, Publication } from "@/lib/types";
import { cn } from "@/lib/utils";
import { BookCover } from "@/components/public/BookCover";
import { ShareDialog } from "@/components/public/ShareDialog";
import { PlacementSection } from "@/components/books/BookSections";
import { PublicationCard, PublicationCardSkeleton } from "@/components/public/PublicationCard";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { EmptyState, ErrorState } from "@/components/ui/misc";

export function LibraryPage({ variant }: { variant: "home" | "library" }) {
  const { site } = useSite();
  const [params, setParams] = useSearchParams();
  const q = params.get("q") ?? "";
  const category = params.get("category") ?? "";
  const sort = (params.get("sort") as "newest" | "az") ?? "newest";

  const { data, error, loading, reload } = useAsync(() => Promise.all([api.listPublicPublications(), api.listPublicCategories()]), []);
  const [pubs, cats] = data ?? [[] as Publication[], [] as Category[]];

  useDocumentMeta({ title: variant === "home" ? site.site_name : `Library — ${site.site_name}`, description: site.tagline });

  const update = (k: string, v: string) => {
    const next = new URLSearchParams(params);
    if (v) next.set(k, v);
    else next.delete(k);
    setParams(next, { replace: true });
  };

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    let list = pubs.filter((p) => (!category || p.category?.slug === category) && (!term || p.title.toLowerCase().includes(term) || p.tags.some((t) => t.toLowerCase().includes(term))));
    list = [...list].sort((a, b) => (sort === "az" ? a.title.localeCompare(b.title) : (b.published_at ?? "").localeCompare(a.published_at ?? "")));
    return list;
  }, [pubs, q, category, sort]);

  const featured = pubs.find((p) => p.is_featured) ?? pubs[0];
  const usedCats = cats.filter((c) => pubs.some((p) => p.category_id === c.id));
  const filtering = Boolean(q || category);

  return (
    <>
      {variant === "home" ? (
        <Hero pubs={pubs} loading={loading} tagline={site.tagline} />
      ) : (
        <section className="mx-auto max-w-7xl px-5 pb-4 pt-14 sm:px-8 sm:pt-20">
          <p className="eyebrow">The collection</p>
          <h1 className="mt-3 font-display text-[44px] font-normal leading-none tracking-tight text-ink sm:text-[56px]">Library</h1>
          <p className="mt-4 max-w-xl text-[16px] leading-relaxed text-secondary">{site.tagline}</p>
        </section>
      )}

      {variant === "home" && featured && !filtering && <Featured pub={featured} />}
      {variant === "home" && !filtering && <PlacementSection placementKey="homepage_featured" eyebrow="Books" className="pt-20" />}

      <section id="library" className="mx-auto max-w-7xl scroll-mt-20 px-5 sm:px-8">
        <div className={cn("flex flex-col gap-5 border-b border-line pb-6", variant === "home" ? "pt-20" : "pt-8")}>
          {variant === "home" && (
            <div className="flex items-end justify-between gap-4">
              <div>
                <p className="eyebrow">Browse</p>
                <h2 className="mt-2 font-display text-[34px] font-normal leading-tight text-ink">All publications</h2>
              </div>
            </div>
          )}
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
            <div className="relative lg:w-72">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted" />
              <input
                value={q}
                onChange={(e) => update("q", e.target.value)}
                placeholder="Search by title"
                aria-label="Search publications by title"
                className="h-10 w-full rounded-full border border-line-strong bg-surface pl-9 pr-9 text-sm outline-none transition-colors focus:border-primary"
              />
              {q && (
                <button onClick={() => update("q", "")} className="absolute right-2 top-1/2 grid size-6 -translate-y-1/2 place-items-center rounded-full text-muted hover:bg-black/5" aria-label="Clear search">
                  <X className="size-3.5" />
                </button>
              )}
            </div>
            <div className="flex flex-1 flex-wrap items-center gap-1.5" role="group" aria-label="Filter by category">
              <Chip active={!category} onClick={() => update("category", "")}>All</Chip>
              {usedCats.map((c) => (
                <Chip key={c.id} active={category === c.slug} onClick={() => update("category", category === c.slug ? "" : c.slug)}>
                  {c.name}
                </Chip>
              ))}
            </div>
            <div className="flex items-center gap-2 lg:w-48">
              <Select
                size="sm"
                aria-label="Sort publications"
                value={sort}
                onValueChange={(v) => update("sort", v === "newest" ? "" : v)}
                options={[
                  { value: "newest", label: "Newest first" },
                  { value: "az", label: "Alphabetical (A–Z)" },
                ]}
                className="rounded-full"
              />
            </div>
          </div>
        </div>

        <p className="mt-5 text-[13px] text-muted" aria-live="polite">
          {!loading && !error && `${filtered.length} ${filtered.length === 1 ? "publication" : "publications"}${filtering ? " found" : ""}`}
        </p>

        {error ? (
          <ErrorState message={error} onRetry={reload} />
        ) : loading ? (
          <div className="mt-6 grid gap-x-8 gap-y-14 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {Array.from({ length: 8 }, (_, i) => <PublicationCardSkeleton key={i} />)}
          </div>
        ) : filtered.length === 0 ? (
          <EmptyState
            icon={<BookOpen />}
            title={pubs.length === 0 ? "No publications yet" : "No publications match"}
            description={pubs.length === 0 ? "New publications will appear here as soon as they're published." : "Try a different title or clear the filters."}
            action={filtering ? <Button variant="outline" onClick={() => setParams({}, { replace: true })}>Clear filters</Button> : undefined}
          />
        ) : (
          <div className="mt-6 grid gap-x-8 gap-y-14 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {filtered.map((p, i) => (
              <PublicationCard key={p.id} pub={p} index={i} />
            ))}
          </div>
        )}
      </section>

      {variant === "home" && !filtering && <PlacementSection placementKey="homepage_carousel" layout="carousel" eyebrow="Bookshelf" className="mt-24" />}
    </>
  );
}

function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      aria-pressed={active}
      className={cn("h-9 rounded-full border px-4 text-[13px] font-medium transition-colors", active ? "border-primary bg-primary text-white" : "border-line-strong bg-surface text-secondary hover:border-[#c3c7ce] hover:text-ink")}
    >
      {children}
    </button>
  );
}

function Hero({ pubs, loading, tagline }: { pubs: Publication[]; loading: boolean; tagline: string }) {
  const stack = pubs.slice(0, 3);
  return (
    <section className="relative overflow-hidden">
      <div className="mx-auto grid max-w-7xl items-center gap-12 px-5 pb-8 pt-14 sm:px-8 sm:pt-20 lg:grid-cols-[1.05fr_1fr] lg:pb-16 lg:pt-24">
        <div className="animate-rise">
          <p className="eyebrow">Digital library</p>
          <h1 className="mt-4 font-display text-[46px] font-normal leading-[1.02] tracking-tight text-ink text-balance sm:text-[64px] lg:text-[72px]">
            Explore Our <em className="text-[#8a6224]">Digital</em> Library
          </h1>
          <p className="mt-6 max-w-lg text-[17px] leading-relaxed text-secondary">{tagline || "Discover publications, insights, guides and resources. Read online or download your favourite publications."}</p>
          <div className="mt-9 flex flex-wrap items-center gap-3">
            <Button size="lg" onClick={() => document.getElementById("library")?.scrollIntoView({ behavior: "smooth" })}>
              Browse the library <ArrowRight />
            </Button>
            {pubs.length > 0 && <span className="text-sm text-muted">{pubs.length} publications · free to read</span>}
          </div>
        </div>
        <div className="relative mx-auto h-[340px] w-full max-w-[480px] sm:h-[420px]" aria-hidden>
          {loading
            ? <div className="skeleton absolute left-1/2 top-1/2 h-[300px] w-[212px] -translate-x-1/2 -translate-y-1/2 rounded" />
            : stack.map((p, i) => {
                const pos = [
                  "left-1/2 top-1/2 z-30 -translate-x-1/2 -translate-y-1/2",
                  "left-[6%] top-[54%] z-20 -translate-y-1/2 -rotate-[7deg]",
                  "right-[6%] top-[46%] z-10 -translate-y-1/2 rotate-[6deg]",
                ][i];
                return (
                  <div key={p.id} className={cn("absolute w-[44%] max-w-[216px] animate-rise", pos)} style={{ animationDelay: `${150 + i * 120}ms` }}>
                    <BookCover path={p.cover_image_path} title={p.title} className="aspect-[1/1.414] w-full" eager />
                  </div>
                );
              })}
        </div>
      </div>
    </section>
  );
}

function Featured({ pub }: { pub: Publication }) {
  const [shareOpen, setShareOpen] = useState(false);
  return (
    <section className="mx-auto max-w-7xl px-5 sm:px-8">
      <div className="grid items-center gap-10 overflow-hidden rounded-2xl border border-line bg-surface p-6 sm:p-10 md:grid-cols-[minmax(0,320px)_1fr] lg:gap-16 lg:p-14">
        <Link to={`/library/${pub.slug}`} className="mx-auto block w-[64%] max-w-[300px] md:w-full" tabIndex={-1} aria-hidden>
          <BookCover path={pub.cover_image_path} title={pub.title} className="aspect-[1/1.414] w-full transition-transform duration-500 hover:-translate-y-1" />
        </Link>
        <div>
          <p className="eyebrow text-[#9a7232]">Featured{pub.category?.name ? ` · ${pub.category.name}` : ""}</p>
          <h2 className="mt-3 font-display text-[34px] font-normal leading-[1.1] text-ink text-balance sm:text-[44px]">{pub.title}</h2>
          <p className="mt-5 max-w-xl text-[16px] leading-relaxed text-secondary">{pub.description}</p>
          <div className="mt-6 flex flex-wrap gap-x-6 gap-y-2 text-[13px] text-muted">
            {pub.author && <span>By <span className="text-ink">{pub.author}</span></span>}
            {pub.page_count && <span>{pub.page_count} pages</span>}
          </div>
          <div className="mt-8 flex flex-wrap gap-3">
            <Button asChild size="lg">
              <Link to={`/library/${pub.slug}`}>
                Read Publication <ArrowRight />
              </Link>
            </Button>
            <Button size="lg" variant="outline" onClick={() => setShareOpen(true)}>
              <Share2 /> Share
            </Button>
          </div>
        </div>
      </div>
      <ShareDialog pub={pub} open={shareOpen} onOpenChange={setShareOpen} />
    </section>
  );
}
