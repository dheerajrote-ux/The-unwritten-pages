import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Info } from "lucide-react";
import { api } from "@/data";
import { useAsync } from "@/hooks/useAsync";
import { formatNumber, percent } from "@/lib/utils";
import { BookCover } from "@/components/public/BookCover";
import { EmptyState, ErrorState } from "@/components/ui/misc";
import { DateRangeFilter, PageHeader, Panel, StatCard, StatusBadge, rangeFor, type DateRange } from "@/components/admin/bits";
import { DualTrendChart, RankBars, TrendChart } from "@/components/admin/charts";

const MIN_VIEWS_FOR_RANKING = 5;

export function AnalyticsPage() {
  const [range, setRange] = useState<DateRange>(() => rangeFor("30"));
  const { data, error, loading, reload } = useAsync(() => api.getAnalytics(range.from, range.to), [range.from.getTime(), range.to.getTime()]);
  const [sort, setSort] = useState<"downloads" | "views" | "conversion">("downloads");

  const rows = useMemo(() => {
    const list = (data?.publications ?? []).map((p) => ({ ...p, conversion: p.views ? p.downloads / p.views : 0 }));
    return list.sort((a, b) => (sort === "conversion" ? b.conversion - a.conversion : b[sort] - a[sort]));
  }, [data, sort]);
  const ranked = rows.filter((r) => r.views >= MIN_VIEWS_FOR_RANKING).sort((a, b) => b.conversion - a.conversion);

  if (error) return <ErrorState message={error} onRetry={reload} />;
  const r = data?.range;

  return (
    <>
      <PageHeader title="Analytics" description="Reading and download performance, calculated from recorded events only." actions={<DateRangeFilter value={range} onChange={setRange} />} />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-6">
        <StatCard label="Publication page views" loading={loading} value={formatNumber(r?.views ?? 0)} sub="Visits to a publication page" />
        <StatCard label="Reader opens" loading={loading} value={formatNumber(r?.reader_opens ?? 0)} sub={`${formatNumber(r?.readers ?? 0)} unique sessions`} />
        <StatCard label="Form submissions" loading={loading} value={formatNumber(r?.form_submits ?? 0)} sub="Download form submitted" />
        <StatCard label="Shares" loading={loading} value={formatNumber(r?.shares ?? 0)} sub="Share links opened or copied" />
        <StatCard label="Successful downloads" loading={loading} value={formatNumber(r?.downloads ?? 0)} sub="Secure link issued" />
        <StatCard label="Download conversion" loading={loading} value={percent(r?.downloads ?? 0, r?.views ?? 0)} sub="Downloads ÷ page views" />
      </div>

      <p className="mt-4 flex items-start gap-2 text-[12.5px] text-muted">
        <Info className="mt-0.5 size-3.5 shrink-0" />
        A <b className="font-medium text-secondary">page view</b> is recorded when a publication page loads; a <b className="font-medium text-secondary">reader open</b> only when its PDF rendered successfully. Bots and blocked scripts are not counted.
      </p>

      <div className="mt-6 grid gap-6 xl:grid-cols-[1.4fr_1fr]">
        <Panel title="Reading trend" description="Daily page views and reader opens">
          {loading ? <div className="skeleton h-[290px]" /> : <DualTrendChart data={data!.daily} a={{ key: "views", name: "Page views" }} b={{ key: "reader_opens", name: "Reader opens" }} />}
        </Panel>
        <Panel title="Download trend" description="Successful downloads per day">
          {loading ? <div className="skeleton h-[290px]" /> : <TrendChart data={data!.daily} dataKey="downloads" name="Downloads" height={290} />}
        </Panel>
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-[1.4fr_1fr]">
        <Panel title="Publication comparison" description="Downloads in the selected period">
          {loading ? <div className="skeleton h-[260px]" /> : rows.length ? <RankBars rows={[...rows].sort((a, b) => b.downloads - a.downloads).slice(0, 10).map((p) => ({ label: p.title, value: p.downloads }))} valueLabel="Downloads" /> : <EmptyState title="No publications" />}
        </Panel>
        <Panel title="Lead acquisition" description="New leads per day">
          {loading ? <div className="skeleton h-[260px]" /> : <TrendChart data={data!.daily} dataKey="leads" name="New leads" height={260} />}
        </Panel>
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <Panel title="Highest performing" description={`By conversion, publications with ${MIN_VIEWS_FOR_RANKING}+ views`}>
          <PerfList loading={loading} rows={ranked.slice(0, 3)} />
        </Panel>
        <Panel title="Lowest performing" description={`By conversion, publications with ${MIN_VIEWS_FOR_RANKING}+ views`}>
          <PerfList loading={loading} rows={ranked.slice(-3).reverse()} />
        </Panel>
      </div>

      <Panel
        className="mt-6"
        title="Per-publication performance"
        actions={
          <select value={sort} onChange={(e) => setSort(e.target.value as typeof sort)} className="h-8 rounded-md border border-line-strong bg-surface px-2 text-[12.5px]" aria-label="Sort by">
            <option value="downloads">Sort: Downloads</option>
            <option value="views">Sort: Page views</option>
            <option value="conversion">Sort: Conversion</option>
          </select>
        }
      >
        <div className="relative -mx-5 overflow-x-auto sm:-mx-6">
          <table className="w-full min-w-[800px] text-[13px]">
            <thead>
              <tr className="border-y border-line bg-admin-bg text-left text-[11.5px] uppercase tracking-wide text-muted">
                <th className="px-6 py-2.5 font-medium">Publication</th>
                <th className="px-3 py-2.5 text-right font-medium">Page views</th>
                <th className="px-3 py-2.5 text-right font-medium">Reader opens</th>
                <th className="px-3 py-2.5 text-right font-medium">Shares</th>
                <th className="px-3 py-2.5 text-right font-medium">Form submits</th>
                <th className="px-3 py-2.5 text-right font-medium">Downloads</th>
                <th className="px-6 py-2.5 text-right font-medium">Conversion</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {loading
                ? Array.from({ length: 5 }, (_, i) => (
                    <tr key={i}><td colSpan={7} className="px-6 py-3"><div className="skeleton h-6" /></td></tr>
                  ))
                : rows.map((p) => (
                    <tr key={p.id} className="hover:bg-admin-bg/60">
                      <td className="px-6 py-3">
                        <div className="flex items-center gap-3">
                          <BookCover path={p.cover_image_path} title={p.title} className="aspect-[1/1.414] w-7 shrink-0 shadow-none" />
                          <div className="min-w-0">
                            <Link to={`/admin/publications/${p.id}/edit`} className="block truncate font-medium text-ink hover:text-primary">{p.title}</Link>
                            <StatusBadge status={p.status} />
                          </div>
                        </div>
                      </td>
                      <td className="px-3 text-right tabular-nums">{formatNumber(p.views)}</td>
                      <td className="px-3 text-right tabular-nums">{formatNumber(p.reader_opens)}</td>
                      <td className="px-3 text-right tabular-nums">{formatNumber(p.shares)}</td>
                      <td className="px-3 text-right tabular-nums">{formatNumber(p.form_submits)}</td>
                      <td className="px-3 text-right font-semibold tabular-nums">{formatNumber(p.downloads)}</td>
                      <td className="px-6 text-right tabular-nums">{percent(p.downloads, p.views)}</td>
                    </tr>
                  ))}
            </tbody>
          </table>
        </div>
      </Panel>
    </>
  );
}

function PerfList({ rows, loading }: { rows: { id: string; title: string; views: number; downloads: number; cover_image_path: string | null }[]; loading: boolean }) {
  if (loading) return <div className="skeleton h-40" />;
  if (!rows.length) return <EmptyState className="py-8" title="Not enough data yet" description={`Rankings appear once a publication has ${MIN_VIEWS_FOR_RANKING} or more views in the period.`} />;
  return (
    <ul className="divide-y divide-line">
      {rows.map((p) => (
        <li key={p.id} className="flex items-center gap-3 py-3 first:pt-0 last:pb-0">
          <BookCover path={p.cover_image_path} title={p.title} className="aspect-[1/1.414] w-9 shrink-0 shadow-none" />
          <div className="min-w-0 flex-1">
            <p className="truncate text-[13.5px] font-medium text-ink">{p.title}</p>
            <p className="text-[12px] text-muted">{formatNumber(p.views)} views · {formatNumber(p.downloads)} downloads</p>
          </div>
          <span className="text-[15px] font-semibold tabular-nums text-ink">{percent(p.downloads, p.views)}</span>
        </li>
      ))}
    </ul>
  );
}
