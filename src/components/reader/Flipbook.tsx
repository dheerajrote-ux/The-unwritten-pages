import { forwardRef, useImperativeHandle, useMemo, useRef, useSyncExternalStore } from "react";
import HTMLFlipBook from "react-pageflip";
import type { PdfDoc } from "@/lib/pdf";
import { PageCanvas } from "./PageCanvas";

/** External store so pages re-render on page change without touching the flipbook children. */
function createPageStore(initial: number) {
  let value = initial;
  const subs = new Set<() => void>();
  return {
    get: () => value,
    set: (v: number) => {
      value = v;
      subs.forEach((s) => s());
    },
    subscribe: (cb: () => void) => {
      subs.add(cb);
      return () => void subs.delete(cb);
    },
  };
}
type PageStore = ReturnType<typeof createPageStore>;

const FlipPage = forwardRef<HTMLDivElement, { doc: PdfDoc; index: number; width: number; store: PageStore }>(({ doc, index, width, store }, ref) => {
  const current = useSyncExternalStore(store.subscribe, store.get);
  const distance = Math.abs(index - current);
  return (
    <div ref={ref} className="flip-page" data-density="soft">
      <PageCanvas doc={doc} pageNumber={index + 1} width={width} visible={distance <= 3} release={distance > 7} priority={distance <= 1} />
    </div>
  );
});
FlipPage.displayName = "FlipPage";

export interface FlipbookHandle {
  next: () => void;
  prev: () => void;
  goTo: (index: number) => void;
}

interface Props {
  doc: PdfDoc;
  pageWidth: number;
  pageHeight: number;
  double: boolean;
  startPage: number;
  onPageChange: (index: number) => void;
}

export const Flipbook = forwardRef<FlipbookHandle, Props>(({ doc, pageWidth, pageHeight, double, startPage, onPageChange }, ref) => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const bookRef = useRef<any>(null);
  const store = useMemo(() => createPageStore(startPage), [startPage]);
  const count = doc.numPages;

  // Children are created once per size so react-pageflip never re-initialises mid-read.
  const pages = useMemo(
    () => Array.from({ length: count }, (_, i) => <FlipPage key={i} doc={doc} index={i} width={pageWidth} store={store} />),
    [count, doc, pageWidth, store],
  );

  const flip = () => bookRef.current?.pageFlip?.();

  useImperativeHandle(ref, () => ({
    next: () => flip()?.flipNext(),
    prev: () => flip()?.flipPrev(),
    goTo: (index: number) => {
      const pf = flip();
      if (!pf) return;
      const cur = pf.getCurrentPageIndex();
      if (Math.abs(cur - index) <= 2) pf.flip(index);
      else {
        pf.turnToPage(index);
        store.set(index);
        onPageChange(index);
      }
    },
  }));

  return (
    <HTMLFlipBook
      ref={bookRef}
      className="mx-auto [filter:drop-shadow(0_22px_28px_rgba(15,25,45,0.28))_drop-shadow(0_4px_6px_rgba(15,25,45,0.12))]"
      style={{ width: double ? pageWidth * 2 : pageWidth, height: pageHeight }}
      width={pageWidth}
      height={pageHeight}
      size="fixed"
      minWidth={120}
      maxWidth={4000}
      minHeight={160}
      maxHeight={5000}
      startPage={startPage}
      drawShadow
      flippingTime={700}
      usePortrait={!double}
      startZIndex={0}
      autoSize={false}
      maxShadowOpacity={0.35}
      showCover={double}
      mobileScrollSupport
      clickEventForward={false}
      useMouseEvents
      swipeDistance={24}
      showPageCorners
      disableFlipByClick={false}
      renderOnlyPageLengthChange
      onFlip={(e: { data: number }) => {
        store.set(e.data);
        onPageChange(e.data);
      }}
    >
      {pages}
    </HTMLFlipBook>
  );
});
Flipbook.displayName = "Flipbook";
