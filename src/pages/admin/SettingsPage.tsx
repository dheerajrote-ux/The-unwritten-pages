import { useEffect, useState } from "react";
import { toast } from "sonner";
import { RotateCcw } from "lucide-react";
import { api, isDemo } from "@/data";
import type { DemoApi } from "@/data/demo-api";
import { useSite } from "@/hooks/useSite";
import { DEFAULT_READER, type ReaderSettings, type SiteSettings } from "@/lib/types";
import { EMAIL_RE } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Field, Input, Textarea } from "@/components/ui/input";
import { Switch } from "@/components/ui/misc";
import { ConfirmDialog } from "@/components/ui/dialog";
import { PageHeader, Panel } from "@/components/admin/bits";

const READER_LABELS: [keyof ReaderSettings, string][] = [
  ["flipbook_enabled", "Flipbook mode"],
  ["double_page_mode", "Double-page spreads"],
  ["fullscreen_enabled", "Fullscreen"],
  ["zoom_enabled", "Zoom"],
  ["thumbnail_navigation_enabled", "Thumbnail navigation"],
  ["download_enabled", "Download option"],
];

export function SettingsPage() {
  const { site, refreshSite, admin, refreshAdmin } = useSite();
  const [form, setForm] = useState<SiteSettings>(site);
  const [errors, setErrors] = useState<{ email?: string; url?: string; max?: string; site?: string; author?: string }>({});
  const [saving, setSaving] = useState(false);
  const [name, setName] = useState(admin?.full_name ?? "");
  const [savingName, setSavingName] = useState(false);
  const [pw, setPw] = useState({ a: "", b: "" });
  const [pwError, setPwError] = useState<string | null>(null);
  const [savingPw, setSavingPw] = useState(false);
  const [resetOpen, setResetOpen] = useState(false);
  const [resetting, setResetting] = useState(false);

  useEffect(() => {
    setForm(site);
  }, [site]);

  const saveSite = async (e: React.FormEvent) => {
    e.preventDefault();
    const er: typeof errors = {};
    if (form.contact_email && !EMAIL_RE.test(form.contact_email)) er.email = "Enter a valid email address.";
    if (form.privacy_policy_url && !/^https?:\/\/\S+$/.test(form.privacy_policy_url)) er.url = "Enter a full URL starting with https://";
    if (form.site_url && !/^https?:\/\/[^\s/]+(\/[^\s]*)?$/.test(form.site_url.trim())) er.site = "Enter your site's full address, e.g. https://theunwrittenpages.com";
    if (form.author_website_url && !/^https?:\/\/\S+$/.test(form.author_website_url.trim())) er.author = "Enter a full URL starting with https://";
    if (!(form.max_pdf_mb >= 1 && form.max_pdf_mb <= 500)) er.max = "Between 1 and 500 MB.";
    setErrors(er);
    if (Object.keys(er).length) return;
    setSaving(true);
    try {
      await api.updateSiteSettings({ ...form, site_name: form.site_name.trim() || "The Unwritten Pages", contact_email: form.contact_email?.trim() || null, site_url: form.site_url?.trim().replace(/\/+$/, "") || null, author_website_url: form.author_website_url?.trim() || null, privacy_policy_url: form.privacy_policy_url?.trim() || null });
      await refreshSite();
      toast.success("Settings saved.");
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <PageHeader title="Settings" description="Library details, defaults for new publications and your account." />
      <div className="grid gap-6 xl:grid-cols-[1.4fr_1fr]">
        <form onSubmit={saveSite} className="space-y-6">
          <Panel title="Library">
            <div className="grid gap-4 md:grid-cols-2">
              <Field label="Library name" htmlFor="s-name" className="md:col-span-2">
                <Input value={form.site_name} maxLength={60} onChange={(e) => setForm({ ...form, site_name: e.target.value })} />
              </Field>
              <Field label="Tagline" htmlFor="s-tag" className="md:col-span-2" hint="Shown in the hero and used as the default meta description.">
                <Textarea rows={2} value={form.tagline} maxLength={240} onChange={(e) => setForm({ ...form, tagline: e.target.value })} />
              </Field>
              <Field label="Public site URL" htmlFor="s-site" className="md:col-span-2" error={errors.site} hint="Your live library's address. Used for share links, canonical URLs and social previews.">
                <Input value={form.site_url ?? ""} placeholder="https://theunwrittenpages.com" onChange={(e) => setForm({ ...form, site_url: e.target.value })} />
              </Field>
              <Field label="Author website" htmlFor="s-author" optional className="md:col-span-2" error={errors.author} hint="Linked from the author section on the Books page.">
                <Input value={form.author_website_url ?? ""} placeholder="https://" onChange={(e) => setForm({ ...form, author_website_url: e.target.value })} />
              </Field>
              <Field label="Contact email" htmlFor="s-email" optional error={errors.email}>
                <Input type="email" value={form.contact_email ?? ""} onChange={(e) => setForm({ ...form, contact_email: e.target.value })} />
              </Field>
              <Field label="Privacy Policy URL" htmlFor="s-url" optional error={errors.url} hint="Leave blank to use the built-in template page.">
                <Input value={form.privacy_policy_url ?? ""} placeholder="https://" onChange={(e) => setForm({ ...form, privacy_policy_url: e.target.value })} />
              </Field>
              <Field label="Maximum PDF size (MB)" htmlFor="s-max" error={errors.max} hint="Also enforce the same limit on the storage bucket.">
                <Input type="number" min={1} max={500} value={form.max_pdf_mb} onChange={(e) => setForm({ ...form, max_pdf_mb: Number(e.target.value) })} />
              </Field>
            </div>
          </Panel>
          <Panel title="Default reader settings" description="Applied to new publications. Each publication can override them.">
            <div className="grid gap-x-6 gap-y-3 sm:grid-cols-2">
              {READER_LABELS.map(([k, label]) => (
                <label key={k} className="flex items-center justify-between gap-3 rounded-md border border-line px-3 py-2.5 text-[13px] text-ink">
                  {label}
                  <Switch checked={form.default_reader?.[k] ?? DEFAULT_READER[k]} onCheckedChange={(v) => setForm({ ...form, default_reader: { ...DEFAULT_READER, ...form.default_reader, [k]: v } })} aria-label={label} />
                </label>
              ))}
            </div>
          </Panel>
          <div className="flex justify-end">
            <Button type="submit" loading={saving}>Save settings</Button>
          </div>
        </form>

        <div className="space-y-6">
          <Panel title="Your profile" description={admin?.email}>
            <form
              onSubmit={async (e) => {
                e.preventDefault();
                setSavingName(true);
                try {
                  await api.updateAdminName(name.trim());
                  await refreshAdmin();
                  toast.success("Profile updated.");
                } catch (err) {
                  toast.error((err as Error).message);
                } finally {
                  setSavingName(false);
                }
              }}
              className="flex items-end gap-2"
            >
              <Field label="Full name" htmlFor="p-name" className="flex-1">
                <Input value={name} onChange={(e) => setName(e.target.value)} maxLength={80} />
              </Field>
              <Button type="submit" variant="outline" loading={savingName}>Save</Button>
            </form>
          </Panel>
          <Panel title="Change password">
            <form
              onSubmit={async (e) => {
                e.preventDefault();
                if (pw.a.length < 8) return setPwError("Use at least 8 characters.");
                if (pw.a !== pw.b) return setPwError("Passwords don't match.");
                setPwError(null);
                setSavingPw(true);
                try {
                  await api.updatePassword(pw.a);
                  setPw({ a: "", b: "" });
                  toast.success("Password updated.");
                } catch (err) {
                  setPwError((err as Error).message);
                } finally {
                  setSavingPw(false);
                }
              }}
              className="grid gap-3"
            >
              <Field label="New password" htmlFor="pw-a"><Input type="password" autoComplete="new-password" value={pw.a} onChange={(e) => setPw({ ...pw, a: e.target.value })} /></Field>
              <Field label="Confirm new password" htmlFor="pw-b" error={pwError ?? undefined}><Input type="password" autoComplete="new-password" value={pw.b} onChange={(e) => setPw({ ...pw, b: e.target.value })} /></Field>
              <div><Button type="submit" variant="outline" loading={savingPw}>Update password</Button></div>
            </form>
          </Panel>
          <Panel title="Admin access">
            <p className="text-[13px] leading-relaxed text-muted">
              There is no public sign-up. New admins are provisioned by an owner: invite the user in Supabase Auth, then run <code className="rounded bg-admin-bg px-1 py-0.5 text-[12px] text-ink">select promote_admin('name@company.com');</code> in the SQL editor.
            </p>
          </Panel>
          {isDemo && (
            <Panel title="Demo data" description="Everything in demo mode lives in this browser.">
              <Button variant="outline" onClick={() => setResetOpen(true)}><RotateCcw /> Reset demo to initial state</Button>
            </Panel>
          )}
        </div>
      </div>
      <ConfirmDialog
        open={resetOpen}
        onOpenChange={setResetOpen}
        title="Reset demo data?"
        description="Uploaded files, edits, leads and events in this browser are discarded and the original library is restored."
        confirmLabel="Reset"
        loading={resetting}
        onConfirm={async () => {
          setResetting(true);
          await (api as unknown as DemoApi).resetDemo();
          window.location.reload();
        }}
      />
    </>
  );
}
