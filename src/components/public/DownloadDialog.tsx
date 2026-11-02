import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { CheckCircle2, Download, FileText } from "lucide-react";
import { api } from "@/data";
import { useSite } from "@/hooks/useSite";
import { ApiError, type Publication } from "@/lib/types";
import { EMAIL_RE, formatBytes, sessionId, triggerDownload } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Field, Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/misc";
import { usePlacement } from "@/components/books/BookSections";
import { BookJacket } from "@/components/books/BookJacket";
import { AmazonPurchaseButton } from "@/components/books/AmazonPurchaseButton";
import { useBookImpression } from "@/components/books/useBookImpression";
import type { Book } from "@/lib/books";

type Values = { full_name: string; email: string; company: string; designation: string; marketing_consent: boolean; website: string };
const EMPTY: Values = { full_name: "", email: "", company: "", designation: "", marketing_consent: false, website: "" };
const REMEMBER_KEY = "dl_lead_details";

function validate(v: Values) {
  const e: Partial<Record<keyof Values, string>> = {};
  if (v.full_name.trim().length < 2) e.full_name = "Please enter your full name.";
  if (!v.email.trim()) e.email = "Please enter your work email.";
  else if (!EMAIL_RE.test(v.email.trim())) e.email = "Please enter a valid email address.";
  if (v.company.length > 160) e.company = "Please keep this under 160 characters.";
  if (v.designation.length > 120) e.designation = "Please keep this under 120 characters.";
  return e;
}

export function DownloadDialog({ pub, open, onOpenChange }: { pub: Publication; open: boolean; onOpenChange: (v: boolean) => void }) {
  const { site } = useSite();
  const [values, setValues] = useState<Values>(EMPTY);
  const [errors, setErrors] = useState<Partial<Record<keyof Values, string>>>({});
  const [touched, setTouched] = useState<Partial<Record<keyof Values, boolean>>>({});
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [result, setResult] = useState<{ url: string; filename: string } | null>(null);
  const startedAt = useRef(Date.now());
  const firstField = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    startedAt.current = Date.now();
    setResult(null);
    setFormError(null);
    setErrors({});
    setTouched({});
    // Prefill details from a previous download in this browser (never the consent box).
    try {
      const saved = JSON.parse(localStorage.getItem(REMEMBER_KEY) || "null");
      setValues(saved ? { ...EMPTY, ...saved, marketing_consent: false, website: "" } : EMPTY);
    } catch {
      setValues(EMPTY);
    }
  }, [open]);

  const set = <K extends keyof Values>(k: K, v: Values[K]) => {
    const next = { ...values, [k]: v };
    setValues(next);
    if (touched[k]) setErrors(validate(next));
  };
  const blur = (k: keyof Values) => {
    setTouched((t) => ({ ...t, [k]: true }));
    setErrors(validate(values));
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitting) return;
    const errs = validate(values);
    setErrors(errs);
    setTouched({ full_name: true, email: true, company: true, designation: true });
    if (Object.keys(errs).length) {
      document.getElementById(`dl-${Object.keys(errs)[0]}`)?.focus();
      return;
    }
    setSubmitting(true);
    setFormError(null);
    try {
      const res = await api.requestDownload({
        publication_id: pub.id,
        full_name: values.full_name.trim(),
        email: values.email.trim(),
        company: values.company.trim() || undefined,
        designation: values.designation.trim() || undefined,
        marketing_consent: values.marketing_consent,
        website: values.website,
        started_at: startedAt.current,
        session_id: sessionId(),
      });
      try {
        localStorage.setItem(REMEMBER_KEY, JSON.stringify({ full_name: values.full_name, email: values.email, company: values.company, designation: values.designation }));
      } catch {
        /* ignore */
      }
      setResult(res);
      if (res.url) triggerDownload(res.url, res.filename);
    } catch (err) {
      const ae = err as ApiError;
      if (ae.fields) setErrors(ae.fields as typeof errors);
      setFormError(ae.message || "We couldn't prepare your download. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !submitting && onOpenChange(v)}>
      <DialogContent className="max-w-[480px]" onOpenAutoFocus={(e) => { e.preventDefault(); firstField.current?.focus(); }}>
        {result ? (
          <div className="py-4 text-center animate-fade-in" role="status">
            <div className="mx-auto grid size-14 place-items-center rounded-full bg-success-soft text-success">
              <CheckCircle2 className="size-7" />
            </div>
            <DialogTitle className="mt-5">Your publication is ready!</DialogTitle>
            <DialogDescription>
              Thank you for your interest.{" "}
              {result.url ? <>Your download of “{pub.title}” should begin automatically.</> : <>Your details were recorded. This preview can't deliver files — in the live library the PDF downloads automatically at this point.</>}
            </DialogDescription>
            <div className="mt-7 flex flex-col items-center gap-3">
              {result.url && (
                <Button asChild variant="primary" size="lg">
                  <a href={result.url} download={result.filename} target="_blank" rel="noreferrer">
                    <Download /> Download again
                  </a>
                </Button>
              )}
              <button onClick={() => onOpenChange(false)} className="text-sm text-secondary hover:text-ink">
                Continue reading
              </button>
            </div>
            <DownloadRecommendation publicationId={pub.id} />
            {result.url && <p className="mt-6 text-[12px] text-muted">The secure link expires in a few minutes. Download again any time from this page.</p>}
          </div>
        ) : (
          <form onSubmit={submit} noValidate>
            <DialogTitle>Download Your Copy</DialogTitle>
            <DialogDescription>Please share a few details to access your free publication.</DialogDescription>

            <div className="mt-5 flex items-center gap-3 rounded-lg border border-line bg-paper px-3.5 py-3">
              <FileText className="size-5 shrink-0 text-accent" />
              <div className="min-w-0 text-[13px]">
                <p className="truncate font-medium text-ink">{pub.title}</p>
                <p className="text-muted">
                  PDF{pub.page_count ? ` · ${pub.page_count} pages` : ""}
                  {pub.file_size ? ` · ${formatBytes(pub.file_size)}` : ""}
                </p>
              </div>
            </div>

            <div className="mt-5 grid gap-4">
              <Field label="Full Name" htmlFor="dl-full_name" error={touched.full_name ? errors.full_name : undefined} required>
                <Input ref={firstField} autoComplete="name" value={values.full_name} onChange={(e) => set("full_name", e.target.value)} onBlur={() => blur("full_name")} maxLength={120} />
              </Field>
              <Field label="Work Email" htmlFor="dl-email" error={touched.email ? errors.email : undefined} required>
                <Input type="email" inputMode="email" autoComplete="email" value={values.email} onChange={(e) => set("email", e.target.value)} onBlur={() => blur("email")} maxLength={254} />
              </Field>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Company / Organization" htmlFor="dl-company" error={touched.company ? errors.company : undefined} optional>
                  <Input autoComplete="organization" value={values.company} onChange={(e) => set("company", e.target.value)} onBlur={() => blur("company")} maxLength={160} />
                </Field>
                <Field label="Designation" htmlFor="dl-designation" error={touched.designation ? errors.designation : undefined} optional>
                  <Input autoComplete="organization-title" value={values.designation} onChange={(e) => set("designation", e.target.value)} onBlur={() => blur("designation")} maxLength={120} />
                </Field>
              </div>
              {/* Honeypot: hidden from people, tempting for bots */}
              <div aria-hidden className="absolute -left-[9999px] h-0 w-0 overflow-hidden">
                <label htmlFor="dl-website">Website</label>
                <input id="dl-website" tabIndex={-1} autoComplete="off" value={values.website} onChange={(e) => set("website", e.target.value)} />
              </div>
              <label className="flex cursor-pointer items-start gap-3 text-[13px] leading-relaxed text-secondary">
                <Checkbox checked={values.marketing_consent} onCheckedChange={(v) => set("marketing_consent", v === true)} aria-label="I'd like to receive relevant updates" />
                <span>I'd like to receive occasional updates about new publications. You can unsubscribe at any time.</span>
              </label>
            </div>

            {formError && (
              <p role="alert" className="mt-4 rounded-md bg-danger-soft px-3 py-2.5 text-[13px] text-danger">
                {formError}
              </p>
            )}

            <Button type="submit" size="lg" className="mt-6 w-full" loading={submitting}>
              {!submitting && <Download />}
              {submitting ? "Preparing your download…" : "Submit & Download"}
            </Button>
            <p className="mt-3 text-center text-[12px] text-muted">
              We respect your privacy. Read our{" "}
              {site.privacy_policy_url ? (
                <a href={site.privacy_policy_url} target="_blank" rel="noreferrer" className="underline underline-offset-2 hover:text-ink">Privacy Policy</a>
              ) : (
                <Link to="/privacy" target="_blank" className="underline underline-offset-2 hover:text-ink">Privacy Policy</Link>
              )}
              .
            </p>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}

/** Placement 3 — one recommended book on the download success screen. */
function DownloadRecommendation({ publicationId }: { publicationId: string }) {
  const { data } = usePlacement("download_success", { publicationId });
  const book = data?.books[0];
  if (!data?.placement || !book) return null;
  return <RecommendedBook book={book} heading={data.placement.heading} description={data.placement.description} publicationId={publicationId} />;
}

function RecommendedBook({ book, heading, description, publicationId }: { book: Book; heading: string; description: string | null; publicationId: string }) {
  const ref = useBookImpression<HTMLDivElement>(book.id, "download_success", publicationId);
  return (
    <div ref={ref} className="mt-8 rounded-xl border border-line bg-paper p-4 text-left">
      <p className="font-display text-[18px] text-ink">{heading}</p>
      {description && <p className="mt-0.5 text-[12.5px] text-muted">{description}</p>}
      <div className="mt-4 flex gap-4">
        <Link to={`/books/${book.slug}`} className="w-[72px] shrink-0" tabIndex={-1} aria-hidden>
          <BookJacket path={book.cover_image_path} title={book.title} author={book.author} className="w-full" />
        </Link>
        <div className="min-w-0">
          <Link to={`/books/${book.slug}`} className="font-display text-[17px] leading-snug text-ink hover:text-primary">{book.title}</Link>
          <p className="mt-1 line-clamp-2 text-[12.5px] leading-relaxed text-secondary">{book.short_description}</p>
          <AmazonPurchaseButton book={book} surface="download_success" publicationId={publicationId} size="sm" withOptions={false} className="mt-3" />
        </div>
      </div>
    </div>
  );
}
