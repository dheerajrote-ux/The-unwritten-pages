import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Globe2, MoreHorizontal, Pencil, Plus, Sparkles, Trash2 } from "lucide-react";
import { api } from "@/data";
import { useAsync } from "@/hooks/useAsync";
import { PLACEMENTS, placementLabel, type PlacementKey, type Recommendation } from "@/lib/books";
import { formatDate } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Field, Input, Label } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Badge, Card, EmptyState, ErrorState, Switch } from "@/components/ui/misc";
import { ConfirmDialog, Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown";
import { PageHeader } from "@/components/admin/bits";
import { BookJacket } from "@/components/books/BookJacket";

const GLOBAL = "__global__";
type Draft = Partial<Recommendation> & { publication: string; book_id: string; placement: PlacementKey; start: string; end: string };
const toLocal = (iso: string | null) => (iso ? iso.slice(0, 16) : "");

/** Connect books to publications per placement — or globally for every publication. */
export function RecommendationsPage() {
  const recs = useAsync(() => api.listRecommendations(), []);
  const books = useAsync(() => api.listAdminBooks(), []);
  const pubs = useAsync(() => api.listAdminPublications(), []);
  const [pubFilter, setPubFilter] = useState("");
  const [placementFilter, setPlacementFilter] = useState("");
  const [draft, setDraft] = useState<Draft | null>(null);
  const [saving, setSaving] = useState(false);
  const [toDelete, setToDelete] = useState<Recommendation | null>(null);

  const bookById = useMemo(() => new Map((books.data ?? []).map((b) => [b.id, b])), [books.data]);
  const pubById = useMemo(() => new Map((pubs.data ?? []).map((p) => [p.id, p])), [pubs.data]);
  const rows = useMemo(
    () =>
      (recs.data ?? [])
        .filter((r) => (!pubFilter || (pubFilter === GLOBAL ? r.publication_id === null : r.publication_id === pubFilter)) && (!placementFilter || r.placement === placementFilter))
        .sort((a, b) => a.placement.localeCompare(b.placement) || Number(b.publication_id !== null) - Number(a.publication_id !== null) || b.priority - a.priority || a.display_order - b.display_order),
    [recs.data, pubFilter, placementFilter],
  );

  const open = (r?: Recommendation) =>
    setDraft(
      r
        ? { ...r, publication: r.publication_id ?? GLOBAL, start: toLocal(r.start_date), end: toLocal(r.end_date) }
        : { publication: pubFilter && pubFilter !== GLOBAL ? pubFilter : GLOBAL, book_id: "", placement: (placementFilter as PlacementKey) || "reader_sidebar", priority: 0, display_order: 0, is_active: true, is_featured: false, start: "", end: "" },
    );

  const save = async () => {
    if (!draft) return;
    if (!draft.book_id) return toast.error("Choose a book.");
    if (draft.start && draft.end && draft.end <= draft.start) return toast.error("The end date must be after the start date.");
    setSaving(true);
    try {
      await api.saveRecommendation({
        id: draft.id,
        publication_id: draft.publication === GLOBAL ? null : draft.publication,
        book_id: draft.book_id,
        placement: draft.placement,
        priority: Number(draft.priority) || 0,
        display_order: Number(draft.display_order) || 0,
        is_active: draft.is_active ?? true,
        is_featured: draft.is_featured ?? false,
        start_date: draft.start ? new Date(draft.start).toISOString() : null,
        end_date: draft.end ? new Date(draft.end).toISOString() : null,
      });
      toast.success(draft.id ? "Recommendation updated." : "Recommendation added.");
      setDraft(null);
      recs.reload();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const toggle = async (r: Recommendation) => {
    try {
      await api.saveRecommendation({ ...r, is_active: !r.is_active });
      recs.reload();
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  const campaignState = (r: Recommendation) => {
    const now = Date.now();
    if (r.start_date && new Date(r.start_date).getTime() > now) return <Badge tone="primary">Scheduled {formatDate(r.start_date)}</Badge>;
    if (r.end_date && new Date(r.end_date).getTime() <= now) return <Badge tone="warning">Ended {formatDate(r.end_date)}</Badge>;
    if (r.end_date) return <Badge tone="accent">Until {formatDate(r.end_date)}</Badge>;
    return <span className="text-muted">Always</span>;
  };

  const loading = recs.loading || books.loading || pubs.loading;
  return (
    <>
      <PageHeader title="Recommendations" description="Recommend books for specific publications and placements. Global rules apply to every publication; publication-specific rules take precedence." actions={<Button onClick={() => open()}><Plus /> Add recommendation</Button>} />
      <Card>
        <div className="grid gap-2 border-b border-line p-4 sm:grid-cols-2 lg:grid-cols-[280px_260px]">
          <Select size="sm" aria-label="Publication" value={pubFilter} onValueChange={setPubFilter} options={[{ value: "", label: "All rules" }, { value: GLOBAL, label: "Global (all publications)" }, ...(pubs.data ?? []).map((p) => ({ value: p.id, label: p.title }))]} />
          <Select size="sm" aria-label="Placement" value={placementFilter} onValueChange={setPlacementFilter} options={[{ value: "", label: "All placements" }, ...PLACEMENTS.map((p) => ({ value: p.key, label: p.label }))]} />
        </div>
        {recs.error ? <ErrorState message={recs.error} onRetry={recs.reload} /> : loading ? <div className="space-y-2 p-4">{Array.from({ length: 5 }, (_, i) => <div key={i} className="skeleton h-12" />)}</div> : !rows.length ? (
          <EmptyState icon={<Sparkles />} title="No recommendations here yet" description="Without manual rules, placements fall back to featured books." action={<Button onClick={() => open()}><Plus /> Add recommendation</Button>} />
        ) : (
          <div className="relative overflow-x-auto">
            <table className="w-full min-w-[920px] text-[13px]">
              <thead>
                <tr className="border-b border-line bg-admin-bg text-left text-[11.5px] uppercase tracking-wide text-muted">
                  <th className="px-4 py-2.5 font-medium">Publication</th>
                  <th className="px-3 py-2.5 font-medium">Recommended book</th>
                  <th className="px-3 py-2.5 font-medium">Placement</th>
                  <th className="px-3 py-2.5 text-right font-medium">Priority</th>
                  <th className="px-3 py-2.5 text-right font-medium">Order</th>
                  <th className="px-3 py-2.5 font-medium">Campaign</th>
                  <th className="px-3 py-2.5 font-medium">Active</th>
                  <th className="w-14 px-4" />
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {rows.map((r) => {
                  const b = bookById.get(r.book_id);
                  return (
                    <tr key={r.id} className="hover:bg-admin-bg/70">
                      <td className="max-w-[220px] truncate px-4 py-3">{r.publication_id ? <span className="text-ink">{pubById.get(r.publication_id)?.title ?? "Deleted publication"}</span> : <span className="inline-flex items-center gap-1.5 text-secondary"><Globe2 className="size-3.5" />Global</span>}</td>
                      <td className="px-3 py-3">
                        <div className="flex items-center gap-2.5">
                          {b && <BookJacket path={b.cover_image_path} title={b.title} author={b.author} className="w-7 shadow-none" />}
                          <span className="max-w-[220px] truncate font-medium text-ink">{b?.title ?? "Deleted book"}</span>
                          {r.is_featured && <Badge tone="accent">Featured</Badge>}
                          {b && b.status !== "published" && <Badge tone="warning">Book not live</Badge>}
                        </div>
                      </td>
                      <td className="px-3 text-secondary">{placementLabel(r.placement)}</td>
                      <td className="px-3 text-right tabular-nums">{r.priority}</td>
                      <td className="px-3 text-right tabular-nums">{r.display_order}</td>
                      <td className="px-3">{campaignState(r)}</td>
                      <td className="px-3"><Switch checked={r.is_active} onCheckedChange={() => toggle(r)} aria-label="Active" /></td>
                      <td className="px-4 text-right">
                        <DropdownMenu>
                          <DropdownMenuTrigger className="grid size-8 place-items-center rounded-md text-muted hover:bg-black/5" aria-label="Actions"><MoreHorizontal className="size-4" /></DropdownMenuTrigger>
                          <DropdownMenuContent>
                            <DropdownMenuItem onSelect={() => open(r)}><Pencil /> Edit</DropdownMenuItem>
                            <DropdownMenuItem danger onSelect={() => setToDelete(r)}><Trash2 /> Delete</DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Dialog open={!!draft} onOpenChange={(v) => !v && !saving && setDraft(null)}>
        <DialogContent className="max-w-xl">
          <DialogTitle className="font-sans text-[18px] font-semibold">{draft?.id ? "Edit recommendation" : "Add recommendation"}</DialogTitle>
          {draft && (
            <form onSubmit={(e) => { e.preventDefault(); void save(); }} className="mt-5 grid gap-4">
              <div><Label>Publication</Label><Select value={draft.publication} onValueChange={(v) => setDraft({ ...draft, publication: v })} options={[{ value: GLOBAL, label: "Global — every publication" }, ...(pubs.data ?? []).map((p) => ({ value: p.id, label: p.title }))]} /></div>
              <div><Label required>Book</Label><Select value={draft.book_id} onValueChange={(v) => setDraft({ ...draft, book_id: v })} placeholder="Choose a book" options={(books.data ?? []).map((b) => ({ value: b.id, label: `${b.title}${b.status !== "published" ? " (not live)" : ""}` }))} /></div>
              <div><Label>Placement</Label><Select value={draft.placement} onValueChange={(v) => setDraft({ ...draft, placement: v as PlacementKey })} options={PLACEMENTS.map((p) => ({ value: p.key, label: p.label }))} /></div>
              <div className="grid grid-cols-2 gap-4">
                <Field label="Priority" htmlFor="r-pri" hint="Higher shows first."><Input type="number" value={draft.priority ?? 0} onChange={(e) => setDraft({ ...draft, priority: Number(e.target.value) })} /></Field>
                <Field label="Display order" htmlFor="r-ord" hint="Tie-breaker, ascending."><Input type="number" min={0} value={draft.display_order ?? 0} onChange={(e) => setDraft({ ...draft, display_order: Number(e.target.value) })} /></Field>
                <Field label="Campaign start" htmlFor="r-start" optional><Input type="datetime-local" value={draft.start} onChange={(e) => setDraft({ ...draft, start: e.target.value })} /></Field>
                <Field label="Campaign end" htmlFor="r-end" optional><Input type="datetime-local" value={draft.end} onChange={(e) => setDraft({ ...draft, end: e.target.value })} /></Field>
              </div>
              <div className="flex gap-6">
                <label className="flex items-center gap-2 text-[13px]"><Switch checked={draft.is_active ?? true} onCheckedChange={(v) => setDraft({ ...draft, is_active: v })} aria-label="Active" />Active</label>
                <label className="flex items-center gap-2 text-[13px]"><Switch checked={draft.is_featured ?? false} onCheckedChange={(v) => setDraft({ ...draft, is_featured: v })} aria-label="Featured" />Featured</label>
              </div>
              <div className="mt-2 flex justify-end gap-2">
                <Button type="button" variant="outline" onClick={() => setDraft(null)} disabled={saving}>Cancel</Button>
                <Button type="submit" loading={saving}>{draft.id ? "Save changes" : "Add recommendation"}</Button>
              </div>
            </form>
          )}
        </DialogContent>
      </Dialog>
      <ConfirmDialog open={!!toDelete} onOpenChange={(v) => !v && setToDelete(null)} title="Delete this recommendation?" description="The book stops appearing in this placement for this publication." confirmLabel="Delete" onConfirm={async () => { if (!toDelete) return; await api.deleteRecommendation(toDelete.id); setToDelete(null); toast.success("Recommendation deleted."); recs.reload(); }} />
    </>
  );
}
