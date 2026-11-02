import { Link } from "react-router-dom";
import { useSite } from "@/hooks/useSite";
import { BrandMark } from "./Brand";

export function SiteFooter() {
  const { site } = useSite();
  return (
    <footer className="mt-24 border-t border-line">
      <div className="mx-auto flex max-w-7xl flex-col gap-6 px-5 py-10 text-sm text-muted sm:flex-row sm:items-center sm:justify-between sm:px-8">
        <div className="flex items-center gap-2.5">
          <BrandMark className="size-6" />
          <span>
            © {new Date().getFullYear()} {site.site_name}
          </span>
        </div>
        <nav className="flex flex-wrap gap-x-6 gap-y-2" aria-label="Footer">
          <Link to="/library" className="hover:text-ink">Library</Link>
          <Link to="/books" className="hover:text-ink">Books</Link>
          <Link to="/about" className="hover:text-ink">About</Link>
          {site.privacy_policy_url ? (
            <a href={site.privacy_policy_url} target="_blank" rel="noreferrer" className="hover:text-ink">Privacy Policy</a>
          ) : (
            <Link to="/privacy" className="hover:text-ink">Privacy Policy</Link>
          )}
          <Link to="/admin" className="hover:text-ink">Admin</Link>
        </nav>
      </div>
    </footer>
  );
}
