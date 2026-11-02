#!/usr/bin/env node
/**
 * Bulk-imports PDFs into Supabase (private storage + database rows).
 *
 *   SUPABASE_URL=https://xxx.supabase.co \
 *   SUPABASE_SERVICE_ROLE_KEY=... \
 *   node scripts/import-library.mjs [manifest.json] [--draft] [--force]
 *
 * The manifest lists categories and publications; file paths are relative to
 * the manifest's `baseDir` (default: ./demo-assets). Runs locally only — the
 * service-role key must never be bundled into the frontend.
 *
 *   --draft  import as drafts instead of publishing
 *   --force  re-upload publications whose slug already exists
 */
import { readFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";

const args = process.argv.slice(2);
const manifestPath = args.find((a) => !a.startsWith("--")) ?? "src/content/library-manifest.json";
const asDraft = args.includes("--draft");
const force = args.includes("--force");

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error("Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in your shell (never in .env files that Vite reads).");
  process.exit(1);
}

const db = createClient(url, key, { auth: { persistSession: false } });
const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
const baseDir = path.resolve(manifest.baseDir ?? "demo-assets");

async function pageCount(buf) {
  const doc = await getDocument({ data: new Uint8Array(buf), isEvalSupported: false }).promise;
  const n = doc.numPages;
  await doc.destroy();
  return n;
}

// 1. Categories (upsert by slug)
const catIds = {};
for (const c of manifest.categories ?? []) {
  const { data, error } = await db.from("categories").upsert({ name: c.name, slug: c.slug, description: c.description ?? null, display_order: c.display_order ?? 0 }, { onConflict: "slug" }).select("id, slug").single();
  if (error) throw error;
  catIds[data.slug] = data.id;
  console.log(`✓ category ${c.slug}`);
}

// 2. Publications
let i = 0;
for (const p of manifest.publications) {
  i++;
  const { data: existing } = await db.from("publications").select("id").eq("slug", p.slug).maybeSingle();
  if (existing && !force) {
    console.log(`– skip ${p.slug} (exists; use --force to replace)`);
    continue;
  }
  const id = existing?.id ?? randomUUID();
  const pdf = await readFile(path.join(baseDir, p.file));
  const pdfPath = `${id}/${Date.now()}-${path.basename(p.file)}`;
  const up = await db.storage.from("publications").upload(pdfPath, pdf, { contentType: "application/pdf", upsert: false });
  if (up.error) throw up.error;

  let coverPath = null;
  if (p.cover) {
    const cover = await readFile(path.join(baseDir, p.cover));
    const ext = path.extname(p.cover).slice(1).toLowerCase();
    coverPath = `${id}/cover-${Date.now()}.${ext}`;
    const cu = await db.storage.from("publication-covers").upload(coverPath, cover, { contentType: ext === "png" ? "image/png" : ext === "webp" ? "image/webp" : "image/jpeg", cacheControl: "31536000" });
    if (cu.error) throw cu.error;
  }

  const publish = !asDraft && p.status !== "draft" && coverPath && catIds[p.category];
  // Stagger publish times so "newest first" keeps manifest order.
  const publishedAt = new Date(Date.now() - i * 60_000).toISOString();
  const row = {
    id,
    title: p.title,
    slug: p.slug,
    description: p.description ?? "",
    pdf_storage_path: pdfPath,
    cover_image_path: coverPath,
    cover_source: "auto",
    category_id: catIds[p.category] ?? null,
    author: p.author ?? null,
    publisher: p.publisher ?? null,
    language: p.language ?? "en",
    page_count: await pageCount(pdf),
    file_size: pdf.length,
    tags: p.tags ?? [],
    is_featured: !!p.featured,
    publication_date: p.publication_date ?? null,
    status: publish ? "published" : "draft",
    published_at: publish ? publishedAt : null,
  };
  const { error } = await db.from("publications").upsert(row, { onConflict: "id" });
  if (error) throw error;
  console.log(`✓ ${row.status.padEnd(9)} ${p.slug} (${row.page_count} pages)`);
}
console.log("Done.");
