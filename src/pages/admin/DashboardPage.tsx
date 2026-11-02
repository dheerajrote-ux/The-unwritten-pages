import { useState } from "react";
import { Link } from "react-router-dom";
import { BookCheck, BookOpen, Download, FilePen, Plus, Users, Eye } from "lucide-react";
import { api } from "@/data";
import { useAsync } from "@/hooks/useAsync";
import { formatNumber, relativeTime } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { EmptyState, ErrorState } from "@/components/ui/misc";
import { DateRangeFilter, PageHeader, Panel, StatCard, rangeFor, type DateRange } from "@/components/admin/bits";
import { RankBars, TrendChart } from "@/components/admin/charts";

export function DashboardPage() {
  const [range, setRange] = useState<DateRange>(() => rangeFor("30"));
  const { data, error, loading, reload } = useAsync(() => api.getAnalytics(range.from, range.to), [range.from.getTime(), range.to.getTime()]);

  if (error) return <ErrorState message={error} onRetry={reload} />;
  const r = data?.range;
  const top = (data?.publications ?? []).filter((p) => p.downloads > 0).slice(0, 5);

  return (
    <>
      <PageHeader
        title="Dashboard"
        description="An overview of your library. Every figure is calculated from recorded events."
        actions={
          <>
            <DateRangeFilter value={range} onChange={setRange} />
            <Button asChild>
              <Link to="/admin/publications/new"><Plus /> Add publication</Link>
            </Button>
          </>
        }
      />
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        <StatCard label="Total publications" icon={<BookOpen />} loading={loading} value={formatNumber(data?.inventory.total ?? 0)} sub="In the library, all statuses" />
        <StatCard label="Published" icon={<BookCheck />} loading={loading} value={formatNumber(data?.inventory.published ?? 0)} sub={data?.inventory.unpublished ? `${data.inventory.unpublished} unpublished` : "Visible to readers"} />
        <StatCard label="Drafts" icon={<FilePen />} loading={loading} value={formatNumber(data?.inventory.drafts ?? 0)} sub="Not yet public" />
        <StatCard label="Total downloads" icon={<Download />} loading={loading} value={formatNumber(data?.all_time.downloads ?? 0)} sub={`+${formatNumber(r?.downloads ?? 0)} in selected period`} />
        <StatCard label="Total leads" icon={<Users />} loading={loading} value={formatNumber(data?.all_time.leads ?? 0)} sub={`+${formatNumber(r?.leads ?? 0)} new in selected period`} />
        <StatCard label="Total readers" icon={<Eye />} loading={loading} value={formatNumber(data?.all_time.readers ?? 0)} sub="Unique reading sessions that opened the reader" />
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-2">
        <Panel title="Downloads over time" description={`${formatNumber(r?.downloads ?? 0)} downloads in this period`}>
          {loading ? <div className="skeleton h-[220px]" /> : <TrendChart data={data!.daily} dataKey="downloads" name="Downloads" />}
        </Panel>
        <Panel title="Leads collected over time" description={`${formatNumber(r?.leads ?? 0)} new leads in this period`}>
          {loading ? <div className="skeleton h-[220px]" /> : <TrendChart data={data!.daily} dataKey="leads" name="New leads" />}
        </Panel>
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-3">
        <Panel title="Most downloaded" description="Selected period" actions={<Link to="/admin/analytics" className="text-[12.5px] font-medium text-primary hover:underline">Analytics</Link>}>
          {loading ? <div className="skeleton h-48" /> : top.length ? <RankBars rows={top.map((p) => ({ label: p.title, value: p.downloads }))} valueLabel="Downloads" /> : <EmptyState className="py-8" title="No downloads yet" description="Downloads will appear once readers request PDFs." />}
        </Panel>
        <Panel title="Recent downloads" actions={<Link to="/admin/leads" className="text-[12.5px] font-medium text-primary hover:underline">All leads</Link>}>
          <ActivityList loading={loading} empty="No downloads yet" items={(data?.recent_downloads ?? []).map((d) => ({ id: d.id, title: d.full_name, sub: d.publication_title, time: d.downloaded_at }))} />
        </Panel>
        <Panel title="Recent lead submissions">
          <ActivityList loading={loading} empty="No leads yet" items={(data?.recent_leads ?? []).map((l) => ({ id: l.id, title: l.full_name, sub: [l.designation, l.company].filter(Boolean).join(" · ") || l.email, time: l.created_at }))} />
        </Panel>
      </div>
    </>
  );
}

function ActivityList({ items, loading, empty }: { items: { id: string; title: string; sub: string; time: string }[]; loading: boolean; empty: string }) {
  if (loading) return <div className="space-y-3">{Array.from({ length: 5 }, (_, i) => <div key={i} className="skeleton h-9" />)}</div>;
  if (!items.length) return <EmptyState className="py-8" title={empty} />;
  return (
    <ul className="divide-y divide-line">
      {items.map((i) => (
        <li key={i.id} className="flex items-center gap-3 py-2.5 first:pt-0 last:pb-0">
          <span className="grid size-8 shrink-0 place-items-center rounded-full bg-primary/[0.06] text-[11.5px] font-semibold text-primary">
            {i.title.split(/\s+/).map((s) => s[0]).slice(0, 2).join("")}
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-[13px] font-medium text-ink">{i.title}</p>
            <p className="truncate text-[12px] text-muted">{i.sub}</p>
          </div>
          <span className="shrink-0 text-[11.5px] text-muted">{relativeTime(i.time)}</span>
        </li>
      ))}
    </ul>
  );
}
