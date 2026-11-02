import { useEffect, useRef, useState } from "react";
import { Link, NavLink, useNavigate, useSearchParams } from "react-router-dom";
import { Menu, Search, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { Brand } from "./Brand";

const NAV = [
  { to: "/", label: "Home", end: true },
  { to: "/library", label: "Library" },
  { to: "/books", label: "Books" },
  { to: "/about", label: "About" },
];

export function SiteHeader() {
  const [params] = useSearchParams();
  const [searchOpen, setSearchOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [q, setQ] = useState(params.get("q") ?? "");
  const inputRef = useRef<HTMLInputElement>(null);
  const navigate = useNavigate();

  useEffect(() => {
    if (searchOpen) inputRef.current?.focus();
  }, [searchOpen]);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    navigate(`/library${q.trim() ? `?q=${encodeURIComponent(q.trim())}` : ""}`);
    setSearchOpen(false);
    setMenuOpen(false);
  };

  return (
    <header className="sticky top-0 z-40 border-b border-line/70 bg-paper/85 backdrop-blur-md">
      <div className="mx-auto flex h-16 max-w-7xl items-center gap-6 px-5 sm:px-8">
        <Brand />
        <nav className="ml-6 hidden items-center gap-1 md:flex" aria-label="Main">
          {NAV.map((n) => (
            <NavLink
              key={n.to}
              to={n.to}
              end={n.end}
              className={({ isActive }) => cn("rounded-md px-3 py-2 text-sm text-secondary transition-colors hover:text-ink", isActive && "font-medium text-ink")}
            >
              {n.label}
            </NavLink>
          ))}
        </nav>
        <div className="ml-auto flex items-center gap-1">
          {searchOpen ? (
            <form onSubmit={submit} className="flex items-center" role="search">
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted" />
                <input
                  ref={inputRef}
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  onKeyDown={(e) => e.key === "Escape" && setSearchOpen(false)}
                  placeholder="Search by title…"
                  aria-label="Search publications"
                  className="h-9 w-48 rounded-full border border-line-strong bg-surface pl-9 pr-3 text-sm outline-none focus:border-primary sm:w-64"
                />
              </div>
              <button type="button" onClick={() => setSearchOpen(false)} className="ml-1 grid size-9 place-items-center rounded-full text-muted hover:bg-black/5" aria-label="Close search">
                <X className="size-4" />
              </button>
            </form>
          ) : (
            <button onClick={() => setSearchOpen(true)} className="grid size-9 place-items-center rounded-full text-secondary transition-colors hover:bg-black/5 hover:text-ink" aria-label="Search">
              <Search className="size-[18px]" />
            </button>
          )}
          <button onClick={() => setMenuOpen((v) => !v)} className="grid size-9 place-items-center rounded-full text-secondary hover:bg-black/5 md:hidden" aria-label="Menu" aria-expanded={menuOpen}>
            {menuOpen ? <X className="size-5" /> : <Menu className="size-5" />}
          </button>
        </div>
      </div>
      {menuOpen && (
        <nav className="border-t border-line bg-paper px-5 py-3 md:hidden animate-fade-in" aria-label="Mobile">
          {NAV.map((n) => (
            <Link key={n.to} to={n.to} onClick={() => setMenuOpen(false)} className="block rounded-md px-2 py-2.5 text-[15px] text-ink hover:bg-black/[0.04]">
              {n.label}
            </Link>
          ))}
        </nav>
      )}
    </header>
  );
}
