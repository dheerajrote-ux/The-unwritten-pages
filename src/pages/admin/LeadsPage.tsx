import { useEffect, useState } from "react";
import { toast } from "sonner";
import { ChevronLeft, ChevronRight, Download, Mail, Search, Users } from "lucide-react";
import { api } from "@/data";
import { useAsync, useDebounced } from "@/hooks/useAsync";
import type { LeadFilter } from "@/lib/types";
import { addDays, downloadBlob, formatDateTime, formatNumber, startOfDay, toCsv, toDateInput } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { Badge, Card, EmptyState, ErrorState } from "@/components/ui/misc";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { PageHeader } from "@/components/admin/bits";

const PAGE_SIZE = 25;

export function LeadsPage() {
  const [search, setSearch] = useState("");
  const q = useDebounced(search, 250);
  const [publicationId, setPublicationId] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [consent, setConsent] = useState<"all" | "yes" | "no">("all");
  const [sort, setSort] = useState<"newest" | "oldest">("newest");
  const [page, setPage] = useState(1);
  const [exporting, setExporting] = useState(false);
  const [detailId, setDetailId] = useState<string | null>(null);

  const filter: LeadFilter = {
    search: q || undefined,
    publicationId: publicationId || undefined,
    from: from ? startOfDay(new Date(from + "T00:00:00")).toISOString() : undefined,
    to: to ? addDays(startOfDay(new Date(to + "T00:00:00")), 1).toISOString() : undefined,
    consent,
    sort,
  };
  const key = JSON.stringify(filter);
  useEffect(() => {
    setPage(1);
  }, [key]);

  const pubs = useAsync(() => api.listAdminPublications(), []);
  const { data, error, loading, reload } = useAsync(() => api.listLeadDownloads({ ...filter, page, pageSize: PAGE_SIZE }), [key, page]);
  const total = data?.total ?? 0;
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const filtered = Boolean(q || publicationId || from || to || consent !== "all");

  const exportCsv = async () => {
    setExporting(true);
    try {
      const rows = await api.exportLeadDownloads(filter);
      if (!rows.length) return toast.error("There are no leads to export for these filters.");
      const csv = toCsv(
        rows.map((r) => ({ ...r, marketing_consent: r.marketing_consent ? "Yes" : "No", last_downloaded_at: new Date(r.last_downloaded_at).toISOString(), first_downloaded_at: new Date(r.first_downloaded_at).toISOString() })),
        [
          { key: "full_name", label: "Full Name" },
          { key: "email", label: "Email" },
          { key: "company", label: "Company" },
          { key: "designation", label: "Designation" },
          { key: "publication_title", label: "Publication Downloaded" },
          { key: "last_downloaded_at", label: "Download Date (UTC)" },
          { key: "first_downloaded_at", label: "First Download (UTC)" },
          { key: "download_count", label: "Download Count" },
          { key: "marketing_consent", label: "Marketing Consent" },
        ],
      );
      downloadBlob(new Blob([csv], { type: "text/csv;charset=utf-8" }), `leads-${toDateInput(new Date())}.csv`);
      toast.success(`Exported ${formatNumber(rows.length)} rows.`);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setExporting(false);
    }
  };

  return (
    <>
      <PageHeader
        title="Leads"
        description="People who downloaded a publication. One lead per email; each row is a lead + publication."
        actions={<Button variant="outline" onClick={exportCsv} loading={exporting}><Download /> Export {filtered ? "filtered " : ""}CSV</Button>}
      />
      <Card>
        <div className="grid gap-2 border-b border-line p-4 md:grid-cols-2 xl:grid-cols-[1fr_200px_auto_150px_150px]">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted" />
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search name, email, company" aria-label="Search leads" className="h-9 w-full rounded-md border border-line-strong bg-surface pl-9 pr-3 text-[13px] outline-none focus:border-primary" />
          </div>
          <Select size="sm" aria-label="Publication" value={publicationId} onValueChange={setPublicationId} options={[{ value: "", label: "All publications" }, ...(pubs.data ?? []).map((p) => ({ value: p.id, label: p.title }))]} />
          <div className="flex items-center gap-1.5 text-[12.5px] text-muted">
            <input type="date" aria-label="From date" value={from} max={to || undefined} onChange={(e) => setFrom(e.target.value)} className="h-9 rounded-md border border-line-strong bg-surface px-2 text-[12.5px] text-ink" />
            <span>–</span>
            <input type="date" aria-label="To date" value={to} min={from || undefined} onChange={(e) => setTo(e.target.value)} className="h-9 rounded-md border border-line-strong bg-surface px-2 text-[12.5px] text-ink" />
          </div>
          <Select size="sm" aria-label="Consent" value={consent} onValueChange={(v) => setConsent(v as typeof consent)} options={[{ value: "all", label: "Any consent" }, { value: "yes", label: "Consented" }, { value: "no", label: "No consent" }]} />
          <Select size="sm" aria-label="Sort" value={sort} onValueChange={(v) => setSort(v as typeof sort)} options={[{ value: "newest", label: "Newest first" }, { value: "oldest", label: "Oldest first" }]} />
        </div>

        {error ? (
          <ErrorState message={error} onRetry={reload} />
        ) : loading && !data ? (
          <div className="space-y-2 p-4">{Array.from({ length: 6 }, (_, i) => <div key={i} className="skeleton h-11" />)}</div>
        ) : !data?.rows.length ? (
          <EmptyState icon={<Users />} title={filtered ? "No leads match these filters" : "No leads yet"} description={filtered ? "Try widening the date range or clearing the search." : "Leads appear here when readers download a publication."} />
        ) : (
          <>
            <div className="relative overflow-x-auto">
              <table className="w-full min-w-[900px] text-[13px]">
                <thead>
                  <tr className="border-b border-line bg-admin-bg text-left text-[11.5px] uppercase tracking-wide text-muted">
                    <th className="px-4 py-2.5 font-medium">Full name</th>
                    <th className="px-3 py-2.5 font-medium">Email</th>
                    <th className="px-3 py-2.5 font-medium">Company</th>
                    <th className="px-3 py-2.5 font-medium">Designation</th>
                    <th className="px-3 py-2.5 font-medium">Publication downloaded</th>
                    <th className="px-3 py-2.5 font-medium">Download date</th>
                    <th className="px-4 py-2.5 font-medium">Consent</th>
                  </tr>
                </thead>
                <tbody className={loading ? "divide-y divide-line opacity-60" : "divide-y divide-line"}>
                  {data.rows.map((r) => (
                    <tr key={`${r.lead_id}-${r.publication_id ?? r.publication_title}`} className="cursor-pointer hover:bg-admin-bg/70" onClick={() => setDetailId(r.lead_id)}>
                      <td className="px-4 py-3 font-medium text-ink">
                        <button className="text-left hover:text-primary" onClick={(e) => { e.stopPropagation(); setDetailId(r.lead_id); }}>{r.full_name}</button>
                      </td>
                      <td className="px-3 text-secondary">{r.email}</td>
                      <td className="px-3 text-secondary">{r.company ?? "—"}</td>
                      <td className="px-3 text-secondary">{r.designation ?? "—"}</td>
                      <td className="max-w-[240px] truncate px-3 text-ink">
                        {r.publication_title}
                        {r.download_count > 1 && <span className="ml-1.5 text-[11.5px] text-muted">×{r.download_count}</span>}
                      </td>
                      <td className="whitespace-nowrap px-3 text-secondary">{formatDateTime(r.last_downloaded_at)}</td>
                      <td className="px-4">{r.marketing_consent ? <Badge tone="success">Yes</Badge> : <Badge>No</Badge>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="flex items-center justify-between border-t border-line px-4 py-3 text-[12.5px] text-muted">
              <span>
                {formatNumber((page - 1) * PAGE_SIZE + 1)}–{formatNumber(Math.min(page * PAGE_SIZE, total))} of {formatNumber(total)}
              </span>
              <div className="flex items-center gap-1">
                <Button variant="outline" size="icon-sm" onClick={() => setPage((p) => p - 1)} disabled={page <= 1} aria-label="Previous page"><ChevronLeft /></Button>
                <span className="px-2">Page {page} of {pages}</span>
                <Button variant="outline" size="icon-sm" onClick={() => setPage((p) => p + 1)} disabled={page >= pages} aria-label="Next page"><ChevronRight /></Button>
              </div>
            </div>
          </>
        )}
      </Card>
      <LeadDetailDialog leadId={detailId} onClose={() => setDetailId(null)} />
    </>
  );
}

function LeadDetailDialog({ leadId, onClose }: { leadId: string | null; onClose: () => void }) {
  const { data, loading } = useAsync(() => (leadId ? api.getLeadDetail(leadId) : Promise.resolve(null)), [leadId]);
  return (
    <Dialog open={!!leadId} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-md">
        {loading || !data ? (
          <div className="space-y-3"><div className="skeleton h-7 w-48" /><div className="skeleton h-32" /></div>
        ) : (
          <>
            <DialogTitle className="font-sans text-[19px] font-semibold">{data.lead.full_name}</DialogTitle>
            <a href={`mailto:${data.lead.email}`} className="mt-1 inline-flex items-center gap-1.5 text-[13px] text-primary hover:underline"><Mail className="size-3.5" />{data.lead.email}</a>
            <dl className="mt-5 grid grid-cols-2 gap-4 rounded-lg bg-admin-bg p-4 text-[13px]">
              <div><dt className="text-muted">Company</dt><dd className="font-medium text-ink">{data.lead.company ?? "—"}</dd></div>
              <div><dt className="text-muted">Designation</dt><dd className="font-medium text-ink">{data.lead.designation ?? "—"}</dd></div>
              <div><dt className="text-muted">First seen</dt><dd className="font-medium text-ink">{formatDateTime(data.lead.created_at)}</dd></div>
              <div>
                <dt className="text-muted">Marketing consent</dt>
                <dd className="font-medium text-ink">{data.lead.marketing_consent ? `Yes${data.lead.consent_at ? ` · ${formatDateTime(data.lead.consent_at)}` : ""}` : "No"}</dd>
              </div>
            </dl>
            <h3 className="mt-6 text-[13px] font-semibold text-ink">Downloads ({data.downloads.length})</h3>
            <ul className="mt-2 max-h-60 divide-y divide-line overflow-y-auto">
              {data.downloads.map((d) => (
                <li key={d.id} className="flex justify-between gap-3 py-2.5 text-[13px]">
                  <span className="truncate text-ink">{d.publication_title}</span>
                  <span className="shrink-0 text-muted">{formatDateTime(d.downloaded_at)}</span>
                </li>
              ))}
            </ul>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
