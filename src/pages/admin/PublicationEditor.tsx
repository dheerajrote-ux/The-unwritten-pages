import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { toast } from "sonner";
import { CalendarClock, Check, ExternalLink, Eye, ImagePlus, Monitor, Smartphone, Upload, Wand2 } from "lucide-react";
import { api } from "@/data";
import { useAsync } from "@/hooks/useAsync";
import { useSite } from "@/hooks/useSite";
import { inspectPdf } from "@/lib/pdf";
import { DEFAULT_READER, EMPTY_SEO, type ApiError, type PublicationDetail, type PublicationInput, type ReaderSettings, type ReaderSource, type SeoSettings } from "@/lib/types";
import { cn, formatBytes, formatDateTime, LANGUAGES, SLUG_RE, slugify, uuid } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Field, Input, Label, Textarea } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Card, ErrorState, Switch, Tabs, TabsList, TabsTrigger } from "@/components/ui/misc";
import { ConfirmDialog, Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { PdfDropzone, validatePdfFile, type PdfState } from "@/components/admin/PdfDropzone";
import { CoverCropper } from "@/components/admin/CoverCropper";
import { TagInput } from "@/components/admin/TagInput";
import { StatusBadge } from "@/components/admin/bits";
import { PdfReader } from "@/components/reader/PdfReader";
import { BookCover } from "@/components/public/BookCover";

interface Form {
  title: string;
  slug: string;
  slugTouched: boolean;
  description: string;
  category_id: string;
  author: string;
  publisher: string;
  publication_date: string;
  tags: string[];
  language: string;
  is_featured: boolean;
  settings: ReaderSettings;
  seo: SeoSettings;
}

type Errors = Partial<Record<"title" | "slug" | "description" | "category_id" | "pdf" | "cover" | "canonical" | "schedule", string>>;

const SECTIONS = [
  { id: "pdf", label: "Upload PDF" },
  { id: "info", label: "Publication information" },
  { id: "cover", label: "Cover image" },
  { id: "reader", label: "Reader configuration" },
  { id: "seo", label: "SEO settings" },
  { id: "publish", label: "Preview & publishing" },
] as const;

const READER_OPTIONS: { key: keyof ReaderSettings; label: string; hint: string }[] = [
  { key: "flipbook_enabled", label: "Flipbook mode", hint: "Realistic page-turning. Off shows a simple page viewer." },
  { key: "double_page_mode", label: "Double-page spreads", hint: "Two-page layout on wide screens. Mobile always shows single pages." },
  { key: "fullscreen_enabled", label: "Fullscreen", hint: "Allow readers to read in fullscreen." },
  { key: "zoom_enabled", label: "Zoom", hint: "Allow zoom in / out and panning." },
  { key: "thumbnail_navigation_enabled", label: "Thumbnail navigation", hint: "Show a page thumbnail strip." },
  { key: "download_enabled", label: "Download option", hint: "Show “Download PDF” — always through the lead capture form." },
];

function blankForm(defaults: ReaderSettings): Form {
  return { title: "", slug: "", slugTouched: false, description: "", category_id: "", author: "", publisher: "", publication_date: "", tags: [], language: "en", is_featured: false, settings: { ...defaults }, seo: { ...EMPTY_SEO } };
}

function fromDetail(p: PublicationDetail): Form {
  return {
    title: p.title,
    slug: p.slug,
    slugTouched: true,
    description: p.description,
    category_id: p.category_id ?? "",
    author: p.author ?? "",
    publisher: p.publisher ?? "",
    publication_date: p.publication_date ?? "",
    tags: p.tags,
    language: p.language ?? "en",
    is_featured: p.is_featured,
    settings: { ...p.settings },
    seo: { ...p.seo },
  };
}

const useObjectUrl = (blob: Blob | null) => {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!blob) return setUrl(null);
    const u = URL.createObjectURL(blob);
    setUrl(u);
    return () => URL.revokeObjectURL(u);
  }, [blob]);
  return url;
};

export function PublicationEditor() {
  const { id } = useParams();
  const isNew = !id;
  const navigate = useNavigate();
  const { site } = useSite();
  const [pubId] = useState(() => id ?? uuid());

  const existing = useAsync(() => (id ? api.getAdminPublication(id) : Promise.resolve(null)), [id]);
  const cats = useAsync(() => api.listCategories(), []);
  const pubs = useAsync(() => api.listAdminPublications().catch(() => []), []);

  const [original, setOriginal] = useState<PublicationDetail | null>(null);
  const [form, setForm] = useState<Form>(() => blankForm(site.default_reader ?? DEFAULT_READER));
  const [errors, setErrors] = useState<Errors>({});
  const [dirty, setDirty] = useState(false);

  // --- assets -------------------------------------------------------------
  const [pdfPath, setPdfPath] = useState<string | null>(null);
  const [pdfState, setPdfState] = useState<PdfState | null>(null);
  const [pdfFile, setPdfFile] = useState<File | null>(null);
  const [fileSize, setFileSize] = useState<number | null>(null);
  const [pageCount, setPageCount] = useState<number | null>(null);
  const sessionUploads = useRef<Set<string>>(new Set());

  const [coverMode, setCoverMode] = useState<"auto" | "custom">("auto");
  const [coverPath, setCoverPath] = useState<string | null>(null);
  const [autoCover, setAutoCover] = useState<Blob | null>(null);
  const [customFile, setCustomFile] = useState<File | null>(null);
  const [customBlob, setCustomBlob] = useState<Blob | null>(null);
  const [ogBlob, setOgBlob] = useState<Blob | null>(null);
  const autoUrl = useObjectUrl(autoCover);
  const customUrl = useObjectUrl(customBlob);
  const ogUrl = useObjectUrl(ogBlob);

  const [saving, setSaving] = useState<null | "draft" | "publish" | "schedule" | "unpublish" | "save">(null);
  const [scheduleAt, setScheduleAt] = useState("");
  const [scheduleOpen, setScheduleOpen] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [confirmUnpublish, setConfirmUnpublish] = useState(false);
  const [slugTaken, setSlugTaken] = useState(false);

  // --- load existing ------------------------------------------------------
  useEffect(() => {
    const p = existing.data;
    if (!p) return;
    setOriginal(p);
    setForm(fromDetail(p));
    setPdfPath(p.pdf_storage_path);
    setFileSize(p.file_size);
    setPageCount(p.page_count);
    setPdfState(p.pdf_storage_path ? { name: p.pdf_storage_path.split("/").pop()!.replace(/^\d+-/, ""), size: p.file_size ?? 0, pages: p.page_count, status: "done", progress: 1 } : null);
    setCoverPath(p.cover_image_path);
    setCoverMode(p.cover_source);
    if (p.status === "published" && p.published_at) setScheduleAt(p.published_at.slice(0, 16));
  }, [existing.data]);

  // Switching an existing custom cover back to automatic regenerates it from the stored PDF.
  useEffect(() => {
    if (coverMode !== "auto" || autoCover || !pdfPath || original?.cover_source !== "custom") return;
    let cancelled = false;
    (async () => {
      try {
        const src = pdfFile ?? (await api.getAdminPdfSource(pdfPath));
        if (!(src instanceof Blob) && !("url" in src)) return; // image-only preview build
        const info = await inspectPdf(src instanceof Blob ? src : await fetch(src.url).then((r) => r.blob()));
        if (!cancelled) setAutoCover(info.cover);
      } catch {
        if (!cancelled) toast.error("Couldn't generate a cover from the PDF.");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [coverMode, autoCover, pdfPath, pdfFile, original?.cover_source]);

  // Unsaved-changes guard
  useEffect(() => {
    if (!dirty) return;
    const h = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", h);
    return () => window.removeEventListener("beforeunload", h);
  }, [dirty]);

  const set = <K extends keyof Form>(k: K, v: Form[K]) => {
    setForm((f) => {
      const next = { ...f, [k]: v };
      if (k === "title" && !f.slugTouched) next.slug = slugify(String(v));
      return next;
    });
    setDirty(true);
    setErrors((e) => ({ ...e, [k]: undefined, ...(k === "title" ? { slug: undefined } : {}), ...(k === "seo" ? { canonical: undefined } : {}) }));
  };

  // Debounced slug availability
  useEffect(() => {
    if (!form.slug || !SLUG_RE.test(form.slug)) return setSlugTaken(false);
    const t = setTimeout(() => {
      api.isSlugAvailable(form.slug, pubId).then((ok) => setSlugTaken(!ok)).catch(() => undefined);
    }, 350);
    return () => clearTimeout(t);
  }, [form.slug, pubId]);

  const tagSuggestions = useMemo(() => [...new Set((pubs.data ?? []).flatMap((p) => p.tags))].sort(), [pubs.data]);
  const maxMb = site.max_pdf_mb || 50;

  // --- PDF handling -------------------------------------------------------
  const handlePdf = async (file: File) => {
    const err = await validatePdfFile(file, maxMb);
    if (err) return setPdfState({ name: file.name, size: file.size, pages: null, status: "error", progress: 0, error: err });
    setPdfState({ name: file.name, size: file.size, pages: null, status: "inspecting", progress: 0 });
    let info;
    try {
      info = await inspectPdf(file);
    } catch {
      return setPdfState({ name: file.name, size: file.size, pages: null, status: "error", progress: 0, error: "This PDF couldn't be read. It may be damaged or password-protected." });
    }
    setPdfState({ name: file.name, size: file.size, pages: info.pageCount, status: "uploading", progress: 0 });
    try {
      const path = await api.uploadPdf(pubId, file, (p) => setPdfState((s) => (s ? { ...s, progress: p } : s)));
      // A previous unsaved upload from this session is no longer needed.
      if (pdfPath && sessionUploads.current.has(pdfPath)) {
        sessionUploads.current.delete(pdfPath);
        void api.removeFiles({ pdf: [pdfPath] });
      }
      sessionUploads.current.add(path);
      setPdfPath(path);
      setPdfFile(file);
      setFileSize(file.size);
      setPageCount(info.pageCount);
      setAutoCover(info.cover);
      setPdfState({ name: file.name, size: file.size, pages: info.pageCount, status: "done", progress: 1 });
      setErrors((e) => ({ ...e, pdf: undefined, cover: undefined }));
      setDirty(true);
      setForm((f) => {
        const next = { ...f };
        if (!f.title && info.title) {
          next.title = info.title;
          if (!f.slugTouched) next.slug = slugify(info.title);
        }
        if (!f.author && info.author) next.author = info.author;
        return next;
      });
    } catch (e) {
      setPdfState({ name: file.name, size: file.size, pages: info.pageCount, status: "error", progress: 0, error: (e as Error).message || "Upload failed. Please try again." });
    }
  };

  const removePdf = () => {
    if (pdfPath && sessionUploads.current.has(pdfPath)) {
      sessionUploads.current.delete(pdfPath);
      void api.removeFiles({ pdf: [pdfPath] });
    }
    setPdfPath(null);
    setPdfFile(null);
    setPdfState(null);
    setAutoCover(null);
    setPageCount(null);
    setFileSize(null);
    setDirty(true);
  };

  // --- validation ---------------------------------------------------------
  const coverAvailable = coverMode === "custom" ? Boolean(customBlob || (original?.cover_source === "custom" && coverPath)) : Boolean(autoCover || coverPath);
  const validate = (forPublish: boolean): Errors => {
    const e: Errors = {};
    if (!form.title.trim()) e.title = "Publication title is required.";
    if (!form.slug) e.slug = "URL slug is required.";
    else if (!SLUG_RE.test(form.slug)) e.slug = "Use lowercase letters, numbers and single hyphens only.";
    else if (slugTaken) e.slug = "This slug is already in use.";
    if (form.seo.canonical_url && !/^https?:\/\/\S+$/.test(form.seo.canonical_url)) e.canonical = "Enter a full URL starting with https://";
    if (forPublish) {
      if (!form.description.trim()) e.description = "A short description is required to publish.";
      if (!form.category_id) e.category_id = "Choose a category to publish.";
      if (!pdfPath) e.pdf = "Upload a PDF before publishing.";
      if (!coverAvailable) e.cover = coverMode === "custom" ? "Upload a custom cover or switch to the automatic cover." : "A cover is generated once a PDF is uploaded.";
    }
    return e;
  };

  const scrollTo = (sid: string) => document.getElementById(`section-${sid}`)?.scrollIntoView({ behavior: "smooth", block: "start" });
  const sectionFor: Record<keyof Errors, string> = { title: "info", slug: "info", description: "info", category_id: "info", pdf: "pdf", cover: "cover", canonical: "seo", schedule: "publish" };

  // --- persist ------------------------------------------------------------
  const persist = async (mode: "draft" | "publish" | "schedule" | "unpublish" | "save") => {
    const forPublish = mode === "publish" || mode === "schedule" || (mode === "save" && original?.status === "published");
    const e = validate(forPublish);
    let publishedAt: string | null = original?.published_at ?? null;
    if (mode === "schedule") {
      const when = scheduleAt ? new Date(scheduleAt) : null;
      if (!when || Number.isNaN(when.getTime())) e.schedule = "Choose a date and time.";
      else if (when.getTime() < Date.now() + 60_000) e.schedule = "Choose a time in the future.";
      else publishedAt = when.toISOString();
    }
    setErrors(e);
    const first = Object.keys(e)[0] as keyof Errors | undefined;
    if (first) {
      toast.error("Please fix the highlighted fields.");
      scrollTo(sectionFor[first]);
      return;
    }
    if (pdfState?.status === "uploading" || pdfState?.status === "inspecting") return toast.error("Please wait for the PDF upload to finish.");

    setSaving(mode);
    try {
      if (!(await api.isSlugAvailable(form.slug, pubId))) {
        setErrors({ slug: "This slug is already in use." });
        scrollTo("info");
        throw new Error("That URL slug is already in use.");
      }
      // Upload pending images first; never publish without a stored cover.
      let newCover = coverPath;
      if (coverMode === "custom" && customBlob) newCover = await api.uploadImage(pubId, customBlob, "cover");
      else if (coverMode === "auto" && autoCover) newCover = await api.uploadImage(pubId, autoCover, "cover");
      let newOg = form.seo.og_image_path;
      if (ogBlob) newOg = await api.uploadImage(pubId, ogBlob, "og");

      let status = original?.status ?? "draft";
      if (mode === "draft") status = original?.status === "published" ? "published" : "draft";
      if (mode === "publish") {
        status = "published";
        publishedAt = new Date().toISOString();
      }
      if (mode === "schedule") status = "published";
      if (mode === "unpublish") status = "unpublished";
      if (status === "draft") publishedAt = null;

      const input: PublicationInput = {
        id: pubId,
        title: form.title.trim(),
        slug: form.slug,
        description: form.description.trim(),
        pdf_storage_path: pdfPath,
        cover_image_path: newCover,
        cover_source: coverMode,
        category_id: form.category_id || null,
        author: form.author.trim() || null,
        publisher: form.publisher.trim() || null,
        language: form.language || null,
        page_count: pageCount,
        file_size: fileSize,
        tags: form.tags,
        status,
        is_featured: form.is_featured,
        publication_date: form.publication_date || null,
        published_at: publishedAt,
        settings: form.settings,
        seo: { ...form.seo, seo_title: form.seo.seo_title?.trim() || null, meta_description: form.seo.meta_description?.trim() || null, canonical_url: form.seo.canonical_url?.trim() || null, og_image_path: newOg },
      };
      const saved = await api.savePublication(input);

      // Only now that the record points at the new files, remove the replaced ones.
      if (original) {
        const oldPdf = original.pdf_storage_path !== saved.pdf_storage_path ? original.pdf_storage_path : null;
        const oldCover = original.cover_image_path !== saved.cover_image_path ? original.cover_image_path : null;
        const oldOg = original.seo.og_image_path !== saved.seo.og_image_path ? original.seo.og_image_path : null;
        void api.removeFiles({ pdf: [oldPdf], images: [oldCover, oldOg] }).catch(() => undefined);
      }
      sessionUploads.current.clear();
      setOriginal(saved);
      setCoverPath(saved.cover_image_path);
      setAutoCover(null);
      setCustomBlob(null);
      setCustomFile(null);
      setOgBlob(null);
      setForm((f) => ({ ...f, seo: saved.seo }));
      setDirty(false);
      setScheduleOpen(false);
      setConfirmUnpublish(false);
      const messages = {
        draft: status === "published" ? "Changes saved." : "Saved as draft.",
        publish: "Published — it's now live in the library.",
        schedule: `Scheduled for ${formatDateTime(saved.published_at)}.`,
        unpublish: "Unpublished — it's no longer visible to readers.",
        save: "Changes saved.",
      };
      toast.success(messages[mode]);
      if (isNew) navigate(`/admin/publications/${pubId}/edit`, { replace: true });
    } catch (err) {
      const ae = err as ApiError;
      if (ae.fields?.slug) setErrors((e) => ({ ...e, slug: ae.fields!.slug }));
      toast.error(ae.message || "Saving failed. Please try again.");
    } finally {
      setSaving(null);
    }
  };

  if (existing.error) return <ErrorState message={existing.error} onRetry={existing.reload} />;
  if (!isNew && !existing.loading && !existing.data) return <ErrorState message="This publication doesn't exist or was deleted." />;
  if (!isNew && existing.loading) return <div className="space-y-4"><div className="skeleton h-10 w-72" /><div className="skeleton h-64" /><div className="skeleton h-96" /></div>;

  const coverPreview = coverMode === "custom" ? customUrl ?? (original?.cover_source === "custom" ? api.coverUrl(coverPath) : null) : autoUrl ?? (original?.cover_source !== "custom" || !original ? api.coverUrl(coverPath) : null);
  const status = original?.status ?? "draft";
  const isLive = status === "published";
  const done: Record<string, boolean> = {
    pdf: Boolean(pdfPath),
    info: Boolean(form.title && form.slug && form.description && form.category_id),
    cover: coverAvailable,
    reader: true,
    seo: true,
    publish: isLive,
  };
  const catOptions = (cats.data ?? []).map((c) => ({ value: c.id, label: c.status === "hidden" ? `${c.name} (hidden)` : c.name }));
  const category = cats.data?.find((c) => c.id === form.category_id);
  const effectiveTitle = form.seo.seo_title || form.title || "Publication title";
  const effectiveDesc = form.seo.meta_description || form.description.slice(0, 160) || "A short description of this publication.";

  return (
    <div className="pb-28">
      <div className="mb-7 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-[24px] font-semibold tracking-tight text-ink">{isNew ? "Add new publication" : "Edit publication"}</h1>
            <StatusBadge status={status} publishedAt={original?.published_at} />
          </div>
          <p className="mt-1 text-sm text-muted">{isNew ? "Upload a PDF, add details, then save as a draft or publish." : `Last updated ${formatDateTime(original?.updated_at)}`}</p>
        </div>
        {!isNew && isLive && original && new Date(original.published_at ?? 0) <= new Date() && (
          <Button asChild variant="outline" size="sm">
            <Link to={`/library/${original.slug}`} target="_blank"><ExternalLink /> View live</Link>
          </Button>
        )}
      </div>

      <div className="grid gap-8 lg:grid-cols-[220px_1fr]">
        <nav className="hidden lg:block" aria-label="Sections">
          <ol className="sticky top-24 space-y-1">
            {SECTIONS.map((s, i) => (
              <li key={s.id}>
                <button onClick={() => scrollTo(s.id)} className="flex w-full items-center gap-3 rounded-md px-2 py-2 text-left text-[13px] text-secondary hover:bg-black/[0.04] hover:text-ink">
                  <span className={cn("grid size-6 shrink-0 place-items-center rounded-full border text-[11px] font-semibold", done[s.id] ? "border-success bg-success text-white" : "border-line-strong bg-surface")}>
                    {done[s.id] ? <Check className="size-3.5" /> : i + 1}
                  </span>
                  {s.label}
                </button>
              </li>
            ))}
          </ol>
        </nav>

        <div className="min-w-0 space-y-6">
          {/* 1. PDF */}
          <Section id="pdf" step={1} title="Upload PDF" description="The original file is stored privately. Readers only receive time-limited access.">
            <PdfDropzone state={pdfState} maxMb={maxMb} onFile={handlePdf} onRemove={removePdf} disabled={!!saving} />
            {errors.pdf && <p role="alert" className="mt-2 text-[12.5px] text-danger">{errors.pdf}</p>}
            {original?.pdf_storage_path && pdfPath !== original.pdf_storage_path && pdfPath && (
              <p className="mt-3 text-[12.5px] text-muted">The previous PDF is kept until you save; the publication URL stays the same.</p>
            )}
          </Section>

          {/* 2. Info */}
          <Section id="info" step={2} title="Publication information">
            <div className="grid gap-5 md:grid-cols-2">
              <Field label="Publication title" htmlFor="f-title" error={errors.title} required className="md:col-span-2">
                <Input value={form.title} onChange={(e) => set("title", e.target.value)} maxLength={200} placeholder="e.g. The Person I Once Needed" />
              </Field>
              <div className="md:col-span-2">
                <Label htmlFor="f-slug" required>URL slug</Label>
                <div className={cn("flex items-center rounded-md border bg-surface focus-within:ring-3 focus-within:ring-primary/10", errors.slug || slugTaken ? "border-danger" : "border-line-strong focus-within:border-primary")}>
                  <span className="shrink-0 border-r border-line pl-3 pr-2 text-[13px] text-muted">/library/</span>
                  <input
                    id="f-slug"
                    value={form.slug}
                    onChange={(e) => {
                      setForm((f) => ({ ...f, slug: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "-").replace(/-{2,}/g, "-"), slugTouched: true }));
                      setErrors((er) => ({ ...er, slug: undefined }));
                      setDirty(true);
                    }}
                    onBlur={() => setForm((f) => ({ ...f, slug: f.slug.replace(/^-+|-+$/g, "") }))}
                    className="h-10 min-w-0 flex-1 bg-transparent px-2 text-sm outline-none"
                    aria-invalid={errors.slug || slugTaken ? true : undefined}
                    aria-describedby="f-slug-msg"
                  />
                  {form.slugTouched && form.title && (
                    <button type="button" onClick={() => setForm((f) => ({ ...f, slug: slugify(f.title), slugTouched: false }))} className="mr-1 shrink-0 rounded px-2 py-1 text-[12px] text-primary hover:bg-primary/5">
                      Regenerate
                    </button>
                  )}
                </div>
                <p id="f-slug-msg" className={cn("mt-1.5 text-[12.5px]", errors.slug || slugTaken ? "text-danger" : "text-muted")}>
                  {errors.slug ?? (slugTaken ? "This slug is already in use." : "Generated from the title. Changing it on a live publication changes its URL.")}
                </p>
              </div>
              <Field label="Short description" htmlFor="f-desc" error={errors.description} required className="md:col-span-2" hint={`${form.description.length}/500 · Shown on library cards and the reading page.`}>
                <Textarea value={form.description} onChange={(e) => set("description", e.target.value.slice(0, 500))} rows={3} />
              </Field>
              <Field label="Category" htmlFor="f-cat" error={errors.category_id} required hint={!cats.data?.length ? <Link to="/admin/categories" className="text-primary underline">Create a category first</Link> : undefined}>
                <Select value={form.category_id} onValueChange={(v) => set("category_id", v)} options={catOptions} placeholder="Select a category" />
              </Field>
              <Field label="Language" htmlFor="f-lang" optional>
                <Select value={form.language} onValueChange={(v) => set("language", v)} options={LANGUAGES} />
              </Field>
              <Field label="Author" htmlFor="f-author" optional>
                <Input value={form.author} onChange={(e) => set("author", e.target.value)} maxLength={120} />
              </Field>
              <Field label="Publisher" htmlFor="f-publisher" optional>
                <Input value={form.publisher} onChange={(e) => set("publisher", e.target.value)} maxLength={120} />
              </Field>
              <Field label="Publication date" htmlFor="f-date" optional>
                <Input type="date" value={form.publication_date} onChange={(e) => set("publication_date", e.target.value)} />
              </Field>
              <div>
                <Label htmlFor="f-tags" optional>Tags</Label>
                <TagInput id="f-tags" value={form.tags} onChange={(v) => set("tags", v)} suggestions={tagSuggestions} placeholder="Type and press Enter" />
              </div>
              <label className="flex items-center justify-between gap-4 rounded-lg border border-line px-4 py-3 md:col-span-2">
                <span>
                  <span className="block text-[13.5px] font-medium text-ink">Feature this publication</span>
                  <span className="block text-[12.5px] text-muted">Highlighted at the top of the library home page.</span>
                </span>
                <Switch checked={form.is_featured} onCheckedChange={(v) => set("is_featured", v)} aria-label="Feature this publication" />
              </label>
            </div>
          </Section>

          {/* 3. Cover */}
          <Section id="cover" step={3} title="Cover image" description="Recommended ratio 3:4. JPG, PNG or WebP for custom covers.">
            <Tabs value={coverMode} onValueChange={(v) => { setCoverMode(v as "auto" | "custom"); setDirty(true); setErrors((e) => ({ ...e, cover: undefined })); }}>
              <TabsList>
                <TabsTrigger value="auto"><Wand2 className="mr-1.5 inline size-3.5" />Automatic</TabsTrigger>
                <TabsTrigger value="custom"><ImagePlus className="mr-1.5 inline size-3.5" />Custom</TabsTrigger>
              </TabsList>
            </Tabs>
            <div className="mt-5">
              {coverMode === "auto" ? (
                <div className="flex flex-col gap-5 sm:flex-row sm:items-start">
                  {coverPreview ? (
                    <img src={coverPreview} alt="Automatic cover preview" className="w-[180px] rounded-[3px] shadow-book" />
                  ) : (
                    <div className="grid aspect-[3/4] w-[180px] place-items-center rounded-md border-2 border-dashed border-line-strong text-center text-[12px] text-muted">Upload a PDF to<br />generate the cover</div>
                  )}
                  <p className="max-w-sm text-[13px] leading-relaxed text-muted">The first page of the PDF is rendered at high resolution and used as the cover. Replacing the PDF regenerates it automatically.</p>
                </div>
              ) : customFile ? (
                <div>
                  <CoverCropper file={customFile} onChange={(b) => { setCustomBlob(b); setDirty(true); }} />
                  <Button type="button" variant="link" className="mt-3" onClick={() => document.getElementById("custom-cover-input")?.click()}>Choose a different image</Button>
                </div>
              ) : (
                <div className="flex flex-col gap-5 sm:flex-row sm:items-center">
                  {coverPreview && <img src={coverPreview} alt="Current custom cover" className="w-[150px] rounded-[3px] shadow-book" />}
                  <Button type="button" variant="outline" onClick={() => document.getElementById("custom-cover-input")?.click()}>
                    <Upload /> {coverPreview ? "Replace cover image" : "Upload cover image"}
                  </Button>
                </div>
              )}
              <input
                id="custom-cover-input"
                type="file"
                accept="image/jpeg,image/png,image/webp"
                className="sr-only"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  e.target.value = "";
                  if (!f) return;
                  if (!["image/jpeg", "image/png", "image/webp"].includes(f.type)) return toast.error("Please choose a JPG, PNG or WebP image.");
                  if (f.size > 10 * 1024 * 1024) return toast.error("Cover images must be under 10 MB.");
                  setCustomFile(f);
                  setErrors((er) => ({ ...er, cover: undefined }));
                }}
              />
              {errors.cover && <p role="alert" className="mt-3 text-[12.5px] text-danger">{errors.cover}</p>}
            </div>
          </Section>

          {/* 4. Reader */}
          <Section id="reader" step={4} title="Reader configuration">
            <div className="divide-y divide-line rounded-lg border border-line">
              {READER_OPTIONS.map((o) => (
                <label key={o.key} className="flex items-center justify-between gap-4 px-4 py-3.5">
                  <span>
                    <span className="block text-[13.5px] font-medium text-ink">{o.label}</span>
                    <span className="block text-[12.5px] text-muted">{o.hint}</span>
                  </span>
                  <Switch
                    checked={form.settings[o.key]}
                    disabled={o.key === "double_page_mode" && !form.settings.flipbook_enabled}
                    onCheckedChange={(v) => set("settings", { ...form.settings, [o.key]: v })}
                    aria-label={o.label}
                  />
                </label>
              ))}
            </div>
          </Section>

          {/* 5. SEO */}
          <Section id="seo" step={5} title="SEO settings" description="Leave blank to use sensible defaults from the publication details.">
            <div className="grid gap-5 md:grid-cols-2">
              <Field label="SEO page title" htmlFor="f-seo-title" optional hint={`${(form.seo.seo_title ?? "").length}/70 · Default: ${form.title || "publication title"}`}>
                <Input value={form.seo.seo_title ?? ""} placeholder={form.title} maxLength={120} onChange={(e) => set("seo", { ...form.seo, seo_title: e.target.value })} />
              </Field>
              <Field label="Canonical URL" htmlFor="f-canonical" optional error={errors.canonical} hint="Only if this publication lives elsewhere too.">
                <Input value={form.seo.canonical_url ?? ""} placeholder="https://" onChange={(e) => set("seo", { ...form.seo, canonical_url: e.target.value })} />
              </Field>
              <Field label="Meta description" htmlFor="f-meta" optional className="md:col-span-2" hint={`${(form.seo.meta_description ?? "").length}/160 · Default: the short description`}>
                <Textarea rows={2} value={form.seo.meta_description ?? ""} placeholder={form.description.slice(0, 160)} maxLength={320} onChange={(e) => set("seo", { ...form.seo, meta_description: e.target.value })} />
              </Field>
              <div>
                <Label optional>Open Graph image</Label>
                <div className="flex items-center gap-3">
                  <div className="grid aspect-[1.91/1] w-40 place-items-center overflow-hidden rounded-md border border-line bg-admin-bg">
                    {ogUrl || form.seo.og_image_path ? <img src={ogUrl ?? api.coverUrl(form.seo.og_image_path) ?? ""} alt="Open Graph" className="h-full w-full object-cover" /> : coverPreview ? <img src={coverPreview} alt="" className="h-full object-contain" /> : <span className="text-[11px] text-muted">Uses cover</span>}
                  </div>
                  <div className="flex flex-col items-start gap-1">
                    <Button type="button" variant="outline" size="sm" onClick={() => document.getElementById("og-input")?.click()}>Upload image</Button>
                    {(ogBlob || form.seo.og_image_path) && (
                      <button type="button" className="text-[12px] text-muted hover:text-danger" onClick={() => { setOgBlob(null); set("seo", { ...form.seo, og_image_path: null }); }}>
                        Use cover instead
                      </button>
                    )}
                  </div>
                </div>
                <input id="og-input" type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) { if (f.size > 5 * 1024 * 1024) return toast.error("Images must be under 5 MB."); setOgBlob(f); setDirty(true); } }} />
                <p className="mt-1.5 text-[12.5px] text-muted">1200 × 630 recommended. Defaults to the cover.</p>
              </div>
              <div>
                <Label>Search preview</Label>
                <div className="rounded-lg border border-line bg-surface p-4">
                  <p className="truncate text-[12px] text-[#4d5156]">{window.location.host} › library › {form.slug || "slug"}</p>
                  <p className="mt-1 truncate text-[17px] leading-snug text-[#1a0dab]">{effectiveTitle} — {site.site_name}</p>
                  <p className="mt-1 line-clamp-2 text-[13px] text-[#4d5156]">{effectiveDesc}</p>
                </div>
              </div>
            </div>
          </Section>

          {/* 6. Preview & publish */}
          <Section id="publish" step={6} title="Preview & publishing" description="A publication appears in the public library only after it is explicitly published.">
            <div className="grid gap-6 md:grid-cols-[200px_1fr]">
              <BookCoverPreview url={coverPreview} title={form.title} />
              <div>
                <p className="eyebrow text-[#9a7232]">{category?.name ?? "No category"}{pageCount ? ` · ${pageCount} pages` : ""}</p>
                <p className="mt-2 font-display text-[26px] leading-tight text-ink">{form.title || "Untitled publication"}</p>
                <p className="mt-2 text-[14px] leading-relaxed text-secondary">{form.description || <span className="italic text-muted">No description yet.</span>}</p>
                <dl className="mt-4 grid grid-cols-2 gap-x-6 gap-y-1.5 text-[12.5px] sm:grid-cols-3">
                  <Meta k="Author" v={form.author} />
                  <Meta k="File" v={fileSize ? formatBytes(fileSize) : null} />
                  <Meta k="Language" v={LANGUAGES.find((l) => l.value === form.language)?.label} />
                  <Meta k="URL" v={`/library/${form.slug || "…"}`} />
                  <Meta k="Downloads" v={form.settings.download_enabled ? "Lead form" : "Disabled"} />
                  <Meta k="Status" v={isLive && original?.published_at && new Date(original.published_at) > new Date() ? `Scheduled · ${formatDateTime(original.published_at)}` : status.charAt(0).toUpperCase() + status.slice(1)} />
                </dl>
                <div className="mt-5 flex flex-wrap gap-2">
                  <Button type="button" variant="outline" onClick={() => setPreviewOpen(true)} disabled={!pdfPath}>
                    <Eye /> Full flipbook preview
                  </Button>
                </div>
                {!pdfPath && <p className="mt-2 text-[12.5px] text-muted">Upload a PDF to preview the reader.</p>}
              </div>
            </div>
          </Section>
        </div>
      </div>

      {/* Sticky action bar */}
      <div className="fixed inset-x-0 bottom-0 z-20 border-t border-line bg-surface/95 backdrop-blur lg:left-60">
        <div className="mx-auto flex max-w-[1280px] flex-wrap items-center gap-2 px-4 py-3 sm:px-8">
          <p className="mr-auto hidden text-[12.5px] text-muted sm:block">{dirty ? "Unsaved changes" : isNew ? "Not saved yet" : "All changes saved"}</p>
          <Button variant="ghost" asChild>
            <Link to="/admin/publications">Cancel</Link>
          </Button>
          {isLive ? (
            <>
              <Button variant="outline" onClick={() => setConfirmUnpublish(true)} disabled={!!saving}>Unpublish</Button>
              <Button onClick={() => persist("save")} loading={saving === "save"} disabled={!!saving && saving !== "save"}>Save changes</Button>
            </>
          ) : (
            <>
              <Button variant="outline" onClick={() => persist("draft")} loading={saving === "draft"} disabled={!!saving && saving !== "draft"}>
                Save as draft
              </Button>
              <Button variant="outline" onClick={() => setScheduleOpen(true)} disabled={!!saving}>
                <CalendarClock /> Schedule
              </Button>
              <Button onClick={() => persist("publish")} loading={saving === "publish"} disabled={!!saving && saving !== "publish"}>
                Publish now
              </Button>
            </>
          )}
        </div>
      </div>

      <Dialog open={scheduleOpen} onOpenChange={setScheduleOpen}>
        <DialogContent className="max-w-sm">
          <DialogTitle className="font-sans text-[17px] font-semibold">Schedule publication</DialogTitle>
          <p className="mt-2 text-sm text-muted">The publication goes live automatically at this time ({Intl.DateTimeFormat().resolvedOptions().timeZone}).</p>
          <Field label="Publish on" htmlFor="schedule-at" error={errors.schedule} className="mt-5">
            <Input type="datetime-local" value={scheduleAt} onChange={(e) => setScheduleAt(e.target.value)} />
          </Field>
          <div className="mt-6 flex justify-end gap-2">
            <Button variant="outline" onClick={() => setScheduleOpen(false)}>Cancel</Button>
            <Button onClick={() => persist("schedule")} loading={saving === "schedule"}>Schedule</Button>
          </div>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={confirmUnpublish}
        onOpenChange={setConfirmUnpublish}
        title="Unpublish this publication?"
        description="It will be removed from the public library immediately. Leads and analytics are kept, and you can republish at any time."
        confirmLabel="Unpublish"
        loading={saving === "unpublish"}
        onConfirm={() => persist("unpublish")}
      />

      {previewOpen && pdfPath && (
        <PreviewDialog
          open
          onOpenChange={setPreviewOpen}
          title={form.title || "Untitled"}
          settings={form.settings}
          sourceKey={pdfPath}
          loadSource={() => (pdfFile ? Promise.resolve(pdfFile) : api.getAdminPdfSource(pdfPath))}
        />
      )}
    </div>
  );
}

function Section({ id, step, title, description, children }: { id: string; step: number; title: string; description?: string; children: React.ReactNode }) {
  return (
    <Card id={`section-${id}`} className="scroll-mt-24 p-5 sm:p-7">
      <div className="mb-5">
        <p className="text-[11.5px] font-semibold uppercase tracking-wider text-muted">Step {step}</p>
        <h2 className="mt-1 text-[17px] font-semibold text-ink">{title}</h2>
        {description && <p className="mt-1 text-[13px] text-muted">{description}</p>}
      </div>
      {children}
    </Card>
  );
}

function Meta({ k, v }: { k: string; v: string | null | undefined }) {
  return (
    <div className="min-w-0">
      <dt className="text-muted">{k}</dt>
      <dd className="truncate font-medium text-ink">{v || "—"}</dd>
    </div>
  );
}

function BookCoverPreview({ url, title }: { url: string | null; title: string }) {
  return (
    <div className="flex items-start justify-center rounded-lg bg-[#efece6] p-5">
      {url ? <img src={url} alt={`Cover of ${title}`} className="w-full max-w-[150px] rounded-[3px] shadow-book" /> : <BookCover path={null} title={title || "Untitled"} className="w-full max-w-[150px]" />}
    </div>
  );
}

export function PreviewDialog({
  open,
  onOpenChange,
  title,
  settings,
  sourceKey,
  loadSource,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  title: string;
  settings: ReaderSettings;
  sourceKey: string;
  loadSource: () => Promise<Blob | ReaderSource>;
}) {
  const [device, setDevice] = useState<"desktop" | "mobile">("desktop");
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex h-[calc(100dvh-2rem)] max-w-[1400px] flex-col overflow-hidden p-0 sm:p-0" hideClose>
        <div className="flex items-center gap-3 border-b border-line px-4 py-3">
          <DialogTitle className="min-w-0 flex-1 truncate font-sans text-[15px] font-semibold">Preview · {title}</DialogTitle>
          <Tabs value={device} onValueChange={(v) => setDevice(v as "desktop" | "mobile")}>
            <TabsList>
              <TabsTrigger value="desktop"><Monitor className="mr-1.5 inline size-3.5" />Desktop</TabsTrigger>
              <TabsTrigger value="mobile"><Smartphone className="mr-1.5 inline size-3.5" />Mobile</TabsTrigger>
            </TabsList>
          </Tabs>
          <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>Close</Button>
        </div>
        <div className="flex min-h-0 flex-1 items-stretch justify-center bg-admin-bg">
          {device === "desktop" ? (
            <PdfReader key="d" sourceKey={sourceKey} loadSource={loadSource} settings={settings} title={title} className="w-full flex-1" />
          ) : (
            <div className="my-4 flex w-[390px] max-w-full flex-col overflow-hidden rounded-[28px] border-[6px] border-[#1b2230] bg-paper shadow-2xl">
              <div className="flex h-11 shrink-0 items-center justify-center border-b border-line text-[13px] font-medium text-ink">{title}</div>
              <PdfReader key="m" sourceKey={sourceKey} loadSource={loadSource} settings={settings} title={title} forceSingle className="flex-1" />
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
