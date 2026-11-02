import { Navigate, Route, Routes } from "react-router-dom";
import { RequireAdmin } from "@/components/admin/AdminLayout";
import { ForgotPasswordPage, LoginPage, ResetPasswordPage } from "./AuthPages";
import { DashboardPage } from "./DashboardPage";
import { PublicationsPage } from "./PublicationsPage";
import { PublicationEditor } from "./PublicationEditor";
import { PreviewPage } from "./PreviewPage";
import { CategoriesPage } from "./CategoriesPage";
import { LeadsPage } from "./LeadsPage";
import { AnalyticsPage } from "./AnalyticsPage";
import { SettingsPage } from "./SettingsPage";
import { BooksListPage } from "./books/BooksListPage";
import { BookEditor } from "./books/BookEditor";
import { BookPreviewPage } from "./books/BookPreviewPage";
import { BookCategoriesPage } from "./books/BookCategoriesPage";
import { RecommendationsPage } from "./books/RecommendationsPage";
import { PlacementsPage } from "./books/PlacementsPage";
import { AmazonLinksPage } from "./books/AmazonLinksPage";
import { BookAnalyticsPage } from "./books/BookAnalyticsPage";

export default function AdminRoutes() {
  return (
    <Routes>
      <Route path="login" element={<LoginPage />} />
      <Route path="forgot-password" element={<ForgotPasswordPage />} />
      <Route path="reset-password" element={<ResetPasswordPage />} />
      <Route element={<RequireAdmin />}>
        <Route index element={<Navigate to="dashboard" replace />} />
        <Route path="dashboard" element={<DashboardPage />} />
        <Route path="publications" element={<PublicationsPage />} />
        <Route path="publications/new" element={<PublicationEditor key="new" />} />
        <Route path="publications/:id/edit" element={<PublicationEditor />} />
        <Route path="publications/:id/preview" element={<PreviewPage />} />
        <Route path="categories" element={<CategoriesPage />} />
        <Route path="leads" element={<LeadsPage />} />
        <Route path="analytics" element={<AnalyticsPage />} />
        <Route path="settings" element={<SettingsPage />} />
        <Route path="books" element={<BooksListPage />} />
        <Route path="books/new" element={<BookEditor key="new" />} />
        <Route path="books/:id/edit" element={<BookEditor />} />
        <Route path="books/:id/preview" element={<BookPreviewPage />} />
        <Route path="books/categories" element={<BookCategoriesPage />} />
        <Route path="books/recommendations" element={<RecommendationsPage />} />
        <Route path="books/placements" element={<PlacementsPage />} />
        <Route path="books/links" element={<AmazonLinksPage />} />
        <Route path="books/analytics" element={<BookAnalyticsPage />} />
        <Route path="*" element={<Navigate to="dashboard" replace />} />
      </Route>
    </Routes>
  );
}
