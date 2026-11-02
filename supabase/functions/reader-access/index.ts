// POST /functions/v1/reader-access  { slug } | { publication_id }
// Returns a short-lived signed URL so the online reader can stream a live
// publication's PDF without exposing a permanent storage URL.
import { adminClient, clientIp, corsHeaders, hashKey, json, rateLimit } from "../_shared/http.ts";

const READ_TTL = 60 * 30; // 30 minutes — pdf.js fetches the full file well within this.

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders(req) });
  if (req.method !== "POST") return json(req, 405, { error: "Method not allowed" });

  let body: { slug?: string; publication_id?: string };
  try {
    body = await req.json();
  } catch {
    return json(req, 400, { error: "Invalid request body." });
  }

  const db = adminClient();
  try {
    if (!(await rateLimit(db, "reader-ip", await hashKey(clientIp(req)), 120, 600))) {
      return json(req, 429, { error: "Too many requests. Please slow down." });
    }

    let q = db.from("publications").select("id, status, published_at, pdf_storage_path").limit(1);
    if (body.publication_id) q = q.eq("id", body.publication_id);
    else if (body.slug) q = q.eq("slug", body.slug);
    else return json(req, 400, { error: "slug or publication_id is required." });

    const { data, error } = await q.maybeSingle();
    if (error) throw error;
    const live = data && data.status === "published" && data.published_at && new Date(data.published_at) <= new Date();
    if (!live || !data?.pdf_storage_path) return json(req, 404, { error: "Publication not found." });

    const { data: signed, error: signErr } = await db.storage
      .from("publications")
      .createSignedUrl(data.pdf_storage_path, READ_TTL);
    if (signErr || !signed) throw signErr ?? new Error("Could not sign URL");

    return json(req, 200, { url: signed.signedUrl, expires_in: READ_TTL });
  } catch (err) {
    console.error("reader-access failed", err);
    return json(req, 500, { error: "Unable to open this publication right now." });
  }
});
