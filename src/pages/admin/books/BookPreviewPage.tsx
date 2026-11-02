import { Link, useParams } from "react-router-dom";
import { ArrowLeft, Pencil } from "lucide-react";
import { api } from "@/data";
import { useAsync } from "@/hooks/useAsync";
import { Button } from "@/components/ui/button";
import { ErrorState } from "@/components/ui/misc";
import { StatusBadge } from "@/components/admin/bits";
import { BookDetailView } from "@/pages/BookDetailPage";

export function BookPreviewPage() {
  const { id = "" } = useParams();
  const { data: book, error, loading } = useAsync(() => api.getAdminBook(id), [id]);
  if (error) return <ErrorState message={error} />;
  if (loading) return <div className="skeleton h-[70vh]" />;
  if (!book) return <ErrorState message="Book not found." />;
  return (
    <div>
      <div className="mb-5 flex flex-wrap items-center gap-3">
        <Link to="/admin/books" className="grid size-9 place-items-center rounded-md text-secondary hover:bg-black/5" aria-label="Back"><ArrowLeft className="size-4" /></Link>
        <div className="min-w-0 flex-1"><h1 className="truncate text-[20px] font-semibold text-ink">Preview · {book.title}</h1><StatusBadge status={book.status} publishedAt={book.published_at} /></div>
        <Button asChild variant="outline"><Link to={`/admin/books/${book.id}/edit`}><Pencil /> Edit</Link></Button>
      </div>
      <div className="overflow-hidden rounded-xl border border-line bg-paper pb-16">
        <BookDetailView book={{ ...book, links: (book.links ?? []).filter((l) => l.status === "active") }} preview />
      </div>
    </div>
  );
}
