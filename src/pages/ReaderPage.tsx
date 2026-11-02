import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ArrowLeft, ArrowRight, Download, Share2 } from "lucide-react";
import { api } from "@/data";
import { useAsync } from "@/hooks/useAsync";
import { useSite } from "@/hooks/useSite";
import { useDocumentMeta } from "@/hooks/useDocumentMeta";
import { formatBytes, formatDate, languageLabel } from "@/lib/utils";
import { PdfReader } from "@/components/reader/PdfReader";
import { DownloadDialog } from "@/components/public/DownloadDialog";
import { ShareDialog } from "@/components/public/ShareDialog";
import { publicationUrl } from "@/lib/share";
import { ReaderFooterPanel, ReaderSidebar } from "@/components/books/ReaderRecommendations";
import { PlacementSection } from "@/components/books/BookSections";
import { BookCover } from "@/components/public/BookCover";
import { Brand } from "@/components/public/Brand";
import { Button } from "@/components/ui/button";
import { EmptyState, ErrorState, Skeleton } from "@/components/ui/misc";

export function ReaderPage() {
  const { slug = "" } = useParams();
  const { site } = useSite();
  const { data: pub, error, loading, reload } = useAsync(() => api.getPublicPublication(slug), [slug]);
  const { data: others } = useAsync(() => api.listPublicPublications(), []);
  const [downloadOpen, setDownloadOpen] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const viewed = useRef<string | null>(null);
  const opened = useRef<string | null>(null);

  useEffect(() => {
    window.scrollTo(0, 0);
  }, [slug]);

  useDocumentMeta({
    title: pub ? `${pub.seo.seo_title || pub.title} — ${site.site_name}` : site.site_name,
    description: pub ? pub.seo.meta_description || pub.description : null,
    image: pub ? api.coverUrl(pub.seo.og_image_path || pub.cover_image_path) : null,
    canonical: pub ? pub.seo.canonical_url || publicationUrl(pub.slug, site.site_url).url : null,
    url: pub ? publicationUrl(pub.slug, site.site_url).url : null,
    type: "article",
    siteName: site.site_name,
    author: pub?.author ?? null,
  });

  // One publication_view per page load; failures never affect reading.
  useEffect(() => {
    if (pub && viewed.current !== pub.id) {
      viewed.current = pub.id;
      api.trackEvent(pub.id, "publication_view").catch(() => undefined);
    }
  }, [pub]);

  const loadSource = useCallback(() => (pub ? api.getReaderSource(pub) : Promise.reject(new Error("Not found"))), [pub]);
  const onOpened = useCallback(() => {
    if (pub && opened.current !== pub.id) {
      opened.current = pub.id;
      api.trackEvent(pub.id, "reader_open").catch(() => undefined);
    }
  }, [pub]);

  const canDownload = Boolean(pub?.settings.download_enabled);
  const more = (others ?? []).filter((p) => p.id !== pub?.id).slice(0, 3);

  return (
    <div className="min-h-dvh bg-paper">
      <header className="sticky top-0 z-40 border-b border-line bg-paper/90 backdrop-blur-md">
        <div className="mx-auto flex h-16 max-w-[1600px] items-center gap-3 px-4 sm:gap-5 sm:px-6">
          <Brand className="hidden shrink-0 md:flex" />
          <span className="hidden h-6 w-px bg-line md:block" />
          <Link to="/library" aria-label="Back to Library" className="inline-flex shrink-0 items-center gap-1.5 rounded-md px-2 py-1.5 text-[13.5px] text-secondary transition-colors hover:bg-black/[0.04] hover:text-ink">
            <ArrowLeft className="size-4" />
            <span className="hidden sm:inline">Back to Library</span>
          </Link>
          <h1 className="min-w-0 flex-1 truncate text-center font-display text-[17px] text-ink sm:text-[19px]">{pub?.title ?? (loading ? "" : "")}</h1>
          {pub && (
            <Button size="sm" variant="ghost" className="h-9 shrink-0 px-2.5 sm:px-3" onClick={() => setShareOpen(true)} aria-label="Share">
              <Share2 />
              <span className="hidden lg:inline">Share</span>
            </Button>
          )}
          {canDownload ? (
            <Button size="sm" className="h-9 shrink-0 sm:px-4" onClick={() => setDownloadOpen(true)} aria-label="Download PDF">
              <Download />
              <span className="hidden sm:inline">Download PDF</span>
            </Button>
          ) : (
            <span className="w-9 sm:w-[132px]" />
          )}
        </div>
      </header>

      {loading ? (
        <div className="grid h-[calc(100dvh-64px)] place-items-center bg-[#ebe8e2]">
          <Skeleton className="h-[70%] w-[min(80%,760px)]" />
        </div>
      ) : error ? (
        <ErrorState message={error} onRetry={reload} />
      ) : !pub ? (
        <EmptyState
          className="py-32"
          title="Publication not found"
          description="It may have been moved or is no longer available."
          action={
            <Button asChild variant="outline">
              <Link to="/library">Back to Library</Link>
            </Button>
          }
        />
      ) : (
        <>
          <div className="flex h-[calc(100dvh-64px)] min-h-[460px]">
            <PdfReader
              sourceKey={pub.id + (pub.pdf_storage_path ?? "")}
              loadSource={loadSource}
              settings={pub.settings}
              title={pub.title}
              onOpened={onOpened}
              onDownload={canDownload ? () => setDownloadOpen(true) : undefined}
              endPanel={(dismiss) => <ReaderFooterPanel publicationId={pub.id} onDismiss={dismiss} />}
              className="min-w-0 flex-1"
            />
            <ReaderSidebar publicationId={pub.id} />
          </div>

          <section className="mx-auto grid max-w-6xl gap-12 px-5 py-16 sm:px-8 md:grid-cols-[1fr_280px] lg:gap-20">
            <div>
              <p className="eyebrow text-[#9a7232]">{pub.category?.name ?? "Publication"}</p>
              <h2 className="mt-3 font-display text-[36px] font-normal leading-[1.1] text-ink text-balance">{pub.title}</h2>
              <p className="mt-5 text-[16.5px] leading-relaxed text-secondary">{pub.description}</p>
              {pub.tags.length > 0 && (
                <ul className="mt-6 flex flex-wrap gap-2" aria-label="Tags">
                  {pub.tags.map((t) => (
                    <li key={t}>
                      <Link to={`/library?q=${encodeURIComponent(t)}`} className="rounded-full border border-line-strong px-3 py-1 text-[12.5px] text-secondary hover:border-primary hover:text-primary">
                        {t}
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
              <div className="mt-8 flex flex-wrap gap-2">
                {canDownload && (
                  <Button variant="outline" onClick={() => setDownloadOpen(true)}>
                    <Download /> Download the PDF
                  </Button>
                )}
                <Button variant="outline" onClick={() => setShareOpen(true)}>
                  <Share2 /> Share
                </Button>
              </div>
            </div>
            <dl className="grid h-fit gap-4 rounded-xl border border-line bg-surface p-6 text-sm">
              {[
                ["Author", pub.author],
                ["Publisher", pub.publisher],
                ["Published", pub.publication_date ? formatDate(pub.publication_date) : null],
                ["Pages", pub.page_count?.toString()],
                ["Language", pub.language ? languageLabel(pub.language) : null],
                ["File size", pub.file_size ? formatBytes(pub.file_size) : null],
              ]
                .filter(([, v]) => v)
                .map(([k, v]) => (
                  <div key={k} className="flex justify-between gap-4 border-b border-line pb-3 last:border-0 last:pb-0">
                    <dt className="text-muted">{k}</dt>
                    <dd className="text-right font-medium text-ink">{v}</dd>
                  </div>
                ))}
            </dl>
          </section>

          <PlacementSection placementKey="publication_page" publicationId={pub.id} eyebrow="Books" className="mb-20" />

          {more.length > 0 && (
            <section className="border-t border-line bg-[#f2f0eb]">
              <div className="mx-auto max-w-6xl px-5 py-16 sm:px-8">
                <div className="flex items-end justify-between">
                  <h2 className="font-display text-[28px] font-normal text-ink">More to read</h2>
                  <Link to="/library" className="inline-flex items-center gap-1.5 text-sm font-medium text-primary">
                    View library <ArrowRight className="size-4" />
                  </Link>
                </div>
                <div className="mt-8 grid gap-8 sm:grid-cols-3">
                  {more.map((p) => (
                    <Link key={p.id} to={`/library/${p.slug}`} className="group flex gap-4">
                      <BookCover path={p.cover_image_path} title={p.title} className="aspect-[1/1.414] w-20 shrink-0 transition-transform group-hover:-translate-y-1" />
                      <div className="min-w-0">
                        <p className="eyebrow">{p.category?.name}</p>
                        <p className="mt-1.5 font-display text-[18px] leading-snug text-ink group-hover:text-primary">{p.title}</p>
                      </div>
                    </Link>
                  ))}
                </div>
              </div>
            </section>
          )}
          <DownloadDialog pub={pub} open={downloadOpen} onOpenChange={setDownloadOpen} />
          <ShareDialog pub={pub} open={shareOpen} onOpenChange={setShareOpen} />
        </>
      )}
    </div>
  );
}
