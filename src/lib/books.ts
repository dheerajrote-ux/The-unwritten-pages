// Types and helpers for the Books & Cross-Selling module.
import type { PublicationStatus } from "./types";

export type BookFormat = "paperback" | "hardcover" | "kindle" | "audiobook";
export type Marketplace = "amazon_in" | "amazon_us" | "amazon_uk" | "other";
export type PlacementKey =
  | "homepage_featured"
  | "homepage_carousel"
  | "reader_sidebar"
  | "reader_footer"
  | "download_success"
  | "publication_page"
  | "related_books"
  | "books_landing";
export type BookEventType = "book_impression" | "book_detail_view" | "amazon_link_click";
/** Where an event happened: a placement, the detail page, or the books grid. */
export type EventSurface = PlacementKey | "book_detail" | "books_grid";

export const FORMATS: { value: BookFormat; label: string }[] = [
  { value: "paperback", label: "Paperback" },
  { value: "hardcover", label: "Hardcover" },
  { value: "kindle", label: "Kindle" },
  { value: "audiobook", label: "Audiobook" },
];
export const formatLabel = (f: string | null | undefined) => FORMATS.find((x) => x.value === f)?.label ?? (f ? f[0].toUpperCase() + f.slice(1) : "—");

export const MARKETPLACES: { value: Marketplace; label: string; currency: string }[] = [
  { value: "amazon_in", label: "Amazon India", currency: "INR" },
  { value: "amazon_us", label: "Amazon US", currency: "USD" },
  { value: "amazon_uk", label: "Amazon UK", currency: "GBP" },
  { value: "other", label: "Other Amazon store", currency: "EUR" },
];
export const marketplaceLabel = (m: string | null | undefined, custom?: string | null) =>
  m === "other" ? custom || "Amazon" : MARKETPLACES.find((x) => x.value === m)?.label ?? (m === "unknown" || !m ? "Unknown" : m);

export const CURRENCIES = ["INR", "USD", "GBP", "EUR", "CAD", "AUD", "JPY", "AED", "SGD"];

export const PLACEMENTS: { key: PlacementKey; label: string; where: string }[] = [
  { key: "homepage_featured", label: "Homepage Featured Books", where: "Home, between the featured publication and the library" },
  { key: "homepage_carousel", label: "Homepage Book Carousel", where: "Home, below the library grid" },
  { key: "reader_sidebar", label: "Flipbook Reader Sidebar", where: "Beside the reader on wide screens" },
  { key: "reader_footer", label: "Flipbook Reader Footer", where: "After the final page of a publication" },
  { key: "download_success", label: "Download Success Screen", where: "After a successful PDF download" },
  { key: "publication_page", label: "Publication Detail Page", where: "Below a publication's details" },
  { key: "related_books", label: "Related Books Section", where: "On each book's detail page" },
  { key: "books_landing", label: "Dedicated Books Landing Page", where: "“Recommended Reading” on /books" },
];
export const placementLabel = (k: string) => PLACEMENTS.find((p) => p.key === k)?.label ?? (k === "book_detail" ? "Book detail page" : k === "books_grid" ? "Books page grid" : k);

export interface BookCategory {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  display_order: number;
  status: "active" | "hidden";
  created_at: string;
  updated_at?: string;
  book_count?: number;
}

export interface PurchaseLink {
  id: string;
  book_id: string;
  marketplace: Marketplace;
  marketplace_name: string | null;
  format: BookFormat;
  product_url: string;
  display_label: string | null;
  displayed_price: number | null;
  currency: string | null;
  show_price: boolean;
  is_primary: boolean;
  status: "active" | "inactive";
  display_order: number;
  created_at?: string;
  updated_at?: string;
}

export interface Book {
  id: string;
  title: string;
  slug: string;
  subtitle: string | null;
  author: string | null;
  short_description: string;
  full_description: string;
  learn_points: string[];
  audience: string | null;
  key_takeaways: string[];
  cover_image_path: string | null;
  category_id: string | null;
  isbn_10: string | null;
  isbn_13: string | null;
  publisher: string | null;
  page_count: number | null;
  edition: string | null;
  formats: BookFormat[];
  language: string | null;
  publication_date: string | null;
  tags: string[];
  is_featured: boolean;
  status: PublicationStatus;
  published_at: string | null;
  seo_title: string | null;
  meta_description: string | null;
  og_image_path: string | null;
  canonical_url: string | null;
  created_at: string;
  updated_at: string;
  category?: { id: string; name: string; slug: string } | null;
  links?: PurchaseLink[];
}

export interface AdminBookRow extends Book {
  category_name: string | null;
  link_count: number;
  active_link_count: number;
  click_count: number;
}

export type BookInput = Omit<Book, "created_at" | "updated_at" | "category" | "links"> & { links: PurchaseLink[] };

export interface Placement {
  id: string;
  placement_key: PlacementKey;
  heading: string;
  description: string | null;
  max_books: number;
  is_active: boolean;
}

export interface Recommendation {
  id: string;
  publication_id: string | null; // null = global
  book_id: string;
  placement: PlacementKey;
  priority: number;
  display_order: number;
  is_featured: boolean;
  is_active: boolean;
  start_date: string | null;
  end_date: string | null;
  created_at: string;
}

/** A resolved placement ready to render. */
export interface PlacementResult {
  placement: Placement | null;
  books: Book[];
}

export interface BookAnalytics {
  totals: { published_books: number; impressions: number; detail_views: number; clicks: number };
  daily: { date: string; impressions: number; detail_views: number; clicks: number }[];
  books: { id: string; title: string; slug: string; cover_image_path: string | null; status: PublicationStatus; impressions: number; detail_views: number; clicks: number }[];
  links: { id: string; book_id: string; book_title: string; display_label: string | null; marketplace: string; format: string; clicks: number }[];
  marketplaces: { key: string; clicks: number }[];
  formats: { key: string; clicks: number }[];
  placements: { key: string; impressions: number; clicks: number }[];
}

export interface LinkCheck {
  ok: boolean;
  marketplace: Marketplace | null;
  host: string;
  affiliateTag: string | null;
  error?: string;
}

const STORES: [RegExp, Marketplace, string][] = [
  [/(^|\.)amazon\.in$/, "amazon_in", "Amazon India"],
  [/(^|\.)amazon\.com$/, "amazon_us", "Amazon US"],
  [/(^|\.)amazon\.co\.uk$/, "amazon_uk", "Amazon UK"],
];
const AMAZON_HOST = /(^|\.)(amazon\.(com|in|co\.uk|de|fr|it|es|ca|com\.au|co\.jp|ae|sa|sg|nl|se|pl|com\.br|com\.mx|com\.tr|eg|com\.be)|amzn\.(to|in|eu|com|asia)|a\.co|audible\.(com|in|co\.uk))$/i;

/** Validates an admin-supplied Amazon URL (mirrors the database check) and detects its store. */
export function checkAmazonUrl(raw: string): LinkCheck {
  const value = raw.trim();
  let u: URL;
  try {
    u = new URL(value);
  } catch {
    return { ok: false, marketplace: null, host: "", affiliateTag: null, error: "Enter a full URL starting with https://" };
  }
  const host = u.hostname.toLowerCase();
  if (u.protocol !== "https:") return { ok: false, marketplace: null, host, affiliateTag: null, error: "Amazon links must use https://" };
  if (!AMAZON_HOST.test(host)) return { ok: false, marketplace: null, host, affiliateTag: null, error: "This doesn't look like an Amazon (or amzn.to) link." };
  const store = STORES.find(([re]) => re.test(host));
  const short = /amzn\.|a\.co$/.test(host);
  return { ok: true, marketplace: store ? store[1] : short ? null : "other", host, affiliateTag: u.searchParams.get("tag") };
}

export function formatPrice(amount: number | null, currency: string | null): string | null {
  if (amount === null || amount === undefined) return null;
  try {
    return new Intl.NumberFormat(undefined, { style: "currency", currency: currency || "INR", maximumFractionDigits: amount % 1 === 0 ? 0 : 2 }).format(amount);
  } catch {
    return `${currency ?? ""} ${amount}`.trim();
  }
}

export function linkLabel(l: PurchaseLink): string {
  if (l.display_label) return l.display_label;
  const verb = l.format === "kindle" ? "Read on Kindle" : l.format === "audiobook" ? "Listen on Audible" : `Buy ${formatLabel(l.format)}`;
  return `${verb} · ${marketplaceLabel(l.marketplace, l.marketplace_name)}`;
}

/** Active links ordered with the primary link first. */
export function activeLinks(book: Pick<Book, "links">): PurchaseLink[] {
  return (book.links ?? []).filter((l) => l.status === "active").sort((a, b) => Number(b.is_primary) - Number(a.is_primary) || a.display_order - b.display_order);
}

export function validIsbn10(v: string) {
  if (!/^[0-9]{9}[0-9X]$/.test(v)) return false;
  const sum = v.split("").reduce((s, c, i) => s + (c === "X" ? 10 : Number(c)) * (10 - i), 0);
  return sum % 11 === 0;
}
export function validIsbn13(v: string) {
  if (!/^97[89][0-9]{10}$/.test(v)) return false;
  const sum = v.split("").reduce((s, c, i) => s + Number(c) * (i % 2 ? 3 : 1), 0);
  return sum % 10 === 0;
}
