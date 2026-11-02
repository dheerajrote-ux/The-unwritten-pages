import { ChevronDown, ExternalLink, ShoppingBag } from "lucide-react";
import * as DM from "@radix-ui/react-dropdown-menu";
import { api } from "@/data";
import { useSite } from "@/hooks/useSite";
import { activeLinks, formatLabel, formatPrice, linkLabel, marketplaceLabel, type Book, type EventSurface, type PurchaseLink } from "@/lib/books";
import { cn } from "@/lib/utils";
import { buttonVariants } from "@/components/ui/button";
import { useTrackingDisabled } from "./useBookImpression";

interface Props {
  book: Book;
  surface: EventSurface;
  publicationId?: string;
  size?: "sm" | "md" | "lg";
  className?: string;
  /** Show the other formats/marketplaces in a menu next to the main button. */
  withOptions?: boolean;
  label?: string;
}

/**
 * Outbound purchase button. Links are exactly the admin-supplied URLs (affiliate
 * tags untouched) and always open Amazon in a new tab. A click is recorded as
 * an outbound click — never as a sale.
 */
export function AmazonPurchaseButton({ book, surface, publicationId, size = "md", className, withOptions = true, label }: Props) {
  const { site } = useSite();
  const links = activeLinks(book);
  const rel = site.amazon_associate ? "sponsored noopener noreferrer" : "noopener noreferrer";
  const noTrack = useTrackingDisabled();
  const track = (l: PurchaseLink) => !noTrack && api.trackBookEvent(book.id, "amazon_link_click", { surface, linkId: l.id, publicationId }).catch(() => undefined);

  if (!links.length) {
    return (
      <div className={cn("inline-flex", className)}>
        <span className={cn(buttonVariants({ variant: "subtle", size }), "pointer-events-none flex-1 cursor-default text-secondary")} aria-disabled>
          <ShoppingBag /> Coming soon
        </span>
      </div>
    );
  }
  const [primary, ...rest] = links;
  return (
    <div className={cn("inline-flex", className)}>
      <a
        href={primary.product_url}
        target="_blank"
        rel={rel}
        onClick={() => track(primary)}
        className={cn(buttonVariants({ variant: "accent", size }), "flex-1", withOptions && rest.length && "rounded-r-none")}
        aria-label={`${label ?? "Buy on Amazon"}: ${linkLabel(primary)} (opens Amazon in a new tab)`}
      >
        <ShoppingBag />
        {label ?? "Buy on Amazon"}
      </a>
      {withOptions && rest.length > 0 && (
        <DM.Root>
          <DM.Trigger className={cn(buttonVariants({ variant: "accent", size }), "rounded-l-none border-l border-primary/15 px-2.5")} aria-label="More formats and stores">
            <ChevronDown />
          </DM.Trigger>
          <DM.Portal>
            <DM.Content sideOffset={6} align="end" className="z-50 min-w-64 rounded-lg border border-line bg-surface p-1.5 shadow-lg data-[state=open]:animate-fade-in">
              <p className="px-2.5 pb-1.5 pt-1 text-[11px] font-semibold uppercase tracking-wider text-muted">Formats & stores</p>
              {links.map((l) => (
                <DM.Item key={l.id} asChild>
                  <a href={l.product_url} target="_blank" rel={rel} onClick={() => track(l)} className="flex cursor-pointer items-center justify-between gap-4 rounded-md px-2.5 py-2 text-[13px] text-ink outline-none data-[highlighted]:bg-black/[0.05]">
                    <span>
                      <span className="block font-medium">{formatLabel(l.format)}</span>
                      <span className="block text-[12px] text-muted">{marketplaceLabel(l.marketplace, l.marketplace_name)}</span>
                    </span>
                    <span className="flex items-center gap-2 text-[12.5px] text-secondary">
                      {l.show_price && formatPrice(l.displayed_price, l.currency)}
                      <ExternalLink className="size-3.5 text-muted" />
                    </span>
                  </a>
                </DM.Item>
              ))}
            </DM.Content>
          </DM.Portal>
        </DM.Root>
      )}
    </div>
  );
}

/** Manually maintained price of the primary link, clearly labelled as such. */
export function PriceNote({ book, className }: { book: Book; className?: string }) {
  const l = activeLinks(book)[0];
  const price = l?.show_price ? formatPrice(l.displayed_price, l.currency) : null;
  if (!price) return null;
  return (
    <p className={cn("text-[13px] text-secondary", className)}>
      <span className="font-semibold text-ink">{price}</span> <span className="text-muted">· {formatLabel(l.format)}, {marketplaceLabel(l.marketplace, l.marketplace_name)}</span>
    </p>
  );
}

export function PurchaseFinePrint({ className, showPriceNote = true }: { className?: string; showPriceNote?: boolean }) {
  const { site } = useSite();
  return (
    <p className={cn("text-[12px] leading-relaxed text-muted", className)}>
      You will be redirected to Amazon to complete your purchase.
      {showPriceNote && " Prices and availability may change on Amazon."}
      {site.amazon_associate && site.affiliate_disclosure && <> {site.affiliate_disclosure}</>}
    </p>
  );
}
