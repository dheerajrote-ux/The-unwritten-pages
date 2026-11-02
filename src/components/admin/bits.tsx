import { useState } from "react";
import type { ReactNode } from "react";
import { Calendar } from "lucide-react";
import { addDays, cn, startOfDay, toDateInput } from "@/lib/utils";
import { Card } from "@/components/ui/misc";

export function PageHeader({ title, description, actions }: { title: string; description?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="mb-7 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <h1 className="text-[24px] font-semibold tracking-tight text-ink">{title}</h1>
        {description && <p className="mt-1 text-sm text-muted">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

export function StatCard({ label, value, sub, icon, loading }: { label: string; value: ReactNode; sub?: ReactNode; icon?: ReactNode; loading?: boolean }) {
  return (
    <Card className="p-5">
      <div className="flex items-center justify-between">
        <p className="text-[13px] font-medium text-secondary">{label}</p>
        {icon && <span className="text-muted [&_svg]:size-4">{icon}</span>}
      </div>
      {loading ? <div className="skeleton mt-3 h-8 w-20" /> : <p className="mt-2 text-[30px] font-semibold leading-none tracking-tight tabular-nums text-ink">{value}</p>}
      {sub && !loading && <p className="mt-2 text-[12.5px] text-muted">{sub}</p>}
    </Card>
  );
}

export function Panel({ title, description, actions, children, className }: { title: string; description?: ReactNode; actions?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <Card className={cn("p-5 sm:p-6", className)}>
      <div className="mb-5 flex items-start justify-between gap-3">
        <div>
          <h2 className="text-[15px] font-semibold text-ink">{title}</h2>
          {description && <p className="mt-0.5 text-[12.5px] text-muted">{description}</p>}
        </div>
        {actions}
      </div>
      {children}
    </Card>
  );
}

export type RangeKey = "7" | "30" | "90" | "custom";
export interface DateRange {
  key: RangeKey;
  from: Date;
  to: Date; // exclusive
}

export function rangeFor(key: Exclude<RangeKey, "custom">): DateRange {
  const to = addDays(startOfDay(new Date()), 1);
  return { key, from: addDays(to, -Number(key)), to };
}

export function DateRangeFilter({ value, onChange }: { value: DateRange; onChange: (r: DateRange) => void }) {
  const [custom, setCustom] = useState({ from: toDateInput(value.from), to: toDateInput(addDays(value.to, -1)) });
  const opts: { key: RangeKey; label: string }[] = [
    { key: "7", label: "7 days" },
    { key: "30", label: "30 days" },
    { key: "90", label: "90 days" },
    { key: "custom", label: "Custom" },
  ];
  const applyCustom = (from: string, to: string) => {
    setCustom({ from, to });
    if (!from || !to) return;
    const f = startOfDay(new Date(from + "T00:00:00"));
    const t = addDays(startOfDay(new Date(to + "T00:00:00")), 1);
    if (t > f) onChange({ key: "custom", from: f, to: t });
  };
  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="inline-flex rounded-md border border-line-strong bg-surface p-0.5" role="group" aria-label="Date range">
        {opts.map((o) => (
          <button
            key={o.key}
            onClick={() => (o.key === "custom" ? applyCustom(custom.from, custom.to) : onChange(rangeFor(o.key)))}
            aria-pressed={value.key === o.key}
            className={cn("rounded-[5px] px-3 py-1.5 text-[12.5px] font-medium transition-colors", value.key === o.key ? "bg-primary text-white" : "text-secondary hover:text-ink")}
          >
            {o.label}
          </button>
        ))}
      </div>
      {value.key === "custom" && (
        <div className="flex items-center gap-1.5 text-[12.5px] text-secondary">
          <Calendar className="size-4 text-muted" />
          <input type="date" aria-label="From date" value={custom.from} max={custom.to} onChange={(e) => applyCustom(e.target.value, custom.to)} className="h-8 rounded-md border border-line-strong bg-surface px-2 text-[12.5px]" />
          <span>to</span>
          <input type="date" aria-label="To date" value={custom.to} min={custom.from} max={toDateInput(new Date())} onChange={(e) => applyCustom(custom.from, e.target.value)} className="h-8 rounded-md border border-line-strong bg-surface px-2 text-[12.5px]" />
        </div>
      )}
    </div>
  );
}

export function StatusBadge({ status, publishedAt }: { status: "draft" | "published" | "unpublished"; publishedAt?: string | null }) {
  const scheduled = status === "published" && publishedAt && new Date(publishedAt) > new Date();
  const map = {
    published: "bg-success-soft text-success",
    draft: "bg-black/[0.05] text-secondary",
    unpublished: "bg-warning-soft text-warning",
    scheduled: "bg-primary/[0.07] text-primary",
  };
  const k = scheduled ? "scheduled" : status;
  const label = { published: "Published", draft: "Draft", unpublished: "Unpublished", scheduled: "Scheduled" }[k];
  return (
    <span className={cn("inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11.5px] font-medium", map[k])}>
      <span className="size-1.5 rounded-full bg-current" aria-hidden />
      {label}
    </span>
  );
}
