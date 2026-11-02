import { createStore, get, set, del } from "idb-keyval";
import type { DataApi, UploadProgress } from "./api";
import { buildSeed, DEMO_VERSION, type DemoDb, type DemoEvent } from "./demo-seed";
import {
  ApiError,
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
  type ReaderSource,
  type SiteSettings,
  type VisitorEvent,
} from "@/lib/types";
import { ASSET_BASE, DEMO_PAGE_IMAGES } from "@/lib/config";
import { EMAIL_RE, sessionId, toDateInput, uuid } from "@/lib/utils";
import type { AdminBookRow, Book, BookAnalytics, BookCategory, BookEventType, BookInput, EventSurface, Placement, PlacementKey, Recommendation } from "@/lib/books";
import { checkAmazonUrl } from "@/lib/books";
import { resolvePlacement } from "@/lib/placements";

/**
 * In-browser implementation of the data contract. Records live in IndexedDB
 * (falls back to memory when storage is unavailable), uploaded files are kept
 * as Blobs, and every metric is computed from the stored event rows — the same
 * logic as the `admin_analytics` SQL function.
 */

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const latency = () => sleep(120 + Math.random() * 180);

let store: ReturnType<typeof createStore> | null = null;
const memory = new Map<string, unknown>();
async function kvGet<T>(key: string): Promise<T | undefined> {
  try {
    store ??= createStore("digital-library-demo", "kv");
    return (await get<T>(key, store)) ?? (memory.get(key) as T | undefined);
  } catch {
    return memory.get(key) as T | undefined;
  }
}
async function kvSet(key: string, value: unknown) {
  memory.set(key, value);
  try {
    store ??= createStore("digital-library-demo", "kv");
    await set(key, value, store);
  } catch {
    /* memory only */
  }
}
async function kvDel(key: string) {
  memory.delete(key);
  try {
    store ??= createStore("digital-library-demo", "kv");
    await del(key, store);
  } catch {
    /* ignore */
  }
}

function assetUrl(rel: string) {
  return new URL(ASSET_BASE + rel, window.location.href).toString();
}

const SESSION_KEY = "dl_demo_admin";

export class DemoApi implements DataApi {
  readonly mode = "demo" as const;
  private db!: DemoDb;
  private ready: Promise<void>;
  private blobUrls = new Map<string, string>();
  private listeners = new Set<() => void>();
  private signedIn = false;

  constructor() {
    try {
      this.signedIn = sessionStorage.getItem(SESSION_KEY) === "1";
    } catch {
      /* ignore */
    }
    this.ready = this.init();
  }

  private async init() {
    const saved = await kvGet<DemoDb>("db");
    this.db = saved && saved.version === DEMO_VERSION ? saved : buildSeed();
    if (!saved || saved.version !== DEMO_VERSION) await this.persist();
    // Pre-create object URLs for uploaded images so coverUrl() can stay synchronous.
    const imagePaths = new Set<string>();
    for (const p of this.db.publications) {
      if (p.cover_image_path?.startsWith("idb:")) imagePaths.add(p.cover_image_path);
      if (p.seo.og_image_path?.startsWith("idb:")) imagePaths.add(p.seo.og_image_path);
    }
    for (const c of this.db.categories) if (c.image_path?.startsWith("idb:")) imagePaths.add(c.image_path);
    for (const b of this.db.books) {
      if (b.cover_image_path?.startsWith("idb:")) imagePaths.add(b.cover_image_path);
      if (b.og_image_path?.startsWith("idb:")) imagePaths.add(b.og_image_path);
    }
    await Promise.all(
      [...imagePaths].map(async (path) => {
        const blob = await kvGet<Blob>(path);
        if (blob) this.blobUrls.set(path, URL.createObjectURL(blob));
      }),
    );
  }

  private async persist() {
    await kvSet("db", this.db);
  }

  private async load() {
    await this.ready;
    return this.db;
  }

  /** Reset the demo to its seeded state (used from Settings). */
  async resetDemo() {
    const db = await this.load();
    const paths = [...db.publications.flatMap((p) => [p.pdf_storage_path, p.cover_image_path, p.seo.og_image_path]), ...db.books.flatMap((b) => [b.cover_image_path, b.og_image_path])].filter((p): p is string => !!p?.startsWith("idb:"));
    await Promise.all(paths.map(kvDel));
    this.db = buildSeed();
    await this.persist();
  }

  private isLive(p: Publication) {
    return p.status === "published" && !!p.published_at && new Date(p.published_at) <= new Date();
  }

  private withCategory<T extends Publication>(p: T): T {
    const c = this.db.categories.find((x) => x.id === p.category_id);
    return { ...p, category: c ? { id: c.id, name: c.name, slug: c.slug } : null };
  }

  // ---------------------------------------------------------------- public
  async getSiteSettings(): Promise<SiteSettings> {
    return structuredClone((await this.load()).site);
  }

  async listPublicCategories() {
    const db = await this.load();
    return db.categories.filter((c) => c.status === "active").sort((a, b) => a.display_order - b.display_order);
  }

  async listPublicPublications(): Promise<Publication[]> {
    const db = await this.load();
    await latency();
    return db.publications
      .filter((p) => this.isLive(p))
      .map((p) => this.withCategory(p))
      .map((p) => ({ ...p, category: p.category && db.categories.find((c) => c.id === p.category_id)?.status === "active" ? p.category : null }))
      .sort((a, b) => (b.published_at ?? "").localeCompare(a.published_at ?? ""));
  }

  async getPublicPublication(slug: string) {
    const db = await this.load();
    await latency();
    const p = db.publications.find((x) => x.slug === slug && this.isLive(x));
    return p ? structuredClone(this.withCategory(p)) : null;
  }

  async getReaderSource(publication: PublicationDetail): Promise<ReaderSource> {
    return this.resolvePdf(publication.pdf_storage_path);
  }

  private async resolvePdf(path: string | null): Promise<ReaderSource> {
    if (!path) throw new ApiError("This publication has no PDF.");
    if (path.startsWith("sample:")) {
      if (DEMO_PAGE_IMAGES) {
        const slug = path.slice(7).replace(/\.pdf$/, "");
        const manifest = await this.pageManifest();
        const pages = manifest[slug];
        if (!pages) throw new ApiError("Pages for this publication are missing.");
        return { images: pages.map((p) => ({ ...p, url: assetUrl(`books/pages/${slug}/${p.file}`) })) };
      }
      return { url: assetUrl("books/" + path.slice(7)) };
    }
    const blob = await kvGet<Blob>(path);
    if (!blob) throw new ApiError("The PDF file could not be found.");
    return { url: URL.createObjectURL(blob) };
  }

  private manifestPromise: Promise<Record<string, { file: string; width: number; height: number }[]>> | null = null;
  private pageManifest() {
    this.manifestPromise ??= fetch(assetUrl("books/pages/manifest.json")).then((r) => {
      if (!r.ok) throw new ApiError("Page manifest missing.");
      return r.json();
    });
    return this.manifestPromise;
  }

  async trackEvent(publicationId: string, type: VisitorEvent) {
    const db = await this.load();
    const pub = db.publications.find((p) => p.id === publicationId);
    if (!pub || !this.isLive(pub)) return;
    db.events.push({ publication_id: publicationId, event_type: type, session_id: sessionId(), created_at: new Date().toISOString() });
    await this.persist();
  }

  async requestDownload(req: DownloadRequest): Promise<DownloadResult> {
    const db = await this.load();
    await sleep(500 + Math.random() * 400);
    if (req.website) throw new ApiError("Submission rejected.");
    const fields: Record<string, string> = {};
    const name = req.full_name?.trim().replace(/\s+/g, " ") ?? "";
    const email = req.email?.trim().toLowerCase() ?? "";
    if (name.length < 2) fields.full_name = "Please enter your full name.";
    if (!email) fields.email = "Please enter your work email.";
    else if (!EMAIL_RE.test(email)) fields.email = "Please enter a valid email address.";
    if (Object.keys(fields).length) throw new ApiError("Please check the highlighted fields.", { fields, status: 422 });

    const pub = db.publications.find((p) => p.id === req.publication_id);
    if (!pub || !this.isLive(pub)) throw new ApiError("This publication is not available.", { status: 404 });
    if (!pub.settings.download_enabled) throw new ApiError("Downloads are disabled for this publication.", { status: 403 });

    const recentByEmail = db.downloads.filter((d) => {
      const l = db.leads.find((x) => x.id === d.lead_id);
      return l?.email === email && Date.now() - new Date(d.downloaded_at).getTime() < 600_000;
    }).length;
    if (recentByEmail >= 6) throw new ApiError("Too many downloads for this email. Please try again later.", { status: 429 });

    const now = new Date().toISOString();
    db.events.push({ publication_id: pub.id, event_type: "download_form_submit", session_id: req.session_id, created_at: now });

    let lead = db.leads.find((l) => l.email === email);
    if (lead) {
      lead.full_name = name;
      lead.company = req.company?.trim() || lead.company;
      lead.designation = req.designation?.trim() || lead.designation;
      if (req.marketing_consent && !lead.marketing_consent) {
        lead.marketing_consent = true;
        lead.consent_at = now;
      }
    } else {
      lead = {
        id: uuid(),
        full_name: name,
        email,
        company: req.company?.trim() || null,
        designation: req.designation?.trim() || null,
        marketing_consent: req.marketing_consent,
        consent_at: req.marketing_consent ? now : null,
        created_at: now,
      };
      db.leads.push(lead);
    }

    const leadId = lead.id;
    const duplicate = db.downloads.some((d) => d.lead_id === leadId && d.publication_id === pub.id && Date.now() - new Date(d.downloaded_at).getTime() < 60_000);
    if (!duplicate) {
      db.downloads.push({ id: uuid(), lead_id: leadId, publication_id: pub.id, publication_title: pub.title, downloaded_at: now });
      db.events.push({ publication_id: pub.id, event_type: "download_success", session_id: req.session_id, created_at: now });
    }
    await this.persist();
    const src = await this.resolvePdf(pub.pdf_storage_path);
    // Static previews have no PDF to hand out; the dialog explains this.
    return { url: "url" in src ? src.url : "", filename: `${pub.slug}.pdf` };
  }

  coverUrl(path: string | null | undefined): string | null {
    if (!path) return null;
    if (path.startsWith("sample:")) return assetUrl("books/" + path.slice(7));
    if (path.startsWith("idb:")) return this.blobUrls.get(path) ?? null;
    return path;
  }

  // ------------------------------------------------------------------ auth
  async getAdminUser(): Promise<AdminUser | null> {
    const db = await this.load();
    if (!this.signedIn) return null;
    return { id: db.admin.id, email: db.admin.email, full_name: db.admin.full_name, role: db.admin.role };
  }

  onAuthChange(cb: () => void) {
    this.listeners.add(cb);
    return () => void this.listeners.delete(cb);
  }

  private setSignedIn(v: boolean) {
    this.signedIn = v;
    try {
      if (v) sessionStorage.setItem(SESSION_KEY, "1");
      else sessionStorage.removeItem(SESSION_KEY);
    } catch {
      /* ignore */
    }
    this.listeners.forEach((l) => l());
  }

  async signIn(email: string, password: string) {
    const db = await this.load();
    await sleep(400);
    if (email.trim().toLowerCase() !== db.admin.email || password !== db.admin.password) throw new ApiError("Incorrect email or password.");
    this.setSignedIn(true);
    return (await this.getAdminUser())!;
  }

  async signOut() {
    this.setSignedIn(false);
  }

  async sendPasswordReset(email: string) {
    await sleep(500);
    if (!EMAIL_RE.test(email)) throw new ApiError("Please enter a valid email address.");
  }

  async updatePassword(password: string) {
    const db = await this.load();
    if (password.length < 8) throw new ApiError("Password must be at least 8 characters.");
    db.admin.password = password;
    await this.persist();
  }

  async updateAdminName(name: string) {
    const db = await this.load();
    db.admin.full_name = name;
    await this.persist();
    this.listeners.forEach((l) => l());
  }

  private requireAdmin() {
    if (!this.signedIn) throw new ApiError("Your session has expired. Please sign in again.", { status: 401 });
  }

  // ---------------------------------------------------------- publications
  async listAdminPublications(): Promise<AdminPublicationRow[]> {
    const db = await this.load();
    this.requireAdmin();
    await latency();
    return db.publications
      .map((p) => ({
        ...this.withCategory(p),
        category_name: db.categories.find((c) => c.id === p.category_id)?.name ?? null,
        download_count: db.downloads.filter((d) => d.publication_id === p.id).length,
        view_count: db.events.filter((e) => e.publication_id === p.id && e.event_type === "publication_view").length,
      }))
      .sort((a, b) => b.updated_at.localeCompare(a.updated_at));
  }

  async getAdminPublication(id: string) {
    const db = await this.load();
    this.requireAdmin();
    const p = db.publications.find((x) => x.id === id);
    return p ? structuredClone(this.withCategory(p)) : null;
  }

  async isSlugAvailable(slug: string, excludeId?: string) {
    const db = await this.load();
    return !db.publications.some((p) => p.slug === slug && p.id !== excludeId);
  }

  async uploadPdf(publicationId: string, file: File, onProgress?: UploadProgress) {
    this.requireAdmin();
    for (let i = 1; i <= 10; i++) {
      await sleep(40 + file.size / 2_000_000);
      onProgress?.(i / 10);
    }
    const path = `idb:pdf/${publicationId}/${Date.now()}-${file.name.toLowerCase().replace(/[^a-z0-9.]+/g, "-")}`;
    try {
      await kvSet(path, file.slice(0, file.size, "application/pdf"));
    } catch {
      throw new ApiError("Storage upload failed — your browser may be out of space.");
    }
    return path;
  }

  async uploadImage(publicationId: string, blob: Blob, kind: "cover" | "og") {
    this.requireAdmin();
    const path = `idb:img/${publicationId}/${kind}-${Date.now()}`;
    await kvSet(path, blob);
    this.blobUrls.set(path, URL.createObjectURL(blob));
    return path;
  }

  async uploadCategoryImage(blob: Blob) {
    return this.uploadImage("categories", blob, "cover");
  }

  async removeFiles(paths: { pdf?: (string | null)[]; images?: (string | null)[] }) {
    const db = await this.load();
    const all = [...(paths.pdf ?? []), ...(paths.images ?? [])].filter((p): p is string => !!p?.startsWith("idb:"));
    for (const p of all) {
      // Never delete a blob another record still references (duplicates share files).
      const inUse =
        db.publications.some((x) => x.pdf_storage_path === p || x.cover_image_path === p || x.seo.og_image_path === p) ||
        db.categories.some((c) => c.image_path === p) ||
        db.books.some((b) => b.cover_image_path === p || b.og_image_path === p);
      if (inUse) continue;
      await kvDel(p);
      const u = this.blobUrls.get(p);
      if (u) URL.revokeObjectURL(u);
      this.blobUrls.delete(p);
    }
  }

  async savePublication(input: PublicationInput): Promise<PublicationDetail> {
    const db = await this.load();
    this.requireAdmin();
    await latency();
    if (db.publications.some((p) => p.slug === input.slug && p.id !== input.id))
      throw new ApiError("That URL slug is already in use.", { fields: { slug: "This slug is already in use." } });
    if (input.status === "published" && (!input.pdf_storage_path || !input.cover_image_path || !input.category_id || !input.published_at))
      throw new ApiError("A publication can only be published once its PDF, cover and category are in place.");
    const now = new Date().toISOString();
    const idx = db.publications.findIndex((p) => p.id === input.id);
    const record: PublicationDetail = {
      ...structuredClone(input),
      created_at: idx >= 0 ? db.publications[idx].created_at : now,
      updated_at: now,
    };
    if (idx >= 0) db.publications[idx] = record;
    else db.publications.push(record);
    await this.persist();
    return this.withCategory(structuredClone(record));
  }

  async setPublicationStatus(id: string, status: PublicationStatus, publishedAt?: string | null) {
    const db = await this.load();
    this.requireAdmin();
    const p = db.publications.find((x) => x.id === id);
    if (!p) throw new ApiError("Publication not found.");
    if (status === "published") {
      if (!p.pdf_storage_path || !p.cover_image_path || !p.category_id) throw new ApiError("A publication can only be published once its PDF, cover and category are in place.");
      p.published_at = publishedAt ?? new Date().toISOString();
    }
    p.status = status;
    p.updated_at = new Date().toISOString();
    await this.persist();
  }

  async duplicatePublication(id: string) {
    const db = await this.load();
    const src = db.publications.find((p) => p.id === id);
    if (!src) throw new ApiError("Publication not found.");
    let slug = `${src.slug}-copy`;
    for (let i = 2; db.publications.some((p) => p.slug === slug); i++) slug = `${src.slug}-copy-${i}`;
    const { created_at: _c, updated_at: _u, category: _cat, ...rest } = structuredClone(src);
    return this.savePublication({ ...rest, id: uuid(), slug, title: `${src.title} (Copy)`, status: "draft", is_featured: false, published_at: null });
  }

  async deletePublication(id: string) {
    const db = await this.load();
    this.requireAdmin();
    const p = db.publications.find((x) => x.id === id);
    if (!p) return;
    db.publications = db.publications.filter((x) => x.id !== id);
    db.events = db.events.filter((e) => e.publication_id !== id);
    db.downloads.forEach((d) => {
      if (d.publication_id === id) d.publication_id = null;
    });
    await this.persist();
    await this.removeFiles({ pdf: [p.pdf_storage_path], images: [p.cover_image_path, p.seo.og_image_path] });
  }

  async getAdminPdfSource(path: string) {
    return this.resolvePdf(path);
  }

  // ------------------------------------------------------------ categories
  async listCategories(): Promise<Category[]> {
    const db = await this.load();
    return db.categories
      .map((c) => ({ ...c, publication_count: db.publications.filter((p) => p.category_id === c.id).length }))
      .sort((a, b) => a.display_order - b.display_order || a.name.localeCompare(b.name));
  }

  async saveCategory(input: Partial<Category> & { name: string; slug: string }) {
    const db = await this.load();
    this.requireAdmin();
    await latency();
    if (db.categories.some((c) => c.slug === input.slug && c.id !== input.id))
      throw new ApiError("A category with this slug already exists.", { fields: { slug: "Slug already in use." } });
    const now = new Date().toISOString();
    const idx = db.categories.findIndex((c) => c.id === input.id);
    const { publication_count: _pc, ...clean } = input;
    const record: Category = {
      id: input.id ?? uuid(),
      description: null,
      image_path: null,
      display_order: db.categories.length + 1,
      status: "active",
      created_at: now,
      ...(idx >= 0 ? db.categories[idx] : {}),
      ...clean,
      updated_at: now,
    };
    if (idx >= 0) db.categories[idx] = record;
    else db.categories.push(record);
    await this.persist();
    return record;
  }

  async deleteCategory(id: string, reassignTo?: string) {
    const db = await this.load();
    this.requireAdmin();
    const assigned = db.publications.filter((p) => p.category_id === id);
    if (assigned.length && !reassignTo) throw new ApiError("Reassign this category's publications before deleting it.");
    assigned.forEach((p) => (p.category_id = reassignTo!));
    db.categories = db.categories.filter((c) => c.id !== id);
    await this.persist();
  }

  // ------------------------------------------------------------------ leads
  private leadRows(filter: LeadFilter): LeadDownloadRow[] {
    const db = this.db;
    const leadsById = new Map(db.leads.map((l) => [l.id, l]));
    const groups = new Map<string, LeadDownloadRow>();
    for (const d of db.downloads) {
      const lead = leadsById.get(d.lead_id);
      if (!lead) continue;
      const key = `${d.lead_id}|${d.publication_id ?? "deleted:" + d.publication_title}`;
      const g = groups.get(key);
      const title = db.publications.find((p) => p.id === d.publication_id)?.title ?? d.publication_title;
      if (!g) {
        groups.set(key, {
          lead_id: lead.id,
          full_name: lead.full_name,
          email: lead.email,
          company: lead.company,
          designation: lead.designation,
          marketing_consent: lead.marketing_consent,
          consent_at: lead.consent_at,
          lead_created_at: lead.created_at,
          publication_id: d.publication_id,
          publication_title: title,
          first_downloaded_at: d.downloaded_at,
          last_downloaded_at: d.downloaded_at,
          download_count: 1,
        });
      } else {
        g.download_count++;
        if (d.downloaded_at < g.first_downloaded_at) g.first_downloaded_at = d.downloaded_at;
        if (d.downloaded_at > g.last_downloaded_at) g.last_downloaded_at = d.downloaded_at;
      }
    }
    const s = filter.search?.trim().toLowerCase();
    let rows = [...groups.values()].filter((r) => {
      if (s && ![r.full_name, r.email, r.company ?? "", r.publication_title].some((v) => v.toLowerCase().includes(s))) return false;
      if (filter.publicationId && r.publication_id !== filter.publicationId) return false;
      if (filter.from && r.last_downloaded_at < filter.from) return false;
      if (filter.to && r.last_downloaded_at >= filter.to) return false;
      if (filter.consent === "yes" && !r.marketing_consent) return false;
      if (filter.consent === "no" && r.marketing_consent) return false;
      return true;
    });
    rows = rows.sort((a, b) => (filter.sort === "oldest" ? a.last_downloaded_at.localeCompare(b.last_downloaded_at) : b.last_downloaded_at.localeCompare(a.last_downloaded_at)));
    return rows;
  }

  async listLeadDownloads(filter: LeadFilter) {
    await this.load();
    this.requireAdmin();
    await latency();
    const rows = this.leadRows(filter);
    const page = filter.page ?? 1;
    const size = filter.pageSize ?? 25;
    return { rows: rows.slice((page - 1) * size, page * size), total: rows.length };
  }

  async exportLeadDownloads(filter: LeadFilter) {
    await this.load();
    this.requireAdmin();
    return this.leadRows(filter);
  }

  async getLeadDetail(leadId: string): Promise<LeadDetail | null> {
    const db = await this.load();
    const lead = db.leads.find((l) => l.id === leadId);
    if (!lead) return null;
    return {
      lead: structuredClone(lead),
      downloads: db.downloads
        .filter((d) => d.lead_id === leadId)
        .sort((a, b) => b.downloaded_at.localeCompare(a.downloaded_at))
        .map((d) => ({ id: d.id, publication_id: d.publication_id, downloaded_at: d.downloaded_at, publication_title: db.publications.find((p) => p.id === d.publication_id)?.title ?? d.publication_title })),
    };
  }

  // ------------------------------------------------------------- books (public)
  private bookIsLive(b: Book) {
    return b.status === "published" && !!b.published_at && new Date(b.published_at) <= new Date();
  }

  private hydrateBook(b: Book, publicView: boolean): Book {
    const c = this.db.bookCategories.find((x) => x.id === b.category_id);
    const links = this.db.links.filter((l) => l.book_id === b.id && (!publicView || l.status === "active")).sort((a, z) => a.display_order - z.display_order);
    return structuredClone({ ...b, category: c && (!publicView || c.status === "active") ? { id: c.id, name: c.name, slug: c.slug } : null, links });
  }

  async listPublicBooks(): Promise<Book[]> {
    const db = await this.load();
    return db.books.filter((b) => this.bookIsLive(b)).map((b) => this.hydrateBook(b, true)).sort((a, b) => (b.published_at ?? "").localeCompare(a.published_at ?? ""));
  }

  async getPublicBook(slug: string) {
    const db = await this.load();
    await latency();
    const b = db.books.find((x) => x.slug === slug && this.bookIsLive(x));
    return b ? this.hydrateBook(b, true) : null;
  }

  async listPublicBookCategories() {
    const db = await this.load();
    return db.bookCategories.filter((c) => c.status === "active").sort((a, b) => a.display_order - b.display_order);
  }

  async getPlacementBooks(key: PlacementKey, opts: { publicationId?: string; excludeBookId?: string; categoryId?: string | null } = {}) {
    const db = await this.load();
    const placement = db.placements.find((p) => p.placement_key === key) ?? null;
    return resolvePlacement(placement, db.recommendations, await this.listPublicBooks(), opts);
  }

  async trackBookEvent(bookId: string, type: BookEventType, opts: { surface?: EventSurface; linkId?: string; publicationId?: string } = {}) {
    const db = await this.load();
    const book = db.books.find((b) => b.id === bookId);
    if (!book || !this.bookIsLive(book)) return;
    const link = opts.linkId ? db.links.find((l) => l.id === opts.linkId && l.book_id === bookId) : undefined;
    db.bookEvents.push({
      id: uuid(), book_id: bookId, purchase_link_id: link?.id ?? null, event_type: type, session_id: sessionId(), placement: opts.surface ?? null,
      publication_id: opts.publicationId ?? null, marketplace: link?.marketplace ?? null, format: link?.format ?? null, created_at: new Date().toISOString(),
    });
    await this.persist();
  }

  // -------------------------------------------------------------- books (admin)
  async listAdminBooks(): Promise<AdminBookRow[]> {
    const db = await this.load();
    this.requireAdmin();
    await latency();
    return db.books
      .map((b) => {
        const links = db.links.filter((l) => l.book_id === b.id);
        return {
          ...this.hydrateBook(b, false),
          category_name: db.bookCategories.find((c) => c.id === b.category_id)?.name ?? null,
          link_count: links.length,
          active_link_count: links.filter((l) => l.status === "active").length,
          click_count: db.bookEvents.filter((e) => e.book_id === b.id && e.event_type === "amazon_link_click").length,
        };
      })
      .sort((a, b) => b.updated_at.localeCompare(a.updated_at));
  }

  async getAdminBook(id: string) {
    const db = await this.load();
    this.requireAdmin();
    const b = db.books.find((x) => x.id === id);
    return b ? this.hydrateBook(b, false) : null;
  }

  async isBookSlugAvailable(slug: string, excludeId?: string) {
    const db = await this.load();
    return !db.books.some((b) => b.slug === slug && b.id !== excludeId);
  }

  async saveBook(input: BookInput): Promise<Book> {
    const db = await this.load();
    this.requireAdmin();
    await latency();
    if (db.books.some((b) => b.slug === input.slug && b.id !== input.id)) throw new ApiError("That URL slug is already in use.", { fields: { slug: "This slug is already in use." } });
    if (input.status === "published" && (!input.short_description.trim() || !input.published_at)) throw new ApiError("Add a short description before publishing this book.");
    for (const l of input.links) if (!checkAmazonUrl(l.product_url).ok) throw new ApiError("One of the purchase links isn't a valid https Amazon URL.");
    if (input.links.filter((l) => l.is_primary).length > 1) throw new ApiError("Only one purchase link can be primary.");
    const { links, ...book } = structuredClone(input);
    const now = new Date().toISOString();
    const idx = db.books.findIndex((b) => b.id === book.id);
    const record: Book = { ...book, created_at: idx >= 0 ? db.books[idx].created_at : now, updated_at: now };
    if (idx >= 0) db.books[idx] = record;
    else db.books.push(record);
    db.links = db.links.filter((l) => l.book_id !== book.id).concat(links.map((l, i) => ({ ...l, book_id: book.id, display_order: i, updated_at: now, created_at: l.created_at ?? now })));
    await this.persist();
    return this.hydrateBook(record, false);
  }

  async setBookStatus(id: string, status: Book["status"]) {
    const db = await this.load();
    this.requireAdmin();
    const b = db.books.find((x) => x.id === id);
    if (!b) throw new ApiError("Book not found.");
    if (status === "published") {
      if (!b.short_description.trim()) throw new ApiError("Add a short description before publishing this book.");
      b.published_at = new Date().toISOString();
    }
    b.status = status;
    b.updated_at = new Date().toISOString();
    await this.persist();
  }

  async setBookFeatured(id: string, featured: boolean) {
    const db = await this.load();
    this.requireAdmin();
    const b = db.books.find((x) => x.id === id);
    if (!b) throw new ApiError("Book not found.");
    b.is_featured = featured;
    b.updated_at = new Date().toISOString();
    await this.persist();
  }

  async duplicateBook(id: string) {
    const db = await this.load();
    const src = db.books.find((b) => b.id === id);
    if (!src) throw new ApiError("Book not found.");
    let slug = `${src.slug}-copy`;
    for (let i = 2; db.books.some((b) => b.slug === slug); i++) slug = `${src.slug}-copy-${i}`;
    const newId = uuid();
    const { created_at: _c, updated_at: _u, category: _cat, links: _l, ...rest } = structuredClone(src);
    const links = db.links.filter((l) => l.book_id === id).map((l) => ({ ...structuredClone(l), id: uuid(), book_id: newId }));
    return this.saveBook({ ...rest, id: newId, slug, title: `${src.title} (Copy)`, status: "draft", published_at: null, is_featured: false, links });
  }

  async deleteBook(id: string) {
    const db = await this.load();
    this.requireAdmin();
    const b = db.books.find((x) => x.id === id);
    db.books = db.books.filter((x) => x.id !== id);
    db.links = db.links.filter((l) => l.book_id !== id);
    db.recommendations = db.recommendations.filter((r) => r.book_id !== id);
    db.bookEvents = db.bookEvents.filter((e) => e.book_id !== id);
    await this.persist();
    if (b) await this.removeFiles({ images: [b.cover_image_path, b.og_image_path] });
  }

  async listBookCategories(): Promise<BookCategory[]> {
    const db = await this.load();
    return db.bookCategories.map((c) => ({ ...c, book_count: db.books.filter((b) => b.category_id === c.id).length })).sort((a, b) => a.display_order - b.display_order || a.name.localeCompare(b.name));
  }

  async saveBookCategory(input: Partial<BookCategory> & { name: string; slug: string }) {
    const db = await this.load();
    this.requireAdmin();
    if (db.bookCategories.some((c) => c.slug === input.slug && c.id !== input.id)) throw new ApiError("A category with this slug already exists.", { fields: { slug: "Slug already in use." } });
    const idx = db.bookCategories.findIndex((c) => c.id === input.id);
    const { book_count: _bc, ...clean } = input;
    const now = new Date().toISOString();
    const record: BookCategory = { id: input.id ?? uuid(), description: null, display_order: db.bookCategories.length + 1, status: "active", created_at: now, ...(idx >= 0 ? db.bookCategories[idx] : {}), ...clean, updated_at: now };
    if (idx >= 0) db.bookCategories[idx] = record;
    else db.bookCategories.push(record);
    await this.persist();
    return record;
  }

  async deleteBookCategory(id: string, reassignTo?: string) {
    const db = await this.load();
    this.requireAdmin();
    const assigned = db.books.filter((b) => b.category_id === id);
    if (assigned.length && !reassignTo) throw new ApiError("Reassign this category's books before deleting it.");
    assigned.forEach((b) => (b.category_id = reassignTo!));
    db.bookCategories = db.bookCategories.filter((c) => c.id !== id);
    await this.persist();
  }

  async listRecommendations() {
    const db = await this.load();
    return structuredClone(db.recommendations);
  }

  async saveRecommendation(input: Partial<Recommendation> & { book_id: string; placement: PlacementKey }) {
    const db = await this.load();
    this.requireAdmin();
    const pub = input.publication_id ?? null;
    if (db.recommendations.some((r) => r.id !== input.id && r.book_id === input.book_id && r.placement === input.placement && r.publication_id === pub))
      throw new ApiError("This book is already recommended in that placement for this publication.");
    if (input.start_date && input.end_date && input.end_date <= input.start_date) throw new ApiError("The end date must be after the start date.");
    const idx = db.recommendations.findIndex((r) => r.id === input.id);
    const record: Recommendation = {
      id: input.id ?? uuid(), publication_id: pub, book_id: input.book_id, placement: input.placement, priority: input.priority ?? 0, display_order: input.display_order ?? 0,
      is_featured: input.is_featured ?? false, is_active: input.is_active ?? true, start_date: input.start_date ?? null, end_date: input.end_date ?? null,
      created_at: idx >= 0 ? db.recommendations[idx].created_at : new Date().toISOString(),
    };
    if (idx >= 0) db.recommendations[idx] = record;
    else db.recommendations.push(record);
    await this.persist();
    return record;
  }

  async deleteRecommendation(id: string) {
    const db = await this.load();
    this.requireAdmin();
    db.recommendations = db.recommendations.filter((r) => r.id !== id);
    await this.persist();
  }

  async listPlacements() {
    const db = await this.load();
    return structuredClone(db.placements);
  }

  async savePlacement(p: Placement, globalRecs: Recommendation[]) {
    const db = await this.load();
    this.requireAdmin();
    const idx = db.placements.findIndex((x) => x.placement_key === p.placement_key);
    if (idx >= 0) db.placements[idx] = { ...db.placements[idx], heading: p.heading, description: p.description, max_books: p.max_books, is_active: p.is_active };
    db.recommendations = db.recommendations
      .filter((r) => !(r.placement === p.placement_key && r.publication_id === null))
      .concat(globalRecs.map((r, i) => ({ ...structuredClone(r), publication_id: null, placement: p.placement_key, display_order: i })));
    await this.persist();
  }

  async listAllPurchaseLinks() {
    const db = await this.load();
    this.requireAdmin();
    return db.links.map((l) => {
      const b = db.books.find((x) => x.id === l.book_id);
      return { ...structuredClone(l), book_title: b?.title ?? "—", book_slug: b?.slug ?? "", book_status: b?.status ?? ("draft" as const), clicks: db.bookEvents.filter((e) => e.purchase_link_id === l.id && e.event_type === "amazon_link_click").length };
    });
  }

  async setPurchaseLinkStatus(id: string, status: "active" | "inactive") {
    const db = await this.load();
    this.requireAdmin();
    const l = db.links.find((x) => x.id === id);
    if (!l) throw new ApiError("Link not found.");
    l.status = status;
    await this.persist();
  }

  async getBookAnalytics(from: Date, to: Date): Promise<BookAnalytics> {
    const db = await this.load();
    this.requireAdmin();
    await latency();
    const f = from.toISOString();
    const t = to.toISOString();
    const ev = db.bookEvents.filter((e) => e.created_at >= f && e.created_at < t);
    const cnt = (list: typeof ev, type: BookEventType) => list.filter((e) => e.event_type === type).length;
    const clicks = ev.filter((e) => e.event_type === "amazon_link_click");
    const group = (key: (e: (typeof ev)[number]) => string | null) => {
      const m = new Map<string, number>();
      for (const e of clicks) m.set(key(e) ?? "unknown", (m.get(key(e) ?? "unknown") ?? 0) + 1);
      return [...m.entries()].map(([k, c]) => ({ key: k, clicks: c })).sort((a, b) => b.clicks - a.clicks);
    };
    const daily: BookAnalytics["daily"] = [];
    for (let d = new Date(from); d < to; d.setDate(d.getDate() + 1)) {
      const key = toDateInput(d);
      const day = ev.filter((e) => toDateInput(new Date(e.created_at)) === key);
      daily.push({ date: key, impressions: cnt(day, "book_impression"), detail_views: cnt(day, "book_detail_view"), clicks: cnt(day, "amazon_link_click") });
    }
    const placements = new Map<string, { impressions: number; clicks: number }>();
    for (const e of ev) {
      const k = e.placement ?? "unknown";
      const v = placements.get(k) ?? { impressions: 0, clicks: 0 };
      if (e.event_type === "book_impression") v.impressions++;
      if (e.event_type === "amazon_link_click") v.clicks++;
      placements.set(k, v);
    }
    return {
      totals: { published_books: db.books.filter((b) => this.bookIsLive(b)).length, impressions: cnt(ev, "book_impression"), detail_views: cnt(ev, "book_detail_view"), clicks: clicks.length },
      daily,
      books: db.books
        .map((b) => {
          const be = ev.filter((e) => e.book_id === b.id);
          return { id: b.id, title: b.title, slug: b.slug, cover_image_path: b.cover_image_path, status: b.status, impressions: cnt(be, "book_impression"), detail_views: cnt(be, "book_detail_view"), clicks: cnt(be, "amazon_link_click") };
        })
        .sort((a, b) => b.clicks - a.clicks || b.detail_views - a.detail_views),
      links: db.links
        .map((l) => ({ id: l.id, book_id: l.book_id, book_title: db.books.find((b) => b.id === l.book_id)?.title ?? "—", display_label: l.display_label, marketplace: l.marketplace, format: l.format, clicks: clicks.filter((e) => e.purchase_link_id === l.id).length }))
        .sort((a, b) => b.clicks - a.clicks),
      marketplaces: group((e) => e.marketplace),
      formats: group((e) => e.format),
      placements: [...placements.entries()].map(([key, v]) => ({ key, ...v })).sort((a, b) => b.clicks - a.clicks || b.impressions - a.impressions),
    };
  }

  // -------------------------------------------------------------- analytics
  async getAnalytics(from: Date, to: Date): Promise<AnalyticsResult> {
    const db = await this.load();
    this.requireAdmin();
    await latency();
    const f = from.toISOString();
    const t = to.toISOString();
    const inRange = (iso: string) => iso >= f && iso < t;
    const ev = db.events.filter((e) => inRange(e.created_at));
    const dl = db.downloads.filter((d) => inRange(d.downloaded_at));
    const ld = db.leads.filter((l) => inRange(l.created_at));
    const dayKey = (iso: string) => toDateInput(new Date(iso));

    const days: AnalyticsResult["daily"] = [];
    const idx = new Map<string, AnalyticsResult["daily"][number]>();
    for (let d = new Date(from); d < to; d.setDate(d.getDate() + 1)) {
      const row = { date: toDateInput(d), views: 0, reader_opens: 0, downloads: 0, leads: 0 };
      days.push(row);
      idx.set(row.date, row);
    }
    for (const e of ev) {
      const r = idx.get(dayKey(e.created_at));
      if (!r) continue;
      if (e.event_type === "publication_view") r.views++;
      if (e.event_type === "reader_open") r.reader_opens++;
    }
    for (const d of dl) idx.get(dayKey(d.downloaded_at)) && idx.get(dayKey(d.downloaded_at))!.downloads++;
    for (const l of ld) idx.get(dayKey(l.created_at)) && idx.get(dayKey(l.created_at))!.leads++;

    const count = (list: DemoEvent[], type: DemoEvent["event_type"]) => list.filter((e) => e.event_type === type).length;
    const readers = (list: DemoEvent[]) => new Set(list.filter((e) => e.event_type === "reader_open").map((e) => e.session_id)).size;

    const leadsById = new Map(db.leads.map((l) => [l.id, l]));
    return {
      inventory: {
        total: db.publications.length,
        published: db.publications.filter((p) => p.status === "published").length,
        drafts: db.publications.filter((p) => p.status === "draft").length,
        unpublished: db.publications.filter((p) => p.status === "unpublished").length,
      },
      all_time: { downloads: db.downloads.length, leads: db.leads.length, readers: readers(db.events) },
      range: {
        views: count(ev, "publication_view"),
        reader_opens: count(ev, "reader_open"),
        readers: readers(ev),
        form_submits: count(ev, "download_form_submit"),
        shares: count(ev, "publication_share"),
        downloads: dl.length,
        leads: ld.length,
      },
      daily: days,
      publications: db.publications
        .map((p) => {
          const pe = ev.filter((e) => e.publication_id === p.id);
          return {
            id: p.id,
            title: p.title,
            slug: p.slug,
            cover_image_path: p.cover_image_path,
            status: p.status,
            views: count(pe, "publication_view"),
            reader_opens: count(pe, "reader_open"),
            form_submits: count(pe, "download_form_submit"),
            shares: count(pe, "publication_share"),
            downloads: dl.filter((d) => d.publication_id === p.id).length,
          };
        })
        .sort((a, b) => b.downloads - a.downloads || b.views - a.views),
      recent_downloads: [...db.downloads]
        .sort((a, b) => b.downloaded_at.localeCompare(a.downloaded_at))
        .slice(0, 8)
        .map((d) => {
          const l = leadsById.get(d.lead_id);
          return { id: d.id, downloaded_at: d.downloaded_at, full_name: l?.full_name ?? "—", email: l?.email ?? "", publication_title: db.publications.find((p) => p.id === d.publication_id)?.title ?? d.publication_title };
        }),
      recent_leads: [...db.leads]
        .sort((a, b) => b.created_at.localeCompare(a.created_at))
        .slice(0, 8)
        .map((l) => ({ id: l.id, full_name: l.full_name, email: l.email, company: l.company, designation: l.designation, marketing_consent: l.marketing_consent, created_at: l.created_at })),
    };
  }

  async updateSiteSettings(patch: Partial<SiteSettings>) {
    const db = await this.load();
    this.requireAdmin();
    db.site = { ...db.site, ...patch };
    await this.persist();
    return structuredClone(db.site);
  }
}
