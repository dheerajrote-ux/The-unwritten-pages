import { useMemo, useState } from "react";
import { toast } from "sonner";
import { ArrowDown, ArrowUp, Eye, LayoutTemplate, Plus, Settings2, Star, Trash2 } from "lucide-react";
import { api } from "@/data";
import { useAsync } from "@/hooks/useAsync";
import { PLACEMENTS, type AdminBookRow, type Placement, type PlacementKey, type Recommendation } from "@/lib/books";
import { resolvePlacement } from "@/lib/placements";
import { cn, uuid } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Field, Input, Label, Textarea } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Badge, Card, ErrorState, Switch } from "@/components/ui/misc";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { PageHeader } from "@/components/admin/bits";
import { BookJacket } from "@/components/books/BookJacket";
import { BookCard, BookCompact } from "@/components/books/BookCard";

export function PlacementsPage() {
  const placements = useAsync(() => api.listPlacements(), []);
  const recs = useAsync(() => api.listRecommendations(), []);
  const books = useAsync(() => api.listAdminBooks(), []);
  const [editing, setEditing] = useState<PlacementKey | null>(null);

  const byKey = useMemo(() => new Map((placements.data ?? []).map((p) => [p.placement_key, p])), [placements.data]);
  const bookById = useMemo(() => new Map((books.data ?? []).map((b) => [b.id, b])), [books.data]);

  if (placements.error) return <ErrorState message={placements.error} onRetry={placements.reload} />;
  const loading = placements.loading || recs.loading || books.loading;

  return (
    <>
      <PageHeader title="Promotional Placements" description="Choose where books appear, which books, in what order and with what heading. Publication-specific rules from Recommendations take precedence over these global selections." />
      <div className="grid gap-4 md:grid-cols-2">
        {loading
          ? Array.from({ length: 6 }, (_, i) => <div key={i} className="skeleton h-40 rounded-lg" />)
          : PLACEMENTS.map((meta) => {
              const p = byKey.get(meta.key);
              const global = (recs.data ?? []).filter((r) => r.placement === meta.key && r.publication_id === null).sort((a, b) => a.display_order - b.display_order);
              const specific = (recs.data ?? []).filter((r) => r.placement === meta.key && r.publication_id !== null).length;
              return (
                <Card key={meta.key} className={cn("flex flex-col p-5", p && !p.is_active && "opacity-70")}>
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="flex items-center gap-2">
                        <h2 className="text-[15px] font-semibold text-ink">{meta.label}</h2>
                        {p?.is_active ? <Badge tone="success">On</Badge> : <Badge>Off</Badge>}
                      </div>
                      <p className="mt-0.5 text-[12.5px] text-muted">{meta.where}</p>
                    </div>
                    <Button variant="outline" size="sm" onClick={() => setEditing(meta.key)} disabled={!p}><Settings2 /> Configure</Button>
                  </div>
                  <p className="mt-4 font-display text-[18px] text-ink">“{p?.heading}”</p>
                  <div className="mt-auto flex items-center gap-3 pt-4">
                    <div className="flex -space-x-2">
                      {global.slice(0, 5).map((r) => {
                        const b = bookById.get(r.book_id);
                        return b ? <BookJacket key={r.id} path={b.cover_image_path} title={b.title} author={b.author} className="w-8 ring-2 ring-surface" /> : null;
                      })}
                    </div>
                    <p className="text-[12.5px] text-muted">
                      {global.length ? `${global.length} selected` : "No books selected — automatic fallback"} · max {p?.max_books}
                      {specific > 0 && ` · ${specific} publication-specific rule${specific > 1 ? "s" : ""}`}
                    </p>
                  </div>
                </Card>
              );
            })}
      </div>
      {editing && byKey.get(editing) && (
        <PlacementEditor
          placement={byKey.get(editing)!}
          globalRecs={(recs.data ?? []).filter((r) => r.placement === editing && r.publication_id === null).sort((a, b) => a.display_order - b.display_order)}
          books={books.data ?? []}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            placements.reload();
            recs.reload();
          }}
        />
      )}
    </>
  );
}

function PlacementEditor({ placement, globalRecs, books, onClose, onSaved }: { placement: Placement; globalRecs: Recommendation[]; books: AdminBookRow[]; onClose: () => void; onSaved: () => void }) {
  const [p, setP] = useState(placement);
  const [items, setItems] = useState<Recommendation[]>(globalRecs);
  const [adding, setAdding] = useState("");
  const [saving, setSaving] = useState(false);
  const [previewing, setPreviewing] = useState(false);
  const meta = PLACEMENTS.find((x) => x.key === placement.placement_key)!;
  const bookById = new Map(books.map((b) => [b.id, b]));
  const available = books.filter((b) => !items.some((i) => i.book_id === b.id));

  const move = (i: number, d: -1 | 1) => setItems((list) => {
    const n = [...list];
    [n[i], n[i + d]] = [n[i + d], n[i]];
    return n;
  });
  const add = () => {
    if (!adding) return;
    setItems((l) => [...l, { id: uuid(), publication_id: null, book_id: adding, placement: placement.placement_key, priority: 0, display_order: l.length, is_featured: false, is_active: true, start_date: null, end_date: null, created_at: new Date().toISOString() }]);
    setAdding("");
  };
  const save = async () => {
    if (!p.heading.trim()) return toast.error("A heading is required.");
    setSaving(true);
    try {
      await api.savePlacement({ ...p, heading: p.heading.trim(), description: p.description?.trim() || null, max_books: Math.min(24, Math.max(1, Number(p.max_books) || 1)) }, items);
      toast.success(`${meta.label} saved.`);
      onSaved();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  // Preview resolves exactly like the live site (published books only, max, fallback).
  const liveBooks = books.filter((b) => b.status === "published" && b.published_at && new Date(b.published_at) <= new Date());
  const preview = resolvePlacement({ ...p, is_active: true }, items.map((r, i) => ({ ...r, display_order: i })), liveBooks);

  return (
    <Dialog open onOpenChange={(v) => !v && !saving && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogTitle className="font-sans text-[18px] font-semibold">{meta.label}</DialogTitle>
        <p className="mt-1 text-[13px] text-muted">{meta.where}</p>
        <div className="mt-5 grid gap-4">
          <label className="flex items-center justify-between rounded-lg border border-line px-4 py-3">
            <span className="text-[13.5px] font-medium text-ink">Placement enabled</span>
            <Switch checked={p.is_active} onCheckedChange={(v) => setP({ ...p, is_active: v })} aria-label="Placement enabled" />
          </label>
          <div className="grid gap-4 sm:grid-cols-[1fr_120px]">
            <Field label="Promotional heading" htmlFor="pl-h" required><Input value={p.heading} maxLength={80} onChange={(e) => setP({ ...p, heading: e.target.value })} /></Field>
            <Field label="Max books" htmlFor="pl-max"><Input type="number" min={1} max={24} value={p.max_books} onChange={(e) => setP({ ...p, max_books: Number(e.target.value) })} /></Field>
          </div>
          <Field label="Supporting description" htmlFor="pl-d" optional><Textarea rows={2} value={p.description ?? ""} maxLength={240} onChange={(e) => setP({ ...p, description: e.target.value })} /></Field>
          <div>
            <Label>Books (in display order)</Label>
            {items.length === 0 && <p className="rounded-lg border border-dashed border-line-strong p-4 text-center text-[12.5px] text-muted">No books selected. The placement falls back to featured books automatically.</p>}
            <ul className="space-y-2">
              {items.map((r, i) => {
                const b = bookById.get(r.book_id);
                return (
                  <li key={r.id} className={cn("flex items-center gap-3 rounded-lg border border-line p-2.5", i >= p.max_books && "opacity-55")}>
                    <span className="w-5 text-center text-[12px] tabular-nums text-muted">{i + 1}</span>
                    {b && <BookJacket path={b.cover_image_path} title={b.title} author={b.author} className="w-8 shadow-none" />}
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[13.5px] font-medium text-ink">{b?.title ?? "Deleted book"}</span>
                      <span className="block text-[11.5px] text-muted">
                        {b && b.status !== "published" ? "Not published — hidden on the site" : i >= p.max_books ? "Beyond the max — not shown" : r.end_date || r.start_date ? "Has campaign dates" : "Shown"}
                      </span>
                    </span>
                    <button type="button" onClick={() => setItems((l) => l.map((x, j) => (j === i ? { ...x, is_featured: !x.is_featured } : x)))} className="grid size-8 place-items-center rounded-md hover:bg-black/5" aria-label={r.is_featured ? "Unmark featured" : "Mark featured"} aria-pressed={r.is_featured}>
                      <Star className={cn("size-4", r.is_featured ? "fill-accent text-accent" : "text-muted")} />
                    </button>
                    <Button type="button" variant="ghost" size="icon-sm" onClick={() => move(i, -1)} disabled={i === 0} aria-label="Move up"><ArrowUp /></Button>
                    <Button type="button" variant="ghost" size="icon-sm" onClick={() => move(i, 1)} disabled={i === items.length - 1} aria-label="Move down"><ArrowDown /></Button>
                    <Button type="button" variant="ghost" size="icon-sm" onClick={() => setItems((l) => l.filter((_, j) => j !== i))} aria-label="Remove"><Trash2 /></Button>
                  </li>
                );
              })}
            </ul>
            {available.length > 0 && (
              <div className="mt-3 flex gap-2">
                <div className="flex-1"><Select value={adding} onValueChange={setAdding} placeholder="Add a book…" options={available.map((b) => ({ value: b.id, label: `${b.title}${b.status !== "published" ? " (not live)" : ""}` }))} /></div>
                <Button type="button" variant="outline" onClick={add} disabled={!adding}><Plus /> Add</Button>
              </div>
            )}
            <p className="mt-2 text-[12px] text-muted">Featured books are shown first. Campaign dates and priorities can be set per rule on the Recommendations page.</p>
          </div>
        </div>
        <div className="mt-6 flex flex-wrap justify-end gap-2">
          <Button variant="outline" onClick={() => setPreviewing(true)}><Eye /> Preview</Button>
          <Button variant="outline" onClick={onClose} disabled={saving}>Cancel</Button>
          <Button onClick={save} loading={saving}>Save placement</Button>
        </div>
      </DialogContent>
      <Dialog open={previewing} onOpenChange={setPreviewing}>
        <DialogContent className="max-w-5xl bg-paper">
          <DialogTitle className="font-sans text-[15px] font-semibold"><LayoutTemplate className="mr-2 inline size-4" />Preview · {meta.label}</DialogTitle>
          <p className="mt-1 text-[12.5px] text-muted">Rendered with your unsaved settings and the currently published books.</p>
          <div className="mt-6">
            {!preview.books.length ? (
              <p className="py-10 text-center text-sm text-muted">Nothing to show — no published books in this placement.</p>
            ) : ["reader_sidebar", "download_success"].includes(meta.key) ? (
              <div className="mx-auto max-w-sm rounded-xl border border-line bg-surface p-5">
                <p className="font-display text-[19px] text-ink">{p.heading}</p>
                {p.description && <p className="mt-1 text-[12.5px] text-muted">{p.description}</p>}
                <div className="mt-5 space-y-5">{preview.books.map((b) => <BookCompact key={b.id} book={b} surface={meta.key} />)}</div>
              </div>
            ) : meta.key === "reader_footer" ? (
              <div className="rounded-2xl bg-primary p-6">
                <p className="font-display text-[22px] text-white">{p.heading}</p>
                {p.description && <p className="mt-1 text-[13.5px] text-white/70">{p.description}</p>}
                <div className="mt-5 grid gap-5 sm:grid-cols-3">{preview.books.map((b) => <BookCompact key={b.id} book={b} surface={meta.key} dark />)}</div>
              </div>
            ) : (
              <div>
                <h3 className="font-display text-[30px] text-ink">{p.heading}</h3>
                {p.description && <p className="mt-2 text-[15px] text-secondary">{p.description}</p>}
                <div className="mt-6 grid gap-8 sm:grid-cols-2 lg:grid-cols-3">{preview.books.map((b) => <BookCard key={b.id} book={b} surface={meta.key} />)}</div>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </Dialog>
  );
}
