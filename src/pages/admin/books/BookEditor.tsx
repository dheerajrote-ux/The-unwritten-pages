import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { toast } from "sonner";
import { Check, ExternalLink, Eye, ImagePlus, Trash2, Upload } from "lucide-react";
import { api } from "@/data";
import { useAsync } from "@/hooks/useAsync";
import { useSite } from "@/hooks/useSite";
import { FORMATS, validIsbn10, validIsbn13, type Book, type BookFormat, type BookInput, type PurchaseLink } from "@/lib/books";
import type { ApiError } from "@/lib/types";
import { cn, formatDateTime, LANGUAGES, SLUG_RE, slugify, uuid } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Field, Input, Label, Textarea } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Card, ErrorState, Switch } from "@/components/ui/misc";
import { ConfirmDialog, Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { CoverCropper } from "@/components/admin/CoverCropper";
import { TagInput } from "@/components/admin/TagInput";
import { StatusBadge } from "@/components/admin/bits";
import { BookJacket } from "@/components/books/BookJacket";
import { BookDetailView } from "@/pages/BookDetailPage";
import { PurchaseLinkManager, linkErrors } from "./PurchaseLinkManager";

interface Form {
  title: string;
  slug: string;
  slugTouched: boolean;
  subtitle: string;
  author: string;
  short_description: string;
  full_description: string;
  learn_points: string;
  audience: string;
  key_takeaways: string;
  category_id: string;
  tags: string[];
  language: string;
  publication_date: string;
  isbn_10: string;
  isbn_13: string;
  publisher: string;
  page_count: string;
  edition: string;
  formats: BookFormat[];
  is_featured: boolean;
  seo_title: string;
  meta_description: string;
  canonical_url: string;
}
type Errors = Partial<Record<keyof Form | "links", string>>;

const SECTIONS = [
  { id: "basic", label: "Basic information" },
  { id: "cover", label: "Book cover" },
  { id: "meta", label: "Book metadata" },
  { id: "content", label: "Book description" },
  { id: "links", label: "Amazon purchase links" },
  { id: "seo", label: "SEO information" },
];
const SECTION_OF: Record<string, string> = { title: "basic", slug: "basic", short_description: "basic", isbn_10: "meta", isbn_13: "meta", page_count: "meta", links: "links", canonical_url: "seo" };

const lines = (s: string) => s.split("\n").map((x) => x.trim()).filter(Boolean);

function blank(author: string): Form {
  return { title: "", slug: "", slugTouched: false, subtitle: "", author, short_description: "", full_description: "", learn_points: "", audience: "", key_takeaways: "", category_id: "", tags: [], language: "en", publication_date: "", isbn_10: "", isbn_13: "", publisher: "", page_count: "", edition: "", formats: [], is_featured: false, seo_title: "", meta_description: "", canonical_url: "" };
}
function fromBook(b: Book): Form {
  return {
    title: b.title, slug: b.slug, slugTouched: true, subtitle: b.subtitle ?? "", author: b.author ?? "", short_description: b.short_description, full_description: b.full_description,
    learn_points: b.learn_points.join("\n"), audience: b.audience ?? "", key_takeaways: b.key_takeaways.join("\n"), category_id: b.category_id ?? "", tags: b.tags, language: b.language ?? "en",
    publication_date: b.publication_date ?? "", isbn_10: b.isbn_10 ?? "", isbn_13: b.isbn_13 ?? "", publisher: b.publisher ?? "", page_count: b.page_count?.toString() ?? "", edition: b.edition ?? "",
    formats: b.formats, is_featured: b.is_featured, seo_title: b.seo_title ?? "", meta_description: b.meta_description ?? "", canonical_url: b.canonical_url ?? "",
  };
}

export function BookEditor() {
  const { id } = useParams();
  const isNew = !id;
  const navigate = useNavigate();
  const { site } = useSite();
  const [bookId] = useState(() => id ?? uuid());
  const existing = useAsync(() => (id ? api.getAdminBook(id) : Promise.resolve(null)), [id]);
  const cats = useAsync(() => api.listBookCategories(), []);
  const allBooks = useAsync(() => api.listAdminBooks().catch(() => []), []);

  const [original, setOriginal] = useState<Book | null>(null);
  const [form, setForm] = useState<Form>(() => blank("Dheeraj Rote"));
  const [links, setLinks] = useState<PurchaseLink[]>([]);
  const [coverPath, setCoverPath] = useState<string | null>(null);
  const [coverFile, setCoverFile] = useState<File | null>(null);
  const [coverBlob, setCoverBlob] = useState<Blob | null>(null);
  const [coverUrl, setCoverUrl] = useState<string | null>(null);
  const [errors, setErrors] = useState<Errors>({});
  const [showLinkErrors, setShowLinkErrors] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState<null | "draft" | "publish" | "save" | "unpublish">(null);
  const [preview, setPreview] = useState(false);
  const [confirmUnpublish, setConfirmUnpublish] = useState(false);
  const [slugTaken, setSlugTaken] = useState(false);

  useEffect(() => {
    const b = existing.data;
    if (!b) return;
    setOriginal(b);
    setForm(fromBook(b));
    setLinks(b.links ?? []);
    setCoverPath(b.cover_image_path);
  }, [existing.data]);

  useEffect(() => {
    if (!coverBlob) return setCoverUrl(null);
    const u = URL.createObjectURL(coverBlob);
    setCoverUrl(u);
    return () => URL.revokeObjectURL(u);
  }, [coverBlob]);

  useEffect(() => {
    if (!dirty) return;
    const h = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", h);
    return () => window.removeEventListener("beforeunload", h);
  }, [dirty]);

  useEffect(() => {
    if (!form.slug || !SLUG_RE.test(form.slug)) return setSlugTaken(false);
    const t = setTimeout(() => api.isBookSlugAvailable(form.slug, bookId).then((ok) => setSlugTaken(!ok)).catch(() => undefined), 350);
    return () => clearTimeout(t);
  }, [form.slug, bookId]);

  const set = <K extends keyof Form>(k: K, v: Form[K]) => {
    setForm((f) => ({ ...f, [k]: v, ...(k === "title" && !f.slugTouched ? { slug: slugify(String(v)) } : {}) }));
    setErrors((e) => ({ ...e, [k]: undefined, ...(k === "title" ? { slug: undefined } : {}) }));
    setDirty(true);
  };
  const tagSuggestions = useMemo(() => [...new Set((allBooks.data ?? []).flatMap((b) => b.tags))].sort(), [allBooks.data]);

  const validate = (forPublish: boolean): Errors => {
    const e: Errors = {};
    if (!form.title.trim()) e.title = "Book title is required.";
    if (!form.slug || !SLUG_RE.test(form.slug)) e.slug = "Use lowercase letters, numbers and single hyphens.";
    else if (slugTaken) e.slug = "This slug is already in use.";
    if (forPublish && !form.short_description.trim()) e.short_description = "A short description is required to publish.";
    const i10 = form.isbn_10.replace(/[-\s]/g, "").toUpperCase();
    const i13 = form.isbn_13.replace(/[-\s]/g, "");
    if (i10 && !validIsbn10(i10)) e.isbn_10 = "Not a valid ISBN-10 (check digit doesn't match).";
    if (i13 && !validIsbn13(i13)) e.isbn_13 = "Not a valid ISBN-13 (check digit doesn't match).";
    if (form.page_count && !(Number(form.page_count) > 0)) e.page_count = "Enter a positive number.";
    if (form.canonical_url && !/^https?:\/\/\S+$/.test(form.canonical_url)) e.canonical_url = "Enter a full URL starting with https://";
    if (links.some((l) => linkErrors(l))) e.links = "Fix the highlighted purchase links.";
    return e;
  };

  const persist = async (mode: "draft" | "publish" | "save" | "unpublish") => {
    const live = original?.status === "published";
    const e = validate(mode === "publish" || (mode === "save" && live));
    setErrors(e);
    setShowLinkErrors(true);
    const first = Object.keys(e)[0];
    if (first) {
      toast.error("Please fix the highlighted fields.");
      document.getElementById(`bsec-${SECTION_OF[first] ?? "basic"}`)?.scrollIntoView({ behavior: "smooth", block: "start" });
      return;
    }
    setSaving(mode);
    try {
      let cover = coverPath;
      if (coverBlob) cover = await api.uploadImage(`books/${bookId}`, coverBlob, "cover");
      let status = original?.status ?? "draft";
      let publishedAt = original?.published_at ?? null;
      if (mode === "publish") {
        status = "published";
        publishedAt = new Date().toISOString();
      }
      if (mode === "unpublish") status = "unpublished";
      const fixedLinks = links.some((l) => l.is_primary) || !links.length ? links : links.map((l, i) => ({ ...l, is_primary: i === 0 }));
      const input: BookInput = {
        id: bookId,
        title: form.title.trim(),
        slug: form.slug,
        subtitle: form.subtitle.trim() || null,
        author: form.author.trim() || null,
        short_description: form.short_description.trim(),
        full_description: form.full_description.trim(),
        learn_points: lines(form.learn_points),
        audience: form.audience.trim() || null,
        key_takeaways: lines(form.key_takeaways),
        cover_image_path: cover,
        category_id: form.category_id || null,
        isbn_10: form.isbn_10.replace(/[-\s]/g, "").toUpperCase() || null,
        isbn_13: form.isbn_13.replace(/[-\s]/g, "") || null,
        publisher: form.publisher.trim() || null,
        page_count: form.page_count ? Number(form.page_count) : null,
        edition: form.edition.trim() || null,
        formats: form.formats,
        language: form.language || null,
        publication_date: form.publication_date || null,
        tags: form.tags,
        is_featured: form.is_featured,
        status,
        published_at: publishedAt,
        seo_title: form.seo_title.trim() || null,
        meta_description: form.meta_description.trim() || null,
        og_image_path: original?.og_image_path ?? null,
        canonical_url: form.canonical_url.trim() || null,
        links: fixedLinks.map((l) => ({ ...l, product_url: l.product_url.trim(), marketplace_name: l.marketplace === "other" ? l.marketplace_name?.trim() || null : null })),
      };
      const saved = await api.saveBook(input);
      if (original?.cover_image_path && original.cover_image_path !== saved.cover_image_path) void api.removeFiles({ images: [original.cover_image_path] }).catch(() => undefined);
      setOriginal(saved);
      setLinks(saved.links ?? []);
      setCoverPath(saved.cover_image_path);
      setCoverBlob(null);
      setCoverFile(null);
      setDirty(false);
      setShowLinkErrors(false);
      setConfirmUnpublish(false);
      toast.success({ draft: status === "published" ? "Changes saved." : "Saved as draft.", publish: "Published — the book is now live.", save: "Changes saved.", unpublish: "Unpublished." }[mode]);
      if (isNew) navigate(`/admin/books/${bookId}/edit`, { replace: true });
    } catch (err) {
      const ae = err as ApiError;
      if (ae.fields?.slug) setErrors((x) => ({ ...x, slug: ae.fields!.slug }));
      toast.error(ae.message || "Saving failed.");
    } finally {
      setSaving(null);
    }
  };

  if (existing.error) return <ErrorState message={existing.error} onRetry={existing.reload} />;
  if (!isNew && existing.loading) return <div className="space-y-4"><div className="skeleton h-10 w-72" /><div className="skeleton h-96" /></div>;
  if (!isNew && !existing.data) return <ErrorState message="This book doesn't exist or was deleted." />;

  const status = original?.status ?? "draft";
  const live = status === "published";
  const previewBook: Book = {
    ...(original ?? ({} as Book)),
    id: bookId, title: form.title || "Untitled book", slug: form.slug, subtitle: form.subtitle || null, author: form.author || null, short_description: form.short_description, full_description: form.full_description,
    learn_points: lines(form.learn_points), audience: form.audience || null, key_takeaways: lines(form.key_takeaways), cover_image_path: coverBlob ? null : coverPath, category_id: form.category_id || null,
    category: cats.data?.find((c) => c.id === form.category_id) ?? null, isbn_10: form.isbn_10 || null, isbn_13: form.isbn_13 || null, publisher: form.publisher || null, page_count: form.page_count ? Number(form.page_count) : null,
    edition: form.edition || null, formats: form.formats, language: form.language, publication_date: form.publication_date || null, tags: form.tags, is_featured: form.is_featured, status, published_at: original?.published_at ?? null,
    seo_title: null, meta_description: null, og_image_path: null, canonical_url: null, created_at: "", updated_at: "", links: links.filter((l) => !linkErrors(l)),
  };
  const done: Record<string, boolean> = { basic: !!(form.title && form.slug && form.short_description), cover: !!(coverPath || coverBlob), meta: form.formats.length > 0, content: !!form.full_description, links: links.length > 0 && !links.some((l) => linkErrors(l)), seo: true };

  return (
    <div className="pb-28">
      <div className="mb-7 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-[24px] font-semibold tracking-tight text-ink">{isNew ? "Add new book" : "Edit book"}</h1>
            <StatusBadge status={status} publishedAt={original?.published_at} />
          </div>
          <p className="mt-1 text-sm text-muted">{isNew ? "Add the details and your real Amazon product links." : `Last updated ${formatDateTime(original?.updated_at)}`}</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => setPreview(true)}><Eye /> Preview</Button>
          {live && original && (
            <Button asChild variant="outline" size="sm"><Link to={`/books/${original.slug}`} target="_blank"><ExternalLink /> View live</Link></Button>
          )}
        </div>
      </div>

      <div className="grid gap-8 lg:grid-cols-[220px_1fr]">
        <nav className="hidden lg:block" aria-label="Sections">
          <ol className="sticky top-24 space-y-1">
            {SECTIONS.map((s, i) => (
              <li key={s.id}>
                <button onClick={() => document.getElementById(`bsec-${s.id}`)?.scrollIntoView({ behavior: "smooth", block: "start" })} className="flex w-full items-center gap-3 rounded-md px-2 py-2 text-left text-[13px] text-secondary hover:bg-black/[0.04] hover:text-ink">
                  <span className={cn("grid size-6 shrink-0 place-items-center rounded-full border text-[11px] font-semibold", done[s.id] ? "border-success bg-success text-white" : "border-line-strong bg-surface")}>{done[s.id] ? <Check className="size-3.5" /> : i + 1}</span>
                  {s.label}
                </button>
              </li>
            ))}
          </ol>
        </nav>

        <div className="min-w-0 space-y-6">
          <Section id="basic" step={1} title="Basic information">
            <div className="grid gap-5 md:grid-cols-2">
              <Field label="Book title" htmlFor="b-title" error={errors.title} required className="md:col-span-2"><Input value={form.title} maxLength={200} onChange={(e) => set("title", e.target.value)} /></Field>
              <div className="md:col-span-2">
                <Label htmlFor="b-slug" required>URL slug</Label>
                <div className={cn("flex items-center rounded-md border bg-surface", errors.slug || slugTaken ? "border-danger" : "border-line-strong focus-within:border-primary")}>
                  <span className="border-r border-line pl-3 pr-2 text-[13px] text-muted">/books/</span>
                  <input id="b-slug" value={form.slug} onChange={(e) => { setForm((f) => ({ ...f, slug: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "-").replace(/-{2,}/g, "-"), slugTouched: true })); setErrors((x) => ({ ...x, slug: undefined })); setDirty(true); }} className="h-10 min-w-0 flex-1 bg-transparent px-2 text-sm outline-none" aria-invalid={errors.slug || slugTaken ? true : undefined} />
                </div>
                <p className={cn("mt-1.5 text-[12.5px]", errors.slug || slugTaken ? "text-danger" : "text-muted")}>{errors.slug ?? (slugTaken ? "This slug is already in use." : "Generated from the title; editable.")}</p>
              </div>
              <Field label="Subtitle" htmlFor="b-sub" optional className="md:col-span-2"><Input value={form.subtitle} maxLength={200} onChange={(e) => set("subtitle", e.target.value)} /></Field>
              <Field label="Author name" htmlFor="b-author" optional><Input value={form.author} maxLength={120} onChange={(e) => set("author", e.target.value)} /></Field>
              <Field label="Category" htmlFor="b-cat" optional hint={!cats.data?.length ? <Link to="/admin/books/categories" className="text-primary underline">Create a book category</Link> : undefined}>
                <Select value={form.category_id} onValueChange={(v) => set("category_id", v)} options={[{ value: "", label: "No category" }, ...(cats.data ?? []).map((c) => ({ value: c.id, label: c.name }))]} />
              </Field>
              <Field label="Short description" htmlFor="b-short" error={errors.short_description} required className="md:col-span-2" hint={`${form.short_description.length}/300 · Used on cards, recommendations and the hero.`}>
                <Textarea rows={2} value={form.short_description} onChange={(e) => set("short_description", e.target.value.slice(0, 300))} />
              </Field>
              <Field label="Language" htmlFor="b-lang" optional><Select value={form.language} onValueChange={(v) => set("language", v)} options={LANGUAGES} /></Field>
              <Field label="Publication date" htmlFor="b-date" optional><Input type="date" value={form.publication_date} onChange={(e) => set("publication_date", e.target.value)} /></Field>
              <div className="md:col-span-2"><Label htmlFor="b-tags" optional>Tags</Label><TagInput id="b-tags" value={form.tags} onChange={(v) => set("tags", v)} suggestions={tagSuggestions} placeholder="Type and press Enter" /></div>
            </div>
          </Section>

          <Section id="cover" step={2} title="Book cover" description="JPG, PNG or WebP. Recommended ratio 2:3 — cropped and optimised for the web.">
            {coverFile ? (
              <div>
                <CoverCropper file={coverFile} ratio={2 / 3} ratioLabel="2:3" maxHeight={1800} onChange={(b) => { setCoverBlob(b); setDirty(true); }} />
                <div className="mt-4 flex gap-2">
                  <Button variant="outline" size="sm" onClick={() => document.getElementById("book-cover-input")?.click()}>Choose another image</Button>
                  <Button variant="ghost" size="sm" onClick={() => { setCoverFile(null); setCoverBlob(null); }}>Cancel</Button>
                </div>
              </div>
            ) : (
              <div className="flex flex-col gap-5 sm:flex-row sm:items-center">
                <div className="w-[150px]">{coverUrl ? <img src={coverUrl} alt="" className="w-full rounded-[3px] shadow-book" /> : <BookJacket path={coverPath} title={form.title || "Untitled book"} author={form.author} className="w-full" />}</div>
                <div className="space-y-2">
                  <p className="text-[13px] text-muted">{coverPath ? "Current cover." : "No cover uploaded — a typographic cover is shown instead."}</p>
                  <div className="flex flex-wrap gap-2">
                    <Button variant="outline" onClick={() => document.getElementById("book-cover-input")?.click()}>{coverPath ? <><ImagePlus /> Replace cover</> : <><Upload /> Upload cover</>}</Button>
                    {coverPath && <Button variant="ghost" onClick={() => { setCoverPath(null); setDirty(true); }}><Trash2 /> Remove</Button>}
                  </div>
                </div>
              </div>
            )}
            <input id="book-cover-input" type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" onChange={(e) => {
              const f = e.target.files?.[0];
              e.target.value = "";
              if (!f) return;
              if (!["image/jpeg", "image/png", "image/webp"].includes(f.type)) return toast.error("Please choose a JPG, PNG or WebP image.");
              if (f.size > 15 * 1024 * 1024) return toast.error("Cover images must be under 15 MB.");
              setCoverFile(f);
            }} />
          </Section>

          <Section id="meta" step={3} title="Book metadata">
            <div className="grid gap-5 md:grid-cols-3">
              <Field label="ISBN-13" htmlFor="b-isbn13" optional error={errors.isbn_13}><Input value={form.isbn_13} placeholder="978…" onChange={(e) => set("isbn_13", e.target.value)} /></Field>
              <Field label="ISBN-10" htmlFor="b-isbn10" optional error={errors.isbn_10}><Input value={form.isbn_10} onChange={(e) => set("isbn_10", e.target.value)} /></Field>
              <Field label="Publisher" htmlFor="b-pub" optional><Input value={form.publisher} onChange={(e) => set("publisher", e.target.value)} /></Field>
              <Field label="Number of pages" htmlFor="b-pages" optional error={errors.page_count}><Input type="number" min={1} value={form.page_count} onChange={(e) => set("page_count", e.target.value)} /></Field>
              <Field label="Edition" htmlFor="b-ed" optional><Input value={form.edition} placeholder="First edition" onChange={(e) => set("edition", e.target.value)} /></Field>
              <div>
                <Label>Available formats</Label>
                <div className="flex flex-wrap gap-1.5">
                  {FORMATS.map((f) => {
                    const on = form.formats.includes(f.value);
                    return (
                      <button key={f.value} type="button" aria-pressed={on} onClick={() => set("formats", on ? form.formats.filter((x) => x !== f.value) : [...form.formats, f.value])} className={cn("h-9 rounded-full border px-3 text-[12.5px] font-medium", on ? "border-primary bg-primary text-white" : "border-line-strong text-secondary hover:text-ink")}>
                        {f.label}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          </Section>

          <Section id="content" step={4} title="Book description" description="Sections with no content are hidden on the book page.">
            <div className="grid gap-5">
              <Field label="Full description" htmlFor="b-full" optional hint="Separate paragraphs with a blank line."><Textarea rows={6} value={form.full_description} onChange={(e) => set("full_description", e.target.value)} /></Field>
              <Field label="What readers will learn" htmlFor="b-learn" optional hint="One point per line."><Textarea rows={4} value={form.learn_points} onChange={(e) => set("learn_points", e.target.value)} /></Field>
              <Field label="Who should read this book" htmlFor="b-aud" optional><Textarea rows={2} value={form.audience} onChange={(e) => set("audience", e.target.value)} /></Field>
              <Field label="Key takeaways" htmlFor="b-take" optional hint="One takeaway per line."><Textarea rows={4} value={form.key_takeaways} onChange={(e) => set("key_takeaways", e.target.value)} /></Field>
            </div>
          </Section>

          <Section id="links" step={5} title="Amazon purchase links" description="Add one link per format and store. The primary link powers the main “Buy on Amazon” button.">
            {errors.links && <p role="alert" className="mb-4 rounded-md bg-danger-soft px-3 py-2.5 text-[13px] text-danger">{errors.links}</p>}
            <PurchaseLinkManager bookId={bookId} links={links} onChange={(l) => { setLinks(l); setDirty(true); setErrors((x) => ({ ...x, links: undefined })); }} showErrors={showLinkErrors} associate={site.amazon_associate} />
          </Section>

          <Section id="seo" step={6} title="SEO information" description="Leave blank to use the title and short description.">
            <div className="grid gap-5 md:grid-cols-2">
              <Field label="SEO title" htmlFor="b-seot" optional><Input value={form.seo_title} maxLength={120} placeholder={form.title} onChange={(e) => set("seo_title", e.target.value)} /></Field>
              <Field label="Canonical URL" htmlFor="b-canon" optional error={errors.canonical_url}><Input value={form.canonical_url} placeholder="https://" onChange={(e) => set("canonical_url", e.target.value)} /></Field>
              <Field label="Meta description" htmlFor="b-meta" optional className="md:col-span-2"><Textarea rows={2} maxLength={320} value={form.meta_description} placeholder={form.short_description} onChange={(e) => set("meta_description", e.target.value)} /></Field>
              <p className="text-[12.5px] text-muted md:col-span-2">The Open Graph image defaults to the book cover.</p>
            </div>
          </Section>

          <Card className="p-5 sm:p-7">
            <label className="flex items-center justify-between gap-4">
              <span>
                <span className="block text-[14px] font-semibold text-ink">Mark as featured</span>
                <span className="block text-[12.5px] text-muted">Featured books lead the /books page and are the fallback for reader recommendations.</span>
              </span>
              <Switch checked={form.is_featured} onCheckedChange={(v) => set("is_featured", v)} aria-label="Mark as featured" />
            </label>
          </Card>
        </div>
      </div>

      <div className="fixed inset-x-0 bottom-0 z-20 border-t border-line bg-surface/95 backdrop-blur lg:left-60">
        <div className="mx-auto flex max-w-[1280px] flex-wrap items-center gap-2 px-4 py-3 sm:px-8">
          <p className="mr-auto hidden text-[12.5px] text-muted sm:block">{dirty ? "Unsaved changes" : isNew ? "Not saved yet" : "All changes saved"}</p>
          <Button variant="ghost" asChild><Link to="/admin/books">Cancel</Link></Button>
          {live ? (
            <>
              <Button variant="outline" onClick={() => setConfirmUnpublish(true)} disabled={!!saving}>Unpublish</Button>
              <Button onClick={() => persist("save")} loading={saving === "save"} disabled={!!saving && saving !== "save"}>Save changes</Button>
            </>
          ) : (
            <>
              <Button variant="outline" onClick={() => persist("draft")} loading={saving === "draft"} disabled={!!saving && saving !== "draft"}>Save as draft</Button>
              <Button onClick={() => persist("publish")} loading={saving === "publish"} disabled={!!saving && saving !== "publish"}>Publish now</Button>
            </>
          )}
        </div>
      </div>

      <ConfirmDialog open={confirmUnpublish} onOpenChange={setConfirmUnpublish} title="Unpublish this book?" description="It will disappear from the books page and every recommendation placement until you publish it again." confirmLabel="Unpublish" tone="primary" loading={saving === "unpublish"} onConfirm={() => persist("unpublish")} />

      <Dialog open={preview} onOpenChange={setPreview}>
        <DialogContent className="max-h-[calc(100dvh-2rem)] max-w-6xl overflow-y-auto bg-paper p-0 sm:p-0">
          <div className="sticky top-0 z-10 flex items-center justify-between border-b border-line bg-surface px-5 py-3">
            <DialogTitle className="font-sans text-[15px] font-semibold">Preview · {form.title || "Untitled book"}</DialogTitle>
          </div>
          <div className="pb-16">
            {coverUrl ? <PreviewWithLocalCover book={previewBook} url={coverUrl} /> : <BookDetailView book={previewBook} preview />}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/** Shows an unsaved local cover in the preview by swapping in its object URL. */
function PreviewWithLocalCover({ book, url }: { book: Book; url: string }) {
  return <BookDetailView book={{ ...book, cover_image_path: url }} preview />;
}

function Section({ id, step, title, description, children }: { id: string; step: number; title: string; description?: string; children: React.ReactNode }) {
  return (
    <Card id={`bsec-${id}`} className="scroll-mt-24 p-5 sm:p-7">
      <div className="mb-5">
        <p className="text-[11.5px] font-semibold uppercase tracking-wider text-muted">Section {step}</p>
        <h2 className="mt-1 text-[17px] font-semibold text-ink">{title}</h2>
        {description && <p className="mt-1 text-[13px] text-muted">{description}</p>}
      </div>
      {children}
    </Card>
  );
}
