import { ArrowDown, ArrowUp, CheckCircle2, ExternalLink, Plus, Tag, Trash2, AlertCircle } from "lucide-react";
import { CURRENCIES, FORMATS, MARKETPLACES, checkAmazonUrl, linkLabel, type BookFormat, type Marketplace, type PurchaseLink } from "@/lib/books";
import { cn, uuid } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Badge, Switch } from "@/components/ui/misc";

export function newLink(bookId: string, format: BookFormat = "paperback"): PurchaseLink {
  return { id: uuid(), book_id: bookId, marketplace: "amazon_in", marketplace_name: null, format, product_url: "", display_label: null, displayed_price: null, currency: "INR", show_price: true, is_primary: false, status: "active", display_order: 0 };
}

export function linkErrors(l: PurchaseLink): string | null {
  if (!l.product_url.trim()) return "Paste the Amazon product URL.";
  const c = checkAmazonUrl(l.product_url);
  if (!c.ok) return c.error ?? "Invalid URL.";
  if (l.marketplace === "other" && !l.marketplace_name?.trim()) return "Name the store (e.g. Amazon.de).";
  if (l.displayed_price !== null && (Number.isNaN(l.displayed_price) || l.displayed_price < 0)) return "Enter a valid price.";
  return null;
}

/**
 * Edits a book's purchase links. URLs are stored exactly as pasted (affiliate
 * tags preserved). The store is detected from the URL; nothing is generated.
 */
export function PurchaseLinkManager({ bookId, links, onChange, showErrors, associate }: { bookId: string; links: PurchaseLink[]; onChange: (l: PurchaseLink[]) => void; showErrors: boolean; associate: boolean }) {
  const set = (i: number, patch: Partial<PurchaseLink>) => onChange(links.map((l, j) => (j === i ? { ...l, ...patch } : patch.is_primary ? { ...l, is_primary: false } : l)));
  const move = (i: number, d: -1 | 1) => {
    const next = [...links];
    [next[i], next[i + d]] = [next[i + d], next[i]];
    onChange(next);
  };

  return (
    <div className="space-y-4">
      {links.length === 0 && <p className="rounded-lg border border-dashed border-line-strong p-5 text-center text-[13px] text-muted">No purchase links yet. The book shows “Coming soon” until you add one.</p>}
      {links.map((l, i) => {
        const check = l.product_url ? checkAmazonUrl(l.product_url) : null;
        const err = showErrors ? linkErrors(l) : check && !check.ok ? check.error ?? null : null;
        return (
          <div key={l.id} className={cn("rounded-lg border p-4", err ? "border-danger/40" : "border-line", l.status === "inactive" && "bg-admin-bg/60")}>
            <div className="mb-3 flex flex-wrap items-center gap-2">
              <span className="text-[12px] font-semibold uppercase tracking-wider text-muted">Link {i + 1}</span>
              {l.is_primary && <Badge tone="primary">Primary</Badge>}
              {l.status === "inactive" && <Badge>Inactive</Badge>}
              {check?.ok && <Badge tone="success"><CheckCircle2 className="size-3" />{check.host}</Badge>}
              {check?.ok && check.affiliateTag && <Badge tone="accent"><Tag className="size-3" />tag={check.affiliateTag}</Badge>}
              {check?.ok && !check.affiliateTag && associate && <Badge tone="warning">No affiliate tag</Badge>}
              <div className="ml-auto flex gap-1">
                <Button type="button" variant="ghost" size="icon-sm" onClick={() => move(i, -1)} disabled={i === 0} aria-label="Move up"><ArrowUp /></Button>
                <Button type="button" variant="ghost" size="icon-sm" onClick={() => move(i, 1)} disabled={i === links.length - 1} aria-label="Move down"><ArrowDown /></Button>
                {check?.ok && (
                  <Button asChild variant="ghost" size="icon-sm" aria-label="Open link in a new tab"><a href={l.product_url} target="_blank" rel="noopener noreferrer"><ExternalLink /></a></Button>
                )}
                <Button type="button" variant="ghost" size="icon-sm" onClick={() => onChange(links.filter((_, j) => j !== i))} aria-label="Remove link"><Trash2 /></Button>
              </div>
            </div>
            <div className="grid gap-3 md:grid-cols-12">
              <div className="md:col-span-12">
                <Label htmlFor={`url-${l.id}`} required>Product URL</Label>
                <Input
                  id={`url-${l.id}`}
                  value={l.product_url}
                  placeholder="https://www.amazon.in/dp/…?tag=yourtag-21"
                  aria-invalid={err ? true : undefined}
                  onChange={(e) => {
                    const url = e.target.value;
                    const c = checkAmazonUrl(url);
                    set(i, { product_url: url, ...(c.ok && c.marketplace ? { marketplace: c.marketplace as Marketplace, currency: l.displayed_price === null ? MARKETPLACES.find((m) => m.value === c.marketplace)?.currency ?? l.currency : l.currency } : {}) });
                  }}
                />
                {err && <p className="mt-1.5 flex items-center gap-1.5 text-[12.5px] text-danger"><AlertCircle className="size-3.5" />{err}</p>}
              </div>
              <div className="md:col-span-3">
                <Label>Marketplace</Label>
                <Select value={l.marketplace} onValueChange={(v) => set(i, { marketplace: v as Marketplace })} options={MARKETPLACES.map((m) => ({ value: m.value, label: m.label }))} />
              </div>
              {l.marketplace === "other" && (
                <div className="md:col-span-3">
                  <Label htmlFor={`mk-${l.id}`} required>Store name</Label>
                  <Input id={`mk-${l.id}`} value={l.marketplace_name ?? ""} placeholder="Amazon.de" onChange={(e) => set(i, { marketplace_name: e.target.value })} />
                </div>
              )}
              <div className="md:col-span-3">
                <Label>Format</Label>
                <Select value={l.format} onValueChange={(v) => set(i, { format: v as BookFormat })} options={FORMATS} />
              </div>
              <div className={l.marketplace === "other" ? "md:col-span-3" : "md:col-span-6"}>
                <Label htmlFor={`lbl-${l.id}`} optional>Display label</Label>
                <Input id={`lbl-${l.id}`} value={l.display_label ?? ""} maxLength={80} placeholder={linkLabel({ ...l, display_label: null })} onChange={(e) => set(i, { display_label: e.target.value || null })} />
              </div>
              <div className="md:col-span-3">
                <Label htmlFor={`price-${l.id}`} optional>Displayed price</Label>
                <Input id={`price-${l.id}`} type="number" min={0} step="0.01" value={l.displayed_price ?? ""} onChange={(e) => set(i, { displayed_price: e.target.value === "" ? null : Number(e.target.value) })} />
              </div>
              <div className="md:col-span-2">
                <Label>Currency</Label>
                <Select value={l.currency ?? "INR"} onValueChange={(v) => set(i, { currency: v })} options={CURRENCIES.map((c) => ({ value: c, label: c }))} />
              </div>
              <div className="flex flex-wrap items-end gap-x-6 gap-y-3 md:col-span-7">
                <label className="flex h-10 items-center gap-2 text-[13px] text-ink"><Switch checked={l.show_price} onCheckedChange={(v) => set(i, { show_price: v })} aria-label="Show price" />Show price</label>
                <label className="flex h-10 items-center gap-2 text-[13px] text-ink"><Switch checked={l.is_primary} onCheckedChange={(v) => set(i, { is_primary: v })} aria-label="Primary purchase link" />Primary</label>
                <label className="flex h-10 items-center gap-2 text-[13px] text-ink"><Switch checked={l.status === "active"} onCheckedChange={(v) => set(i, { status: v ? "active" : "inactive" })} aria-label="Link active" />Active</label>
              </div>
            </div>
          </div>
        );
      })}
      <Button type="button" variant="outline" onClick={() => onChange([...links, { ...newLink(bookId), is_primary: links.length === 0 }])}>
        <Plus /> Add purchase link
      </Button>
      <p className="text-[12.5px] leading-relaxed text-muted">
        Paste the exact product URL from Amazon (Associates links with <code>tag=</code> are kept as-is). Links are never generated, and prices are shown as manually maintained information.
      </p>
    </div>
  );
}
