import { useState } from "react";
import { toast } from "sonner";
import { FolderTree, MoreHorizontal, Pencil, Plus, Trash2 } from "lucide-react";
import { api } from "@/data";
import { useAsync } from "@/hooks/useAsync";
import type { BookCategory } from "@/lib/books";
import type { ApiError } from "@/lib/types";
import { SLUG_RE, slugify } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Field, Input, Label, Textarea } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Badge, Card, EmptyState, ErrorState, Switch } from "@/components/ui/misc";
import { ConfirmDialog, Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown";
import { PageHeader } from "@/components/admin/bits";

type Draft = { id?: string; name: string; slug: string; slugTouched: boolean; description: string; display_order: number; status: "active" | "hidden" };

export function BookCategoriesPage() {
  const { data, error, loading, reload } = useAsync(() => api.listBookCategories(), []);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [errors, setErrors] = useState<{ name?: string; slug?: string }>({});
  const [saving, setSaving] = useState(false);
  const [toDelete, setToDelete] = useState<BookCategory | null>(null);
  const [reassign, setReassign] = useState("");
  const [deleting, setDeleting] = useState(false);

  const save = async () => {
    if (!draft) return;
    const e: typeof errors = {};
    if (!draft.name.trim()) e.name = "Name is required.";
    if (!SLUG_RE.test(draft.slug)) e.slug = "Use lowercase letters, numbers and hyphens.";
    setErrors(e);
    if (Object.keys(e).length) return;
    setSaving(true);
    try {
      await api.saveBookCategory({ id: draft.id, name: draft.name.trim(), slug: draft.slug, description: draft.description.trim() || null, display_order: Number(draft.display_order) || 0, status: draft.status });
      toast.success(draft.id ? "Category updated." : "Category added.");
      setDraft(null);
      reload();
    } catch (err) {
      const ae = err as ApiError;
      if (ae.fields?.slug) setErrors({ slug: ae.fields.slug });
      toast.error(ae.message);
    } finally {
      setSaving(false);
    }
  };

  const doDelete = async () => {
    if (!toDelete) return;
    if ((toDelete.book_count ?? 0) > 0 && !reassign) return toast.error("Choose a category to move its books to.");
    setDeleting(true);
    try {
      await api.deleteBookCategory(toDelete.id, reassign || undefined);
      toast.success("Category deleted.");
      setToDelete(null);
      reload();
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setDeleting(false);
    }
  };

  const openNew = () => {
    setErrors({});
    setDraft({ name: "", slug: "", slugTouched: false, description: "", display_order: (data?.length ?? 0) + 1, status: "active" });
  };

  return (
    <>
      <PageHeader title="Book Categories" description="Separate from publication categories; used to filter the books page." actions={<Button onClick={openNew}><Plus /> Add category</Button>} />
      <Card>
        {error ? <ErrorState message={error} onRetry={reload} /> : loading ? <div className="space-y-2 p-4">{Array.from({ length: 3 }, (_, i) => <div key={i} className="skeleton h-12" />)}</div> : !data?.length ? (
          <EmptyState icon={<FolderTree />} title="No book categories yet" action={<Button onClick={openNew}><Plus /> Add category</Button>} />
        ) : (
          <div className="relative overflow-x-auto">
            <table className="w-full min-w-[640px] text-[13px]">
              <thead>
                <tr className="border-b border-line bg-admin-bg text-left text-[11.5px] uppercase tracking-wide text-muted">
                  <th className="w-16 px-4 py-2.5 font-medium">Order</th>
                  <th className="px-3 py-2.5 font-medium">Category</th>
                  <th className="px-3 py-2.5 font-medium">Description</th>
                  <th className="px-3 py-2.5 text-right font-medium">Books</th>
                  <th className="px-3 py-2.5 font-medium">Status</th>
                  <th className="w-14 px-4" />
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {data.map((c) => (
                  <tr key={c.id} className="hover:bg-admin-bg/70">
                    <td className="px-4 py-3 tabular-nums text-muted">{c.display_order}</td>
                    <td className="px-3 py-3"><span className="font-medium text-ink">{c.name}</span><span className="block text-[12px] text-muted">{c.slug}</span></td>
                    <td className="max-w-[320px] truncate px-3 text-secondary">{c.description ?? "—"}</td>
                    <td className="px-3 text-right font-medium tabular-nums">{c.book_count ?? 0}</td>
                    <td className="px-3">{c.status === "active" ? <Badge tone="success">Active</Badge> : <Badge>Hidden</Badge>}</td>
                    <td className="px-4 text-right">
                      <DropdownMenu>
                        <DropdownMenuTrigger className="grid size-8 place-items-center rounded-md text-muted hover:bg-black/5" aria-label={`Actions for ${c.name}`}><MoreHorizontal className="size-4" /></DropdownMenuTrigger>
                        <DropdownMenuContent>
                          <DropdownMenuItem onSelect={() => { setErrors({}); setDraft({ id: c.id, name: c.name, slug: c.slug, slugTouched: true, description: c.description ?? "", display_order: c.display_order, status: c.status }); }}><Pencil /> Edit</DropdownMenuItem>
                          <DropdownMenuItem danger onSelect={() => { setReassign(""); setToDelete(c); }}><Trash2 /> Delete</DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
      <Dialog open={!!draft} onOpenChange={(v) => !v && !saving && setDraft(null)}>
        <DialogContent>
          <DialogTitle className="font-sans text-[18px] font-semibold">{draft?.id ? "Edit book category" : "Add book category"}</DialogTitle>
          {draft && (
            <form onSubmit={(e) => { e.preventDefault(); void save(); }} className="mt-5 grid gap-4">
              <Field label="Name" htmlFor="bc-name" error={errors.name} required><Input value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value, slug: draft.slugTouched ? draft.slug : slugify(e.target.value) })} /></Field>
              <Field label="Slug" htmlFor="bc-slug" error={errors.slug} required><Input value={draft.slug} onChange={(e) => setDraft({ ...draft, slug: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "-"), slugTouched: true })} /></Field>
              <Field label="Description" htmlFor="bc-desc" optional><Textarea rows={2} value={draft.description} onChange={(e) => setDraft({ ...draft, description: e.target.value })} /></Field>
              <div className="grid grid-cols-2 gap-4">
                <Field label="Display order" htmlFor="bc-order"><Input type="number" min={0} value={draft.display_order} onChange={(e) => setDraft({ ...draft, display_order: Number(e.target.value) })} /></Field>
                <div><Label>Status</Label><label className="flex h-10 items-center gap-3 text-[13px] text-secondary"><Switch checked={draft.status === "active"} onCheckedChange={(v) => setDraft({ ...draft, status: v ? "active" : "hidden" })} aria-label="Active" />{draft.status === "active" ? "Active" : "Hidden"}</label></div>
              </div>
              <div className="mt-2 flex justify-end gap-2">
                <Button type="button" variant="outline" onClick={() => setDraft(null)} disabled={saving}>Cancel</Button>
                <Button type="submit" loading={saving}>{draft.id ? "Save changes" : "Add category"}</Button>
              </div>
            </form>
          )}
        </DialogContent>
      </Dialog>
      <ConfirmDialog open={!!toDelete} onOpenChange={(v) => !v && setToDelete(null)} title={`Delete “${toDelete?.name}”?`} description={(toDelete?.book_count ?? 0) > 0 ? `${toDelete?.book_count} book(s) use this category. Move them first.` : "No books use this category."} confirmLabel={(toDelete?.book_count ?? 0) > 0 ? "Reassign & delete" : "Delete"} loading={deleting} onConfirm={doDelete}>
        {(toDelete?.book_count ?? 0) > 0 && (
          <div className="mt-4"><Label>Move books to</Label><Select value={reassign} onValueChange={setReassign} options={(data ?? []).filter((c) => c.id !== toDelete?.id).map((c) => ({ value: c.id, label: c.name }))} placeholder="Choose a category" /></div>
        )}
      </ConfirmDialog>
    </>
  );
}
