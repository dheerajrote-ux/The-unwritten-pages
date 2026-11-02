import * as React from "react";
import { cn } from "@/lib/utils";

export const inputBase =
  "w-full rounded-md border border-line-strong bg-surface px-3 text-sm text-ink placeholder:text-[#9aa3af] shadow-[inset_0_1px_0_rgba(0,0,0,0.02)] transition-colors focus:border-primary focus:outline-none focus:ring-3 focus:ring-primary/10 disabled:bg-paper disabled:text-muted aria-[invalid=true]:border-danger aria-[invalid=true]:focus:ring-danger/10";

export const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(({ className, ...props }, ref) => (
  <input ref={ref} className={cn(inputBase, "h-10", className)} {...props} />
));
Input.displayName = "Input";

export const Textarea = React.forwardRef<HTMLTextAreaElement, React.TextareaHTMLAttributes<HTMLTextAreaElement>>(({ className, ...props }, ref) => (
  <textarea ref={ref} className={cn(inputBase, "min-h-24 py-2.5 leading-relaxed", className)} {...props} />
));
Textarea.displayName = "Textarea";

export function Label({ className, children, required, optional, ...props }: React.LabelHTMLAttributes<HTMLLabelElement> & { required?: boolean; optional?: boolean }) {
  return (
    <label className={cn("mb-1.5 block text-[13px] font-medium text-ink", className)} {...props}>
      {children}
      {required && <span className="ml-0.5 text-danger" aria-hidden>*</span>}
      {optional && <span className="ml-1.5 font-normal text-muted">(optional)</span>}
    </label>
  );
}

export function FieldError({ id, children }: { id?: string; children?: React.ReactNode }) {
  if (!children) return null;
  return (
    <p id={id} role="alert" className="mt-1.5 text-[12.5px] text-danger">
      {children}
    </p>
  );
}

export function FieldHint({ children, className }: { children: React.ReactNode; className?: string }) {
  return <p className={cn("mt-1.5 text-[12.5px] text-muted", className)}>{children}</p>;
}

/** Label + control + error wiring with aria attributes. */
export function Field({
  label,
  htmlFor,
  error,
  hint,
  required,
  optional,
  className,
  children,
}: {
  label: React.ReactNode;
  htmlFor: string;
  error?: string;
  hint?: React.ReactNode;
  required?: boolean;
  optional?: boolean;
  className?: string;
  children: React.ReactElement<Record<string, unknown>>;
}) {
  const errorId = `${htmlFor}-error`;
  const child = React.cloneElement(children, {
    id: htmlFor,
    "aria-invalid": error ? true : undefined,
    "aria-describedby": error ? errorId : undefined,
  });
  return (
    <div className={className}>
      <Label htmlFor={htmlFor} required={required} optional={optional}>
        {label}
      </Label>
      {child}
      {error ? <FieldError id={errorId}>{error}</FieldError> : hint ? <FieldHint>{hint}</FieldHint> : null}
    </div>
  );
}
