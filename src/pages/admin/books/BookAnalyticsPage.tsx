import { useState } from "react";
import { Download, Info } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/data";
import { useAsync } from "@/hooks/useAsync";
import { formatLabel, marketplaceLabel, placementLabel } from "@/lib/books";
import { downloadBlob, formatNumber, percent, toCsv, toDateInput } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { EmptyState, ErrorState } from "@/components/ui/misc";
import { DateRangeFilter, PageHeader, Panel, StatCard, StatusBadge, rangeFor, type DateRange } from "@/components/admin/bits";
import { DualTrendChart, RankBars } from "@/components/admin/charts";
import { BookJacket } from "@/components/books/BookJacket";

export function BookAnalyticsPage() {
  const [range, setRange] = useState<DateRange>(() => rangeFor("30"));
  const { data, error, loading, reload } = useAsync(() => api.getBookAnalytics(range.from, range.to), [range.from.getTime(), range.to.getTime()]);
  if (error) return <ErrorState message={error} onRetry={reload} />;
  const t = data?.totals;

  const exportCsv = (kind: "books" | "links") => {
    if (!data) return;
    const stamp = `${toDateInput(range.from)}_${toDateInput(new Date(range.to.getTime() - 1))}`;
    const csv =
      kind === "books"
        ? toCsv(data.books.map((b) => ({ ...b, ctr: b.impressions ? ((b.clicks / b.impressions) * 100).toFixed(2) + "%" : "" })), [
            { key: "title", label: "Book" }, { key: "status", label: "Status" }, { key: "impressions", label: "Impressions" }, { key: "detail_views", label: "Detail page views" }, { key: "clicks", label: "Amazon outbound clicks" }, { key: "ctr", label: "Click-through rate" },
          ])
        : toCsv(data.links.map((l) => ({ ...l, marketplace: marketplaceLabel(l.marketplace), format: formatLabel(l.format) })), [
            { key: "book_title", label: "Book" }, { key: "display_label", label: "Label" }, { key: "marketplace", label: "Marketplace" }, { key: "format", label: "Format" }, { key: "clicks", label: "Outbound clicks" },
          ]);
    downloadBlob(new Blob([csv], { type: "text/csv;charset=utf-8" }), `book-${kind}-${stamp}.csv`);
    toast.success("CSV exported.");
  };

  return (
    <>
      <PageHeader title="Book Analytics" description="Website engagement and outbound Amazon clicks — not sales." actions={<DateRangeFilter value={range} onChange={setRange} />} />
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <StatCard label="Published books" loading={loading} value={formatNumber(t?.published_books ?? 0)} />
        <StatCard label="Book impressions" loading={loading} value={formatNumber(t?.impressions ?? 0)} sub="Cards seen (≥50% visible)" />
        <StatCard label="Detail page views" loading={loading} value={formatNumber(t?.detail_views ?? 0)} />
        <StatCard label="Amazon outbound clicks" loading={loading} value={formatNumber(t?.clicks ?? 0)} sub="Visits sent to Amazon" />
        <StatCard label="Click-through rate" loading={loading} value={percent(t?.clicks ?? 0, t?.impressions ?? 0)} sub="Clicks ÷ impressions" />
      </div>
      <p className="mt-4 flex items-start gap-2 text-[12.5px] text-muted">
        <Info className="mt-0.5 size-3.5 shrink-0" />
        A click means a visitor left for Amazon. Purchases are completed on Amazon and aren't visible here; actual sales reporting requires Amazon Associates reporting.
      </p>

      <Panel title="Engagement trend" description="Daily impressions and Amazon clicks" className="mt-6">
        {loading ? <div className="skeleton h-[290px]" /> : <DualTrendChart data={data!.daily} a={{ key: "impressions", name: "Impressions" }} b={{ key: "clicks", name: "Amazon clicks" }} />}
      </Panel>

      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        <Panel title="Clicks by marketplace">
          {loading ? <div className="skeleton h-32" /> : data!.marketplaces.length ? <RankBars rows={data!.marketplaces.map((m) => ({ label: marketplaceLabel(m.key), value: m.clicks }))} valueLabel="Clicks" /> : <EmptyState className="py-8" title="No clicks yet" description="Clicks appear once books have active purchase links." />}
        </Panel>
        <Panel title="Clicks by format">
          {loading ? <div className="skeleton h-32" /> : data!.formats.length ? <RankBars rows={data!.formats.map((f) => ({ label: formatLabel(f.key), value: f.clicks }))} valueLabel="Clicks" /> : <EmptyState className="py-8" title="No clicks yet" />}
        </Panel>
        <Panel title="Placements" description="Impressions → clicks">
          {loading ? <div className="skeleton h-32" /> : data!.placements.length ? (
            <ul className="divide-y divide-line text-[13px]">
              {data!.placements.map((p) => (
                <li key={p.key} className="flex items-center justify-between gap-3 py-2">
                  <span className="truncate text-ink">{placementLabel(p.key)}</span>
                  <span className="shrink-0 tabular-nums text-secondary">{formatNumber(p.impressions)} → <b className="text-ink">{formatNumber(p.clicks)}</b> <span className="text-muted">({percent(p.clicks, p.impressions)})</span></span>
                </li>
              ))}
            </ul>
          ) : <EmptyState className="py-8" title="No activity yet" />}
        </Panel>
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-2">
        <Panel title="Most viewed books" description="Detail page views">
          {loading ? <div className="skeleton h-40" /> : data!.books.some((b) => b.detail_views) ? <RankBars rows={[...data!.books].sort((a, b) => b.detail_views - a.detail_views).filter((b) => b.detail_views).slice(0, 6).map((b) => ({ label: b.title, value: b.detail_views }))} valueLabel="Views" /> : <EmptyState className="py-8" title="No views yet" />}
        </Panel>
        <Panel title="Most clicked Amazon links" actions={<Button variant="outline" size="sm" onClick={() => exportCsv("links")} disabled={!data?.links.length}><Download /> CSV</Button>}>
          {loading ? <div className="skeleton h-40" /> : data!.links.some((l) => l.clicks) ? (
            <RankBars rows={data!.links.filter((l) => l.clicks).slice(0, 6).map((l) => ({ label: `${l.book_title} · ${formatLabel(l.format)}, ${marketplaceLabel(l.marketplace)}`, value: l.clicks }))} valueLabel="Clicks" />
          ) : <EmptyState className="py-8" title="No link clicks yet" />}
        </Panel>
      </div>

      <Panel className="mt-6" title="Book-specific performance" actions={<Button variant="outline" size="sm" onClick={() => exportCsv("books")} disabled={!data?.books.length}><Download /> Export CSV</Button>}>
        <div className="relative -mx-5 overflow-x-auto sm:-mx-6">
          <table className="w-full min-w-[700px] text-[13px]">
            <thead>
              <tr className="border-y border-line bg-admin-bg text-left text-[11.5px] uppercase tracking-wide text-muted">
                <th className="px-6 py-2.5 font-medium">Book</th>
                <th className="px-3 py-2.5 text-right font-medium">Impressions</th>
                <th className="px-3 py-2.5 text-right font-medium">Detail views</th>
                <th className="px-3 py-2.5 text-right font-medium">Amazon clicks</th>
                <th className="px-6 py-2.5 text-right font-medium">CTR</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {loading ? <tr><td colSpan={5} className="px-6 py-3"><div className="skeleton h-8" /></td></tr> : data!.books.map((b) => (
                <tr key={b.id} className="hover:bg-admin-bg/60">
                  <td className="px-6 py-3">
                    <div className="flex items-center gap-3">
                      <BookJacket path={b.cover_image_path} title={b.title} className="w-7 shadow-none" />
                      <div><p className="font-medium text-ink">{b.title}</p><StatusBadge status={b.status} /></div>
                    </div>
                  </td>
                  <td className="px-3 text-right tabular-nums">{formatNumber(b.impressions)}</td>
                  <td className="px-3 text-right tabular-nums">{formatNumber(b.detail_views)}</td>
                  <td className="px-3 text-right font-semibold tabular-nums">{formatNumber(b.clicks)}</td>
                  <td className="px-6 text-right tabular-nums">{percent(b.clicks, b.impressions)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>
    </>
  );
}
