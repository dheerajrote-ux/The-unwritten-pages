import { useCallback, useEffect, useRef, useState } from "react";
import { ZoomIn, ZoomOut } from "lucide-react";
import { canvasToBlob } from "@/lib/pdf";

const DEFAULT_RATIO = 3 / 4; // width / height

/**
 * Drag-to-position, slider-to-zoom cropper locked to 3:4. Output is rendered
 * from the original image at its native resolution (capped), so quality is kept.
 */
export function CoverCropper({ file, onChange, ratio = DEFAULT_RATIO, maxHeight = 2400, ratioLabel = "3:4" }: { file: File; onChange: (blob: Blob) => void; ratio?: number; maxHeight?: number; ratioLabel?: string }) {
  const RATIO = ratio;
  const MAX_OUT_H = maxHeight;
  const frame = useRef<HTMLDivElement>(null);
  const [img, setImg] = useState<HTMLImageElement | null>(null);
  const [url, setUrl] = useState<string>("");
  const [zoom, setZoom] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 }); // in frame px, relative to centred position
  const drag = useRef<{ x: number; y: number; ox: number; oy: number } | null>(null);
  const [frameW, setFrameW] = useState(240);

  useEffect(() => {
    const u = URL.createObjectURL(file);
    setUrl(u);
    const i = new Image();
    i.onload = () => {
      setImg(i);
      setZoom(1);
      setOffset({ x: 0, y: 0 });
    };
    i.src = u;
    return () => URL.revokeObjectURL(u);
  }, [file]);

  useEffect(() => {
    const el = frame.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setFrameW(el.clientWidth));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const frameH = frameW / RATIO;
  // "cover" scale so the image always fills the frame at zoom 1
  const base = img ? Math.max(frameW / img.naturalWidth, frameH / img.naturalHeight) : 1;
  const scale = base * zoom;
  const dispW = img ? img.naturalWidth * scale : 0;
  const dispH = img ? img.naturalHeight * scale : 0;

  const clampOffset = useCallback(
    (o: { x: number; y: number }) => {
      const mx = Math.max(0, (dispW - frameW) / 2);
      const my = Math.max(0, (dispH - frameH) / 2);
      return { x: Math.max(-mx, Math.min(mx, o.x)), y: Math.max(-my, Math.min(my, o.y)) };
    },
    [dispW, dispH, frameW, frameH],
  );

  useEffect(() => setOffset((o) => clampOffset(o)), [clampOffset]);

  // Export whenever the crop changes (debounced).
  useEffect(() => {
    if (!img) return;
    const t = setTimeout(async () => {
      const left = (dispW - frameW) / 2 - offset.x;
      const top = (dispH - frameH) / 2 - offset.y;
      const sx = left / scale;
      const sy = top / scale;
      const sw = frameW / scale;
      const sh = frameH / scale;
      const outH = Math.min(MAX_OUT_H, Math.round(sh));
      const outW = Math.round(outH * RATIO);
      const c = document.createElement("canvas");
      c.width = outW;
      c.height = outH;
      const ctx = c.getContext("2d")!;
      ctx.imageSmoothingQuality = "high";
      ctx.drawImage(img, sx, sy, sw, sh, 0, 0, outW, outH);
      const type = file.type === "image/png" ? "image/png" : "image/jpeg";
      onChange(await canvasToBlob(c, type, 0.92));
    }, 250);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [img, zoom, offset, frameW]);

  return (
    <div className="flex flex-col items-center gap-4 sm:flex-row sm:items-start">
      <div
        ref={frame}
        className="relative w-[220px] shrink-0 cursor-grab touch-none overflow-hidden rounded-[3px] bg-admin-bg shadow-book active:cursor-grabbing"
        style={{ aspectRatio: String(ratio) }}
        onPointerDown={(e) => {
          (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
          drag.current = { x: e.clientX, y: e.clientY, ox: offset.x, oy: offset.y };
        }}
        onPointerMove={(e) => {
          const d = drag.current;
          if (!d) return;
          setOffset(clampOffset({ x: d.ox + (e.clientX - d.x), y: d.oy + (e.clientY - d.y) }));
        }}
        onPointerUp={() => (drag.current = null)}
        aria-label="Drag to position the cover"
      >
        {url && img && (
          <img
            src={url}
            alt=""
            draggable={false}
            className="pointer-events-none absolute max-w-none select-none"
            style={{ width: dispW, height: dispH, left: (frameW - dispW) / 2 + offset.x, top: (frameH - dispH) / 2 + offset.y }}
          />
        )}
      </div>
      <div className="w-full max-w-[260px] text-[12.5px] text-muted">
        <p className="font-medium text-ink">Position your cover</p>
        <p className="mt-1">Drag the image to reposition and use the slider to zoom. The cover is cropped to {ratioLabel} and optimised for the web.</p>
        <div className="mt-4 flex items-center gap-2">
          <ZoomOut className="size-4" />
          <input type="range" min={1} max={3} step={0.01} value={zoom} onChange={(e) => setZoom(Number(e.target.value))} className="flex-1 accent-[#172b4d]" aria-label="Zoom" />
          <ZoomIn className="size-4" />
        </div>
        {img && <p className="mt-3">Source: {img.naturalWidth} × {img.naturalHeight}px</p>}
      </div>
    </div>
  );
}
