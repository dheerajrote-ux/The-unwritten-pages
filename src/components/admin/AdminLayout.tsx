import { useEffect, useState } from "react";
import { Link, NavLink, Navigate, Outlet, useLocation, useNavigate } from "react-router-dom";
import { BarChart3, BookOpen, BookMarked, ChevronDown, ChevronRight, ExternalLink, FolderTree, LayoutDashboard, LogOut, Menu, Settings, Users, X } from "lucide-react";
import { api } from "@/data";
import { useSite } from "@/hooks/useSite";
import { cn } from "@/lib/utils";
import { BrandMark } from "@/components/public/Brand";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown";
import { DemoBanner } from "@/components/DemoBanner";
import { NoTrackingContext } from "@/components/books/useBookImpression";

const NAV = [
  { to: "/admin/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { to: "/admin/publications", label: "Publications", icon: BookOpen },
  { to: "/admin/categories", label: "Categories", icon: FolderTree },
  { to: "/admin/leads", label: "Leads", icon: Users },
  { to: "/admin/analytics", label: "Analytics", icon: BarChart3 },
  { to: "/admin/settings", label: "Settings", icon: Settings },
];

const BOOKS_NAV = [
  { to: "/admin/books", label: "All Books", end: true },
  { to: "/admin/books/new", label: "Add New Book" },
  { to: "/admin/books/categories", label: "Book Categories" },
  { to: "/admin/books/recommendations", label: "Recommendations" },
  { to: "/admin/books/placements", label: "Promotional Placements" },
  { to: "/admin/books/links", label: "Amazon Link Management" },
  { to: "/admin/books/analytics", label: "Book Analytics" },
];

const CRUMBS: Record<string, string> = {
  dashboard: "Dashboard",
  publications: "Publications",
  new: "New publication",
  edit: "Edit",
  preview: "Preview",
  categories: "Categories",
  leads: "Leads",
  analytics: "Analytics",
  settings: "Settings",
  books: "Books & Cross-Selling",
  recommendations: "Recommendations",
  placements: "Placements",
  links: "Amazon links",
};

export function RequireAdmin() {
  const { admin, authLoading } = useSite();
  const loc = useLocation();
  if (authLoading)
    return (
      <div className="grid min-h-dvh place-items-center bg-admin-bg">
        <div className="skeleton h-2 w-40 rounded-full" />
      </div>
    );
  if (!admin) return <Navigate to="/admin/login" replace state={{ from: loc.pathname }} />;
  return <AdminLayout />;
}

function AdminLayout() {
  const { admin, site } = useSite();
  const [open, setOpen] = useState(false);
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const parts = pathname.replace(/^\/admin\/?/, "").split("/").filter(Boolean);
  const inBooks = pathname.startsWith("/admin/books");
  const BOOK_CRUMBS: Record<string, string> = { new: "New book", categories: "Book categories", analytics: "Book analytics" };
  const crumbs = parts.filter((p) => CRUMBS[p]).map((p) => (inBooks && BOOK_CRUMBS[p]) || CRUMBS[p]);
  const [booksOpen, setBooksOpen] = useState(true);

  // Mobile drawer: close on navigation and Escape, and stop the page behind it scrolling.
  useEffect(() => setOpen(false), [pathname]);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const logout = async () => {
    await api.signOut();
    navigate("/admin/login", { replace: true });
  };

  const sidebar = (
    <div className="flex h-full flex-col">
      <Link to="/admin/dashboard" className="flex h-16 items-center gap-2.5 px-5">
        <BrandMark className="size-7" />
        <div className="leading-tight">
          <p className="text-[14px] font-semibold text-white">{site.site_name}</p>
          <p className="text-[11px] text-white/50">Admin</p>
        </div>
      </Link>
      <nav className="mt-2 flex-1 space-y-0.5 overflow-y-auto px-3 scrollbar-thin" aria-label="Admin">
        {NAV.slice(0, 5).map(({ to, label, icon: Icon }) => (
          <NavLink
            key={to}
            to={to}
            onClick={() => setOpen(false)}
            className={({ isActive }) =>
              cn("flex items-center gap-3 rounded-md px-3 py-2 text-[13.5px] font-medium text-white/65 transition-colors hover:bg-white/[0.06] hover:text-white", isActive && "bg-white/[0.1] text-white")
            }
          >
            <Icon className="size-[17px]" />
            {label}
          </NavLink>
        ))}
        <div>
          <button
            onClick={() => setBooksOpen((v) => !v)}
            aria-expanded={booksOpen || inBooks}
            className={cn("flex w-full items-center gap-3 rounded-md px-3 py-2 text-left text-[13.5px] font-medium text-white/65 transition-colors hover:bg-white/[0.06] hover:text-white", inBooks && "text-white")}
          >
            <BookMarked className="size-[17px]" />
            <span className="flex-1">Books & Cross-Selling</span>
            <ChevronDown className={cn("size-4 transition-transform", !(booksOpen || inBooks) && "-rotate-90")} />
          </button>
          {(booksOpen || inBooks) && (
            <div className="ml-[22px] mt-0.5 space-y-0.5 border-l border-white/10 pl-3">
              {BOOKS_NAV.map((n) => (
                <NavLink
                  key={n.to}
                  to={n.to}
                  end={n.end}
                  onClick={() => setOpen(false)}
                  className={({ isActive }) => cn("block rounded-md px-2.5 py-1.5 text-[12.5px] text-white/55 transition-colors hover:bg-white/[0.06] hover:text-white", isActive && "bg-white/[0.1] text-white")}
                >
                  {n.label}
                </NavLink>
              ))}
            </div>
          )}
        </div>
        {NAV.slice(5).map(({ to, label, icon: Icon }) => (
          <NavLink
            key={to}
            to={to}
            onClick={() => setOpen(false)}
            className={({ isActive }) =>
              cn("flex items-center gap-3 rounded-md px-3 py-2 text-[13.5px] font-medium text-white/65 transition-colors hover:bg-white/[0.06] hover:text-white", isActive && "bg-white/[0.1] text-white")
            }
          >
            <Icon className="size-[17px]" />
            {label}
          </NavLink>
        ))}
      </nav>
      <div className="space-y-0.5 border-t border-white/10 p-3">
        <Link to="/" target="_blank" className="flex items-center gap-3 rounded-md px-3 py-2 text-[13px] text-white/60 hover:bg-white/[0.06] hover:text-white">
          <ExternalLink className="size-4" /> View library
        </Link>
        <button onClick={logout} className="flex w-full items-center gap-3 rounded-md px-3 py-2 text-[13px] text-white/60 hover:bg-white/[0.06] hover:text-white">
          <LogOut className="size-4" /> Logout
        </button>
      </div>
    </div>
  );

  const initials = (admin?.full_name || admin?.email || "A").split(/\s+/).map((s) => s[0]).slice(0, 2).join("").toUpperCase();

  return (
    <div className="min-h-dvh bg-admin-bg">
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-60 bg-primary lg:block">{sidebar}</aside>
      {open && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div className="absolute inset-0 bg-black/40" onClick={() => setOpen(false)} />
          <aside className="absolute inset-y-0 left-0 w-64 bg-primary animate-fade-in">
            <button onClick={() => setOpen(false)} className="absolute right-3 top-4 grid size-8 place-items-center rounded text-white/70" aria-label="Close menu">
              <X className="size-4" />
            </button>
            {sidebar}
          </aside>
        </div>
      )}
      <div className="lg:pl-60">
        <DemoBanner admin />
        <header className="sticky top-0 z-20 flex h-16 items-center gap-3 border-b border-line bg-surface/90 px-4 backdrop-blur sm:px-8">
          <button onClick={() => setOpen(true)} className="grid size-9 place-items-center rounded-md text-secondary hover:bg-black/5 lg:hidden" aria-label="Open menu">
            <Menu className="size-5" />
          </button>
          {/* Phones show only the current page; wider screens get the full trail. */}
          <nav aria-label="Breadcrumb" className="flex min-w-0 items-center gap-1.5 text-[13px] text-muted">
            <Link to="/admin/dashboard" className={cn("shrink-0 hover:text-ink", crumbs.length && "hidden sm:inline")}>Admin</Link>
            {crumbs.map((c, i) => {
              const last = i === crumbs.length - 1;
              return (
                <span key={i} className={cn("min-w-0 items-center gap-1.5", last ? "flex" : "hidden sm:flex")}>
                  <ChevronRight className="hidden size-3.5 shrink-0 sm:block" />
                  <span className={cn("truncate whitespace-nowrap", last && "font-medium text-ink")}>{c}</span>
                </span>
              );
            })}
          </nav>
          <DropdownMenu>
            <DropdownMenuTrigger className="ml-auto flex items-center gap-2.5 rounded-full py-1 pl-1 pr-2 hover:bg-black/[0.04]" aria-label="Account menu">
              <span className="grid size-8 place-items-center rounded-full bg-accent-soft text-[12px] font-semibold text-[#8a6224]">{initials}</span>
              <span className="hidden text-left leading-tight sm:block">
                <span className="block text-[13px] font-medium text-ink">{admin?.full_name || "Admin"}</span>
                <span className="block text-[11.5px] capitalize text-muted">{admin?.role}</span>
              </span>
            </DropdownMenuTrigger>
            <DropdownMenuContent>
              <div className="px-2.5 py-2 text-[12px] text-muted">{admin?.email}</div>
              <DropdownMenuSeparator />
              <DropdownMenuItem onSelect={() => navigate("/admin/settings")}>
                <Settings /> Settings
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={logout}>
                <LogOut /> Logout
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </header>
        <main className="mx-auto max-w-[1280px] px-4 py-8 sm:px-8">
          <NoTrackingContext.Provider value>
            <Outlet />
          </NoTrackingContext.Provider>
        </main>
      </div>
    </div>
  );
}
