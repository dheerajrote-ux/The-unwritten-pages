import { useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { BookOpen, Copy, Eye, EyeOff, MoreHorizontal, Pencil, Plus, Search, Send, Trash2, UploadCloud } from "lucide-react";
import { api } from "@/data";
import { useAsync, useDebounced } from "@/hooks/useAsync";
import type { AdminPublicationRow } from "@/lib/types";
import { cn, formatDate, formatNumber } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { Card, EmptyState, ErrorState } from "@/components/ui/misc";
import { ConfirmDialog } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown";
import { PageHeader, StatusBadge } from "@/components/admin/bits";
import { BulkUploadDialog } from "@/components/admin/BulkUploadDialog";
import { BookCover } from "@/components/public/BookCover";

type StatusFilter = "all" | "published" | "draft" | "unpublished";

export function PublicationsPage() {
  const navigate = useNavigate();
  const { data, error, loading, reload } = useAsync(() => api.listAdminPublications(), []);
  const cats = useAsync(() => api.listCategories(), []);
  const [status, setStatus] = useState<StatusFilter>("all");
  const [category, setCategory] = useState("");
  const [sort, setSort] = useState<"updated" | "title" | "downloads">("updated");
  const [qRaw, setQ] = useState("");
  const q = useDebounced(qRaw, 150).trim().toLowerCase();
  const [toDelete, setToDelete] = useState<AdminPublicationRow | null>(null);
  const [toUnpublish, setToUnpublish] = useState<AdminPublicationRow | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [bulkOpen, setBulkOpen] = useState(false);

  const counts = useMemo(() => {
    const list = data ?? [];
    return { all: list.length, published: list.filter((p) => p.status === "published").length, draft: list.filter((p) => p.status === "draft").length, unpublished: list.filter((p) => p.status === "unpublished").length };
  }, [data]);

  const rows = useMemo(() => {
    let list = (data ?? []).filter(
      (p) =>
        (status === "all" || p.status === status) &&
        (!category || p.category_id === category) &&
        (!q || p.title.toLowerCase().includes(q) || (p.category_name ?? "").toLowerCase().includes(q) || p.description.toLowerCase().includes(q)),
    );
    list = [...list].sort((a, b) => (sort === "title" ? a.title.localeCompare(b.title) : sort === "downloads" ? b.download_count - a.download_count : b.updated_at.localeCompare(a.updated_at)));
    return list;
  }, [data, status, category, q, sort]);

  const act = async (id: string, fn: () => Promise<unknown>, success: string) => {
    setBusy(id);
    try {
      await fn();
      toast.success(success);
      reload();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(null);
      setToDelete(null);
      setToUnpublish(null);
    }
  };

  const publish = (p: AdminPublicationRow) => {
    if (!p.pdf_storage_path || !p.cover_image_path || !p.category_id) {
      toast.error("Add a PDF, cover and category before publishing.", { action: { label: "Edit", onClick: () => navigate(`/admin/publications/${p.id}/edit`) } });
      return;
    }
    void act(p.id, () => api.setPublicationStatus(p.id, "published"), `“${p.title}” is now live.`);
  };

  return (
    <>
      <PageHeader
        title="Publications"
        description="Upload, edit and publish the documents in your library."
        actions={
          <>
            <Button variant="outline" onClick={() => setBulkOpen(true)}><UploadCloud /> Bulk upload</Button>
            <Button asChild>
              <Link to="/admin/publications/new"><Plus /> Add new publication</Link>
            </Button>
          </>
        }
      />

      <Card>
        <div className="flex flex-col gap-3 border-b border-line p-4 xl:flex-row xl:items-center">
          <div className="flex flex-wrap gap-1" role="tablist" aria-label="Filter by status">
            {(["all", "published", "draft", "unpublished"] as StatusFilter[]).map((s) => (
              <button
                key={s}
                role="tab"
                aria-selected={status === s}
                onClick={() => setStatus(s)}
                className={cn("rounded-md px-3 py-1.5 text-[13px] font-medium capitalize transition-colors", status === s ? "bg-primary/[0.07] text-primary" : "text-secondary hover:bg-black/[0.04] hover:text-ink")}
              >
                {s === "all" ? "All publications" : s === "draft" ? "Drafts" : s} <span className="ml-1 text-muted">{counts[s]}</span>
              </button>
            ))}
          </div>
          <div className="flex flex-1 flex-wrap items-center gap-2 xl:justify-end">
            <div className="relative min-w-[200px] flex-1 xl:max-w-64">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted" />
              <input value={qRaw} onChange={(e) => setQ(e.target.value)} placeholder="Search title, category, description" aria-label="Search publications" className="h-9 w-full rounded-md border border-line-strong bg-surface pl-9 pr-3 text-[13px] outline-none focus:border-primary" />
            </div>
            <div className="w-40">
              <Select size="sm" aria-label="Category" value={category} onValueChange={setCategory} options={[{ value: "", label: "All categories" }, ...(cats.data ?? []).map((c) => ({ value: c.id, label: c.name }))]} />
            </div>
            <div className="w-44">
              <Select size="sm" aria-label="Sort" value={sort} onValueChange={(v) => setSort(v as typeof sort)} options={[{ value: "updated", label: "Recently updated" }, { value: "title", label: "Title A–Z" }, { value: "downloads", label: "Most downloaded" }]} />
            </div>
          </div>
        </div>

        {error ? (
          <ErrorState message={error} onRetry={reload} />
        ) : loading ? (
          <div className="space-y-2 p-4">{Array.from({ length: 5 }, (_, i) => <div key={i} className="skeleton h-16" />)}</div>
        ) : rows.length === 0 ? (
          <EmptyState
            icon={<BookOpen />}
            title={data?.length ? "No publications match these filters" : "No publications yet"}
            description={data?.length ? "Try another status, category or search term." : "Upload your first PDF to start building the library."}
            action={!data?.length ? <Button asChild><Link to="/admin/publications/new"><Plus /> Add new publication</Link></Button> : undefined}
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[860px] text-[13px]">
              <thead>
                <tr className="border-b border-line bg-admin-bg text-left text-[11.5px] uppercase tracking-wide text-muted">
                  <th className="w-16 px-4 py-2.5 font-medium">Cover</th>
                  <th className="px-3 py-2.5 font-medium">Title</th>
                  <th className="px-3 py-2.5 font-medium">Category</th>
                  <th className="px-3 py-2.5 text-right font-medium">Pages</th>
                  <th className="px-3 py-2.5 text-right font-medium">Downloads</th>
                  <th className="px-3 py-2.5 font-medium">Status</th>
                  <th className="px-3 py-2.5 font-medium">Updated</th>
                  <th className="w-14 px-4 py-2.5"><span className="sr-only">Actions</span></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {rows.map((p) => (
                  <tr key={p.id} className={cn("group hover:bg-admin-bg/70", busy === p.id && "opacity-50")}>
                    <td className="px-4 py-3">
                      <BookCover path={p.cover_image_path} title={p.title} className="aspect-[1/1.414] w-9 shadow-none ring-1 ring-black/5" />
                    </td>
                    <td className="max-w-[320px] px-3 py-3">
                      <Link to={`/admin/publications/${p.id}/edit`} className="block truncate font-medium text-ink hover:text-primary">{p.title}</Link>
                      <span className="block truncate text-[12px] text-muted">/library/{p.slug}{p.is_featured ? " · Featured" : ""}</span>
                    </td>
                    <td className="px-3 text-secondary">{p.category_name ?? <span className="text-muted">—</span>}</td>
                    <td className="px-3 text-right tabular-nums text-secondary">{p.page_count ?? "—"}</td>
                    <td className="px-3 text-right font-medium tabular-nums text-ink">{formatNumber(p.download_count)}</td>
                    <td className="px-3"><StatusBadge status={p.status} publishedAt={p.published_at} /></td>
                    <td className="px-3 text-secondary">{formatDate(p.updated_at)}</td>
                    <td className="px-4 text-right">
                      <DropdownMenu>
                        <DropdownMenuTrigger className="grid size-8 place-items-center rounded-md text-muted hover:bg-black/5 hover:text-ink" aria-label={`Actions for ${p.title}`}>
                          <MoreHorizontal className="size-4" />
                        </DropdownMenuTrigger>
                        <DropdownMenuContent>
                          <DropdownMenuItem onSelect={() => navigate(`/admin/publications/${p.id}/edit`)}><Pencil /> Edit</DropdownMenuItem>
                          <DropdownMenuItem onSelect={() => navigate(`/admin/publications/${p.id}/preview`)} disabled={!p.pdf_storage_path}><Eye /> Preview</DropdownMenuItem>
                          {p.status === "published" ? (
                            <DropdownMenuItem onSelect={() => setToUnpublish(p)}><EyeOff /> Unpublish</DropdownMenuItem>
                          ) : (
                            <DropdownMenuItem onSelect={() => publish(p)}><Send /> {p.status === "unpublished" ? "Republish" : "Publish"}</DropdownMenuItem>
                          )}
                          <DropdownMenuItem onSelect={() => act(p.id, () => api.duplicatePublication(p.id), "Duplicated as a draft.")}><Copy /> Duplicate</DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem danger onSelect={() => setToDelete(p)}><Trash2 /> Delete</DropdownMenuItem>
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

      <BulkUploadDialog open={bulkOpen} onOpenChange={setBulkOpen} onDone={reload} />
      <ConfirmDialog
        open={!!toDelete}
        onOpenChange={(v) => !v && setToDelete(null)}
        title="Delete this publication?"
        description={
          <>
            “{toDelete?.title}” and its PDF and cover files will be permanently deleted. Lead records are kept and will still show the publication title. This can't be undone.
          </>
        }
        confirmLabel="Delete publication"
        loading={busy === toDelete?.id}
        onConfirm={() => toDelete && act(toDelete.id, () => api.deletePublication(toDelete.id), "Publication deleted.")}
      />
      <ConfirmDialog
        open={!!toUnpublish}
        onOpenChange={(v) => !v && setToUnpublish(null)}
        title="Unpublish this publication?"
        tone="primary"
        description={`“${toUnpublish?.title}” will be removed from the public library immediately. You can republish it at any time.`}
        confirmLabel="Unpublish"
        loading={busy === toUnpublish?.id}
        onConfirm={() => toUnpublish && act(toUnpublish.id, () => api.setPublicationStatus(toUnpublish.id, "unpublished"), "Publication unpublished.")}
      />
    </>
  );
}
