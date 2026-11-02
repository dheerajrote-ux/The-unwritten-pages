// POST /functions/v1/request-download
// Validates the lead form, stores/reuses the lead, records the download and
// returns a short-lived signed URL for the private PDF.
import { adminClient, clientIp, corsHeaders, hashKey, json, rateLimit } from "../_shared/http.ts";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const SIGNED_URL_TTL = 120; // seconds

function clean(v: unknown, max: number): string | null {
  if (typeof v !== "string") return null;
  const s = v.trim().replace(/\s+/g, " ");
  if (!s) return null;
  return s.slice(0, max);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders(req) });
  if (req.method !== "POST") return json(req, 405, { error: "Method not allowed" });

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return json(req, 400, { error: "Invalid request body." });
  }

  // --- Spam protection: honeypot + minimum fill time -----------------------
  if (typeof body.website === "string" && body.website.trim() !== "") {
    return json(req, 400, { error: "Submission rejected." });
  }
  const startedAt = Number(body.started_at);
  if (Number.isFinite(startedAt) && Date.now() - startedAt < 1500) {
    return json(req, 429, { error: "Please take a moment to complete the form." });
  }

  // --- Validation -----------------------------------------------------------
  const errors: Record<string, string> = {};
  const publicationId = clean(body.publication_id, 64);
  const fullName = clean(body.full_name, 120);
  const email = clean(body.email, 254)?.toLowerCase() ?? null;
  const company = clean(body.company, 160);
  const designation = clean(body.designation, 120);
  const consent = body.marketing_consent === true;
  const sessionId = clean(body.session_id, 64);

  if (!publicationId) errors.publication_id = "Publication is required.";
  if (!fullName || fullName.length < 2) errors.full_name = "Please enter your full name.";
  if (!email) errors.email = "Please enter your work email.";
  else if (!EMAIL_RE.test(email)) errors.email = "Please enter a valid email address.";
  if (Object.keys(errors).length) return json(req, 422, { error: "Please check the highlighted fields.", fields: errors });

  const db = adminClient();

  try {
    // --- Rate limiting (per IP and per email) -------------------------------
    const ipKey = await hashKey(clientIp(req));
    if (!(await rateLimit(db, "download-ip", ipKey, 10, 600))) {
      return json(req, 429, { error: "Too many requests. Please try again in a few minutes." });
    }
    if (!(await rateLimit(db, "download-email", await hashKey(email!), 6, 600))) {
      return json(req, 429, { error: "Too many downloads for this email. Please try again later." });
    }

    // --- Publication must be live and downloadable --------------------------
    const { data: pub, error: pubErr } = await db
      .from("publications")
      .select("id, title, slug, status, published_at, pdf_storage_path, publication_settings(download_enabled)")
      .eq("id", publicationId!)
      .maybeSingle();
    if (pubErr) throw pubErr;
    const settings = Array.isArray(pub?.publication_settings) ? pub?.publication_settings[0] : pub?.publication_settings;
    const live = pub && pub.status === "published" && pub.published_at && new Date(pub.published_at) <= new Date();
    if (!live || !pub?.pdf_storage_path) return json(req, 404, { error: "This publication is not available." });
    if (settings && settings.download_enabled === false) {
      return json(req, 403, { error: "Downloads are disabled for this publication." });
    }

    await db.from("publication_events").insert({ publication_id: pub.id, event_type: "download_form_submit", session_id: sessionId });

    // --- Upsert lead (one record per email) ---------------------------------
    const { data: existing, error: findErr } = await db
      .from("leads")
      .select("id, marketing_consent, company, designation")
      .ilike("email", email!)
      .maybeSingle();
    if (findErr) throw findErr;

    let leadId: string;
    if (existing) {
      const grantConsent = consent && !existing.marketing_consent;
      const { error } = await db
        .from("leads")
        .update({
          full_name: fullName,
          company: company ?? existing.company,
          designation: designation ?? existing.designation,
          // Consent is only ever granted explicitly; it is never removed or implied here.
          ...(grantConsent ? { marketing_consent: true, consent_at: new Date().toISOString() } : {}),
        })
        .eq("id", existing.id);
      if (error) throw error;
      leadId = existing.id;
    } else {
      const { data: created, error } = await db
        .from("leads")
        .insert({
          full_name: fullName,
          email,
          company,
          designation,
          marketing_consent: consent,
          consent_at: consent ? new Date().toISOString() : null,
        })
        .select("id")
        .single();
      if (error) throw error;
      leadId = created.id;
    }

    // --- Record the download (de-duplicate rapid repeat submissions) --------
    const { data: recent } = await db
      .from("downloads")
      .select("id")
      .eq("lead_id", leadId)
      .eq("publication_id", pub.id)
      .gte("downloaded_at", new Date(Date.now() - 60_000).toISOString())
      .limit(1);

    const filename = `${pub.slug}.pdf`;
    const { data: signed, error: signErr } = await db.storage
      .from("publications")
      .createSignedUrl(pub.pdf_storage_path, SIGNED_URL_TTL, { download: filename });
    if (signErr || !signed) throw signErr ?? new Error("Could not sign URL");

    if (!recent || recent.length === 0) {
      const { error: dlErr } = await db
        .from("downloads")
        .insert({ lead_id: leadId, publication_id: pub.id, publication_title: pub.title, download_status: "link_issued" });
      if (dlErr) throw dlErr;
      await db.from("publication_events").insert({ publication_id: pub.id, event_type: "download_success", session_id: sessionId });
    }

    return json(req, 200, { url: signed.signedUrl, filename, expires_in: SIGNED_URL_TTL });
  } catch (err) {
    console.error("request-download failed", err);
    return json(req, 500, { error: "We couldn't prepare your download. Please try again." });
  }
});
