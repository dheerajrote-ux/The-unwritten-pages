import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { AlertTriangle, CheckCircle2, ExternalLink, Info, Search, Tag } from "lucide-react";
import { api } from "@/data";
import { useAsync, useDebounced } from "@/hooks/useAsync";
import { useSite } from "@/hooks/useSite";
import { MARKETPLACES, checkAmazonUrl, formatLabel, formatPrice, linkLabel, marketplaceLabel } from "@/lib/books";
import { formatNumber } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Field, Textarea } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Badge, Card, EmptyState, ErrorState, Switch } from "@/components/ui/misc";
import { PageHeader, Panel } from "@/components/admin/bits";

/** Every purchase link across all books, with validation and the affiliate disclosure settings. */
export function AmazonLinksPage() {
  const { site, refreshSite } = useSite();
  const { data, error, loading, reload } = useAsync(() => api.listAllPurchaseLinks(), []);
  const [qRaw, setQ] = useState("");
  const q = useDebounced(qRaw, 150).toLowerCase();
  const [market, setMarket] = useState("");
  const [state, setState] = useState<"" | "active" | "inactive" | "issues">("");
  const [associate, setAssociate] = useState(site.amazon_associate);
  const [disclosure, setDisclosure] = useState(site.affiliate_disclosure);
  const [savingSettings, setSavingSettings] = useState(false);

  useEffect(() => {
    setAssociate(site.amazon_associate);
    setDisclosure(site.affiliate_disclosure);
  }, [site.amazon_associate, site.affiliate_disclosure]);

  const issues = (l: NonNullable<typeof data>[number]) => {
    const c = checkAmazonUrl(l.product_url);
    const list: string[] = [];
    if (!c.ok) list.push(c.error ?? "Invalid URL");
    if (c.ok && associate && !c.affiliateTag && !/amzn\.|a\.co/.test(c.host)) list.push("No affiliate tag");
    if (c.ok && c.marketplace && c.marketplace !== l.marketplace && l.marketplace !== "other") list.push(`URL is ${marketplaceLabel(c.marketplace)}`);
    return list;
  };

  const rows = useMemo(
    () =>
      (data ?? []).filter((l) => {
        if (q && ![l.book_title, l.product_url, l.display_label ?? ""].some((v) => v.toLowerCase().includes(q))) return false;
        if (market && l.marketplace !== market) return false;
        if (state === "issues") return issues(l).length > 0;
        if (state && l.status !== state) return false;
        return true;
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [data, q, market, state, associate],
  );

  const toggle = async (id: string, active: boolean) => {
    try {
      await api.setPurchaseLinkStatus(id, active ? "active" : "inactive");
      reload();
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  const saveSettings = async () => {
    setSavingSettings(true);
    try {
      await api.updateSiteSettings({ amazon_associate: associate, affiliate_disclosure: disclosure.trim() || "As an Amazon Associate, we earn from qualifying purchases." });
      await refreshSite();
      toast.success("Affiliate settings saved.");
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSavingSettings(false);
    }
  };

  return (
    <>
      <PageHeader title="Amazon Link Management" description="All purchase links across books. Links are stored exactly as entered — nothing is generated or scraped." />
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_340px]">
        <Card className="min-w-0">
          <div className="grid gap-2 border-b border-line p-4 md:grid-cols-[1fr_180px_180px]">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted" />
              <input value={qRaw} onChange={(e) => setQ(e.target.value)} placeholder="Search book, label or URL" aria-label="Search links" className="h-9 w-full rounded-md border border-line-strong bg-surface pl-9 pr-3 text-[13px] outline-none focus:border-primary" />
            </div>
            <Select size="sm" aria-label="Marketplace" value={market} onValueChange={setMarket} options={[{ value: "", label: "All marketplaces" }, ...MARKETPLACES.map((m) => ({ value: m.value, label: m.label }))]} />
            <Select size="sm" aria-label="Status" value={state} onValueChange={(v) => setState(v as typeof state)} options={[{ value: "", label: "Any status" }, { value: "active", label: "Active" }, { value: "inactive", label: "Inactive" }, { value: "issues", label: "Needs attention" }]} />
          </div>
          {error ? <ErrorState message={error} onRetry={reload} /> : loading ? <div className="space-y-2 p-4">{Array.from({ length: 4 }, (_, i) => <div key={i} className="skeleton h-12" />)}</div> : !rows.length ? (
            <EmptyState icon={<Tag />} title={data?.length ? "No links match" : "No purchase links yet"} description={data?.length ? "Try clearing the filters." : "Add links from a book's edit page (section 5)."} action={!data?.length ? <Button asChild variant="outline"><Link to="/admin/books">Go to books</Link></Button> : undefined} />
          ) : (
            <div className="relative overflow-x-auto">
              <table className="w-full min-w-[900px] text-[13px]">
                <thead>
                  <tr className="border-b border-line bg-admin-bg text-left text-[11.5px] uppercase tracking-wide text-muted">
                    <th className="px-4 py-2.5 font-medium">Book / label</th>
                    <th className="px-3 py-2.5 font-medium">Marketplace</th>
                    <th className="px-3 py-2.5 font-medium">Format</th>
                    <th className="px-3 py-2.5 font-medium">Price</th>
                    <th className="px-3 py-2.5 font-medium">URL check</th>
                    <th className="px-3 py-2.5 text-right font-medium">Clicks</th>
                    <th className="px-3 py-2.5 font-medium">Active</th>
                    <th className="w-12 px-3" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {rows.map((l) => {
                    const c = checkAmazonUrl(l.product_url);
                    const problems = issues(l);
                    return (
                      <tr key={l.id} className="hover:bg-admin-bg/70">
                        <td className="max-w-[260px] px-4 py-3">
                          <Link to={`/admin/books/${l.book_id}/edit`} className="block truncate font-medium text-ink hover:text-primary">{l.book_title}</Link>
                          <span className="block truncate text-[12px] text-muted">{linkLabel(l)}{l.is_primary ? " · Primary" : ""}{l.book_status !== "published" ? " · book not live" : ""}</span>
                        </td>
                        <td className="px-3 text-secondary">{marketplaceLabel(l.marketplace, l.marketplace_name)}</td>
                        <td className="px-3 text-secondary">{formatLabel(l.format)}</td>
                        <td className="px-3 text-secondary">{formatPrice(l.displayed_price, l.currency) ?? "—"}{l.displayed_price !== null && !l.show_price && <span className="text-muted"> (hidden)</span>}</td>
                        <td className="px-3">
                          <div className="flex flex-wrap gap-1">
                            {problems.length ? problems.map((p) => <Badge key={p} tone="warning"><AlertTriangle className="size-3" />{p}</Badge>) : <Badge tone="success"><CheckCircle2 className="size-3" />{c.host}</Badge>}
                            {c.affiliateTag && <Badge tone="accent">tag={c.affiliateTag}</Badge>}
                          </div>
                        </td>
                        <td className="px-3 text-right font-medium tabular-nums">{formatNumber(l.clicks)}</td>
                        <td className="px-3"><Switch checked={l.status === "active"} onCheckedChange={(v) => toggle(l.id, v)} aria-label="Active" /></td>
                        <td className="px-3"><a href={l.product_url} target="_blank" rel="noopener noreferrer" className="grid size-8 place-items-center rounded-md text-muted hover:bg-black/5 hover:text-ink" aria-label="Open link"><ExternalLink className="size-4" /></a></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </Card>
        <div className="space-y-6">
          <Panel title="Amazon Associates">
            <label className="flex items-start justify-between gap-4">
              <span className="text-[13px] text-secondary">This site participates in the Amazon Associates program</span>
              <Switch checked={associate} onCheckedChange={setAssociate} aria-label="Participates in Amazon Associates" />
            </label>
            <p className="mt-3 flex gap-2 text-[12.5px] text-muted"><Info className="mt-0.5 size-3.5 shrink-0" />Turn this on only if you're an approved Associate. When on, the disclosure is shown beside purchase buttons and links carry <code>rel="sponsored"</code>.</p>
            <Field label="Disclosure text" htmlFor="aff-disc" className="mt-4">
              <Textarea rows={3} value={disclosure} onChange={(e) => setDisclosure(e.target.value)} disabled={!associate} />
            </Field>
            <Button className="mt-4" onClick={saveSettings} loading={savingSettings}>Save</Button>
          </Panel>
          <Panel title="Good to know">
            <ul className="list-disc space-y-2 pl-4 text-[12.5px] leading-relaxed text-muted">
              <li>Clicks are outbound visits to Amazon, not sales. Sales reporting needs Amazon Associates reporting.</li>
              <li>Prices are shown as manually maintained and labelled as such; they may differ on Amazon.</li>
              <li>Short links (amzn.to) can't be checked for a tag here, but are stored unchanged.</li>
            </ul>
          </Panel>
        </div>
      </div>
    </>
  );
}
