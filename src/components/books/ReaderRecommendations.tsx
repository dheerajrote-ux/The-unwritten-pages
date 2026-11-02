import { useState } from "react";
import { ChevronRight, PanelRightOpen, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { activeLinks } from "@/lib/books";
import { BookCompact } from "./BookCard";
import { PurchaseFinePrint } from "./AmazonPurchaseButton";
import { usePlacement } from "./BookSections";

const KEY = "dl_reader_sidebar";

/** Placement 1 — compact "You May Also Like" panel beside the flipbook (wide screens). */
export function ReaderSidebar({ publicationId }: { publicationId: string }) {
  const { data } = usePlacement("reader_sidebar", { publicationId });
  const [open, setOpen] = useState(() => {
    try {
      return sessionStorage.getItem(KEY) !== "0";
    } catch {
      return true;
    }
  });
  const toggle = (v: boolean) => {
    setOpen(v);
    try {
      sessionStorage.setItem(KEY, v ? "1" : "0");
    } catch {
      /* ignore */
    }
  };
  if (!data?.placement || !data.books.length) return null;
  if (!open)
    return (
      <button onClick={() => toggle(true)} className="hidden w-10 shrink-0 flex-col items-center gap-3 border-l border-line bg-surface pt-5 text-[12px] font-medium text-secondary hover:text-ink xl:flex" aria-label={`Show ${data.placement.heading}`}>
        <PanelRightOpen className="size-4" />
        <span className="[writing-mode:vertical-rl]">{data.placement.heading}</span>
      </button>
    );
  return (
    <aside className="hidden w-[300px] shrink-0 flex-col border-l border-line bg-surface xl:flex" aria-label={data.placement.heading}>
      <div className="flex items-center justify-between px-5 pb-2 pt-5">
        <h2 className="font-display text-[19px] text-ink">{data.placement.heading}</h2>
        <button onClick={() => toggle(false)} className="grid size-7 place-items-center rounded-md text-muted hover:bg-black/5 hover:text-ink" aria-label="Hide recommendations">
          <ChevronRight className="size-4" />
        </button>
      </div>
      {data.placement.description && <p className="px-5 text-[12.5px] text-muted">{data.placement.description}</p>}
      <div className="flex-1 space-y-6 overflow-y-auto px-5 py-5 scrollbar-thin">
        {data.books.map((b) => <BookCompact key={b.id} book={b} surface="reader_sidebar" publicationId={publicationId} />)}
      </div>
      {data.books.some((b) => activeLinks(b).length > 0) && <PurchaseFinePrint className="border-t border-line px-5 py-3 text-[11px]" showPriceNote={false} />}
    </aside>
  );
}

/** Placement 2 — shown over the stage after the final page. */
export function ReaderFooterPanel({ publicationId, onDismiss }: { publicationId: string; onDismiss: () => void }) {
  const { data } = usePlacement("reader_footer", { publicationId });
  if (!data?.placement || !data.books.length) return null;
  return (
    <div className="relative rounded-2xl bg-primary p-5 shadow-2xl ring-1 ring-black/10 sm:p-6" role="region" aria-label={data.placement.heading}>
      <button onClick={onDismiss} className="absolute right-3 top-3 grid size-8 place-items-center rounded-full text-white/60 hover:bg-white/10 hover:text-white" aria-label="Close">
        <X className="size-4" />
      </button>
      <p className="font-display text-[22px] leading-tight text-white">{data.placement.heading}</p>
      {data.placement.description && <p className="mt-1 text-[13.5px] text-white/70">{data.placement.description}</p>}
      <div className={cn("mt-5 grid gap-5", data.books.length > 1 && "sm:grid-cols-2", data.books.length > 2 && "lg:grid-cols-3")}>
        {data.books.map((b) => <BookCompact key={b.id} book={b} surface="reader_footer" publicationId={publicationId} dark />)}
      </div>
    </div>
  );
}
