import { useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { AlertTriangle, BookMarked, Copy, Eye, EyeOff, Link2, MoreHorizontal, Pencil, Plus, Search, Send, Star, Trash2 } from "lucide-react";
import { api } from "@/data";
import { useAsync, useDebounced } from "@/hooks/useAsync";
import { formatLabel, type AdminBookRow } from "@/lib/books";
import { cn, formatDate } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { Badge, Card, EmptyState, ErrorState } from "@/components/ui/misc";
import { ConfirmDialog } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown";
import { PageHeader, StatusBadge } from "@/components/admin/bits";
import { BookJacket } from "@/components/books/BookJacket";

type StatusFilter = "all" | "published" | "draft" | "unpublished";

export function BooksListPage() {
  const navigate = useNavigate();
  const { data, error, loading, reload } = useAsync(() => api.listAdminBooks(), []);
  const cats = useAsync(() => api.listBookCategories(), []);
  const [status, setStatus] = useState<StatusFilter>("all");
  const [category, setCategory] = useState("");
  const [linkFilter, setLinkFilter] = useState<"" | "missing" | "ok">("");
  const [qRaw, setQ] = useState("");
  const q = useDebounced(qRaw, 150).trim().toLowerCase();
  const [busy, setBusy] = useState<string | null>(null);
  const [toDelete, setToDelete] = useState<AdminBookRow | null>(null);

  const rows = useMemo(
    () =>
      (data ?? []).filter(
        (b) =>
          (status === "all" || b.status === status) &&
          (!category || b.category_id === category) &&
          (!linkFilter || (linkFilter === "missing" ? b.active_link_count === 0 : b.active_link_count > 0)) &&
          (!q || b.title.toLowerCase().includes(q) || (b.author ?? "").toLowerCase().includes(q) || (b.category_name ?? "").toLowerCase().includes(q)),
      ),
    [data, status, category, linkFilter, q],
  );
  const counts = useMemo(() => {
    const l = data ?? [];
    return { all: l.length, published: l.filter((b) => b.status === "published").length, draft: l.filter((b) => b.status === "draft").length, unpublished: l.filter((b) => b.status === "unpublished").length };
  }, [data]);

  const act = async (id: string, fn: () => Promise<unknown>, msg: string) => {
    setBusy(id);
    try {
      await fn();
      toast.success(msg);
      reload();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(null);
      setToDelete(null);
    }
  };

  return (
    <>
      <PageHeader title="All Books" description="Books promoted alongside the free publications. Purchases always happen on Amazon." actions={<Button asChild><Link to="/admin/books/new"><Plus /> Add book</Link></Button>} />
      <Card>
        <div className="flex flex-col gap-3 border-b border-line p-4 xl:flex-row xl:items-center">
          <div className="flex flex-wrap gap-1" role="tablist" aria-label="Filter by status">
            {(["all", "published", "draft", "unpublished"] as StatusFilter[]).map((s) => (
              <button key={s} role="tab" aria-selected={status === s} onClick={() => setStatus(s)} className={cn("rounded-md px-3 py-1.5 text-[13px] font-medium capitalize", status === s ? "bg-primary/[0.07] text-primary" : "text-secondary hover:bg-black/[0.04] hover:text-ink")}>
                {s === "all" ? "All books" : s === "draft" ? "Drafts" : s} <span className="ml-1 text-muted">{counts[s]}</span>
              </button>
            ))}
          </div>
          <div className="flex flex-1 flex-wrap items-center gap-2 xl:justify-end">
            <div className="relative min-w-[200px] flex-1 xl:max-w-64">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted" />
              <input value={qRaw} onChange={(e) => setQ(e.target.value)} placeholder="Search title, author, category" aria-label="Search books" className="h-9 w-full rounded-md border border-line-strong bg-surface pl-9 pr-3 text-[13px] outline-none focus:border-primary" />
            </div>
            <div className="w-40"><Select size="sm" aria-label="Category" value={category} onValueChange={setCategory} options={[{ value: "", label: "All categories" }, ...(cats.data ?? []).map((c) => ({ value: c.id, label: c.name }))]} /></div>
            <div className="w-44"><Select size="sm" aria-label="Amazon links" value={linkFilter} onValueChange={(v) => setLinkFilter(v as typeof linkFilter)} options={[{ value: "", label: "Any link status" }, { value: "ok", label: "Has active links" }, { value: "missing", label: "No active links" }]} /></div>
          </div>
        </div>
        {error ? (
          <ErrorState message={error} onRetry={reload} />
        ) : loading ? (
          <div className="space-y-2 p-4">{Array.from({ length: 4 }, (_, i) => <div key={i} className="skeleton h-16" />)}</div>
        ) : !rows.length ? (
          <EmptyState icon={<BookMarked />} title={data?.length ? "No books match these filters" : "No books yet"} description={data?.length ? "Try a different status, category or search." : "Add your first book to start cross-selling."} action={!data?.length ? <Button asChild><Link to="/admin/books/new"><Plus /> Add book</Link></Button> : undefined} />
        ) : (
          <div className="relative overflow-x-auto">
            <table className="w-full min-w-[980px] text-[13px]">
              <thead>
                <tr className="border-b border-line bg-admin-bg text-left text-[11.5px] uppercase tracking-wide text-muted">
                  <th className="w-16 px-4 py-2.5 font-medium">Cover</th>
                  <th className="px-3 py-2.5 font-medium">Title</th>
                  <th className="px-3 py-2.5 font-medium">Author</th>
                  <th className="px-3 py-2.5 font-medium">Category</th>
                  <th className="px-3 py-2.5 font-medium">Format</th>
                  <th className="px-3 py-2.5 font-medium">Amazon link</th>
                  <th className="px-3 py-2.5 font-medium">Status</th>
                  <th className="px-3 py-2.5 text-center font-medium">Featured</th>
                  <th className="w-14 px-4 py-2.5"><span className="sr-only">Actions</span></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {rows.map((b) => (
                  <tr key={b.id} className={cn("hover:bg-admin-bg/70", busy === b.id && "opacity-50")}>
                    <td className="px-4 py-3"><BookJacket path={b.cover_image_path} title={b.title} author={b.author} className="w-9 shadow-none ring-1 ring-black/5" /></td>
                    <td className="max-w-[260px] px-3 py-3">
                      <Link to={`/admin/books/${b.id}/edit`} className="block truncate font-medium text-ink hover:text-primary">{b.title}</Link>
                      <span className="block truncate text-[12px] text-muted">/books/{b.slug} · updated {formatDate(b.updated_at)}</span>
                    </td>
                    <td className="px-3 text-secondary">{b.author ?? "—"}</td>
                    <td className="px-3 text-secondary">{b.category_name ?? "—"}</td>
                    <td className="px-3 text-secondary">{b.formats.length ? b.formats.map(formatLabel).join(", ") : "—"}</td>
                    <td className="px-3">
                      {b.active_link_count > 0 ? (
                        <Badge tone="success"><Link2 className="size-3" />{b.active_link_count} active{b.link_count > b.active_link_count ? ` · ${b.link_count - b.active_link_count} off` : ""}</Badge>
                      ) : b.link_count > 0 ? (
                        <Badge tone="warning"><AlertTriangle className="size-3" />All inactive</Badge>
                      ) : (
                        <Badge><AlertTriangle className="size-3" />Not configured</Badge>
                      )}
                    </td>
                    <td className="px-3"><StatusBadge status={b.status} publishedAt={b.published_at} /></td>
                    <td className="px-3 text-center">
                      <button onClick={() => act(b.id, () => api.setBookFeatured(b.id, !b.is_featured), b.is_featured ? "Removed from featured." : "Marked as featured.")} className="inline-grid size-8 place-items-center rounded-md hover:bg-black/5" aria-label={b.is_featured ? `Unfeature ${b.title}` : `Feature ${b.title}`} aria-pressed={b.is_featured}>
                        <Star className={cn("size-4", b.is_featured ? "fill-accent text-accent" : "text-muted")} />
                      </button>
                    </td>
                    <td className="px-4 text-right">
                      <DropdownMenu>
                        <DropdownMenuTrigger className="grid size-8 place-items-center rounded-md text-muted hover:bg-black/5 hover:text-ink" aria-label={`Actions for ${b.title}`}><MoreHorizontal className="size-4" /></DropdownMenuTrigger>
                        <DropdownMenuContent>
                          <DropdownMenuItem onSelect={() => navigate(`/admin/books/${b.id}/edit`)}><Pencil /> Edit</DropdownMenuItem>
                          <DropdownMenuItem onSelect={() => navigate(`/admin/books/${b.id}/preview`)}><Eye /> Preview</DropdownMenuItem>
                          {b.status === "published" ? (
                            <DropdownMenuItem onSelect={() => act(b.id, () => api.setBookStatus(b.id, "unpublished"), "Book unpublished.")}><EyeOff /> Unpublish</DropdownMenuItem>
                          ) : (
                            <DropdownMenuItem onSelect={() => act(b.id, () => api.setBookStatus(b.id, "published"), "Book published.")}><Send /> Publish</DropdownMenuItem>
                          )}
                          <DropdownMenuItem onSelect={() => act(b.id, () => api.setBookFeatured(b.id, !b.is_featured), b.is_featured ? "Removed from featured." : "Marked as featured.")}><Star /> {b.is_featured ? "Unfeature" : "Feature"}</DropdownMenuItem>
                          <DropdownMenuItem onSelect={() => act(b.id, () => api.duplicateBook(b.id), "Duplicated as a draft.")}><Copy /> Duplicate</DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem danger onSelect={() => setToDelete(b)}><Trash2 /> Delete</DropdownMenuItem>
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
      <ConfirmDialog
        open={!!toDelete}
        onOpenChange={(v) => !v && setToDelete(null)}
        title="Delete this book?"
        description={`“${toDelete?.title}”, its purchase links, recommendations and analytics events will be permanently deleted.`}
        confirmLabel="Delete book"
        loading={busy === toDelete?.id}
        onConfirm={() => toDelete && act(toDelete.id, () => api.deleteBook(toDelete.id), "Book deleted.")}
      />
    </>
  );
}
