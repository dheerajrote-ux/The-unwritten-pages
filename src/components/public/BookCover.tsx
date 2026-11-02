import { useState } from "react";
import { BookOpen } from "lucide-react";
import { api } from "@/data";
import { cn } from "@/lib/utils";

/** Renders a cover at its natural aspect ratio with a bound-book shadow. */
export function BookCover({ path, title, className, imgClassName, eager }: { path: string | null; title: string; className?: string; imgClassName?: string; eager?: boolean }) {
  const [failed, setFailed] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const url = api.coverUrl(path);
  if (!url || failed) {
    return (
      <div className={cn("book-cover grid aspect-[3/4] place-items-center rounded-[3px] bg-gradient-to-br from-primary to-[#2b4470] p-4 text-center", className)}>
        <div>
          <BookOpen className="mx-auto mb-3 size-6 text-accent" />
          <p className="font-display text-lg leading-snug text-white">{title}</p>
        </div>
      </div>
    );
  }
  return (
    <div className={cn("book-cover overflow-hidden rounded-[3px] bg-[#efe9df]", !loaded && "skeleton", className)}>
      <img
        src={url}
        alt={`Cover of ${title}`}
        loading={eager ? "eager" : "lazy"}
        decoding="async"
        onLoad={() => setLoaded(true)}
        onError={() => setFailed(true)}
        className={cn("block h-full w-full object-cover transition-opacity duration-500", loaded ? "opacity-100" : "opacity-0", imgClassName)}
      />
    </div>
  );
}
