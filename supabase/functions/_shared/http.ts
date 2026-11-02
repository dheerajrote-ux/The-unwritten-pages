// Shared helpers for Edge Functions.
import { createClient } from "npm:@supabase/supabase-js@2";

const ALLOWED_ORIGINS = (Deno.env.get("ALLOWED_ORIGINS") ?? "*")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

export function corsHeaders(req: Request): HeadersInit {
  const origin = req.headers.get("origin") ?? "";
  const allow = ALLOWED_ORIGINS.includes("*")
    ? "*"
    : ALLOWED_ORIGINS.includes(origin)
      ? origin
      : ALLOWED_ORIGINS[0] ?? "";
  return {
    "Access-Control-Allow-Origin": allow,
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    Vary: "Origin",
  };
}

export function json(req: Request, status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders(req), "Content-Type": "application/json" },
  });
}

/** Service-role client. The key lives only in Edge Function secrets. */
export function adminClient() {
  return createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export async function hashKey(value: string): Promise<string> {
  const salt = Deno.env.get("RATE_LIMIT_SALT") ?? "digital-library";
  const data = new TextEncoder().encode(`${salt}:${value}`);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

export function clientIp(req: Request): string {
  return (
    req.headers.get("cf-connecting-ip") ??
    req.headers.get("x-real-ip") ??
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    "unknown"
  );
}

type Db = ReturnType<typeof adminClient>;

/** Sliding-window limiter backed by public.rate_limit_hits. Returns true when allowed. */
export async function rateLimit(db: Db, bucket: string, key: string, max: number, windowSec: number) {
  const since = new Date(Date.now() - windowSec * 1000).toISOString();
  const { count, error } = await db
    .from("rate_limit_hits")
    .select("id", { count: "exact", head: true })
    .eq("bucket", bucket)
    .eq("key", key)
    .gte("created_at", since);
  if (error) throw error;
  if ((count ?? 0) >= max) return false;
  await db.from("rate_limit_hits").insert({ bucket, key });
  // Opportunistic cleanup of old rows (1% of requests).
  if (Math.random() < 0.01) {
    await db.from("rate_limit_hits").delete().lt("created_at", new Date(Date.now() - 86400_000).toISOString());
  }
  return true;
}
