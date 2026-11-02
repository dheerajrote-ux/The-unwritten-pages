import { createContext, useContext, useEffect, useRef } from "react";
import { api } from "@/data";
import type { EventSurface } from "@/lib/books";

/** True inside the admin area, so previews never record impressions or clicks. */
export const NoTrackingContext = createContext(false);
export const useTrackingDisabled = () => useContext(NoTrackingContext);

const seen = new Set<string>();
function alreadySeen(key: string) {
  if (seen.has(key)) return true;
  try {
    const all = JSON.parse(sessionStorage.getItem("dl_book_imp") || "[]") as string[];
    if (all.includes(key)) return true;
    sessionStorage.setItem("dl_book_imp", JSON.stringify([...all, key].slice(-400)));
  } catch {
    /* memory only */
  }
  seen.add(key);
  return false;
}

/** Records one book_impression per book + placement per session, when ≥50% visible. */
export function useBookImpression<T extends HTMLElement>(bookId: string, surface: EventSurface, publicationId?: string) {
  const ref = useRef<T>(null);
  const disabled = useTrackingDisabled();
  useEffect(() => {
    const el = ref.current;
    if (disabled || !el || typeof IntersectionObserver === "undefined") return;
    const key = `${bookId}|${surface}|${publicationId ?? ""}`;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          io.disconnect();
          if (!alreadySeen(key)) api.trackBookEvent(bookId, "book_impression", { surface, publicationId }).catch(() => undefined);
        }
      },
      { threshold: 0.5 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [bookId, surface, publicationId, disabled]);
  return ref;
}
