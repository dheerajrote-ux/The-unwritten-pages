export type PublicationStatus = "draft" | "published" | "unpublished";
export type EventType = "publication_view" | "reader_open" | "download_form_submit" | "download_success" | "publication_share";
export type VisitorEvent = "publication_view" | "reader_open" | "publication_share";

export interface Category {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  image_path: string | null;
  display_order: number;
  status: "active" | "hidden";
  created_at: string;
  updated_at?: string;
  publication_count?: number;
}

export interface ReaderSettings {
  flipbook_enabled: boolean;
  double_page_mode: boolean;
  fullscreen_enabled: boolean;
  zoom_enabled: boolean;
  thumbnail_navigation_enabled: boolean;
  download_enabled: boolean;
}

export interface SeoSettings {
  seo_title: string | null;
  meta_description: string | null;
  og_image_path: string | null;
  canonical_url: string | null;
}

export interface Publication {
  id: string;
  title: string;
  slug: string;
  description: string;
  pdf_storage_path: string | null;
  cover_image_path: string | null;
  cover_source: "auto" | "custom";
  category_id: string | null;
  author: string | null;
  publisher: string | null;
  language: string | null;
  page_count: number | null;
  file_size: number | null;
  tags: string[];
  status: PublicationStatus;
  is_featured: boolean;
  publication_date: string | null;
  published_at: string | null;
  created_at: string;
  updated_at: string;
  category?: { id: string; name: string; slug: string } | null;
}

export interface PublicationDetail extends Publication {
  settings: ReaderSettings;
  seo: SeoSettings;
}

export interface AdminPublicationRow extends Publication {
  category_name: string | null;
  download_count: number;
  view_count: number;
}

export type PublicationInput = Omit<Publication, "created_at" | "updated_at" | "category"> & {
  settings: ReaderSettings;
  seo: SeoSettings;
};

export interface Lead {
  id: string;
  full_name: string;
  email: string;
  company: string | null;
  designation: string | null;
  marketing_consent: boolean;
  consent_at: string | null;
  created_at: string;
}

export interface LeadDownloadRow {
  lead_id: string;
  full_name: string;
  email: string;
  company: string | null;
  designation: string | null;
  marketing_consent: boolean;
  consent_at: string | null;
  lead_created_at: string;
  publication_id: string | null;
  publication_title: string;
  first_downloaded_at: string;
  last_downloaded_at: string;
  download_count: number;
}

export interface LeadFilter {
  search?: string;
  publicationId?: string;
  from?: string; // ISO
  to?: string; // ISO
  consent?: "all" | "yes" | "no";
  sort?: "newest" | "oldest";
  page?: number;
  pageSize?: number;
}

export interface LeadDetail {
  lead: Lead;
  downloads: { id: string; publication_title: string; publication_id: string | null; downloaded_at: string }[];
}

export interface AnalyticsPublicationRow {
  id: string;
  title: string;
  slug: string;
  cover_image_path: string | null;
  status: PublicationStatus;
  views: number;
  reader_opens: number;
  form_submits: number;
  shares: number;
  downloads: number;
}

export interface AnalyticsResult {
  inventory: { total: number; published: number; drafts: number; unpublished: number };
  all_time: { downloads: number; leads: number; readers: number };
  range: { views: number; reader_opens: number; readers: number; form_submits: number; shares: number; downloads: number; leads: number };
  daily: { date: string; views: number; reader_opens: number; downloads: number; leads: number }[];
  publications: AnalyticsPublicationRow[];
  recent_downloads: { id: string; downloaded_at: string; full_name: string; email: string; publication_title: string }[];
  recent_leads: { id: string; full_name: string; email: string; company: string | null; designation: string | null; marketing_consent: boolean; created_at: string }[];
}

export interface SiteSettings {
  site_name: string;
  /** Public URL of the live library, used for share links and social previews. */
  site_url: string | null;
  tagline: string;
  privacy_policy_url: string | null;
  contact_email: string | null;
  max_pdf_mb: number;
  default_reader: ReaderSettings;
  /** Show the Amazon Associates disclosure (only if the site participates). */
  amazon_associate: boolean;
  affiliate_disclosure: string;
  author_website_url: string | null;
}

export interface AdminUser {
  id: string;
  email: string;
  full_name: string | null;
  role: "owner" | "admin" | "editor";
}

export interface DownloadRequest {
  publication_id: string;
  full_name: string;
  email: string;
  company?: string;
  designation?: string;
  marketing_consent: boolean;
  website?: string; // honeypot
  started_at: number;
  session_id: string;
}

export interface DownloadResult {
  url: string;
  filename: string;
}

/** What the PDF reader needs to open a document. */
export type ReaderSource = { url: string } | { data: Uint8Array } | { images: PageImage[] };

/** Pre-rendered page images (used by the static preview build, which cannot ship PDFs). */
export interface PageImage {
  url: string;
  width: number;
  height: number;
}

export const DEFAULT_READER: ReaderSettings = {
  flipbook_enabled: true,
  double_page_mode: true,
  fullscreen_enabled: true,
  zoom_enabled: true,
  thumbnail_navigation_enabled: true,
  download_enabled: true,
};

export const EMPTY_SEO: SeoSettings = { seo_title: null, meta_description: null, og_image_path: null, canonical_url: null };

export class ApiError extends Error {
  fields?: Record<string, string>;
  status?: number;
  constructor(message: string, opts?: { fields?: Record<string, string>; status?: number }) {
    super(message);
    this.name = "ApiError";
    this.fields = opts?.fields;
    this.status = opts?.status;
  }
}
