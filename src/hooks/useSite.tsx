import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { api } from "@/data";
import type { AdminUser, SiteSettings } from "@/lib/types";
import { APP_NAME } from "@/lib/config";
import { DEFAULT_READER } from "@/lib/types";

interface SiteCtx {
  site: SiteSettings;
  refreshSite: () => Promise<void>;
  admin: AdminUser | null;
  authLoading: boolean;
  refreshAdmin: () => Promise<void>;
}

const FALLBACK: SiteSettings = { site_name: APP_NAME, site_url: null, tagline: "", privacy_policy_url: null, contact_email: null, max_pdf_mb: 50, default_reader: DEFAULT_READER, amazon_associate: false, affiliate_disclosure: "As an Amazon Associate, we earn from qualifying purchases.", author_website_url: null };
const Ctx = createContext<SiteCtx | null>(null);

export function SiteProvider({ children }: { children: ReactNode }) {
  const [site, setSite] = useState<SiteSettings>(FALLBACK);
  const [admin, setAdmin] = useState<AdminUser | null>(null);
  const [authLoading, setAuthLoading] = useState(true);

  const refreshSite = useCallback(async () => {
    try {
      setSite(await api.getSiteSettings());
    } catch {
      /* keep fallback */
    }
  }, []);
  const refreshAdmin = useCallback(async () => {
    try {
      setAdmin(await api.getAdminUser());
    } catch {
      setAdmin(null);
    } finally {
      setAuthLoading(false);
    }
  }, []);

  useEffect(() => {
    void refreshSite();
    void refreshAdmin();
    return api.onAuthChange(() => void refreshAdmin());
  }, [refreshSite, refreshAdmin]);

  return <Ctx.Provider value={{ site, refreshSite, admin, authLoading, refreshAdmin }}>{children}</Ctx.Provider>;
}

export function useSite() {
  const c = useContext(Ctx);
  if (!c) throw new Error("useSite outside SiteProvider");
  return c;
}
