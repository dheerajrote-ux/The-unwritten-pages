import { Link } from "react-router-dom";
import { useSite } from "@/hooks/useSite";
import { useDocumentMeta } from "@/hooks/useDocumentMeta";
import { Button } from "@/components/ui/button";

function Prose({ eyebrow, title, children }: { eyebrow: string; title: string; children: React.ReactNode }) {
  return (
    <article className="mx-auto max-w-2xl px-5 py-16 sm:px-8 sm:py-24">
      <p className="eyebrow">{eyebrow}</p>
      <h1 className="mt-3 font-display text-[44px] font-normal leading-tight text-ink sm:text-[52px]">{title}</h1>
      <div className="mt-8 space-y-5 text-[16.5px] leading-[1.75] text-secondary [&_h2]:mt-10 [&_h2]:font-display [&_h2]:text-[24px] [&_h2]:text-ink">{children}</div>
    </article>
  );
}

export function PrivacyPage() {
  const { site } = useSite();
  useDocumentMeta({ title: `Privacy Policy — ${site.site_name}` });
  return (
    <Prose eyebrow="Legal" title="Privacy Policy">
      <p>Reading publications on {site.site_name} is free and does not require you to share any personal information.</p>
      <h2>What we collect</h2>
      <p>When you download a publication, we ask for your name and email address, and optionally your company and designation. We record which publication you downloaded and when.</p>
      <h2>How we use it</h2>
      <p>We use these details to provide your download and to understand which publications are useful. We only send you updates about new publications if you explicitly tick the consent box, and you can withdraw consent at any time.</p>
      <h2>Anonymous reading statistics</h2>
      <p>We count page views and reader opens using a random session identifier that is not linked to your identity.</p>
      <h2>Your rights</h2>
      <p>You can ask us to access, correct or delete your information{site.contact_email ? <> by writing to <a className="text-primary underline underline-offset-4" href={`mailto:${site.contact_email}`}>{site.contact_email}</a></> : ""}.</p>
      <p className="text-sm text-muted">Replace this template with your organisation's own policy, or set a Privacy Policy URL in Admin → Settings.</p>
    </Prose>
  );
}

export function NotFoundPage() {
  return (
    <div className="mx-auto max-w-xl px-5 py-32 text-center">
      <p className="eyebrow">404</p>
      <h1 className="mt-3 font-display text-[44px] font-normal text-ink">Page not found</h1>
      <p className="mt-3 text-secondary">The page you're looking for doesn't exist or has moved.</p>
      <Button asChild className="mt-8">
        <Link to="/">Go to the library</Link>
      </Button>
    </div>
  );
}
