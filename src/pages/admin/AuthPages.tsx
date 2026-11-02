import { useState } from "react";
import { Link, Navigate, useLocation, useNavigate } from "react-router-dom";
import { ArrowLeft, Eye, EyeOff, Info, MailCheck } from "lucide-react";
import { api, isDemo } from "@/data";
import { useSite } from "@/hooks/useSite";
import { DEMO_ADMIN_EMAIL, DEMO_ADMIN_PASSWORD } from "@/data/demo-seed";
import { EMAIL_RE } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/input";
import { BrandMark } from "@/components/public/Brand";

function AuthShell({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  const { site } = useSite();
  return (
    <div className="grid min-h-dvh lg:grid-cols-[1fr_1.1fr]">
      <div className="flex flex-col justify-center px-6 py-12 sm:px-12">
        <div className="mx-auto w-full max-w-[380px]">
          <Link to="/" className="mb-12 flex items-center gap-2.5">
            <BrandMark />
            <span className="font-display text-[20px] text-ink">{site.site_name}</span>
          </Link>
          <h1 className="text-[26px] font-semibold tracking-tight text-ink">{title}</h1>
          {subtitle && <p className="mt-2 text-sm text-muted">{subtitle}</p>}
          <div className="mt-8">{children}</div>
        </div>
      </div>
      <div className="relative hidden overflow-hidden bg-primary lg:block">
        <div className="absolute inset-0 [background-image:radial-gradient(circle_at_30%_20%,rgba(214,168,95,0.22),transparent_45%),radial-gradient(circle_at_80%_90%,rgba(255,255,255,0.08),transparent_40%)]" />
        <div className="relative flex h-full flex-col justify-end p-14">
          <p className="max-w-md font-display text-[34px] leading-[1.15] text-white">Publish, preview and understand how your library is read.</p>
          <p className="mt-4 text-sm text-white/60">Admin access is restricted to authorised accounts.</p>
        </div>
      </div>
    </div>
  );
}

export function LoginPage() {
  const { admin, refreshAdmin } = useSite();
  const navigate = useNavigate();
  const loc = useLocation();
  const [email, setEmail] = useState(isDemo ? DEMO_ADMIN_EMAIL : "");
  const [password, setPassword] = useState(isDemo ? DEMO_ADMIN_PASSWORD : "");
  const [show, setShow] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErr, setFieldErr] = useState<{ email?: string; password?: string }>({});

  if (admin) return <Navigate to={(loc.state as { from?: string })?.from ?? "/admin/dashboard"} replace />;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const fe: typeof fieldErr = {};
    if (!EMAIL_RE.test(email.trim())) fe.email = "Enter a valid email address.";
    if (!password) fe.password = "Enter your password.";
    setFieldErr(fe);
    if (Object.keys(fe).length) return;
    setLoading(true);
    setError(null);
    try {
      await api.signIn(email.trim(), password);
      await refreshAdmin();
      navigate((loc.state as { from?: string })?.from ?? "/admin/dashboard", { replace: true });
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthShell title="Sign in to admin" subtitle="Manage publications, leads and analytics.">
      {isDemo && (
        <div className="mb-6 flex gap-2.5 rounded-lg border border-accent/40 bg-accent-soft px-3.5 py-3 text-[12.5px] text-[#6d4d1c]">
          <Info className="mt-0.5 size-4 shrink-0" />
          <span>
            Demo credentials are pre-filled: <b>{DEMO_ADMIN_EMAIL}</b> / <b>{DEMO_ADMIN_PASSWORD}</b>
          </span>
        </div>
      )}
      <form onSubmit={submit} noValidate className="grid gap-4">
        <Field label="Email address" htmlFor="login-email" error={fieldErr.email}>
          <Input type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} />
        </Field>
        <div>
          <div className="mb-1.5 flex items-center justify-between">
            <label htmlFor="login-password" className="text-[13px] font-medium text-ink">Password</label>
            <Link to="/admin/forgot-password" className="text-[12.5px] font-medium text-primary hover:underline">Forgot password?</Link>
          </div>
          <div className="relative">
            <Input
              id="login-password"
              type={show ? "text" : "password"}
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              aria-invalid={fieldErr.password ? true : undefined}
              className="pr-10"
            />
            <button type="button" onClick={() => setShow((s) => !s)} className="absolute right-1 top-1/2 grid size-8 -translate-y-1/2 place-items-center rounded text-muted hover:text-ink" aria-label={show ? "Hide password" : "Show password"}>
              {show ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
            </button>
          </div>
          {fieldErr.password && <p className="mt-1.5 text-[12.5px] text-danger">{fieldErr.password}</p>}
        </div>
        {error && <p role="alert" className="rounded-md bg-danger-soft px-3 py-2.5 text-[13px] text-danger">{error}</p>}
        <Button type="submit" size="lg" loading={loading} className="mt-2 w-full">
          {loading ? "Signing in…" : "Login"}
        </Button>
      </form>
    </AuthShell>
  );
}

export function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!EMAIL_RE.test(email.trim())) return setError("Enter a valid email address.");
    setLoading(true);
    setError(null);
    try {
      await api.sendPasswordReset(email.trim());
      setSent(true);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  };
  return (
    <AuthShell title="Reset your password" subtitle="We'll email you a secure link to choose a new password.">
      {sent ? (
        <div className="rounded-lg border border-line bg-surface p-5 text-sm text-secondary">
          <MailCheck className="mb-3 size-6 text-success" />
          If an admin account exists for <b className="text-ink">{email}</b>, a reset link is on its way.
          {isDemo && <p className="mt-2 text-muted">(Demo mode doesn't send emails.)</p>}
        </div>
      ) : (
        <form onSubmit={submit} noValidate className="grid gap-4">
          <Field label="Email address" htmlFor="reset-email" error={error ?? undefined}>
            <Input type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} />
          </Field>
          <Button type="submit" size="lg" loading={loading} className="w-full">Send reset link</Button>
        </form>
      )}
      <Link to="/admin/login" className="mt-6 inline-flex items-center gap-1.5 text-sm text-secondary hover:text-ink">
        <ArrowLeft className="size-4" /> Back to login
      </Link>
    </AuthShell>
  );
}

export function ResetPasswordPage() {
  const navigate = useNavigate();
  const [pw, setPw] = useState("");
  const [pw2, setPw2] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (pw.length < 8) return setError("Use at least 8 characters.");
    if (pw !== pw2) return setError("Passwords don't match.");
    setLoading(true);
    setError(null);
    try {
      await api.updatePassword(pw);
      navigate("/admin/dashboard", { replace: true });
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  };
  return (
    <AuthShell title="Choose a new password">
      <form onSubmit={submit} noValidate className="grid gap-4">
        <Field label="New password" htmlFor="pw1"><Input type="password" autoComplete="new-password" value={pw} onChange={(e) => setPw(e.target.value)} /></Field>
        <Field label="Confirm password" htmlFor="pw2" error={error ?? undefined}><Input type="password" autoComplete="new-password" value={pw2} onChange={(e) => setPw2(e.target.value)} /></Field>
        <Button type="submit" size="lg" loading={loading} className="w-full">Update password</Button>
      </form>
    </AuthShell>
  );
}
