import type { AdminBookRow, Book, BookAnalytics, BookCategory, BookEventType, BookInput, EventSurface, Placement, PlacementKey, PlacementResult, PurchaseLink, Recommendation } from "@/lib/books";
import type {
  AdminPublicationRow,
  AdminUser,
  AnalyticsResult,
  Category,
  DownloadRequest,
  DownloadResult,
  LeadDetail,
  LeadDownloadRow,
  LeadFilter,
  Publication,
  PublicationDetail,
  PublicationInput,
  PublicationStatus,
  ReaderSource,
  SiteSettings,
  VisitorEvent,
} from "@/lib/types";

export type UploadProgress = (fraction: number) => void;

/**
 * Single data contract used by every screen. Two implementations exist:
 * - SupabaseApi: production (Postgres + Storage + Edge Functions)
 * - DemoApi: in-browser (IndexedDB) for previews without a backend
 */
export interface DataApi {
  readonly mode: "supabase" | "demo";

  // --- public -------------------------------------------------------------
  getSiteSettings(): Promise<SiteSettings>;
  listPublicCategories(): Promise<Category[]>;
  listPublicPublications(): Promise<Publication[]>;
  getPublicPublication(slug: string): Promise<PublicationDetail | null>;
  getReaderSource(publication: PublicationDetail): Promise<ReaderSource>;
  trackEvent(publicationId: string, type: VisitorEvent): Promise<void>;
  requestDownload(req: DownloadRequest): Promise<DownloadResult>;
  coverUrl(path: string | null | undefined): string | null;

  // --- auth ---------------------------------------------------------------
  getAdminUser(): Promise<AdminUser | null>;
  onAuthChange(cb: () => void): () => void;
  signIn(email: string, password: string): Promise<AdminUser>;
  signOut(): Promise<void>;
  sendPasswordReset(email: string): Promise<void>;
  updatePassword(password: string): Promise<void>;
  updateAdminName(name: string): Promise<void>;

  // --- publications (admin) ----------------------------------------------
  listAdminPublications(): Promise<AdminPublicationRow[]>;
  getAdminPublication(id: string): Promise<PublicationDetail | null>;
  isSlugAvailable(slug: string, excludeId?: string): Promise<boolean>;
  uploadPdf(publicationId: string, file: File, onProgress?: UploadProgress): Promise<string>;
  uploadImage(publicationId: string, blob: Blob, kind: "cover" | "og"): Promise<string>;
  removeFiles(paths: { pdf?: (string | null)[]; images?: (string | null)[] }): Promise<void>;
  savePublication(input: PublicationInput): Promise<PublicationDetail>;
  setPublicationStatus(id: string, status: PublicationStatus, publishedAt?: string | null): Promise<void>;
  duplicatePublication(id: string): Promise<PublicationDetail>;
  deletePublication(id: string): Promise<void>;
  getAdminPdfSource(path: string): Promise<ReaderSource>;

  // --- categories -----------------------------------------------------------
  listCategories(): Promise<Category[]>;
  saveCategory(input: Partial<Category> & { name: string; slug: string }): Promise<Category>;
  deleteCategory(id: string, reassignTo?: string): Promise<void>;
  uploadCategoryImage(blob: Blob): Promise<string>;

  // --- leads ----------------------------------------------------------------
  listLeadDownloads(filter: LeadFilter): Promise<{ rows: LeadDownloadRow[]; total: number }>;
  exportLeadDownloads(filter: LeadFilter): Promise<LeadDownloadRow[]>;
  getLeadDetail(leadId: string): Promise<LeadDetail | null>;

  // --- books: public -------------------------------------------------------
  listPublicBooks(): Promise<Book[]>;
  getPublicBook(slug: string): Promise<Book | null>;
  listPublicBookCategories(): Promise<BookCategory[]>;
  getPlacementBooks(key: PlacementKey, opts?: { publicationId?: string; excludeBookId?: string; categoryId?: string | null }): Promise<PlacementResult>;
  trackBookEvent(bookId: string, type: BookEventType, opts?: { surface?: EventSurface; linkId?: string; publicationId?: string }): Promise<void>;

  // --- books: admin --------------------------------------------------------
  listAdminBooks(): Promise<AdminBookRow[]>;
  getAdminBook(id: string): Promise<Book | null>;
  isBookSlugAvailable(slug: string, excludeId?: string): Promise<boolean>;
  saveBook(input: BookInput): Promise<Book>;
  setBookStatus(id: string, status: PublicationStatus): Promise<void>;
  setBookFeatured(id: string, featured: boolean): Promise<void>;
  duplicateBook(id: string): Promise<Book>;
  deleteBook(id: string): Promise<void>;
  listBookCategories(): Promise<BookCategory[]>;
  saveBookCategory(input: Partial<BookCategory> & { name: string; slug: string }): Promise<BookCategory>;
  deleteBookCategory(id: string, reassignTo?: string): Promise<void>;
  listRecommendations(): Promise<Recommendation[]>;
  saveRecommendation(input: Partial<Recommendation> & { book_id: string; placement: PlacementKey }): Promise<Recommendation>;
  deleteRecommendation(id: string): Promise<void>;
  listPlacements(): Promise<Placement[]>;
  /** Saves placement settings and its global (all-publication) rules, in display order. */
  savePlacement(p: Placement, globalRecs: Recommendation[]): Promise<void>;
  listAllPurchaseLinks(): Promise<(PurchaseLink & { book_title: string; book_slug: string; book_status: PublicationStatus; clicks: number })[]>;
  setPurchaseLinkStatus(id: string, status: "active" | "inactive"): Promise<void>;
  getBookAnalytics(from: Date, to: Date): Promise<BookAnalytics>;

  // --- analytics & settings -------------------------------------------------
  getAnalytics(from: Date, to: Date): Promise<AnalyticsResult>;
  updateSiteSettings(patch: Partial<SiteSettings>): Promise<SiteSettings>;
}
