import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, Download, Expand, LayoutGrid, Minimize, Minus, Plus, X } from "lucide-react";
import { openPdf, pageAspect, type PdfDoc } from "@/lib/pdf";
import type { ReaderSettings, ReaderSource } from "@/lib/types";
import { cn } from "@/lib/utils";
import { Flipbook, type FlipbookHandle } from "./Flipbook";
import { PageCanvas } from "./PageCanvas";
import { Thumbnails } from "./Thumbnails";

const ZOOMS = [1, 1.25, 1.5, 2, 2.5, 3];

interface Props {
  /** Resolves the PDF location (lets callers fetch signed URLs lazily). */
  loadSource: () => Promise<ReaderSource | Blob>;
  sourceKey: string;
  settings: ReaderSettings;
  title: string;
  onOpened?: (pageCount: number) => void;
  onDownload?: () => void;
  className?: string;
  /** Forces single-page layout (e.g. admin mobile preview). */
  forceSingle?: boolean;
  /** Rendered over the stage once the reader reaches the final page. */
  endPanel?: (dismiss: () => void) => React.ReactNode;
}

/**
 * Interactive PDF reader: flipbook spreads on wide screens, single pages on
 * narrow ones, zoom with panning, thumbnails, keyboard and fullscreen.
 */
export function PdfReader({ loadSource, sourceKey, settings, title, onOpened, onDownload, className, forceSingle, endPanel }: Props) {
  const rootRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const bookRef = useRef<FlipbookHandle>(null);
  const [doc, setDoc] = useState<PdfDoc | null>(null);
  const [aspect, setAspect] = useState(1.414);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(0);
  const [zoom, setZoom] = useState(1);
  const [thumbsOpen, setThumbsOpen] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [pseudoFullscreen, setPseudoFullscreen] = useState(false);
  const [stage, setStage] = useState({ w: 0, h: 0 });
  const [attempt, setAttempt] = useState(0);
  const [endDismissed, setEndDismissed] = useState(false);

  // ---- load document ---------------------------------------------------------
  useEffect(() => {
    let cancelled = false;
    let opened: PdfDoc | null = null;
    setDoc(null);
    setError(null);
    setProgress(0);
    setPage(0);
    setZoom(1);
    (async () => {
      try {
        const src = await loadSource();
        if (cancelled) return;
        const d = await openPdf(src, { onProgress: (p) => !cancelled && setProgress(p) });
        opened = d;
        if (cancelled) return void d.destroy();
        const a = await pageAspect(d, 1);
        if (cancelled) return;
        setAspect(a);
        setDoc(d);
        onOpened?.(d.numPages);
      } catch (e) {
        if (!cancelled) setError((e as Error)?.message?.includes("Invalid PDF") ? "This file couldn't be read as a PDF." : (e as Error)?.message || "We couldn't open this publication.");
      }
    })();
    return () => {
      cancelled = true;
      void opened?.destroy();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sourceKey, attempt]);

  // ---- measure stage ---------------------------------------------------------
  useLayoutEffect(() => {
    const el = stageRef.current;
    if (!el) return;
    let t: ReturnType<typeof setTimeout>;
    const measure = () => setStage({ w: el.clientWidth, h: el.clientHeight });
    measure();
    const ro = new ResizeObserver(() => {
      clearTimeout(t);
      t = setTimeout(measure, 120);
    });
    ro.observe(el);
    return () => {
      ro.disconnect();
      clearTimeout(t);
    };
  }, []);

  const count = doc?.numPages ?? 0;
  const narrow = stage.w < 720;
  const double = !forceSingle && settings.double_page_mode && settings.flipbook_enabled && !narrow && count > 1;
  const pad = narrow ? 16 : 48;
  const layout = useMemo(() => {
    const availW = Math.max(0, stage.w - pad * 2);
    const availH = Math.max(0, stage.h - pad * 2);
    let w = Math.floor(Math.min(availW / (double ? 2 : 1), availH / aspect));
    w = Math.max(w, 80);
    return { w, h: Math.floor(w * aspect) };
  }, [stage, pad, double, aspect]);

  // ---- navigation -------------------------------------------------------------
  const useFlip = settings.flipbook_enabled && zoom === 1;
  const step = double ? 2 : 1;
  const clamp = (i: number) => Math.max(0, Math.min(count - 1, i));
  /** Index of the left page of the spread containing i (cover is alone). */
  const spreadStart = useCallback((i: number) => (double ? (i === 0 ? 0 : i % 2 === 1 ? i : i - 1) : i), [double]);

  const next = useCallback(() => {
    if (useFlip) return bookRef.current?.next();
    setPage((p) => {
      const s = spreadStart(p);
      return clamp(!double ? s + 1 : s === 0 ? 1 : s + step);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [useFlip, double, step, count, spreadStart]);
  const prev = useCallback(() => {
    if (useFlip) return bookRef.current?.prev();
    setPage((p) => {
      const s = spreadStart(p);
      return clamp(!double ? s - 1 : s <= 1 ? 0 : s - step);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [useFlip, double, step, count, spreadStart]);
  const goTo = useCallback(
    (i: number) => {
      const target = clamp(i);
      if (useFlip) bookRef.current?.goTo(target);
      else setPage(target);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [useFlip, count],
  );

  const zoomBy = useCallback(
    (dir: 1 | -1 | 0) => {
      if (!settings.zoom_enabled) return;
      setZoom((z) => {
        if (dir === 0) return 1;
        const i = ZOOMS.indexOf(z);
        return ZOOMS[Math.max(0, Math.min(ZOOMS.length - 1, i + dir))];
      });
    },
    [settings.zoom_enabled],
  );

  // ---- fullscreen ---------------------------------------------------------------
  useEffect(() => {
    const on = () => setIsFullscreen(document.fullscreenElement === rootRef.current);
    document.addEventListener("fullscreenchange", on);
    return () => document.removeEventListener("fullscreenchange", on);
  }, []);
  const toggleFullscreen = useCallback(async () => {
    if (!settings.fullscreen_enabled) return;
    if (isFullscreen) return void document.exitFullscreen().catch(() => undefined);
    if (pseudoFullscreen) return setPseudoFullscreen(false);
    try {
      if (!rootRef.current?.requestFullscreen) throw new Error("unsupported");
      await rootRef.current.requestFullscreen();
    } catch {
      setPseudoFullscreen(true); // e.g. iOS Safari or sandboxed iframes
    }
  }, [isFullscreen, pseudoFullscreen, settings.fullscreen_enabled]);

  // ---- keyboard -----------------------------------------------------------------
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (t.closest("input, textarea, select, [contenteditable], [role=dialog]")) return;
      if (!doc) return;
      switch (e.key) {
        case "ArrowRight":
        case "PageDown":
          e.preventDefault();
          next();
          break;
        case "ArrowLeft":
        case "PageUp":
          e.preventDefault();
          prev();
          break;
        case "Home":
          e.preventDefault();
          goTo(0);
          break;
        case "End":
          e.preventDefault();
          goTo(count - 1);
          break;
        case "+":
        case "=":
          e.preventDefault();
          zoomBy(1);
          break;
        case "-":
          zoomBy(-1);
          break;
        case "0":
          zoomBy(0);
          break;
        case "f":
        case "F":
          void toggleFullscreen();
          break;
        case "t":
        case "T":
          if (settings.thumbnail_navigation_enabled) setThumbsOpen((v) => !v);
          break;
        case "Escape":
          if (pseudoFullscreen) setPseudoFullscreen(false);
          setThumbsOpen(false);
          break;
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [doc, next, prev, goTo, zoomBy, toggleFullscreen, count, pseudoFullscreen, settings.thumbnail_navigation_enabled]);

  // Keep page index valid when layout flips between single/double.
  useEffect(() => {
    if (!useFlip) setPage((p) => spreadStart(p));
  }, [double, useFlip, spreadStart]);

  const visiblePages = useMemo(() => {
    const s = spreadStart(page);
    if (!double || s === 0 || s + 1 >= count) return [s];
    return [s, s + 1];
  }, [page, double, count, spreadStart]);
  const label = visiblePages.length === 2 ? `${visiblePages[0] + 1}–${visiblePages[1] + 1}` : `${visiblePages[0] + 1}`;
  const atStart = visiblePages[0] <= 0;
  const atEnd = visiblePages[visiblePages.length - 1] >= count - 1;

  const fullscreenActive = isFullscreen || pseudoFullscreen;

  return (
    <div
      ref={rootRef}
      className={cn(
        "relative flex min-h-0 flex-col overflow-hidden bg-[#ebe8e2]",
        "[background-image:radial-gradient(ellipse_at_center,rgba(255,255,255,0.65),rgba(255,255,255,0)_70%)]",
        pseudoFullscreen && "fixed inset-0 z-[70]",
        className,
      )}
      aria-label={`${title} reader`}
    >
      {fullscreenActive && (
        <div className="flex h-12 shrink-0 items-center justify-between px-4 text-sm">
          <span className="truncate font-display text-[17px] text-ink">{title}</span>
          <button onClick={() => void toggleFullscreen()} className="grid size-9 place-items-center rounded-md hover:bg-black/5" aria-label="Exit fullscreen">
            <X className="size-4" />
          </button>
        </div>
      )}

      {/* Stage */}
      <div ref={stageRef} className="relative min-h-0 flex-1">
        {!doc && !error && <LoadingBook progress={progress} w={layout.w} h={layout.h} double={double} />}
        {error && (
          <div className="absolute inset-0 grid place-items-center p-6 text-center" role="alert">
            <div>
              <p className="font-display text-xl text-ink">We couldn't open this publication</p>
              <p className="mt-2 text-sm text-muted">{error}</p>
              <button onClick={() => setAttempt((a) => a + 1)} className="mt-4 text-sm font-medium text-primary underline-offset-4 hover:underline">
                Try again
              </button>
            </div>
          </div>
        )}

        {doc && stage.w > 0 && useFlip && (
          <div className="absolute inset-0 flex items-center justify-center animate-fade-in">
            <div style={{ width: double ? layout.w * 2 : layout.w, height: layout.h }}>
              <Flipbook key={`${double}-${layout.w}-${layout.h}`} ref={bookRef} doc={doc} pageWidth={layout.w} pageHeight={layout.h} double={double} startPage={page} onPageChange={setPage} />
            </div>
          </div>
        )}

        {doc && stage.w > 0 && !useFlip && <PagedView doc={doc} pages={visiblePages} pageW={layout.w} pageH={layout.h} zoom={zoom} />}

        {doc && endPanel && atEnd && !endDismissed && count > 1 && (
          <div className="pointer-events-none absolute inset-x-0 bottom-3 z-20 flex justify-center px-3 animate-rise">
            <div className="pointer-events-auto w-full max-w-3xl">{endPanel(() => setEndDismissed(true))}</div>
          </div>
        )}

        {/* Side arrows (desktop) */}
        {doc && !narrow && (
          <>
            <EdgeButton side="left" disabled={atStart} onClick={prev} />
            <EdgeButton side="right" disabled={atEnd} onClick={next} />
          </>
        )}
      </div>

      {/* Thumbnails */}
      {doc && settings.thumbnail_navigation_enabled && thumbsOpen && <Thumbnails doc={doc} current={visiblePages} onSelect={(i) => goTo(i)} onClose={() => setThumbsOpen(false)} />}

      {/* Toolbar */}
      <div className="flex shrink-0 justify-center px-3 pb-3 pt-1 sm:pb-4">
        <div className="flex items-center gap-0.5 rounded-full border border-black/[0.06] bg-white/90 p-1 shadow-[0_8px_24px_-12px_rgba(23,43,77,0.35)] backdrop-blur">
          <ToolButton label="Previous page" onClick={prev} disabled={!doc || atStart}>
            <ChevronLeft />
          </ToolButton>
          <span className="min-w-[78px] px-2 text-center text-[13px] font-medium tabular-nums text-ink" aria-live="polite">
            {doc ? (
              <>
                {label} <span className="text-muted">/ {count}</span>
              </>
            ) : (
              <span className="text-muted">Loading…</span>
            )}
          </span>
          <ToolButton label="Next page" onClick={next} disabled={!doc || atEnd}>
            <ChevronRight />
          </ToolButton>

          {settings.zoom_enabled && (
            <div className="hidden items-center sm:flex">
              <Divider />
              <ToolButton label="Zoom out" onClick={() => zoomBy(-1)} disabled={!doc || zoom === 1}>
                <Minus />
              </ToolButton>
              <button onClick={() => zoomBy(0)} disabled={!doc} className="min-w-[52px] rounded-full px-1 text-[12.5px] font-medium tabular-nums text-secondary hover:text-ink" aria-label="Reset zoom">
                {Math.round(zoom * 100)}%
              </button>
              <ToolButton label="Zoom in" onClick={() => zoomBy(1)} disabled={!doc || zoom === ZOOMS[ZOOMS.length - 1]}>
                <Plus />
              </ToolButton>
            </div>
          )}

          {(settings.thumbnail_navigation_enabled || settings.fullscreen_enabled || onDownload) && <Divider />}
          {settings.thumbnail_navigation_enabled && (
            <ToolButton label={thumbsOpen ? "Hide thumbnails" : "Show thumbnails"} onClick={() => setThumbsOpen((v) => !v)} disabled={!doc} active={thumbsOpen}>
              <LayoutGrid />
            </ToolButton>
          )}
          {settings.fullscreen_enabled && (
            <ToolButton label={fullscreenActive ? "Exit fullscreen" : "Fullscreen"} onClick={() => void toggleFullscreen()}>
              {fullscreenActive ? <Minimize /> : <Expand />}
            </ToolButton>
          )}
          {onDownload && fullscreenActive && (
            <ToolButton label="Download PDF" onClick={onDownload}>
              <Download />
            </ToolButton>
          )}
        </div>
      </div>
    </div>
  );
}

function ToolButton({ label, onClick, disabled, active, children }: { label: string; onClick: () => void; disabled?: boolean; active?: boolean; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      title={label}
      className={cn(
        "grid size-9 place-items-center rounded-full text-ink transition-colors hover:bg-black/[0.05] disabled:opacity-30 disabled:hover:bg-transparent [&_svg]:size-[18px]",
        active && "bg-primary text-white hover:bg-primary",
      )}
    >
      {children}
    </button>
  );
}

function Divider() {
  return <span className="mx-1 h-5 w-px bg-black/10" aria-hidden />;
}

function EdgeButton({ side, disabled, onClick }: { side: "left" | "right"; disabled: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={side === "left" ? "Previous page" : "Next page"}
      className={cn(
        "absolute top-1/2 z-10 grid size-11 -translate-y-1/2 place-items-center rounded-full bg-white/80 text-ink shadow-sm ring-1 ring-black/5 backdrop-blur transition-all hover:bg-white hover:shadow-md disabled:pointer-events-none disabled:opacity-0",
        side === "left" ? "left-3" : "right-3",
      )}
    >
      {side === "left" ? <ChevronLeft className="size-5" /> : <ChevronRight className="size-5" />}
    </button>
  );
}

function LoadingBook({ progress, w, h, double }: { progress: number; w: number; h: number; double: boolean }) {
  return (
    <div className="absolute inset-0 flex flex-col items-center justify-center gap-5" role="status" aria-live="polite">
      <div className="flex gap-0.5" style={{ width: Math.min((double ? 2 : 1) * w, 900), height: Math.min(h, 640) }}>
        <div className="skeleton h-full flex-1 rounded-l-[3px] rounded-r-none" />
        {double && <div className="skeleton h-full flex-1 rounded-l-none rounded-r-[3px]" />}
      </div>
      <div className="w-48">
        <div className="h-1 overflow-hidden rounded-full bg-black/10">
          <div className="h-full rounded-full bg-primary transition-[width] duration-300" style={{ width: `${Math.max(6, progress * 100)}%` }} />
        </div>
        <p className="mt-2 text-center text-[12px] text-muted">Preparing pages{progress > 0 ? ` · ${Math.round(progress * 100)}%` : "…"}</p>
      </div>
    </div>
  );
}

/** Static spread used for zoomed reading or when the flip effect is disabled. Drag to pan. */
function PagedView({ doc, pages, pageW, pageH, zoom }: { doc: PdfDoc; pages: number[]; pageW: number; pageH: number; zoom: number }) {
  const scroller = useRef<HTMLDivElement>(null);
  const drag = useRef<{ x: number; y: number; l: number; t: number } | null>(null);
  const w = Math.floor(pageW * zoom);
  const h = Math.floor(pageH * zoom);

  useEffect(() => {
    const el = scroller.current;
    if (!el) return;
    el.scrollLeft = (el.scrollWidth - el.clientWidth) / 2;
    el.scrollTop = 0;
  }, [zoom, pages]);

  return (
    <div
      ref={scroller}
      className={cn("absolute inset-0 overflow-auto scrollbar-thin", zoom > 1 ? "cursor-grab active:cursor-grabbing" : "")}
      onPointerDown={(e) => {
        if (zoom === 1 || e.pointerType === "touch") return;
        const el = scroller.current!;
        drag.current = { x: e.clientX, y: e.clientY, l: el.scrollLeft, t: el.scrollTop };
        el.setPointerCapture(e.pointerId);
      }}
      onPointerMove={(e) => {
        const d = drag.current;
        if (!d) return;
        const el = scroller.current!;
        el.scrollLeft = d.l - (e.clientX - d.x);
        el.scrollTop = d.t - (e.clientY - d.y);
      }}
      onPointerUp={() => (drag.current = null)}
    >
      <div className="flex min-h-full min-w-full items-center justify-center p-4 sm:p-12">
        <div key={pages.join("-")} className="flex shadow-book animate-fade-in">
          {pages.map((p) => (
            <div key={p} style={{ width: w, height: h }} className="bg-white">
              <PageCanvas doc={doc} pageNumber={p + 1} width={w} visible priority />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
