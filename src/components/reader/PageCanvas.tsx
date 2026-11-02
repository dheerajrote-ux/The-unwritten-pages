import { useEffect, useRef, useState } from "react";
import { renderPage, type PdfDoc } from "@/lib/pdf";
import { cn } from "@/lib/utils";

// --- tiny render queue: at most 2 pages rasterising at once ----------------
let active = 0;
const waiting: (() => void)[] = [];
function acquire(): Promise<() => void> {
  return new Promise((resolve) => {
    const go = () => {
      active++;
      resolve(() => {
        active--;
        waiting.shift()?.();
      });
    };
    if (active < 2) go();
    else waiting.push(go);
  });
}

/**
 * Renders a single PDF page into a canvas when `visible` is true. Pages far from
 * the current position release their bitmap to keep memory flat on long PDFs.
 */
export function PageCanvas({
  doc,
  pageNumber,
  width,
  visible,
  release = false,
  quality = 1,
  className,
  priority = false,
}: {
  doc: PdfDoc;
  pageNumber: number;
  width: number;
  visible: boolean;
  release?: boolean;
  quality?: number;
  className?: string;
  priority?: boolean;
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  const renderedKey = useRef<string | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    if (release && !visible) {
      if (renderedKey.current) {
        canvas.width = 0;
        canvas.height = 0;
        renderedKey.current = null;
        setReady(false);
      }
      return;
    }
    if (!visible || width <= 0) return;
    const key = `${pageNumber}:${Math.round(width)}:${quality}`;
    if (renderedKey.current === key) return;

    let cancelled = false;
    let cancelRender: (() => void) | null = null;
    let releaseSlot: (() => void) | null = null;
    (async () => {
      if (!priority) releaseSlot = await acquire();
      if (cancelled) return releaseSlot?.();
      const job = renderPage(doc, pageNumber, canvas, width, quality);
      cancelRender = job.cancel;
      try {
        await job.promise;
        if (!cancelled) {
          renderedKey.current = key;
          setReady(true);
        }
      } catch {
        /* a failed page shows the placeholder; the rest keep working */
      } finally {
        releaseSlot?.();
      }
    })();
    return () => {
      cancelled = true;
      cancelRender?.();
    };
  }, [doc, pageNumber, width, visible, release, quality, priority]);

  return (
    <div className={cn("relative h-full w-full bg-white", className)}>
      <canvas ref={ref} className="block h-full w-full object-contain" aria-label={`Page ${pageNumber}`} role="img" />
      {!ready && <div className="skeleton absolute inset-0 rounded-none opacity-70" aria-hidden />}
    </div>
  );
}
