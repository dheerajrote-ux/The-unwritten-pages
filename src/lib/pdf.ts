import * as pdfjs from "pdfjs-dist";
import type { PDFDocumentProxy, RenderTask } from "pdfjs-dist";
import workerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import type { PageImage, ReaderSource } from "./types";

pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;

/** Minimal document backed by page images; behaves like a PDF for the reader. */
export interface ImageDoc {
  kind: "images";
  numPages: number;
  pages: PageImage[];
  destroy: () => Promise<void>;
}

export type PdfDoc = PDFDocumentProxy | ImageDoc;

export function isImageDoc(doc: PdfDoc): doc is ImageDoc {
  return (doc as ImageDoc).kind === "images";
}

const imageCache = new Map<string, Promise<HTMLImageElement>>();
function loadImage(url: string): Promise<HTMLImageElement> {
  let p = imageCache.get(url);
  if (!p) {
    p = new Promise((resolve, reject) => {
      const img = new Image();
      img.decoding = "async";
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error("Page image failed to load"));
      img.src = url;
    });
    imageCache.set(url, p);
  }
  return p;
}

export interface OpenOptions {
  onProgress?: (fraction: number) => void;
}

/**
 * Opens a PDF with range requests enabled so large documents become readable
 * before they are fully downloaded; pages are rendered on demand.
 */
export async function openPdf(source: ReaderSource | File | Blob, opts: OpenOptions = {}): Promise<PdfDoc> {
  if (!(source instanceof Blob) && "images" in source) {
    const pages = source.images;
    // Warm the first spread so the reader opens instantly.
    await Promise.all(pages.slice(0, 3).map((p, i) => loadImage(p.url).then(() => opts.onProgress?.((i + 1) / 3))));
    return { kind: "images", numPages: pages.length, pages, destroy: async () => undefined };
  }
  let params: Parameters<typeof pdfjs.getDocument>[0];
  if (source instanceof Blob) {
    params = { data: new Uint8Array(await source.arrayBuffer()) };
  } else if ("data" in source) {
    params = { data: source.data.slice() };
  } else {
    params = { url: source.url, rangeChunkSize: 262144, disableAutoFetch: false, disableStream: false };
  }
  const task = pdfjs.getDocument({ ...params, isEvalSupported: false, enableXfa: false });
  if (opts.onProgress) {
    task.onProgress = ({ loaded, total }: { loaded: number; total: number }) => {
      if (total) opts.onProgress!(Math.min(1, loaded / total));
    };
  }
  return task.promise;
}

/** Page aspect ratio (height / width) of a given page. */
export async function pageAspect(doc: PdfDoc, pageNumber = 1): Promise<number> {
  if (isImageDoc(doc)) {
    const p = doc.pages[pageNumber - 1];
    return p.height / p.width;
  }
  const page = await doc.getPage(pageNumber);
  const vp = page.getViewport({ scale: 1 });
  return vp.height / vp.width;
}

/**
 * Renders one page into a canvas at `cssWidth` CSS pixels, using devicePixelRatio
 * for sharp text. Returns a cancel function.
 */
export function renderPage(doc: PdfDoc, pageNumber: number, canvas: HTMLCanvasElement, cssWidth: number, quality = 1): { promise: Promise<void>; cancel: () => void } {
  let task: RenderTask | null = null;
  let cancelled = false;
  if (isImageDoc(doc)) {
    const promise = (async () => {
      const img = await loadImage(doc.pages[pageNumber - 1].url);
      if (cancelled) return;
      const dpr = Math.min(window.devicePixelRatio || 1, 2.5);
      const w = Math.min(img.naturalWidth, Math.round(cssWidth * dpr * quality)) || img.naturalWidth;
      const h = Math.round((w * img.naturalHeight) / img.naturalWidth);
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext("2d")!;
      ctx.imageSmoothingQuality = "high";
      ctx.drawImage(img, 0, 0, w, h);
    })();
    return { promise, cancel: () => void (cancelled = true) };
  }
  const promise = (async () => {
    const page = await doc.getPage(pageNumber);
    if (cancelled) return;
    const base = page.getViewport({ scale: 1 });
    const dpr = Math.min(window.devicePixelRatio || 1, 2.5);
    const scale = (cssWidth / base.width) * dpr * quality;
    const viewport = page.getViewport({ scale });
    const off = document.createElement("canvas");
    off.width = Math.floor(viewport.width);
    off.height = Math.floor(viewport.height);
    const ctx = off.getContext("2d", { alpha: false })!;
    task = page.render({ canvasContext: ctx, viewport, canvas: off } as Parameters<typeof page.render>[0]);
    await task.promise;
    if (cancelled) return;
    canvas.width = off.width;
    canvas.height = off.height;
    canvas.getContext("2d")!.drawImage(off, 0, 0);
  })().catch((err) => {
    if (cancelled || err?.name === "RenderingCancelledException") return;
    throw err;
  });
  return {
    promise,
    cancel: () => {
      cancelled = true;
      task?.cancel();
    },
  };
}

export async function renderPageToBlob(doc: PDFDocumentProxy, pageNumber: number, width: number, type = "image/webp", quality = 0.9): Promise<Blob> {
  const page = await doc.getPage(pageNumber);
  const base = page.getViewport({ scale: 1 });
  const viewport = page.getViewport({ scale: width / base.width });
  const canvas = document.createElement("canvas");
  canvas.width = Math.floor(viewport.width);
  canvas.height = Math.floor(viewport.height);
  const ctx = canvas.getContext("2d", { alpha: false })!;
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  await page.render({ canvasContext: ctx, viewport, canvas } as Parameters<typeof page.render>[0]).promise;
  return canvasToBlob(canvas, type, quality);
}

export function canvasToBlob(canvas: HTMLCanvasElement, type = "image/webp", quality = 0.9): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (b) => {
        if (b && (b.type === type || type !== "image/webp")) return resolve(b);
        // Safari < 16 cannot encode WebP; fall back to JPEG.
        if (b) return resolve(b);
        canvas.toBlob((jb) => (jb ? resolve(jb) : reject(new Error("Could not encode image"))), "image/jpeg", quality);
      },
      type,
      quality,
    );
  });
}

export interface PdfInspection {
  pageCount: number;
  aspect: number;
  cover: Blob;
  title?: string;
  author?: string;
}

/** Validates a PDF file and extracts page count, first-page cover and metadata. */
export async function inspectPdf(file: File | Blob): Promise<PdfInspection> {
  const doc = (await openPdf(file)) as PDFDocumentProxy;
  try {
    const [cover, aspect, meta] = await Promise.all([
      renderPageToBlob(doc, 1, 1200, "image/jpeg", 0.9), // JPEG: universally supported by social previews
      pageAspect(doc, 1),
      doc.getMetadata().catch(() => null),
    ]);
    const info = (meta?.info ?? {}) as { Title?: string; Author?: string };
    return { pageCount: doc.numPages, aspect, cover, title: info.Title?.trim() || undefined, author: info.Author?.trim() || undefined };
  } finally {
    void doc.destroy();
  }
}
