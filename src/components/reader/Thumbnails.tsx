import { useEffect, useRef, useState } from "react";
import { X } from "lucide-react";
import { pageAspect, type PdfDoc } from "@/lib/pdf";
import { cn } from "@/lib/utils";
import { PageCanvas } from "./PageCanvas";

const THUMB_W = 84;

/** Horizontal thumbnail strip; thumbnails render only when scrolled into view. */
export function Thumbnails({ doc, current, onSelect, onClose }: { doc: PdfDoc; current: number[]; onSelect: (i: number) => void; onClose: () => void }) {
  const listRef = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState<Set<number>>(new Set());
  const [aspect, setAspect] = useState(1.414);

  useEffect(() => {
    void pageAspect(doc, 1).then(setAspect);
  }, [doc]);

  useEffect(() => {
    const root = listRef.current;
    if (!root) return;
    const io = new IntersectionObserver(
      (entries) => {
        setVisible((prev) => {
          const next = new Set(prev);
          entries.forEach((e) => {
            const i = Number((e.target as HTMLElement).dataset.index);
            if (e.isIntersecting) next.add(i);
          });
          return next;
        });
      },
      { root, rootMargin: "0px 300px" },
    );
    root.querySelectorAll("[data-index]").forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, [doc]);

  useEffect(() => {
    listRef.current?.querySelector(`[data-index="${current[0]}"]`)?.scrollIntoView({ block: "nearest", inline: "center", behavior: "smooth" });
  }, [current]);

  return (
    <div className="relative shrink-0 border-t border-black/[0.06] bg-white/70 backdrop-blur animate-fade-in">
      <button onClick={onClose} className="absolute right-2 top-2 z-10 grid size-7 place-items-center rounded-full text-muted hover:bg-black/5 hover:text-ink" aria-label="Close thumbnails">
        <X className="size-4" />
      </button>
      <div ref={listRef} className="flex gap-3 overflow-x-auto px-4 py-3 scrollbar-thin" role="listbox" aria-label="Pages">
        {Array.from({ length: doc.numPages }, (_, i) => {
          const isCurrent = current.includes(i);
          return (
            <button
              key={i}
              data-index={i}
              role="option"
              aria-selected={isCurrent}
              onClick={() => onSelect(i)}
              className="group shrink-0 text-center"
              aria-label={`Go to page ${i + 1}`}
            >
              <div
                className={cn("overflow-hidden rounded-[3px] ring-1 ring-black/10 transition-all group-hover:ring-2 group-hover:ring-primary/40", isCurrent && "ring-2 ring-primary")}
                style={{ width: THUMB_W, height: Math.round(THUMB_W * aspect) }}
              >
                <PageCanvas doc={doc} pageNumber={i + 1} width={THUMB_W} visible={visible.has(i)} quality={0.8} />
              </div>
              <span className={cn("mt-1 block text-[11px] tabular-nums", isCurrent ? "font-semibold text-primary" : "text-muted")}>{i + 1}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
