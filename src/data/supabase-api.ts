import { createClient, FunctionsHttpError, type PostgrestError, type SupabaseClient } from "@supabase/supabase-js";
import type { DataApi, UploadProgress } from "./api";
import {
  ApiError,
  DEFAULT_READER,
  EMPTY_SEO,
  type AdminPublicationRow,
  type AdminUser,
  type AnalyticsResult,
  type Category,
  type DownloadRequest,
  type DownloadResult,
  type LeadDetail,
  type LeadDownloadRow,
  type LeadFilter,
  type Publication,
  type PublicationDetail,
  type PublicationInput,
  type PublicationStatus,
  type ReaderSettings,
  type ReaderSource,
  type SeoSettings,
  type SiteSettings,
  type VisitorEvent,
} from "@/lib/types";
import { SUPABASE_ANON_KEY, SUPABASE_URL } from "@/lib/config";
import { localTz, sessionId, uuid } from "@/lib/utils";
import type { AdminBookRow, Book, BookAnalytics, BookCategory, BookEventType, BookInput, EventSurface, Placement, PlacementKey, PurchaseLink, Recommendation } from "@/lib/books";
import { resolvePlacement } from "@/lib/placements";

const PDF_BUCKET = "publications";
const COVER_BUCKET = "publication-covers";

function one<T>(v: T | T[] | null | undefined): T | null {
  if (Array.isArray(v)) return v[0] ?? null;
  return v ?? null;
}

function fail(error: PostgrestError | Error | null | undefined, fallback = "Something went wrong."): never {
  const e = error as PostgrestError | null;
  if (e && "code" in e) {
    if (e.code === "23505") {
      if (/slug/i.test(e.message + (e.details ?? ""))) throw new ApiError("That URL slug is already in use.", { fields: { slug: "This slug is already in use." } });
      throw new ApiError("A record with these details already exists.");
    }
    if (e.code === "23514" && /publish_requires_assets/.test(e.message))
      throw new ApiError("A publication can only be published once its PDF, cover and category are in place.");
    if (e.code === "23503") throw new ApiError("This item is still referenced by other records.");
    if (e.code === "42501" || e.code === "PGRST301") throw new ApiError("You don't have permission to do that.", { status: 403 });
  }
  if (error instanceof TypeError || /fetch/i.test(error?.message ?? "")) throw new ApiError("Network error — check your connection and try again.");
  throw new ApiError(error?.message || fallback);
}

const PUB_SELECT = "*, category:categories(id,name,slug)";

function normalizeDetail(row: Record<string, unknown>): PublicationDetail {
  const settings = one(row.settings as ReaderSettings | ReaderSettings[]) ?? DEFAULT_READER;
  const seo = one(row.seo as SeoSettings | SeoSettings[]) ?? EMPTY_SEO;
  const { settings: _s, seo: _o, ...rest } = row;
  return {
    ...(rest as unknown as Publication),
    category: one(row.category as Publication["category"]),
    settings: pick(settings, Object.keys(DEFAULT_READER)) as unknown as ReaderSettings,
    seo: pick(seo, Object.keys(EMPTY_SEO)) as unknown as SeoSettings,
  };
}

function pick(obj: object, keys: string[]) {
  const src = obj as Record<string, unknown>;
  return Object.fromEntries(keys.map((k) => [k, src[k]]));
}

function escapeLike(s: string) {
  return s.replace(/[%_\\]/g, (m) => "\\" + m).replace(/[,()"]/g, " ");
}

export class SupabaseApi implements DataApi {
  readonly mode = "supabase" as const;
  private sb: SupabaseClient;

  constructor() {
    this.sb = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
    });
  }

  // ---------------------------------------------------------------- public
  async getSiteSettings(): Promise<SiteSettings> {
    const { data, error } = await this.sb.from("site_settings").select("*").eq("id", 1).maybeSingle();
    if (error) fail(error);
    return {
      site_name: data?.site_name ?? "The Unwritten Pages",
      site_url: data?.site_url ?? null,
      tagline: data?.tagline ?? "",
      privacy_policy_url: data?.privacy_policy_url ?? null,
      contact_email: data?.contact_email ?? null,
      max_pdf_mb: data?.max_pdf_mb ?? 50,
      default_reader: { ...DEFAULT_READER, ...(data?.default_reader ?? {}) },
      amazon_associate: data?.amazon_associate ?? false,
      affiliate_disclosure: data?.affiliate_disclosure ?? "As an Amazon Associate, we earn from qualifying purchases.",
      author_website_url: data?.author_website_url ?? null,
    };
  }

  async listPublicCategories(): Promise<Category[]> {
    const { data, error } = await this.sb.from("categories").select("*").eq("status", "active").order("display_order");
    if (error) fail(error);
    return data as Category[];
  }

  async listPublicPublications(): Promise<Publication[]> {
    const { data, error } = await this.sb
      .from("publications")
      .select(PUB_SELECT)
      .eq("status", "published")
      .lte("published_at", new Date().toISOString())
      .order("published_at", { ascending: false });
    if (error) fail(error);
    return (data ?? []).map((r) => ({ ...r, category: one(r.category) })) as Publication[];
  }

  async getPublicPublication(slug: string): Promise<PublicationDetail | null> {
    const { data, error } = await this.sb
      .from("publications")
      .select(`${PUB_SELECT}, settings:publication_settings(*), seo:publication_seo(*)`)
      .eq("slug", slug)
      .eq("status", "published")
      .lte("published_at", new Date().toISOString())
      .maybeSingle();
    if (error) fail(error);
    return data ? normalizeDetail(data) : null;
  }

  async getReaderSource(publication: PublicationDetail): Promise<ReaderSource> {
    const { data, error } = await this.sb.functions.invoke("reader-access", { body: { publication_id: publication.id } });
    if (error) await this.functionError(error, "Unable to open this publication.");
    return { url: (data as { url: string }).url };
  }

  async trackEvent(publicationId: string, type: VisitorEvent): Promise<void> {
    // Fire-and-forget; analytics must never break reading.
    await this.sb.from("publication_events").insert({ publication_id: publicationId, event_type: type, session_id: sessionId() });
  }

  async requestDownload(req: DownloadRequest): Promise<DownloadResult> {
    const { data, error } = await this.sb.functions.invoke("request-download", { body: req });
    if (error) await this.functionError(error, "We couldn't prepare your download.");
    return data as DownloadResult;
  }

  private async functionError(error: unknown, fallback: string): Promise<never> {
    if (error instanceof FunctionsHttpError) {
      let body: { error?: string; fields?: Record<string, string> } = {};
      try {
        body = await error.context.json();
      } catch {
        /* ignore */
      }
      throw new ApiError(body.error ?? fallback, { fields: body.fields, status: error.context.status });
    }
    throw new ApiError("Network error — check your connection and try again.");
  }

  coverUrl(path: string | null | undefined): string | null {
    if (!path) return null;
    if (/^(https?:|blob:|data:)/.test(path)) return path;
    return this.sb.storage.from(COVER_BUCKET).getPublicUrl(path).data.publicUrl;
  }

  // ------------------------------------------------------------------ auth
  async getAdminUser(): Promise<AdminUser | null> {
    const { data } = await this.sb.auth.getSession();
    const user = data.session?.user;
    if (!user) return null;
    const { data: profile } = await this.sb.from("admin_profiles").select("full_name, role").eq("id", user.id).maybeSingle();
    if (!profile) return null;
    return { id: user.id, email: user.email ?? "", full_name: profile.full_name, role: profile.role };
  }

  onAuthChange(cb: () => void) {
    const { data } = this.sb.auth.onAuthStateChange(() => cb());
    return () => data.subscription.unsubscribe();
  }

  async signIn(email: string, password: string): Promise<AdminUser> {
    const { error } = await this.sb.auth.signInWithPassword({ email, password });
    if (error) {
      if (/invalid/i.test(error.message)) throw new ApiError("Incorrect email or password.");
      fail(error);
    }
    const admin = await this.getAdminUser();
    if (!admin) {
      await this.sb.auth.signOut();
      throw new ApiError("This account doesn't have admin access.", { status: 403 });
    }
    return admin;
  }

  async signOut() {
    await this.sb.auth.signOut();
  }

  async sendPasswordReset(email: string) {
    const redirect = `${window.location.origin}${window.location.pathname.replace(/\/admin.*$/, "")}/admin/reset-password`;
    const { error } = await this.sb.auth.resetPasswordForEmail(email, { redirectTo: redirect });
    if (error) fail(error);
  }

  async updatePassword(password: string) {
    const { error } = await this.sb.auth.updateUser({ password });
    if (error) fail(error);
  }

  async updateAdminName(name: string) {
    const { data } = await this.sb.auth.getUser();
    if (!data.user) throw new ApiError("Not signed in.");
    const { error } = await this.sb.from("admin_profiles").update({ full_name: name }).eq("id", data.user.id);
    if (error) fail(error);
  }

  // ---------------------------------------------------------- publications
  async listAdminPublications(): Promise<AdminPublicationRow[]> {
    const { data, error } = await this.sb.from("admin_publication_overview").select("*").order("updated_at", { ascending: false });
    if (error) fail(error);
    return data as AdminPublicationRow[];
  }

  async getAdminPublication(id: string): Promise<PublicationDetail | null> {
    const { data, error } = await this.sb
      .from("publications")
      .select(`${PUB_SELECT}, settings:publication_settings(*), seo:publication_seo(*)`)
      .eq("id", id)
      .maybeSingle();
    if (error) fail(error);
    return data ? normalizeDetail(data) : null;
  }

  async isSlugAvailable(slug: string, excludeId?: string) {
    let q = this.sb.from("publications").select("id").eq("slug", slug).limit(1);
    if (excludeId) q = q.neq("id", excludeId);
    const { data, error } = await q;
    if (error) fail(error);
    return (data ?? []).length === 0;
  }

  async uploadPdf(publicationId: string, file: File, onProgress?: UploadProgress): Promise<string> {
    const safe = file.name.toLowerCase().replace(/[^a-z0-9.]+/g, "-").replace(/-+/g, "-");
    const path = `${publicationId}/${Date.now()}-${safe.endsWith(".pdf") ? safe : safe + ".pdf"}`;
    await this.xhrUpload(PDF_BUCKET, path, file, "application/pdf", onProgress);
    return path;
  }

  async uploadImage(publicationId: string, blob: Blob, kind: "cover" | "og"): Promise<string> {
    const ext = blob.type === "image/png" ? "png" : blob.type === "image/jpeg" ? "jpg" : "webp";
    const path = `${publicationId}/${kind}-${Date.now()}.${ext}`;
    const { error } = await this.sb.storage.from(COVER_BUCKET).upload(path, blob, { contentType: blob.type || "image/webp", cacheControl: "31536000", upsert: false });
    if (error) throw new ApiError(`Image upload failed: ${error.message}`);
    return path;
  }

  async uploadCategoryImage(blob: Blob): Promise<string> {
    return this.uploadImage(`categories`, blob, "cover");
  }

  /** Upload via XHR so we can report progress (supabase-js upload has no progress events). */
  private async xhrUpload(bucket: string, path: string, body: Blob, contentType: string, onProgress?: UploadProgress) {
    const { data } = await this.sb.auth.getSession();
    const token = data.session?.access_token;
    if (!token) throw new ApiError("Your session has expired. Please sign in again.", { status: 401 });
    const url = `${SUPABASE_URL}/storage/v1/object/${bucket}/${path.split("/").map(encodeURIComponent).join("/")}`;
    await new Promise<void>((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open("POST", url);
      xhr.setRequestHeader("Authorization", `Bearer ${token}`);
      xhr.setRequestHeader("apikey", SUPABASE_ANON_KEY);
      xhr.setRequestHeader("Content-Type", contentType);
      xhr.setRequestHeader("x-upsert", "false");
      xhr.setRequestHeader("cache-control", "max-age=3600");
      xhr.upload.onprogress = (e) => e.lengthComputable && onProgress?.(e.loaded / e.total);
      xhr.onload = () => {
        if (xhr.status >= 200 && xhr.status < 300) return resolve();
        let msg = `Upload failed (${xhr.status}).`;
        try {
          const b = JSON.parse(xhr.responseText);
          msg = b.message || b.error || msg;
        } catch {
          /* ignore */
        }
        if (xhr.status === 413) msg = "The file is larger than the storage limit.";
        reject(new ApiError(msg, { status: xhr.status }));
      };
      xhr.onerror = () => reject(new ApiError("Network error during upload. Please retry."));
      xhr.send(body);
    });
    onProgress?.(1);
  }

  async removeFiles(paths: { pdf?: (string | null)[]; images?: (string | null)[] }) {
    const pdf = (paths.pdf ?? []).filter(Boolean) as string[];
    const images = (paths.images ?? []).filter((p): p is string => !!p && !/^https?:/.test(p));
    if (pdf.length) await this.sb.storage.from(PDF_BUCKET).remove(pdf);
    if (images.length) await this.sb.storage.from(COVER_BUCKET).remove(images);
  }

  async savePublication(input: PublicationInput): Promise<PublicationDetail> {
    const { settings, seo, ...pub } = input;
    const { data: { user } } = await this.sb.auth.getUser();
    const existing = await this.sb.from("publications").select("id").eq("id", pub.id).maybeSingle();
    const row = { ...pub, ...(existing.data ? {} : { created_by: user?.id ?? null }) };
    const { error } = await this.sb.from("publications").upsert(row, { onConflict: "id" });
    if (error) fail(error);
    const [s, o] = await Promise.all([
      this.sb.from("publication_settings").upsert({ publication_id: pub.id, ...settings }, { onConflict: "publication_id" }),
      this.sb.from("publication_seo").upsert({ publication_id: pub.id, ...seo }, { onConflict: "publication_id" }),
    ]);
    if (s.error) fail(s.error);
    if (o.error) fail(o.error);
    const saved = await this.getAdminPublication(pub.id);
    if (!saved) throw new ApiError("Saved, but the publication could not be reloaded.");
    return saved;
  }

  async setPublicationStatus(id: string, status: PublicationStatus, publishedAt?: string | null) {
    const patch: Record<string, unknown> = { status };
    if (status === "published") patch.published_at = publishedAt ?? new Date().toISOString();
    const { error } = await this.sb.from("publications").update(patch).eq("id", id);
    if (error) fail(error);
  }

  async duplicatePublication(id: string): Promise<PublicationDetail> {
    const src = await this.getAdminPublication(id);
    if (!src) throw new ApiError("Publication not found.");
    const newId = uuid();
    const copy = async (bucket: string, path: string | null) => {
      if (!path || /^https?:/.test(path)) return path;
      const target = `${newId}/${path.split("/").pop()}`;
      const { error } = await this.sb.storage.from(bucket).copy(path, target);
      if (error) throw new ApiError(`Could not copy file: ${error.message}`);
      return target;
    };
    let slug = `${src.slug}-copy`;
    for (let i = 2; !(await this.isSlugAvailable(slug)); i++) slug = `${src.slug}-copy-${i}`;
    const { category: _c, created_at: _ca, updated_at: _u, ...rest } = src;
    return this.savePublication({
      ...rest,
      id: newId,
      slug,
      title: `${src.title} (Copy)`,
      status: "draft",
      is_featured: false,
      published_at: null,
      pdf_storage_path: await copy(PDF_BUCKET, src.pdf_storage_path),
      cover_image_path: await copy(COVER_BUCKET, src.cover_image_path),
      seo: { ...src.seo, og_image_path: await copy(COVER_BUCKET, src.seo.og_image_path) },
    });
  }

  async deletePublication(id: string) {
    const pub = await this.getAdminPublication(id);
    if (!pub) return;
    const { error } = await this.sb.from("publications").delete().eq("id", id);
    if (error) fail(error);
    // Files are removed only after the row is gone, so a failed delete never orphans the record.
    await this.removeFiles({ pdf: [pub.pdf_storage_path], images: [pub.cover_image_path, pub.seo.og_image_path] }).catch(() => undefined);
  }

  async getAdminPdfSource(path: string): Promise<ReaderSource> {
    const { data, error } = await this.sb.storage.from(PDF_BUCKET).createSignedUrl(path, 600);
    if (error || !data) throw new ApiError("Could not open the PDF preview.");
    return { url: data.signedUrl };
  }

  // ------------------------------------------------------------ categories
  async listCategories(): Promise<Category[]> {
    const { data, error } = await this.sb.from("category_overview").select("*").order("display_order").order("name");
    if (error) fail(error);
    return data as Category[];
  }

  async saveCategory(input: Partial<Category> & { name: string; slug: string }): Promise<Category> {
    const { publication_count: _pc, created_at: _c, updated_at: _u, ...row } = input;
    const { data, error } = await this.sb.from("categories").upsert({ ...row, id: row.id ?? uuid() }, { onConflict: "id" }).select().single();
    if (error) {
      if (error.code === "23505") throw new ApiError("A category with this slug already exists.", { fields: { slug: "Slug already in use." } });
      fail(error);
    }
    return data as Category;
  }

  async deleteCategory(id: string, reassignTo?: string) {
    if (reassignTo) {
      const { error } = await this.sb.from("publications").update({ category_id: reassignTo }).eq("category_id", id);
      if (error) fail(error);
    }
    const { error } = await this.sb.from("categories").delete().eq("id", id);
    if (error) {
      if (error.code === "23503") throw new ApiError("Reassign this category's publications before deleting it.");
      fail(error);
    }
  }

  // ------------------------------------------------------------------ leads
  private leadQuery(filter: LeadFilter, count = false) {
    let q = this.sb.from("lead_downloads").select("*", count ? { count: "exact" } : undefined);
    const s = filter.search?.trim();
    if (s) {
      const v = `%${escapeLike(s)}%`;
      q = q.or(`full_name.ilike.${v},email.ilike.${v},company.ilike.${v},publication_title.ilike.${v}`);
    }
    if (filter.publicationId) q = q.eq("publication_id", filter.publicationId);
    if (filter.from) q = q.gte("last_downloaded_at", filter.from);
    if (filter.to) q = q.lt("last_downloaded_at", filter.to);
    if (filter.consent === "yes") q = q.eq("marketing_consent", true);
    if (filter.consent === "no") q = q.eq("marketing_consent", false);
    return q.order("last_downloaded_at", { ascending: filter.sort === "oldest" });
  }

  async listLeadDownloads(filter: LeadFilter) {
    const page = filter.page ?? 1;
    const size = filter.pageSize ?? 25;
    const { data, error, count } = await this.leadQuery(filter, true).range((page - 1) * size, page * size - 1);
    if (error) fail(error);
    return { rows: (data ?? []) as LeadDownloadRow[], total: count ?? 0 };
  }

  async exportLeadDownloads(filter: LeadFilter) {
    const out: LeadDownloadRow[] = [];
    const size = 1000;
    for (let from = 0; ; from += size) {
      const { data, error } = await this.leadQuery(filter).range(from, from + size - 1);
      if (error) fail(error);
      out.push(...((data ?? []) as LeadDownloadRow[]));
      if (!data || data.length < size) break;
    }
    return out;
  }

  async getLeadDetail(leadId: string): Promise<LeadDetail | null> {
    const [{ data: lead, error }, { data: dls, error: e2 }] = await Promise.all([
      this.sb.from("leads").select("*").eq("id", leadId).maybeSingle(),
      this.sb.from("downloads").select("id, publication_id, publication_title, downloaded_at, publications(title)").eq("lead_id", leadId).order("downloaded_at", { ascending: false }),
    ]);
    if (error) fail(error);
    if (e2) fail(e2);
    if (!lead) return null;
    return {
      lead,
      downloads: (dls ?? []).map((d) => ({
        id: d.id,
        publication_id: d.publication_id,
        downloaded_at: d.downloaded_at,
        publication_title: one(d.publications as { title: string } | { title: string }[] | null)?.title ?? d.publication_title,
      })),
    };
  }

  // ------------------------------------------------------------- books (public)
  private normalizeBook(r: Record<string, unknown>): Book {
    return { ...(r as unknown as Book), category: one(r.category as Book["category"]), links: (r.links as PurchaseLink[] | null) ?? [] };
  }

  async listPublicBooks(): Promise<Book[]> {
    const { data, error } = await this.sb
      .from("books")
      .select("*, category:book_categories(id,name,slug), links:book_purchase_links(*)")
      .eq("status", "published")
      .lte("published_at", new Date().toISOString())
      .order("published_at", { ascending: false });
    if (error) fail(error);
    return (data ?? []).map((r) => this.normalizeBook(r));
  }

  async getPublicBook(slug: string): Promise<Book | null> {
    const { data, error } = await this.sb
      .from("books")
      .select("*, category:book_categories(id,name,slug), links:book_purchase_links(*)")
      .eq("slug", slug)
      .eq("status", "published")
      .lte("published_at", new Date().toISOString())
      .maybeSingle();
    if (error) fail(error);
    return data ? this.normalizeBook(data) : null;
  }

  async listPublicBookCategories(): Promise<BookCategory[]> {
    const { data, error } = await this.sb.from("book_categories").select("*").eq("status", "active").order("display_order");
    if (error) fail(error);
    return data as BookCategory[];
  }

  async getPlacementBooks(key: PlacementKey, opts: { publicationId?: string; excludeBookId?: string; categoryId?: string | null } = {}) {
    const [p, r, books] = await Promise.all([
      this.sb.from("promotional_placements").select("*").eq("placement_key", key).maybeSingle(),
      this.sb.from("publication_book_recommendations").select("*").eq("placement", key),
      this.listPublicBooks(),
    ]);
    if (p.error) fail(p.error);
    if (r.error) fail(r.error);
    return resolvePlacement(p.data as Placement | null, (r.data ?? []) as Recommendation[], books, opts);
  }

  async trackBookEvent(bookId: string, type: BookEventType, opts: { surface?: EventSurface; linkId?: string; publicationId?: string } = {}) {
    await this.sb.from("book_events").insert({
      book_id: bookId,
      event_type: type,
      placement: opts.surface ?? null,
      purchase_link_id: opts.linkId ?? null,
      publication_id: opts.publicationId ?? null,
      session_id: sessionId(),
    });
  }

  // -------------------------------------------------------------- books (admin)
  async listAdminBooks(): Promise<AdminBookRow[]> {
    const { data, error } = await this.sb.from("admin_book_overview").select("*").order("updated_at", { ascending: false });
    if (error) fail(error);
    return data as AdminBookRow[];
  }

  async getAdminBook(id: string): Promise<Book | null> {
    const { data, error } = await this.sb.from("books").select("*, category:book_categories(id,name,slug), links:book_purchase_links(*)").eq("id", id).maybeSingle();
    if (error) fail(error);
    if (!data) return null;
    const b = this.normalizeBook(data);
    b.links = (b.links ?? []).sort((a, z) => a.display_order - z.display_order);
    return b;
  }

  async isBookSlugAvailable(slug: string, excludeId?: string) {
    let q = this.sb.from("books").select("id").eq("slug", slug).limit(1);
    if (excludeId) q = q.neq("id", excludeId);
    const { data, error } = await q;
    if (error) fail(error);
    return (data ?? []).length === 0;
  }

  async saveBook(input: BookInput): Promise<Book> {
    const { links, ...book } = input;
    const { error } = await this.sb.from("books").upsert(book, { onConflict: "id" });
    if (error) fail(error);
    // Replace links: remove deleted ones, clear primaries, then upsert (one primary per book).
    const keep = links.map((l) => l.id);
    const del = this.sb.from("book_purchase_links").delete().eq("book_id", book.id);
    const { error: dErr } = keep.length ? await del.not("id", "in", `(${keep.join(",")})`) : await del;
    if (dErr) fail(dErr);
    if (links.length) {
      const { error: cErr } = await this.sb.from("book_purchase_links").update({ is_primary: false }).eq("book_id", book.id);
      if (cErr) fail(cErr);
      const rows = links.map((l, i) => ({ ...l, book_id: book.id, display_order: i, created_at: undefined, updated_at: undefined }));
      const { error: uErr } = await this.sb.from("book_purchase_links").upsert(rows, { onConflict: "id" });
      if (uErr) {
        if (uErr.code === "23514") throw new ApiError("One of the purchase links isn't a valid https Amazon URL.");
        fail(uErr);
      }
    }
    const saved = await this.getAdminBook(book.id);
    if (!saved) throw new ApiError("Saved, but the book could not be reloaded.");
    return saved;
  }

  async setBookStatus(id: string, status: PublicationStatus) {
    const patch: Record<string, unknown> = { status };
    if (status === "published") patch.published_at = new Date().toISOString();
    const { error } = await this.sb.from("books").update(patch).eq("id", id);
    if (error) {
      if (error.code === "23514") throw new ApiError("Add a short description before publishing this book.");
      fail(error);
    }
  }

  async setBookFeatured(id: string, featured: boolean) {
    const { error } = await this.sb.from("books").update({ is_featured: featured }).eq("id", id);
    if (error) fail(error);
  }

  async duplicateBook(id: string): Promise<Book> {
    const src = await this.getAdminBook(id);
    if (!src) throw new ApiError("Book not found.");
    let slug = `${src.slug}-copy`;
    for (let i = 2; !(await this.isBookSlugAvailable(slug)); i++) slug = `${src.slug}-copy-${i}`;
    const { category: _c, created_at: _ca, updated_at: _u, links, ...rest } = src;
    const newId = uuid();
    return this.saveBook({ ...rest, id: newId, slug, title: `${src.title} (Copy)`, status: "draft", published_at: null, is_featured: false, links: (links ?? []).map((l) => ({ ...l, id: uuid(), book_id: newId })) });
  }

  async deleteBook(id: string) {
    const b = await this.getAdminBook(id);
    const { error } = await this.sb.from("books").delete().eq("id", id);
    if (error) fail(error);
    if (b) await this.removeFiles({ images: [b.cover_image_path, b.og_image_path] }).catch(() => undefined);
  }

  async listBookCategories(): Promise<BookCategory[]> {
    const { data, error } = await this.sb.from("book_category_overview").select("*").order("display_order").order("name");
    if (error) fail(error);
    return data as BookCategory[];
  }

  async saveBookCategory(input: Partial<BookCategory> & { name: string; slug: string }) {
    const { book_count: _b, created_at: _c, updated_at: _u, ...row } = input;
    const { data, error } = await this.sb.from("book_categories").upsert({ ...row, id: row.id ?? uuid() }, { onConflict: "id" }).select().single();
    if (error) {
      if (error.code === "23505") throw new ApiError("A category with this slug already exists.", { fields: { slug: "Slug already in use." } });
      fail(error);
    }
    return data as BookCategory;
  }

  async deleteBookCategory(id: string, reassignTo?: string) {
    if (reassignTo) {
      const { error } = await this.sb.from("books").update({ category_id: reassignTo }).eq("category_id", id);
      if (error) fail(error);
    }
    const { error } = await this.sb.from("book_categories").delete().eq("id", id);
    if (error) {
      if (error.code === "23503") throw new ApiError("Reassign this category's books before deleting it.");
      fail(error);
    }
  }

  async listRecommendations(): Promise<Recommendation[]> {
    const { data, error } = await this.sb.from("publication_book_recommendations").select("*").order("placement").order("display_order");
    if (error) fail(error);
    return data as Recommendation[];
  }

  async saveRecommendation(input: Partial<Recommendation> & { book_id: string; placement: PlacementKey }) {
    const { created_at: _c, ...row } = input;
    const { data, error } = await this.sb.from("publication_book_recommendations").upsert({ ...row, id: row.id ?? uuid() }, { onConflict: "id" }).select().single();
    if (error) {
      if (error.code === "23505") throw new ApiError("This book is already recommended in that placement for this publication.");
      fail(error);
    }
    return data as Recommendation;
  }

  async deleteRecommendation(id: string) {
    const { error } = await this.sb.from("publication_book_recommendations").delete().eq("id", id);
    if (error) fail(error);
  }

  async listPlacements(): Promise<Placement[]> {
    const { data, error } = await this.sb.from("promotional_placements").select("*");
    if (error) fail(error);
    return data as Placement[];
  }

  async savePlacement(p: Placement, globalRecs: Recommendation[]) {
    const { error } = await this.sb.from("promotional_placements").update({ heading: p.heading, description: p.description, max_books: p.max_books, is_active: p.is_active }).eq("placement_key", p.placement_key);
    if (error) fail(error);
    // Global (placement-level) selection = recommendations with no publication.
    // Kept rules are updated in place so their campaign dates and priority survive.
    const keep = globalRecs.map((r) => r.id);
    let del = this.sb.from("publication_book_recommendations").delete().eq("placement", p.placement_key).is("publication_id", null);
    if (keep.length) del = del.not("id", "in", `(${keep.join(",")})`);
    const { error: dErr } = await del;
    if (dErr) fail(dErr);
    if (globalRecs.length) {
      const rows = globalRecs.map((r, i) => {
        const { created_at: _c, ...rest } = r;
        return { ...rest, publication_id: null, placement: p.placement_key, display_order: i };
      });
      const { error: uErr } = await this.sb.from("publication_book_recommendations").upsert(rows, { onConflict: "id" });
      if (uErr) fail(uErr);
    }
  }

  async listAllPurchaseLinks() {
    const [{ data: links, error }, counts] = await Promise.all([
      this.sb.from("book_purchase_links").select("*, book:books(title,slug,status)").order("updated_at", { ascending: false }),
      this.linkClickCounts(),
    ]);
    if (error) fail(error);
    return (links ?? []).map((l) => {
      const b = one(l.book as { title: string; slug: string; status: PublicationStatus } | null);
      const { book: _b, ...rest } = l;
      return { ...(rest as PurchaseLink), book_title: b?.title ?? "—", book_slug: b?.slug ?? "", book_status: b?.status ?? "draft", clicks: counts.get(l.id) ?? 0 };
    });
  }

  private async linkClickCounts(): Promise<Map<string, number>> {
    const a = await this.getBookAnalytics(new Date(0), new Date(Date.now() + 60_000));
    return new Map(a.links.map((l) => [l.id, l.clicks]));
  }

  async setPurchaseLinkStatus(id: string, status: "active" | "inactive") {
    const { error } = await this.sb.from("book_purchase_links").update({ status }).eq("id", id);
    if (error) fail(error);
  }

  async getBookAnalytics(from: Date, to: Date): Promise<BookAnalytics> {
    const { data, error } = await this.sb.rpc("admin_book_analytics", { p_from: from.toISOString(), p_to: to.toISOString(), p_tz: localTz() });
    if (error) fail(error);
    return data as BookAnalytics;
  }

  // -------------------------------------------------------------- analytics
  async getAnalytics(from: Date, to: Date): Promise<AnalyticsResult> {
    const { data, error } = await this.sb.rpc("admin_analytics", { p_from: from.toISOString(), p_to: to.toISOString(), p_tz: localTz() });
    if (error) fail(error);
    return data as AnalyticsResult;
  }

  async updateSiteSettings(patch: Partial<SiteSettings>) {
    const { error } = await this.sb.from("site_settings").update(patch).eq("id", 1);
    if (error) fail(error);
    return this.getSiteSettings();
  }
}
