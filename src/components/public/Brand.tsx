import { Link } from "react-router-dom";
import { useSite } from "@/hooks/useSite";
import { cn } from "@/lib/utils";

/** Open book: a written page on the left, an unwritten page (with bookmark) on the right. */
export function BrandMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={cn("size-8", className)} aria-hidden>
      <rect width="32" height="32" rx="8" fill="#172B4D" />
      <path d="M6.5 9.5c3-.9 6-.7 8.75.9v13.1c-2.75-1.6-5.75-1.8-8.75-.9z" fill="#F3E3C6" />
      <path d="M25.5 9.5c-3-.9-6-.7-8.75.9v13.1c2.75-1.6 5.75-1.8 8.75-.9z" fill="#FBF6EC" />
      <path d="M8.6 13.1h4.6M8.6 15.6h4.6M8.6 18.1h3.2" stroke="#172B4D" strokeWidth="1.05" strokeLinecap="round" opacity=".55" />
      <path d="M21.4 10.05v5.6l-1.2-1-1.2 1v-5.9" fill="#D6A85F" />
    </svg>
  );
}

export function Brand({ to = "/", className, inverted }: { to?: string; className?: string; inverted?: boolean }) {
  const { site } = useSite();
  return (
    <Link to={to} className={cn("flex items-center gap-2.5", className)} aria-label={`${site.site_name} home`}>
      <BrandMark />
      <span className={cn("font-display text-[21px] font-medium leading-none tracking-tight", inverted ? "text-white" : "text-ink")}>{site.site_name}</span>
    </Link>
  );
}
