import { DEFAULT_READER, type Category, type Lead, type PublicationDetail, type SiteSettings } from "@/lib/types";
import type { Book, BookCategory, BookEventType, Placement, PlacementKey, PurchaseLink, Recommendation } from "@/lib/books";
import { APP_NAME } from "@/lib/config";

export interface DemoDownload {
  id: string;
  lead_id: string;
  publication_id: string | null;
  publication_title: string;
  downloaded_at: string;
}
export interface DemoEvent {
  publication_id: string;
  event_type: "publication_view" | "reader_open" | "download_form_submit" | "download_success" | "publication_share";
  session_id: string;
  created_at: string;
}
export interface DemoBookEvent {
  id: string;
  book_id: string;
  purchase_link_id: string | null;
  event_type: BookEventType;
  session_id: string;
  placement: string | null;
  publication_id: string | null;
  marketplace: string | null;
  format: string | null;
  created_at: string;
}
export interface DemoDb {
  version: number;
  site: SiteSettings;
  admin: { id: string; email: string; password: string; full_name: string; role: "owner" };
  categories: Category[];
  publications: PublicationDetail[];
  leads: Lead[];
  downloads: DemoDownload[];
  events: DemoEvent[];
  bookCategories: BookCategory[];
  books: Book[];
  links: PurchaseLink[];
  placements: Placement[];
  recommendations: Recommendation[];
  bookEvents: DemoBookEvent[];
}

export const DEMO_VERSION = 6;
export const DEMO_ADMIN_EMAIL = "admin@demo.library";
export const DEMO_ADMIN_PASSWORD = "demo1234";

/** Deterministic PRNG so the seeded history is stable between reloads. */
function mulberry32(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const CATS: [string, string, string][] = [
  ["cat-relationships", "Relationships", "On the people who stay, the people who drift, and what they leave behind."],
  ["cat-growing-up", "Growing Up", "On childhood, adulthood and the distance between them."],
  ["cat-inner-life", "Inner Life", "On the feelings we carry quietly and rarely say out loud."],
  ["cat-resilience", "Resilience", "On patience, permission and making room for yourself."],
];

const SAMPLE_PUBS: {
  id: string;
  slug: string;
  title: string;
  description: string;
  category: string;
  pages: number;
  size: number;
  daysAgo: number;
  tags: string[];
  featured?: boolean;
  weight: number;
}[] = [
  {
    id: "pub-person-i-once-needed",
    slug: "the-person-i-once-needed",
    title: "The Person I Once Needed",
    description: "There comes a quiet moment when you realise nobody is coming to fix things for you. An essay on growing up, standing on your own, and slowly becoming the support you once looked for in others.",
    category: "cat-growing-up",
    pages: 8,
    size: 226042,
    daysAgo: 6,
    tags: ["growing up", "self-reliance"],
    featured: true,
    weight: 1.5,
  },
  {
    id: "pub-take-the-stage",
    slug: "if-all-the-seats-are-taken-take-the-stage",
    title: "If All the Seats Are Taken, Take the Stage",
    description: "We spend years waiting to be noticed, invited and given a chance. An essay on dropping the habit of waiting for permission and creating your own place instead.",
    category: "cat-resilience",
    pages: 7,
    size: 297605,
    daysAgo: 13,
    tags: ["courage", "work", "permission"],
    weight: 1.3,
  },
  {
    id: "pub-strangers",
    slug: "strangers-who-know-all-your-stories",
    title: "Strangers Who Know All Your Stories",
    description: "Some friendships don't end with a fight; they fade into birthday wishes and festival messages. An essay on the people who once knew everything about your day.",
    category: "cat-relationships",
    pages: 7,
    size: 198298,
    daysAgo: 21,
    tags: ["friendship", "distance"],
    weight: 1.35,
  },
  {
    id: "pub-surrounded",
    slug: "surrounded-by-everyone-understood-by-no-one",
    title: "Surrounded by Everyone, Understood by No One",
    description: "You can sit in a room full of people and still feel unseen. An essay on the different versions of ourselves we show the world, and the wish to be understood without explaining.",
    category: "cat-inner-life",
    pages: 7,
    size: 328154,
    daysAgo: 30,
    tags: ["loneliness", "being understood"],
    weight: 1.2,
  },
  {
    id: "pub-childhood",
    slug: "the-childhood-we-were-in-a-hurry-to-leave",
    title: "The Childhood We Were in a Hurry to Leave",
    description: "As children we couldn't wait to grow up; as adults we wish we could go back. An essay on cricket in the lane, lazy Sundays, and the days we didn't know we'd miss.",
    category: "cat-growing-up",
    pages: 8,
    size: 258820,
    daysAgo: 41,
    tags: ["childhood", "nostalgia"],
    weight: 1.25,
  },
  {
    id: "pub-first-flower",
    slug: "the-first-flower-a-man-receives",
    title: "The First Flower a Man Receives",
    description: "Be strong, don't cry, handle it. An essay on the feelings men are taught to keep to themselves, and why appreciation shouldn't wait until it's too late.",
    category: "cat-inner-life",
    pages: 6,
    size: 166647,
    daysAgo: 52,
    tags: ["men", "emotions", "appreciation"],
    weight: 1.1,
  },
  {
    id: "pub-patience",
    slug: "sometimes-all-you-need-is-patience",
    title: "Sometimes, All You Need Is Patience",
    description: "We want answers, results and happiness right away. An essay on staying steady while life takes its time, and trusting what grows beneath the surface.",
    category: "cat-resilience",
    pages: 7,
    size: 234600,
    daysAgo: 64,
    tags: ["patience", "growth"],
    weight: 1.0,
  },
  {
    id: "pub-people-we-remember",
    slug: "the-people-we-remember-and-the-people-they-become",
    title: "The People We Remember, and the People They Become",
    description: "Not everyone we lose is gone; sometimes life simply changes them, and us. An essay on old friends, familiar faces and the versions of people we hold on to.",
    category: "cat-relationships",
    pages: 7,
    size: 209968,
    daysAgo: 77,
    tags: ["change", "friendship", "memory"],
    weight: 0.95,
  },
  {
    id: "pub-not-everyone-stays",
    slug: "not-everyone-is-meant-to-stay",
    title: "Not Everyone Is Meant to Stay",
    description: "Love isn't always measured by how long someone stays. An essay on goodbyes that never get said, and on being grateful for the people who were part of your story.",
    category: "cat-relationships",
    pages: 7,
    size: 189074,
    daysAgo: 90,
    tags: ["relationships", "letting go", "gratitude"],
    weight: 0.9,
  },
];

const FIRST = ["Aarav", "Priya", "Meera", "Rohan", "Ananya", "Kabir", "Ishaan", "Sara", "Daniel", "Emma", "Lucas", "Olivia", "Noah", "Mia", "Arjun", "Zoya", "Vikram", "Nina", "Tomás", "Hana", "Leo", "Amara", "Kenji", "Freya", "Omar", "Elena", "Ravi", "Chloe", "Samuel", "Tara"];
const LAST = ["Sharma", "Kulkarni", "Iyer", "Fernandes", "Patel", "Mehta", "Nair", "Lindqvist", "Okafor", "Moreau", "Silva", "Brennan", "Tanaka", "Haddad", "Novak", "Reyes", "Chen", "Kapoor", "Desai", "Walsh"];
const COMPANIES: [string, string][] = [
  ["Aster Health", "aster-health"],
  ["Brightline Labs", "brightline"],
  ["Cobalt Finance", "cobalt-finance"],
  ["Driftwood Studio", "driftwood"],
  ["Evergreen Retail", "evergreen-retail"],
  ["Fathom Analytics", "fathom-analytics"],
  ["Granite Systems", "granite-systems"],
  ["Harbor Mobility", "harbor-mobility"],
  ["Ironleaf Software", "ironleaf"],
  ["Juniper Learning", "juniper-learning"],
  ["Kestrel Insurance", "kestrel"],
  ["Lumen Energy", "lumen-energy"],
];
const ROLES = ["Product Designer", "UX Researcher", "Design Manager", "Product Manager", "Head of Design", "Front-end Engineer", "Content Designer", "Design Ops Lead", "CTO", "UX Lead", null];

export function buildSeed(): DemoDb {
  const rand = mulberry32(20261102);
  const now = Date.now();
  const DAY = 86400_000;
  const iso = (t: number) => new Date(t).toISOString();

  const categories: Category[] = CATS.map(([id, name, description], i) => ({
    id,
    name,
    slug: name.toLowerCase(),
    description,
    image_path: null,
    display_order: i + 1,
    status: "active",
    created_at: iso(now - 120 * DAY),
    updated_at: iso(now - 120 * DAY),
  }));

  const publications: PublicationDetail[] = SAMPLE_PUBS.map((p) => {
    const publishedAt = iso(now - p.daysAgo * DAY);
    const cat = categories.find((c) => c.id === p.category)!;
    return {
      id: p.id,
      title: p.title,
      slug: p.slug,
      description: p.description,
      pdf_storage_path: `sample:${p.slug}.pdf`, // served from public/books/
      cover_image_path: `sample:covers/${p.slug}.png`,
      cover_source: "auto",
      category_id: p.category,
      author: "Dheeraj Rote",
      publisher: null,
      language: "en",
      page_count: p.pages,
      file_size: p.size,
      tags: p.tags,
      status: "published",
      is_featured: !!p.featured,
      publication_date: null,
      published_at: publishedAt,
      created_at: iso(now - Math.max(p.daysAgo, 0) * DAY - 5 * DAY),
      updated_at: iso(now - Math.max(p.daysAgo, 0) * DAY),
      category: { id: cat.id, name: cat.name, slug: cat.slug },
      settings: { ...DEFAULT_READER },
      seo: { seo_title: null, meta_description: null, og_image_path: null, canonical_url: null },
    };
  });

  // --- People pool (leads are unique per email) -----------------------------
  const people: Lead[] = [];
  const used = new Set<string>();
  while (people.length < 180) {
    const f = FIRST[Math.floor(rand() * FIRST.length)];
    const l = LAST[Math.floor(rand() * LAST.length)];
    const [company, domain] = COMPANIES[Math.floor(rand() * COMPANIES.length)];
    const email = `${f}.${l}@${domain}.example`.toLowerCase().normalize("NFKD").replace(/[̀-ͯ]/g, "");
    if (used.has(email)) continue;
    used.add(email);
    const consent = rand() < 0.42;
    people.push({
      id: `lead-${people.length + 1}`,
      full_name: `${f} ${l}`,
      email,
      company: rand() < 0.88 ? company : null,
      designation: ROLES[Math.floor(rand() * ROLES.length)],
      marketing_consent: consent,
      consent_at: null,
      created_at: "",
    });
  }

  // --- Event history ---------------------------------------------------------
  const events: DemoDb["events"] = [];
  const downloads: DemoDownload[] = [];
  const leads = new Map<string, Lead>();
  let sessionCounter = 0;
  let dlCounter = 0;

  for (const p of SAMPLE_PUBS) {
    if (p.daysAgo <= 0) continue;
    const pub = publications.find((x) => x.id === p.id)!;
    for (let d = p.daysAgo; d >= 0; d--) {
      const dayStart = now - d * DAY;
      const date = new Date(dayStart);
      const weekday = date.getDay();
      const weekendFactor = weekday === 0 || weekday === 6 ? 0.55 : 1;
      const launchBoost = d > p.daysAgo - 7 ? 1.8 : 1;
      const trend = 1 + (p.daysAgo - d) / (p.daysAgo * 3);
      const views = Math.round((4 + rand() * 9) * p.weight * weekendFactor * launchBoost * trend);
      for (let v = 0; v < views; v++) {
        const sid = `s-${++sessionCounter}`;
        const t = Math.min(dayStart - DAY + 8 * 3600_000 + rand() * 14 * 3600_000, now - 60_000);
        events.push({ publication_id: p.id, event_type: "publication_view", session_id: sid, created_at: iso(t) });
        if (rand() < 0.72) {
          events.push({ publication_id: p.id, event_type: "reader_open", session_id: sid, created_at: iso(t + 4000) });
          if (rand() < 0.07) events.push({ publication_id: p.id, event_type: "publication_share", session_id: sid, created_at: iso(Math.min(t + 240_000, now - 1000)) });
          if (rand() < 0.11) {
            const tt = t + 120_000 + rand() * 600_000;
            if (tt > now) continue;
            events.push({ publication_id: p.id, event_type: "download_form_submit", session_id: sid, created_at: iso(tt) });
            const person = people[Math.floor(rand() * people.length)];
            let lead = leads.get(person.id);
            if (!lead) {
              lead = { ...person, created_at: iso(tt), consent_at: person.marketing_consent ? iso(tt) : null };
              leads.set(person.id, lead);
            }
            downloads.push({ id: `dl-${++dlCounter}`, lead_id: lead.id, publication_id: p.id, publication_title: pub.title, downloaded_at: iso(tt + 1500) });
            events.push({ publication_id: p.id, event_type: "download_success", session_id: sid, created_at: iso(tt + 1500) });
          }
        }
      }
    }
  }
  events.sort((a, b) => a.created_at.localeCompare(b.created_at));
  downloads.sort((a, b) => a.downloaded_at.localeCompare(b.downloaded_at));

  return {
    version: DEMO_VERSION,
    site: {
      site_name: APP_NAME,
      site_url: null,
      amazon_associate: false,
      affiliate_disclosure: "As an Amazon Associate, we earn from qualifying purchases.",
      author_website_url: null,
      tagline: "Short essays by Dheeraj Rote on people, growing up, and the quiet things in between. Read online or download your favourite.",
      privacy_policy_url: null,
      contact_email: null,
      max_pdf_mb: 50,
      default_reader: { ...DEFAULT_READER },
    },
    admin: { id: "admin-1", email: DEMO_ADMIN_EMAIL, password: DEMO_ADMIN_PASSWORD, full_name: "Library Admin", role: "owner" },
    categories,
    publications,
    leads: [...leads.values()].sort((a, b) => a.created_at.localeCompare(b.created_at)),
    downloads,
    events,
    ...buildBooks(now, rand, publications.map((p) => p.id)),
  };
}

export const PLACEMENT_DEFAULTS: [PlacementKey, string, string | null, number][] = [
  ["homepage_featured", "Books Worth Exploring", "Hand-picked books to read alongside the essays.", 3],
  ["homepage_carousel", "Explore More Books", "Discover more ideas, knowledge and inspiration through our curated collection of books.", 12],
  ["reader_sidebar", "You May Also Like", null, 3],
  ["reader_footer", "Enjoyed this publication?", "Continue exploring more ideas through our books.", 3],
  ["download_success", "While You're Here, Explore More", "Take your learning further with these recommended books.", 1],
  ["publication_page", "Books by the Author", "Longer reads from the same writer.", 3],
  ["related_books", "Related Books", null, 4],
  ["books_landing", "Recommended Reading", "Curated collections to read next.", 6],
];

/**
 * Only the author's two works in progress, described with what he has shared.
 * No purchase links are seeded: real Amazon URLs must be added by the admin.
 */
function buildBooks(now: number, rand: () => number, publicationIds: string[]) {
  const DAY = 86400_000;
  const iso = (t: number) => new Date(t).toISOString();
  const bookCategories: BookCategory[] = [
    { id: "bcat-memoir", name: "Memoir", slug: "memoir", description: "True stories from the author's life.", display_order: 1, status: "active", created_at: iso(now - 40 * DAY) },
    { id: "bcat-fiction", name: "Fiction", slug: "fiction", description: "Novels and stories.", display_order: 2, status: "active", created_at: iso(now - 40 * DAY) },
  ];
  const base = { subtitle: null, author: "Dheeraj Rote", learn_points: [], audience: null, key_takeaways: [], cover_image_path: null, isbn_10: null, isbn_13: null, publisher: null, page_count: null, edition: null, formats: [], language: "en", publication_date: null, status: "published" as const, seo_title: null, meta_description: null, og_image_path: null, canonical_url: null };
  const books: Book[] = [
    {
      ...base,
      id: "book-memoir",
      title: "From a Little Diary to a World of Stories",
      slug: "from-a-little-diary-to-a-world-of-stories",
      short_description: "A memoir about finding the way to becoming an author — through reading, diaries, a career in UX, and rediscovering writing.",
      full_description:
        "Long before these essays, there was a 7th-standard student co-writing a printed book about 55 personalities with his best friend. This memoir follows the path from that first book to becoming an author: the reading that started it, the diaries that kept it alive, a career in UX design, and the moment writing found its way back.",
      category_id: "bcat-memoir",
      tags: ["memoir", "writing", "reading"],
      is_featured: true,
      published_at: iso(now - 30 * DAY),
      created_at: iso(now - 32 * DAY),
      updated_at: iso(now - 30 * DAY),
    },
    {
      ...base,
      id: "book-novel",
      title: "Two Souls, One Small Universe",
      slug: "two-souls-one-small-universe",
      short_description: "Dheeraj Rote's debut novel — two people from different emotional worlds learning to understand each other.",
      full_description: "Two people from different emotional worlds, and the slow, uncertain work of learning to understand each other. Dheeraj Rote's debut novel and his first full-length work of fiction.",
      category_id: "bcat-fiction",
      tags: ["novel", "relationships"],
      is_featured: true,
      published_at: iso(now - 29 * DAY),
      created_at: iso(now - 32 * DAY),
      updated_at: iso(now - 29 * DAY),
    },
  ];
  const placements: Placement[] = PLACEMENT_DEFAULTS.map(([k, heading, description, max], i) => ({ id: `pl-${i}`, placement_key: k, heading, description, max_books: max, is_active: true }));
  let recId = 0;
  const rec = (book_id: string, placement: PlacementKey, display_order: number, publication_id: string | null = null, extra: Partial<Recommendation> = {}): Recommendation => ({
    id: `rec-${++recId}`, publication_id, book_id, placement, priority: 0, display_order, is_featured: false, is_active: true, start_date: null, end_date: null, created_at: iso(now - 28 * DAY), ...extra,
  });
  const recommendations: Recommendation[] = [
    ...(["homepage_featured", "homepage_carousel", "reader_sidebar", "reader_footer", "publication_page", "books_landing"] as PlacementKey[]).flatMap((p) => [rec("book-memoir", p, 0), rec("book-novel", p, 1)]),
    rec("book-memoir", "download_success", 0, null, { is_featured: true }),
    // Publication-specific examples: essays about relationships point to the novel first.
    ...["pub-strangers", "pub-not-everyone-stays", "pub-people-we-remember"].filter((id) => publicationIds.includes(id)).map((id) => rec("book-novel", "reader_sidebar", 0, id, { priority: 10 })),
    ...["pub-strangers", "pub-not-everyone-stays", "pub-people-we-remember"].filter((id) => publicationIds.includes(id)).map((id) => rec("book-novel", "download_success", 0, id, { priority: 10 })),
  ];
  // Engagement history (impressions and detail views only — no links exist, so no clicks).
  const bookEvents: DemoBookEvent[] = [];
  let n = 0;
  for (let d = 28; d >= 0; d--) {
    for (const b of books) {
      const imps = Math.round(6 + rand() * 14);
      for (let i = 0; i < imps; i++) {
        const placement = (["homepage_featured", "reader_sidebar", "reader_footer", "homepage_carousel", "download_success"] as const)[Math.floor(rand() * 5)];
        const t = Math.min(now - d * DAY + rand() * 20 * 3600_000 - 10 * 3600_000, now - 60_000);
        bookEvents.push({ id: `be-${++n}`, book_id: b.id, purchase_link_id: null, event_type: "book_impression", session_id: `bs-${n}`, placement, publication_id: null, marketplace: null, format: null, created_at: iso(t) });
        if (rand() < 0.09) bookEvents.push({ id: `be-${++n}`, book_id: b.id, purchase_link_id: null, event_type: "book_detail_view", session_id: `bs-${n}`, placement: "book_detail", publication_id: null, marketplace: null, format: null, created_at: iso(t + 30_000) });
      }
    }
  }
  return { bookCategories, books, links: [] as PurchaseLink[], placements, recommendations, bookEvents };
}
