import { PUBLIC_SUPABASE_ANON_KEY, PUBLIC_SUPABASE_URL } from "./public-supabase";

const env = import.meta.env;

// Production builds fall back to the committed public project values, so a
// fresh Vercel import works without any environment variables. Local dev
// stays in demo mode unless a .env file points it at a project.
export const SUPABASE_URL: string = env.VITE_SUPABASE_URL || (env.PROD ? PUBLIC_SUPABASE_URL : "");
export const SUPABASE_ANON_KEY: string = env.VITE_SUPABASE_ANON_KEY || (env.PROD ? PUBLIC_SUPABASE_ANON_KEY : "");

const hasSupabase = Boolean(SUPABASE_URL && SUPABASE_ANON_KEY && !SUPABASE_URL.includes("YOUR-PROJECT"));

/** Demo mode runs fully in the browser (IndexedDB) with seeded sample data. */
export const DATA_MODE: "supabase" | "demo" = env.VITE_DATA_MODE === "demo" || !hasSupabase ? "demo" : "supabase";

export const ROUTER_MODE: "browser" | "hash" | "memory" = env.VITE_ROUTER === "hash" ? "hash" : env.VITE_ROUTER === "memory" ? "memory" : "browser";

/** Static preview builds ship page images instead of PDFs (and cannot deliver downloads). */
export const DEMO_PAGE_IMAGES: boolean = env.VITE_DEMO_PAGES === "images";
export const APP_NAME: string = env.VITE_APP_NAME || "The Unwritten Pages";
export const MAX_PDF_MB_DEFAULT = Number(env.VITE_MAX_PDF_MB) || 50;

/** Base URL for static assets (respects relative `base` in demo builds). */
export const ASSET_BASE: string = env.BASE_URL ?? "/";
