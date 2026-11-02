import { lazy, Suspense } from "react";
import { BrowserRouter, HashRouter, MemoryRouter, Route, Routes } from "react-router-dom";
import { Toaster } from "sonner";
import { ROUTER_MODE } from "@/lib/config";
import { SiteProvider } from "@/hooks/useSite";
import { PublicLayout } from "@/pages/PublicLayout";
import { LibraryPage } from "@/pages/LibraryPage";
import { ReaderPage } from "@/pages/ReaderPage";
import { NotFoundPage, PrivacyPage } from "@/pages/StaticPages";
import { AboutPage } from "@/pages/AboutPage";
import { BooksPage } from "@/pages/BooksPage";
import { BookDetailPage } from "@/pages/BookDetailPage";

const AdminRoutes = lazy(() => import("@/pages/admin/AdminRoutes"));

const Router = ROUTER_MODE === "hash" ? HashRouter : ROUTER_MODE === "memory" ? MemoryRouter : BrowserRouter;

function Fallback() {
  return <div className="grid min-h-dvh place-items-center"><div className="skeleton h-2 w-40 rounded-full" /></div>;
}

export function App() {
  return (
    <Router>
      <SiteProvider>
        <Suspense fallback={<Fallback />}>
          <Routes>
            <Route element={<PublicLayout />}>
              <Route index element={<LibraryPage variant="home" />} />
              <Route path="library" element={<LibraryPage variant="library" />} />
              <Route path="about" element={<AboutPage />} />
              <Route path="books" element={<BooksPage />} />
              <Route path="books/:slug" element={<BookDetailPage />} />
              <Route path="privacy" element={<PrivacyPage />} />
              <Route path="*" element={<NotFoundPage />} />
            </Route>
            <Route path="library/:slug" element={<ReaderPage />} />
            <Route path="admin/*" element={<AdminRoutes />} />
          </Routes>
        </Suspense>
        <Toaster position="bottom-right" toastOptions={{ style: { fontFamily: "var(--font-sans)", fontSize: 13.5 } }} />
      </SiteProvider>
    </Router>
  );
}
