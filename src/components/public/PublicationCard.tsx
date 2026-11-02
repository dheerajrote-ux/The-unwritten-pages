import { Link } from "react-router-dom";
import { ArrowRight } from "lucide-react";
import type { Publication } from "@/lib/types";
import { formatMonthYear } from "@/lib/utils";
import { BookCover } from "./BookCover";

export function PublicationCard({ pub, index = 0 }: { pub: Publication; index?: number }) {
  const date = formatMonthYear(pub.publication_date);
  return (
    <Link
      to={`/library/${pub.slug}`}
      className="group flex flex-col rounded-xl outline-offset-4 animate-rise"
      style={{ animationDelay: `${Math.min(index, 8) * 50}ms` }}
      aria-label={`Read ${pub.title}`}
    >
      <div className="relative flex aspect-[4/4.4] items-center justify-center overflow-hidden rounded-xl bg-[#efece6] px-[14%] py-[9%] transition-colors duration-300 group-hover:bg-[#e9e5dd]">
        <BookCover
          path={pub.cover_image_path}
          title={pub.title}
          className="aspect-[1/1.414] h-full w-auto max-w-full transition-transform duration-500 ease-out group-hover:-translate-y-1.5 group-hover:rotate-[-0.6deg]"
        />
      </div>
      <div className="flex flex-1 flex-col px-1 pt-5">
        <div className="eyebrow flex items-center gap-2">
          {pub.category?.name && <span className="text-[#9a7232]">{pub.category.name}</span>}
          {pub.category?.name && (pub.page_count || date) && <span className="text-line-strong">•</span>}
          {pub.page_count && <span>{pub.page_count} pages</span>}
          {date && (
            <>
              <span className="text-line-strong">•</span>
              <span>{date}</span>
            </>
          )}
        </div>
        <h3 className="mt-2.5 font-display text-[23px] font-medium leading-[1.18] text-ink text-balance">{pub.title}</h3>
        <p className="mt-2 line-clamp-2 text-[14.5px] leading-relaxed text-secondary">{pub.description}</p>
        <span className="mt-4 inline-flex items-center gap-1.5 text-[13.5px] font-medium text-primary">
          Read Publication
          <ArrowRight className="size-4 transition-transform duration-300 group-hover:translate-x-1" />
        </span>
      </div>
    </Link>
  );
}

export function PublicationCardSkeleton() {
  return (
    <div aria-hidden>
      <div className="skeleton aspect-[4/4.4] rounded-xl" />
      <div className="skeleton mt-5 h-3 w-28" />
      <div className="skeleton mt-3 h-6 w-4/5" />
      <div className="skeleton mt-3 h-4 w-full" />
      <div className="skeleton mt-2 h-4 w-2/3" />
    </div>
  );
}
