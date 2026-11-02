import { useRef, useState } from "react";
import { CheckCircle2, FileText, Loader2, UploadCloud, XCircle } from "lucide-react";
import { api } from "@/data";
import { useSite } from "@/hooks/useSite";
import { inspectPdf } from "@/lib/pdf";
import { EMPTY_SEO, type Category } from "@/lib/types";
import { cn, formatBytes, slugify, uuid } from "@/lib/utils";
import manifest from "@/content/library-manifest.json";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Switch } from "@/components/ui/misc";
import { validatePdfFile } from "./PdfDropzone";

type Status = "queued" | "working" | "done" | "skipped" | "error";
interface Item {
  file: File;
  status: Status;
  step: string;
  title?: string;
  published?: boolean;
}

interface ManifestPub {
  slug: string;
  title: string;
  description: string;
  category: string;
  author?: string;
  language?: string;
  tags?: string[];
  featured?: boolean;
}

const normalize = (s: string) => slugify(s.replace(/\.pdf$/i, "").replace(/^[0-9a-f]{6,}-/i, ""));

/**
 * Upload many PDFs at once. Each file is validated, inspected (page count,
 * cover, title), uploaded privately and saved. Known essays pick up their
 * prepared description, category and tags from src/content/library-manifest.json.
 */
export function BulkUploadDialog({ open, onOpenChange, onDone }: { open: boolean; onOpenChange: (v: boolean) => void; onDone: () => void }) {
  const { site } = useSite();
  const [items, setItems] = useState<Item[]>([]);
  const [publish, setPublish] = useState(true);
  const [running, setRunning] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  const add = (files: FileList | null) => {
    if (!files) return;
    const pdfs = [...files].filter((f) => f.type === "application/pdf" || /\.pdf$/i.test(f.name));
    setItems((cur) => [...cur, ...pdfs.filter((f) => !cur.some((c) => c.file.name === f.name && c.file.size === f.size)).map((file) => ({ file, status: "queued" as Status, step: "Waiting" }))]);
  };
  const update = (i: number, patch: Partial<Item>) => setItems((cur) => cur.map((it, j) => (j === i ? { ...it, ...patch } : it)));

  const ensureCategory = async (slug: string, cache: Map<string, Category>) => {
    const hit = cache.get(slug);
    if (hit) return hit;
    const def = manifest.categories.find((c) => c.slug === slug);
    if (!def) return null;
    const created = await api.saveCategory({ name: def.name, slug: def.slug, description: def.description, display_order: def.display_order, status: "active" });
    cache.set(slug, created);
    return created;
  };

  const run = async () => {
    setRunning(true);
    const cats = new Map((await api.listCategories()).map((c) => [c.slug, c]));
    const existing = new Set((await api.listAdminPublications()).map((p) => p.slug));
    for (let i = 0; i < items.length; i++) {
      if (items[i].status === "done" || items[i].status === "skipped") continue;
      const file = items[i].file;
      try {
        update(i, { status: "working", step: "Checking file…" });
        const err = await validatePdfFile(file, site.max_pdf_mb || 50);
        if (err) throw new Error(err);
        update(i, { step: "Reading pages & cover…" });
        const info = await inspectPdf(file);
        const keys = [info.title ? slugify(info.title) : "", normalize(file.name)].filter(Boolean);
        const m = (manifest.publications as ManifestPub[]).find((p) => keys.includes(p.slug) || keys.includes(slugify(p.title)));
        const title = m?.title ?? info.title ?? file.name.replace(/\.pdf$/i, "").replace(/[-_]+/g, " ");
        let slug = m?.slug ?? slugify(title);
        if (existing.has(slug)) {
          update(i, { status: "skipped", step: "Already in the library", title });
          continue;
        }
        if (!slug) slug = `publication-${Date.now()}`;
        const id = uuid();
        update(i, { step: "Uploading PDF…", title });
        const pdfPath = await api.uploadPdf(id, file, (p) => update(i, { step: `Uploading PDF… ${Math.round(p * 100)}%` }));
        update(i, { step: "Saving cover…" });
        const coverPath = await api.uploadImage(id, info.cover, "cover");
        const category = m ? await ensureCategory(m.category, cats) : null;
        const description = m?.description ?? "";
        const canPublish = publish && !!category && !!description;
        update(i, { step: "Saving…" });
        await api.savePublication({
          id,
          title,
          slug,
          description,
          pdf_storage_path: pdfPath,
          cover_image_path: coverPath,
          cover_source: "auto",
          category_id: category?.id ?? null,
          author: m?.author ?? info.author ?? null,
          publisher: null,
          language: m?.language ?? "en",
          page_count: info.pageCount,
          file_size: file.size,
          tags: m?.tags ?? [],
          status: canPublish ? "published" : "draft",
          is_featured: !!m?.featured,
          publication_date: null,
          // Stagger so "newest first" follows the upload order.
          published_at: canPublish ? new Date(Date.now() - i * 60_000).toISOString() : null,
          settings: { ...site.default_reader },
          seo: { ...EMPTY_SEO },
        });
        existing.add(slug);
        update(i, { status: "done", step: canPublish ? "Published" : "Saved as draft — add a category & description to publish", published: canPublish });
      } catch (e) {
        update(i, { status: "error", step: (e as Error).message || "Upload failed" });
      }
    }
    setRunning(false);
    onDone();
  };

  const done = items.filter((i) => i.status === "done").length;
  return (
    <Dialog open={open} onOpenChange={(v) => !running && onOpenChange(v)}>
      <DialogContent className="max-w-2xl">
        <DialogTitle className="font-sans text-[18px] font-semibold">Bulk upload PDFs</DialogTitle>
        <DialogDescription>Drop several PDFs. Covers and page counts are generated automatically, files are stored privately, and known essays get their prepared descriptions, categories and tags.</DialogDescription>
        <div
          role="button"
          tabIndex={0}
          onClick={() => input.current?.click()}
          onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && input.current?.click()}
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault();
            add(e.dataTransfer.files);
          }}
          className="mt-5 flex cursor-pointer flex-col items-center rounded-lg border-2 border-dashed border-line-strong bg-admin-bg/50 px-6 py-8 text-center hover:border-[#b9bec7]"
        >
          <UploadCloud className="size-6 text-primary" />
          <p className="mt-2 text-[14px] font-medium text-ink">Drop PDFs here, or <span className="text-primary underline">browse</span></p>
          <p className="text-[12.5px] text-muted">Multiple files · up to {site.max_pdf_mb} MB each</p>
          <input ref={input} type="file" accept="application/pdf,.pdf" multiple className="sr-only" onChange={(e) => { add(e.target.files); e.target.value = ""; }} />
        </div>
        {items.length > 0 && (
          <ul className="mt-4 max-h-72 divide-y divide-line overflow-y-auto rounded-lg border border-line">
            {items.map((it, i) => (
              <li key={i} className="flex items-center gap-3 px-3 py-2.5 text-[13px]">
                <span className="grid size-7 shrink-0 place-items-center">
                  {it.status === "working" ? <Loader2 className="size-4 animate-spin text-primary" /> : it.status === "done" ? <CheckCircle2 className="size-4 text-success" /> : it.status === "error" ? <XCircle className="size-4 text-danger" /> : <FileText className="size-4 text-muted" />}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium text-ink">{it.title ?? it.file.name}</span>
                  <span className={cn("block truncate text-[12px]", it.status === "error" ? "text-danger" : "text-muted")}>{formatBytes(it.file.size)} · {it.step}</span>
                </span>
              </li>
            ))}
          </ul>
        )}
        <label className="mt-4 flex items-center justify-between rounded-lg border border-line px-4 py-3">
          <span>
            <span className="block text-[13.5px] font-medium text-ink">Publish immediately</span>
            <span className="block text-[12.5px] text-muted">Files without a matching description and category are saved as drafts.</span>
          </span>
          <Switch checked={publish} onCheckedChange={setPublish} aria-label="Publish immediately" disabled={running} />
        </label>
        <div className="mt-5 flex items-center justify-between gap-3">
          <p className="text-[12.5px] text-muted">{items.length ? `${done} of ${items.length} uploaded` : ""}</p>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)} disabled={running}>Close</Button>
            <Button onClick={run} loading={running} disabled={!items.some((i) => i.status === "queued" || i.status === "error")}>Upload {items.filter((i) => i.status === "queued" || i.status === "error").length || ""} PDFs</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
