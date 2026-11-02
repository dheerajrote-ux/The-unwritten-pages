import { Link } from "react-router-dom";
import { ArrowRight, BookOpen, Feather, Mail, Quote } from "lucide-react";
import { api } from "@/data";
import { useAsync } from "@/hooks/useAsync";
import { useSite } from "@/hooks/useSite";
import { useDocumentMeta } from "@/hooks/useDocumentMeta";
import { AUTHOR } from "@/content/author";
import { BookCover } from "@/components/public/BookCover";
import { Button } from "@/components/ui/button";

export function AboutPage() {
  const { site } = useSite();
  const { data } = useAsync(() => Promise.all([api.listPublicPublications(), api.listPublicCategories()]), []);
  const [pubs, cats] = data ?? [[], []];
  const themes = cats.map((c) => ({ ...c, count: pubs.filter((p) => p.category_id === c.id).length })).filter((c) => c.count > 0);
  const covers = pubs.slice(0, 3);

  useDocumentMeta({ title: `About ${AUTHOR.name} — ${site.site_name}`, description: AUTHOR.intro, type: "website", siteName: site.site_name, author: AUTHOR.name });

  return (
    <div className="animate-fade-in">
      {/* Intro */}
      <section className="mx-auto grid max-w-6xl items-center gap-12 px-5 pb-16 pt-14 sm:px-8 sm:pt-20 lg:grid-cols-[1fr_320px] lg:gap-20">
        <div>
          <p className="eyebrow">About the author</p>
          <h1 className="mt-4 font-display text-[48px] font-normal leading-[1.02] tracking-tight text-ink sm:text-[64px]">{AUTHOR.name}</h1>
          <p className="mt-2 text-[15px] font-medium text-[#9a7232]">{AUTHOR.role}</p>
          <p className="mt-7 max-w-2xl font-display text-[23px] leading-[1.45] text-ink sm:text-[26px]">{AUTHOR.intro}</p>
        </div>
        <div className="mx-auto w-full max-w-[300px]">
          {AUTHOR.photo ? (
            <img src={AUTHOR.photo} alt={`Portrait of ${AUTHOR.name}`} className="aspect-[4/5] w-full rounded-2xl object-cover shadow-book" />
          ) : (
            <div className="relative grid aspect-[4/5] w-full place-items-center overflow-hidden rounded-2xl bg-primary shadow-book" aria-hidden>
              <div className="absolute -right-16 -top-16 size-56 rounded-full bg-accent/25" />
              <div className="absolute -bottom-20 -left-10 size-56 rounded-full bg-white/5" />
              <span className="relative font-display text-[112px] italic leading-none text-[#F3E3C6]">DR</span>
              <span className="absolute bottom-6 left-0 right-0 text-center text-[11px] font-semibold uppercase tracking-[0.22em] text-white/50">{site.site_name}</span>
            </div>
          )}
        </div>
      </section>

      {/* Bio + facts */}
      <section className="border-y border-line bg-surface">
        <div className="mx-auto grid max-w-6xl gap-12 px-5 py-16 sm:px-8 lg:grid-cols-[1fr_340px] lg:gap-20">
          <div className="space-y-6 text-[17px] leading-[1.8] text-secondary">
            {AUTHOR.bio.map((p, i) => (
              <p key={i} className={i === 0 ? "text-[19px] text-ink" : ""}>{p}</p>
            ))}
          </div>
          <dl className="h-fit divide-y divide-line rounded-xl border border-line bg-paper">
            {AUTHOR.facts.map((f) => (
              <div key={f.label} className="px-5 py-4">
                <dt className="eyebrow">{f.label}</dt>
                <dd className="mt-1.5 text-[14.5px] text-ink">{f.value}</dd>
              </div>
            ))}
          </dl>
        </div>
      </section>

      {/* Origin story */}
      <section className="mx-auto max-w-4xl px-5 py-20 text-center sm:px-8">
        <Quote className="mx-auto size-8 text-accent" aria-hidden />
        <p className="eyebrow mt-5">{AUTHOR.origin.eyebrow}</p>
        <h2 className="mt-3 font-display text-[34px] font-normal leading-tight text-ink sm:text-[40px]">{AUTHOR.origin.title}</h2>
        <p className="mx-auto mt-6 max-w-2xl text-[17px] leading-[1.8] text-secondary">{AUTHOR.origin.text}</p>
      </section>

      {/* The essays */}
      <section className="bg-[#f2f0eb]">
        <div className="mx-auto grid max-w-6xl items-center gap-12 px-5 py-20 sm:px-8 lg:grid-cols-[1fr_1fr]">
          <div>
            <p className="eyebrow">The essays</p>
            <h2 className="mt-3 font-display text-[34px] font-normal leading-tight text-ink sm:text-[40px]">{site.site_name}</h2>
            <p className="mt-5 text-[17px] leading-[1.8] text-secondary">{AUTHOR.essayNote}</p>
            {themes.length > 0 && (
              <ul className="mt-8 grid gap-2 sm:grid-cols-2">
                {themes.map((t) => (
                  <li key={t.id}>
                    <Link to={`/library?category=${t.slug}`} className="group flex items-center justify-between rounded-lg border border-line bg-surface px-4 py-3 transition-colors hover:border-primary/40">
                      <span>
                        <span className="block text-[14.5px] font-medium text-ink">{t.name}</span>
                        <span className="block text-[12.5px] text-muted">{t.count} {t.count === 1 ? "essay" : "essays"}</span>
                      </span>
                      <ArrowRight className="size-4 text-muted transition-transform group-hover:translate-x-0.5 group-hover:text-primary" />
                    </Link>
                  </li>
                ))}
              </ul>
            )}
            <Button asChild size="lg" className="mt-8">
              <Link to="/library">
                Read the essays <ArrowRight />
              </Link>
            </Button>
          </div>
          <div className="relative mx-auto hidden h-[400px] w-full max-w-[460px] sm:block" aria-hidden>
            {covers.map((p, i) => {
              const pos = ["left-[30%] top-[6%] z-40", "left-[4%] top-[16%] z-30 -rotate-[8deg]", "left-[56%] top-[14%] z-20 rotate-[7deg]"][i];
              return (
                <div key={p.id} className={`absolute w-[40%] ${pos}`}>
                  <BookCover path={p.cover_image_path} title={p.title} className="aspect-[1/1.414] w-full" />
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* In progress */}
      <section className="mx-auto max-w-6xl px-5 py-20 sm:px-8">
        <p className="eyebrow">On the writing desk</p>
        <h2 className="mt-3 font-display text-[34px] font-normal leading-tight text-ink">Works in progress</h2>
        <div className="mt-8 grid gap-5 md:grid-cols-2">
          {AUTHOR.inProgress.map((w) => (
            <article key={w.title} className="flex gap-5 rounded-xl border border-line bg-surface p-6">
              <div className="grid size-12 shrink-0 place-items-center rounded-full bg-accent-soft text-[#8a6224]">
                {w.kind === "Memoir" ? <Feather className="size-5" /> : <BookOpen className="size-5" />}
              </div>
              <div>
                <p className="eyebrow text-[#9a7232]">
                  {w.kind} · <span className="text-secondary">In progress</span>
                </p>
                <h3 className="mt-2 font-display text-[23px] leading-snug text-ink">{w.title}</h3>
                <p className="mt-2 text-[15px] leading-relaxed text-secondary">{w.description}</p>
              </div>
            </article>
          ))}
        </div>
      </section>

      {/* Reading tips + contact */}
      <section className="mx-auto grid max-w-6xl gap-5 px-5 sm:px-8 md:grid-cols-2">
        <div className="rounded-xl border border-line bg-surface p-6">
          <h2 className="text-[15px] font-semibold text-ink">Reading tips</h2>
          <p className="mt-2 text-[14.5px] leading-relaxed text-secondary">
            Every essay is free to read online. Use the arrow keys or swipe to turn pages, press <kbd className="rounded border border-line-strong px-1 text-[12px]">F</kbd> for fullscreen,{" "}
            <kbd className="rounded border border-line-strong px-1 text-[12px]">T</kbd> for thumbnails, and <kbd className="rounded border border-line-strong px-1 text-[12px]">+</kbd> / <kbd className="rounded border border-line-strong px-1 text-[12px]">−</kbd> to zoom. You can download any essay as a PDF or share it with a friend from its page.
          </p>
        </div>
        <div className="rounded-xl border border-line bg-surface p-6">
          <h2 className="text-[15px] font-semibold text-ink">Get in touch</h2>
          {site.contact_email ? (
            <p className="mt-2 text-[14.5px] leading-relaxed text-secondary">
              Thoughts on an essay, or a line that stayed with you? Write to{" "}
              <a className="inline-flex items-center gap-1 text-primary underline underline-offset-4" href={`mailto:${site.contact_email}`}>
                <Mail className="size-3.5" />
                {site.contact_email}
              </a>
              .
            </p>
          ) : (
            <p className="mt-2 text-[14.5px] leading-relaxed text-secondary">The best way to respond to an essay is to share it with someone it reminds you of.</p>
          )}
        </div>
      </section>
    </div>
  );
}
