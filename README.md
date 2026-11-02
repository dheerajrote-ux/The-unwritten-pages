# The Unwritten Pages — Digital Flipbook Library

> **Essay files are not in this repository.** The nine PDFs live in private
> Supabase storage and are uploaded through Admin → Publications → Bulk upload.
> To run the offline demo builds (`npm run build:demo` / `build:artifact`),
> copy the PDFs into `demo-assets/books/` locally first.

Short essays by Dheeraj Rote, in a premium digital library for PDF publications: readers browse a curated collection, read each
publication in a realistic page-turning flipbook, and download the original PDF after a short
lead-capture form. Administrators manage everything — uploads, covers, publishing, categories,
leads and analytics — from a secured dashboard.

Built with **React 18 + TypeScript, Tailwind CSS v4, shadcn-style Radix components, PDF.js,
react-pageflip (StPageFlip), Recharts and Supabase** (Postgres, Auth, Storage, Edge Functions).

---

## Features

**Public library**
- Editorial home page with hero, featured publication and responsive grid (4 / 3 / 2 / 1 columns)
- Search by title (and tags), category filter chips, sort by newest or A–Z — all reflected in the URL
- Dedicated reader page at `/library/:slug` with SEO title, description, Open Graph image and canonical URL

**Sharing & social previews**
- Share dialog on every publication (reader header, details section, featured block): WhatsApp, LinkedIn, X, Facebook, Telegram, Pinterest, Email, copy link and the device's native share sheet
- A live preview of how the link card will look; links carry UTM tags per channel
- Server-rendered Open Graph, Twitter Card and JSON-LD (`Article`, `WebSite`, `ProfilePage`) for `/`, `/library`, `/about` and every `/library/:slug`, so WhatsApp, LinkedIn, X and Facebook show the title, description and image (they don't run JavaScript)
- Auto-generated 1200×630 preview images per publication (cover + title + author), or the custom Open Graph image set in the editor
- Shares are counted in Analytics

**Books & cross-selling (Amazon)**
- `/books` landing page (hero, featured book, searchable grid with category/format filters and sorting, recommended reading, author section) and `/books/:slug` detail pages (hero, description, what you'll learn, audience, key takeaways, book information, purchase panel, related books)
- Eight configurable placements: Homepage Featured Books, Homepage Book Carousel, Reader Sidebar, Reader Footer (after the last page), Download Success, Publication Page, Related Books, Books Landing
- “Buy on Amazon” buttons use exactly the admin-supplied URLs (affiliate tags preserved), open in a new tab, offer other formats/stores in a menu, and show “Coming soon” when no link exists
- Optional manual prices (with currency, hideable) clearly labelled as manually maintained; Amazon Associates disclosure shown only when enabled
- Impressions, detail views and outbound clicks are tracked — never presented as sales

**Flipbook reader**
- PDF.js rendering at device pixel ratio for sharp text; pages render lazily (±3 pages) and far pages release memory, so long PDFs stay fast
- Two-page spreads with cover on desktop, single pages on narrow screens, swipe on touch
- Previous / next, page indicator (e.g. `4–5 / 48`), zoom 100–300 % with drag-to-pan, thumbnails, fullscreen (with an in-page fallback for iOS / iframes)
- Keyboard: ← → PageUp/PageDown, Home/End, `+` `-` `0` zoom, `F` fullscreen, `T` thumbnails, Esc
- Range requests: large PDFs become readable before they finish downloading

**Lead capture & download**
- Modal with Full Name*, Work Email*, Company, Designation, unchecked consent box and Privacy Policy link
- Inline validation, loading state, honeypot + minimum fill time, server-side validation and rate limiting (per IP and per email)
- One lead per email (case-insensitive). Returning readers are re-used; consent is only ever granted explicitly
- A **120-second signed URL** is generated only after a successful submission, and the download starts automatically
- Reading stays free and unrestricted

**Admin dashboard** (`/admin`)
- Supabase email/password login, show/hide password, forgot / reset password; **no public registration**
- Dashboard cards: total / published / draft publications, downloads, leads, readers — with 7 / 30 / 90-day and custom ranges
- Publications: searchable, filterable table; edit, preview (desktop & mobile), publish / unpublish / republish, duplicate, delete with confirmation
- Six-step editor: drag-and-drop PDF upload with progress → details (auto slug, tags, language, featured) → automatic cover from page 1 *or* custom cover with 3:4 crop → reader configuration → SEO with search preview → full flipbook preview and Save draft / Publish now / Schedule / Unpublish
- Replacing a PDF keeps the URL and metadata, recalculates page count and auto cover, and only deletes the old file after the new one is saved
- Categories with display order, status, optional image and publication counts; deletion requires reassigning publications first
- Leads: search, filter by publication / date / consent, sort, paginate, per-lead detail, **CSV export of the current filter**
- Analytics: page views vs reader opens, form submissions, successful downloads, conversion rate, trends, best / worst performers — **all computed from recorded events** by the `admin_analytics` SQL function

---

## Quick start (demo mode — no backend)

```bash
npm install
npm run dev -- --mode demo        # http://localhost:5173
```

Demo mode stores everything in the browser (IndexedDB), seeds the nine essays in `demo-assets/books/`
plus realistic reader activity, and pre-fills the demo admin login (`admin@demo.library` / `demo1234`).
`npm run build:demo` produces a static, self-contained build in `dist-demo/`.

> Demo mode is for previews only. Seeded leads and analytics are generated sample records and are
> clearly labelled in the UI. Use **Admin → Settings → Reset demo** to start over.

---

## Production setup (Supabase)

### 1. Create the project & schema
```bash
npm i -g supabase                         # or use npx supabase
supabase login
supabase link --project-ref <your-project-ref>
supabase db push                          # applies supabase/migrations/*
psql "$SUPABASE_DB_URL" -f supabase/seed.sql   # optional starter categories (or paste in the SQL editor)
```
The migration creates all tables (`admin_profiles, publications, categories, publication_settings,
publication_seo, leads, downloads, publication_events, site_settings, rate_limit_hits`), constraints,
indexes, triggers, views, the `admin_analytics` RPC, Row Level Security policies, and the three storage
buckets (`publications` private, `publication-covers` public, `publication-previews` private).

### 2. Deploy the Edge Functions
```bash
supabase secrets set ALLOWED_ORIGINS=https://your-domain.com RATE_LIMIT_SALT=$(openssl rand -hex 16)
supabase functions deploy request-download reader-access
```
`SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are injected into functions automatically.

### 3. Create your admin account
1. Supabase Dashboard → Authentication → Users → **Invite user** (or Add user) with your email.
2. SQL editor:
   ```sql
   select promote_admin('you@example.com', 'Your Name', 'owner');
   ```
   `promote_admin` is not callable from the browser. Repeat for each additional admin.
3. Authentication → URL Configuration: add `https://your-domain.com/admin/reset-password` to the redirect URLs.

### 4. Configure the frontend
```bash
cp .env.example .env.local
# VITE_SUPABASE_URL=https://<ref>.supabase.co
# VITE_SUPABASE_ANON_KEY=<anon / publishable key>
npm run dev
```

### 5. Add your PDFs
Either upload them in **Admin → Publications → Add new publication**, or bulk-import the bundled essays
(or any folder described by a manifest):
```bash
SUPABASE_URL=https://<ref>.supabase.co SUPABASE_SERVICE_ROLE_KEY=<service-role-key> \
  node scripts/import-library.mjs src/content/library-manifest.json
```
The script creates categories, uploads PDFs to the private bucket and covers to the public one, detects
page counts, and publishes (or `--draft`). It is idempotent by slug (`--force` to replace).
Run it from your machine only — the service-role key never belongs in a `VITE_*` variable.

---

## Deployment

**Vercel (recommended — required for rich social previews)**
1. Import the repository in Vercel (framework preset: Vite). Build command `npm run build`, output `dist`.
2. Add environment variables `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` (used by both the app and the edge functions).
3. Deploy, then set **Admin → Settings → Public site URL** to your domain (e.g. `https://theunwrittenpages.com`).
4. Add the domain to the `ALLOWED_ORIGINS` Edge Function secret in Supabase.

`vercel.json` routes `/`, `/library`, `/about` and `/library/:slug` through `api/meta.ts`, which returns
the app with the right `<title>`, description, Open Graph, Twitter and JSON-LD tags already in the HTML.
`api/og.ts` renders the 1200×630 preview images. On Vercel builds the app shell is emitted as `app.html`
(static files take precedence over rewrites, so this lets `/` receive server-side tags too).

Check a link preview after deploying with the [LinkedIn Post Inspector](https://www.linkedin.com/post-inspector/)
or [Facebook Sharing Debugger](https://developers.facebook.com/tools/debug/) — both also refresh cached previews.

**Other static hosts** (Netlify, Cloudflare Pages, S3…): `npm run build`, serve `dist/` with an SPA fallback to
`index.html` (`public/_redirects` is included for Netlify). Everything works, but social previews show only the
site-wide title and description, because per-page tags are added by the Vercel functions. Port `api/meta.ts`
to your host's edge functions to get them.

---

## Environment variables

| Variable | Where | Purpose |
|---|---|---|
| `VITE_SUPABASE_URL` | frontend | Project URL |
| `VITE_SUPABASE_ANON_KEY` | frontend | Anon / publishable key (RLS protects data) |
| `VITE_DATA_MODE` | frontend | `supabase` (default when keys are set) or `demo` |
| `VITE_ROUTER` | frontend | `browser` (default) or `hash` |
| `VITE_APP_NAME` | frontend | Fallback name before site settings load |
| `SUPABASE_URL` / `SUPABASE_ANON_KEY` | Vercel functions (optional) | Override the `VITE_*` values for `api/meta` and `api/og` |
| `ALLOWED_ORIGINS` | function secret | Comma-separated CORS allow-list (`*` by default) |
| `RATE_LIMIT_SALT` | function secret | Salt for hashing IPs/emails in rate-limit records |
| `SUPABASE_SERVICE_ROLE_KEY` | function secret / local import script | **Never** in frontend code |

---

## Security model

- Original PDFs live in a **private** bucket. Visitors never receive permanent URLs:
  the reader gets a 30-minute signed URL from `reader-access`; downloads get a 120-second signed URL
  from `request-download`, only after a valid form submission.
- RLS on every table. Anonymous users can read only live publications (published and `published_at <= now()`),
  active categories and site settings, and can insert only `publication_view` / `reader_open` events for live
  publications. Leads and downloads are written exclusively by the Edge Function (service role).
- A check constraint makes it impossible to publish without a PDF, cover and category.
- Admin role escalation is blocked at the column-privilege level (`full_name` is the only editable profile column).
- CSV exports neutralise spreadsheet formula injection.
- A browser-based viewer cannot fully prevent copying or screenshots; signed URLs limit casual sharing only.

## Analytics definitions

**Books:** impressions are recorded once per book + placement per session when a card is ≥50% visible;
click-through rate = Amazon outbound clicks ÷ impressions. These are website engagement metrics —
actual sales require Amazon Associates reporting.

**Publications:**

| Metric | Source |
|---|---|
| Publication page views | `publication_view` event when a reader page loads (once per page load) |
| Reader opens | `reader_open` event when the PDF actually rendered |
| Readers | distinct sessions with a `reader_open` |
| Form submissions | `download_form_submit` (server-side) |
| Successful downloads | rows in `downloads` (signed link issued) |
| Conversion | successful downloads ÷ page views × 100 |

Rapid duplicate submissions (same lead + publication within 60 s) return a fresh link without double-counting.

## Project structure

```
src/
  data/            DataApi contract + Supabase and demo (IndexedDB) implementations
  lib/             pdf.js helpers, types, utilities, config
  components/
    reader/        PdfReader, Flipbook, PageCanvas (lazy render queue), Thumbnails
    public/        header, footer, cards, cover, download dialog
    admin/         layout, charts, dropzone, cover cropper, tag input
    ui/            button, inputs, dialog, select, dropdown, misc
  pages/           public pages + admin/*
supabase/
  migrations/      schema, RLS, storage, analytics RPC
  functions/       request-download, reader-access
  seed.sql
api/               Vercel edge functions: meta.ts (social tags), og.ts (preview images)
scripts/           import-library.mjs + manifest for bulk imports
src/content/       author.ts — About page copy (edit freely)
demo-assets/       sample PDFs & covers — bundled ONLY in demo builds
```

## Books & Amazon links

Admin → **Books & Cross-Selling**:

| Page | What it does |
|---|---|
| All Books | Search/filter, link status, publish/unpublish, feature, duplicate, preview, delete |
| Add New Book | Basic info, 2:3 cover (cropped & optimised), metadata (ISBN checksums validated), long-form content, purchase links, SEO, publish |
| Book Categories | Separate taxonomy for books; deletion requires reassignment |
| Recommendations | Book ↔ publication rules per placement, priority, order, active toggle, optional campaign start/end; “Global” rules apply to all publications |
| Promotional Placements | Per placement: on/off, heading, description, max books, ordered book selection, featured flag, live preview |
| Amazon Link Management | Every link with URL validation, detected store, affiliate tag, clicks, active toggle; Amazon Associates participation & disclosure text |
| Book Analytics | Impressions, detail views, outbound clicks, CTR, by book / link / marketplace / format / placement, date ranges, CSV export |

**Rules enforced in code and in the database**
- Only `https://` Amazon storefronts and official short links (`amzn.to`, `a.co`, Audible) are accepted; the URL is stored verbatim.
- Nothing is generated: no ASINs, URLs, prices or product data are scraped or guessed.
- One primary link per book. Inactive links and unpublished books never reach visitors (RLS).
- Click events snapshot marketplace/format server-side from the stored link, so they can't be spoofed.
- Admin previews never record impressions or clicks.
- Resolution order for a placement: publication-specific rules → global rules (featured first, then priority, then order). If none exist, it falls back to featured books (or same-category books for Related Books).

## Editing the About page

All About page copy lives in `src/content/author.ts` — bio, quick facts, the origin story and works in progress.
Add a portrait by placing an image in `public/` and setting `photo: "/author.jpg"`.

## Known limitations & next steps

- Covers uploaded before this version were stored as WebP; the preview-image generator only reads PNG/JPEG,
  so those publications fall back to a text-only card. Re-save the cover (or replace the PDF) to regenerate it as JPEG.
- If an admin abandons a new publication after uploading, the uploaded PDF stays in storage;
  a periodic cleanup of objects without a matching `publications` row is recommended.
- Marketing emails are not sent by the app — export consented leads (Leads → filter "Consented" → CSV).
